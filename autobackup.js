// autobackup.js: when to back up, and what the screen shows about the backups.
//
// Automatic backup (to Drive only) runs after a change (not more often than CONFIG.AUTO_GAP_MIN),
// when the app opens, and when it comes back to the foreground. A silent run cannot open the Google
// window (the browser only allows it right after a tap): then the screen asks for one tap.
// The phone copy (a downloaded file) is never automatic: it is made only by its own button.

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

// Progress of the running Drive backup: the screen shows the steps and a live timer.
// A quiet automatic run shows nothing until it is past the sign-in step.
B.onProgress((t) => {
  if (t.done) {
    // every run ends here, also the silent follow-up rounds that no button is waiting for
    ctx.progress = null;
    ctx.progressManual = false;
    ctx.render?.();
    return;
  }
  if (!ctx.progressManual && t.index < t.keys.indexOf('folder')) return;
  ctx.progress = t;
  ctx.render?.();
});

export const isEnabled = (kind) => (kind === 'drive' ? drive.isConfigured() : true);

// what one backup target looks like right now
// level: ok | warn | bad | off
// The phone copy is made by hand now and then, so it never turns red or amber because of its age.
export function targetState(kind) {
  const st = ctx.status[kind] || {};
  const enabled = isEnabled(kind);
  const lastOk = st.lastOk || null;
  const lastFail = st.lastFail || null;
  const empty = isEmptyDb(ctx.db);
  if (kind === 'local') {
    const base = { kind, enabled: true, lastOk, lastFail: null, pending: false, needLogin: false, guard: null, level: 'ok', code: 'ok' };
    return lastOk ? base : { ...base, level: 'off', code: 'none' };
  }
  const pending = enabled && !empty && (!lastOk || (lastOk.rev || 0) < (ctx.db.rev || 0));
  const base = { kind, enabled, lastOk, lastFail, pending, needLogin: false, guard: null, level: 'ok', code: 'ok' };
  if (!enabled) return { ...base, level: 'bad', code: 'not_configured' };
  if (!lastOk) return { ...base, level: empty ? 'off' : 'bad', code: 'none' };
  if (lastFail && lastFail.at > lastOk.at) return { ...base, level: 'bad', code: 'failed' };
  if (lastOk.guard) return { ...base, level: 'warn', code: 'guard', guard: lastOk.guard };
  if (pending) return { ...base, level: 'warn', code: 'pending', needLogin: !drive.cachedToken() };
  return base;
}

// the warning dot on the backup tab follows the Drive backup only
export function worstLevel() {
  return targetState('drive').level;
}

// is a Drive backup needed, and how long to wait before it is allowed (ms)
export function dueState(now = Date.now()) {
  if (isEmptyDb(ctx.db)) return { need: false, wait: 0 };
  if (!isEnabled('drive')) return { need: false, wait: 0 };
  const ok = (ctx.status.drive || {}).lastOk;
  if (ok && (ok.rev || 0) >= (ctx.db.rev || 0)) return { need: false, wait: 0 };
  const wait = ok ? Math.max(0, gapMs() - (now - new Date(ok.at).getTime())) : 0;
  return { need: true, wait };
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
// handler when `interactive` is true (nothing awaited before it, except the confirm dialog).
export function runBackupNow({ interactive = false, manual = false } = {}) {
  if (isEmptyDb(ctx.db)) {
    if (manual) toast(T.bEmptyNow, { kind: 'warn' });
    return Promise.resolve(null);
  }
  globalThis.__shiftlogDb = ctx.db;
  if (interactive) drive.expectIntent('backup');
  if (manual) ctx.progressManual = true;
  const p = B.runBackup(ctx.db, { interactive, manual }); // starts Google sign-in synchronously when needed
  ctx.busy = true;
  ctx.render();
  return p
    .then(async (r) => {
      await loadStatus();
      const code = r && r.drive && r.drive.code;
      // on its way to Google: the real result comes after the user is back
      ctx.lastResult =
        code === 'redirecting'
          ? null
          : {
              kind: 'drive',
              ok: !!(r.drive && r.drive.ok),
              code,
              at: r.at,
              steps: r.steps,
              entries: r.built.counts.entries,
              name: r.built.name,
              rotated: r.drive && r.drive.rotated,
              manual: !!r.manual || manual,
              shownAt: Date.now(),
            };
      return r;
    })
    .catch((e) => {
      toast(errText((e && e.code) || 'error'), { kind: 'err' });
      return null;
    })
    .finally(() => {
      ctx.busy = false;
      ctx.progress = null;
      ctx.progressManual = false;
      ctx.render();
    });
}

// The user presses "cancel" while the backup is running.
export function cancelRun() {
  B.cancelBackup();
}

// The phone copy: one tap = one downloaded file.
export async function runPhoneBackup() {
  if (isEmptyDb(ctx.db)) {
    toast(T.bEmptyNow, { kind: 'warn' });
    return null;
  }
  try {
    const r = await B.backupToPhone(ctx.db);
    await loadStatus();
    ctx.lastPhone = { ...r, shownAt: Date.now() };
    toast(T.bPhoneDownloaded);
    return r;
  } catch (e) {
    ctx.lastPhone = { ok: false, code: (e && e.code) || 'error', shownAt: Date.now() };
    toast(errText((e && e.code) || 'error'), { kind: 'err' });
    return null;
  } finally {
    ctx.render();
  }
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
  // the silent try did not work and the page is going to Google again, the normal way
  if (r.code === 'redirecting') return;
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
