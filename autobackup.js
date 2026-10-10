// autobackup.js: what the screen shows about the backups (and how a backup is started).
//
// NOTHING is automatic: a backup to Drive is made only by the button "back up to Drive now" (always
// after a confirmation), the phone copy only by its own button. Instead the screen reminds:
// "N changes are not in the backup yet", yellow at first, red when the oldest unsaved change is
// older than STALE_DAYS days. (A web page cannot back up by itself while it is closed, and a
// half-working automatic backup was worse than none: nobody knew whether it had worked.)

import * as B from './backup.js';
import * as drive from './drive.js';
import { isEmptyDb } from './store.js';
import { ctx } from './ctx.js';
import { toast } from './dom.js';
import { prefs } from './prefs.js';
import { T, errText } from './strings.js';

// unsaved changes older than this many days turn the reminder red (the usual value; the user can choose
// 1 / 3 / 7 / 14 in the settings, see staleDays())
export const STALE_DAYS = 3;
export const staleDays = () => prefs.staleDays || STALE_DAYS;

export async function loadStatus() {
  const s = await B.getStatus();
  s.drive = s.drive || {};
  s.local = s.local || {};
  ctx.status = s;
}

// Progress of the running Drive backup: the screen shows the steps and a live timer.
B.onProgress((t) => {
  if (t.done) {
    // every run ends here
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

// What is not in the last Drive backup yet: {dirty, n, since}. n = number of changed records
// (added, edited, deleted), or null when it cannot be counted (the last backup was made by an older
// version of the app and has no signature). null as a whole = nothing to compare with.
let unsavedCache = null;
export function unsavedInfo() {
  const ok = (ctx.status.drive || {}).lastOk;
  if (!ok || !ctx.db || isEmptyDb(ctx.db)) return null;
  const c = unsavedCache;
  let n;
  let dirty;
  if (c && c.db === ctx.db && c.rev === ctx.db.rev && c.at === ok.at) {
    ({ n, dirty } = c);
  } else {
    if (ok.sig) {
      n = B.diffSig(ctx.db, ok.sig).total;
      dirty = n > 0;
    } else {
      n = null;
      dirty = (ok.rev || 0) < (ctx.db.rev || 0);
    }
    unsavedCache = { db: ctx.db, rev: ctx.db.rev, at: ok.at, n, dirty };
  }
  // since when: the moment of the first unsaved change; if that was not noted, the time of the last backup
  const since = dirty ? (ctx.status.drive || {}).dirtySince || ok.at : null;
  return { dirty, n, since };
}

export const daysSince = (iso, now = Date.now()) => Math.floor((now - new Date(iso).getTime()) / 86400000);

// what one backup target looks like right now
// level: ok | warn | bad | off
// The phone copy is made by hand now and then, so it never turns red or amber because of its age.
export function targetState(kind, now = Date.now()) {
  const st = ctx.status[kind] || {};
  const enabled = isEnabled(kind);
  const lastOk = st.lastOk || null;
  const lastFail = st.lastFail || null;
  const empty = isEmptyDb(ctx.db);
  if (kind === 'local') {
    const base = { kind, enabled: true, lastOk, lastFail: null, pending: false, guard: null, level: 'ok', code: 'ok' };
    return lastOk ? base : { ...base, level: 'off', code: 'none' };
  }
  const u = !empty && lastOk ? unsavedInfo() : null;
  const pending = enabled && !!u && u.dirty;
  const base = { kind, enabled, lastOk, lastFail, pending, unsaved: u ? u.n : null, old: false, days: 0, guard: null, level: 'ok', code: 'ok' };
  if (!enabled) return { ...base, level: 'bad', code: 'not_configured' };
  if (!lastOk) return { ...base, level: empty ? 'off' : 'bad', code: 'none' };
  if (lastFail && lastFail.at > lastOk.at) return { ...base, level: 'bad', code: 'failed' };
  if (lastOk.guard) return { ...base, level: 'warn', code: 'guard', guard: lastOk.guard };
  if (pending) {
    const days = daysSince(u.since, now);
    const old = now - new Date(u.since).getTime() > staleDays() * 86400000;
    return { ...base, level: old ? 'bad' : 'warn', code: 'pending', old, days };
  }
  return base;
}

// the warning dot on the backup tab follows the Drive backup only
export function worstLevel() {
  return targetState('drive').level;
}

// Called after every change of the data (from commit): note since when there is something unsaved,
// then refresh the screen. Never starts a backup.
export function onDataChanged() {
  // (the screen is drawn right after this call: date the change in memory at once, so the first drawing
  // does not count the unsaved change as old; the stored date follows)
  const u = unsavedInfo();
  if (u && u.dirty && !(ctx.status.drive || {}).dirtySince) {
    ctx.status.drive = ctx.status.drive || {};
    ctx.status.drive.dirtySince = new Date().toISOString();
  }
  B.noteChange(ctx.db)
    .then(() => loadStatus())
    .then(() => ctx.render?.())
    .catch((e) => console.error(e));
}

// Used by the button (and to finish it after the trip to Google). IMPORTANT: must be called straight from
// a tap handler when `interactive` is true (nothing awaited before it, except the confirm dialog).
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
