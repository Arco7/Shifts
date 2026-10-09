// autobackup.js: when to back up, and what the screen shows about the backups.
//
// Automatic backup runs after a change (not more often than CONFIG.AUTO_GAP_MIN), when the
// app opens, and when it comes back to the foreground. A silent run cannot open the Google
// window (the browser only allows it right after a tap): then the screen asks for one tap.

import { CONFIG } from './config.js';
import * as B from './backup.js';
import * as drive from './drive.js';
import { isEmptyDb } from './store.js';
import { ctx } from './ctx.js';
import { toast } from './dom.js';
import { T, errText } from './strings.js';

const gapMs = () => (CONFIG.AUTO_GAP_MIN || 180) * 60000;

export async function loadStatus() {
  const s = await B.getStatus();
  s.drive = s.drive || {};
  s.local = s.local || {};
  ctx.status = s;
}

// the silent follow-up round (changes made during a backup) must also refresh the screen
B.onFollowUp(async () => {
  await loadStatus();
  ctx.render?.();
});

export async function refreshLocalPerm() {
  if (!ctx.localDir) {
    ctx.localPerm = null;
    return;
  }
  try {
    ctx.localPerm = await ctx.localDir.queryPermission({ mode: 'readwrite' });
  } catch {
    ctx.localPerm = null;
  }
}

export const isEnabled = (kind) => (kind === 'drive' ? drive.isConfigured() : !!ctx.localDir);

// what one backup target looks like right now
// level: ok | warn | bad | off
export function targetState(kind) {
  const st = ctx.status[kind] || {};
  const enabled = isEnabled(kind);
  const lastOk = st.lastOk || null;
  const lastFail = st.lastFail || null;
  const empty = isEmptyDb(ctx.db);
  const pending = enabled && !empty && (!lastOk || (lastOk.rev || 0) < (ctx.db.rev || 0));
  const base = { kind, enabled, lastOk, lastFail, pending, needLogin: false, guard: null, level: 'ok', code: 'ok' };
  if (!enabled) return { ...base, level: kind === 'drive' ? 'bad' : 'off', code: kind === 'drive' ? 'not_configured' : 'no_folder' };
  if (kind === 'local' && ctx.localPerm && ctx.localPerm !== 'granted') return { ...base, level: 'warn', code: 'permission' };
  if (!lastOk) return { ...base, level: empty ? 'off' : 'bad', code: 'none' };
  if (lastFail && lastFail.at > lastOk.at) return { ...base, level: 'bad', code: 'failed' };
  if (lastOk.guard) return { ...base, level: 'warn', code: 'guard', guard: lastOk.guard };
  if (pending) return { ...base, level: 'warn', code: 'pending', needLogin: kind === 'drive' && !drive.cachedToken() };
  return base;
}

const RANK = { off: 0, ok: 1, warn: 2, bad: 3 };
export function worstLevel() {
  const a = targetState('drive');
  const b = targetState('local');
  return RANK[a.level] >= RANK[b.level] ? a.level : b.level;
}

// is a backup needed, and how long to wait before it is allowed (ms)
export function dueState(now = Date.now()) {
  if (isEmptyDb(ctx.db)) return { need: false, wait: 0 };
  let need = false;
  let wait = Infinity;
  for (const kind of ['drive', 'local']) {
    if (!isEnabled(kind)) continue;
    const ok = (ctx.status[kind] || {}).lastOk;
    if (!ok || (ok.rev || 0) < (ctx.db.rev || 0)) {
      need = true;
      const w = ok ? gapMs() - (now - new Date(ok.at).getTime()) : 0;
      wait = Math.min(wait, Math.max(0, w));
    }
  }
  return { need, wait: need ? wait : 0 };
}

let timer = null;

export function requestAutoBackup({ fromTap = false } = {}) {
  clearTimeout(timer);
  timer = null;
  const d = dueState();
  if (!d.need) return;
  if (d.wait > 0) {
    timer = setTimeout(() => requestAutoBackup({ fromTap: false }), Math.min(d.wait + 1000, 2 ** 31 - 1));
    return;
  }
  // The Google window may only open right after a tap, and only if the user signed in before.
  // (Redirect sign-in would throw the whole page to Google after a plain save, so there the
  // screen asks for a tap instead.)
  const interactive = fromTap && drive.signInMode() === 'popup' && drive.isConfigured() && !drive.cachedToken() && !!drive.accountEmail();
  runBackupNow({ interactive });
}

// Used by the button and by automatic backups. IMPORTANT: must be called straight from a tap
// handler when `interactive` is true (nothing awaited before it).
export function runBackupNow({ interactive = false, manual = false } = {}) {
  if (isEmptyDb(ctx.db)) {
    if (manual) toast(T.bEmptyNow, { kind: 'warn' });
    return Promise.resolve(null);
  }
  globalThis.__shiftlogDb = ctx.db;
  if (interactive) drive.expectIntent('backup');
  const p = B.runBackup(ctx.db, { interactive }); // starts Google sign-in synchronously when needed
  ctx.busy = true;
  ctx.render();
  return p
    .then(async (r) => {
      await loadStatus();
      // on its way to Google: the real result comes after the user is back
      ctx.lastResult = r && r.drive && r.drive.code === 'redirecting' ? null : { ...r, manual, shownAt: Date.now() };
      return r;
    })
    .catch((e) => {
      toast(errText((e && e.code) || 'error'), { kind: 'err' });
      return null;
    })
    .finally(() => {
      ctx.busy = false;
      ctx.render();
    });
}

export async function signInGoogle() {
  drive.expectIntent('signin');
  const p = drive.getToken({ interactive: true }); // synchronous start (tap rule)
  await p;
  // prove that Drive really answers (also creates the backup folder)
  await B.listDriveBackups();
  await loadStatus();
}

// Google sent the user back (redirect sign-in): say what happened and finish what was pending.
// 'restore' is continued by app.js (it needs the restore screen).
export async function handleRedirectResult(r) {
  if (!r) return;
  if (r.pending !== 'restore') ctx.tab = 'backup'; // after a restore the user wants to see the shifts
  if (!r.ok) {
    toast(errText(r.code), { kind: 'err', ms: 7000 });
    ctx.render();
    return;
  }
  toast(T.bConnectedToast);
  ctx.render();
  try {
    if (r.pending === 'backup') {
      await runBackupNow({ interactive: false, manual: true });
    } else if (r.pending === 'signin') {
      // prove that Drive really answers (also creates the backup folder)
      await B.listDriveBackups();
      await loadStatus();
    }
  } catch (e) {
    toast(errText((e && e.code) || 'error'), { kind: 'err', ms: 6000 });
  }
  ctx.render();
}

export function startAutoChecks() {
  const check = () => requestAutoBackup({ fromTap: false });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 5 * 60000);
  check();
}
