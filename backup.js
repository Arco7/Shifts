// backup.js: backup file format, Drive + phone folder backup, verification, rotation, restore.
//
// A "backup date" is only recorded after the file was written AND read back and compared
// with what was sent. A failed or unverified attempt never changes the date.

import { CONFIG } from './config.js';
import * as drive from './drive.js';
import { kvGet, kvSet, isEmptyDb } from './store.js';

export const FORMAT = 'shiftlog-backup';
export const VERSION = 1;

export class BackupError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const pad = (n) => String(n).padStart(2, '0');
export function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
const NAME_RE = /^shifts-(backup|safety)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_e(\d+)\.json$/;

export function parseName(name) {
  const m = NAME_RE.exec(name || '');
  if (!m) return null;
  return { kind: m[1], key: `${m[2]}${m[3]}${m[4]}${m[5]}${m[6]}${m[7]}`, date: new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6], +m[7]), entries: +m[8], name };
}

// ---------- "what is not in the backup yet" ----------
// A signature is one small number per record (every shift/day entry and every job with its settings),
// made from the record's content. It is stored with the last backup and compared with the data as it
// is now: the difference is the number of changes (added, edited, deleted) that no backup has yet.
function canon(v) {
  if (v === undefined) return 'null';
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') {
    return (
      '{' +
      Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canon(v[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(v);
}
// cyrb53: a fast 53-bit text hash (not for secrets; only to notice that a record changed)
function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function makeSig(db) {
  const sig = {};
  // (prefixes keep a shift id and a job id apart, whatever they look like)
  for (const e of db.entries) sig['e:' + e.id] = hash53(canon(e));
  for (const j of db.jobs) sig['j:' + j.id] = hash53(canon(j));
  return sig;
}
// {added, changed, removed, total} between the data now and a stored signature
export function diffSig(db, sig) {
  let added = 0;
  let changed = 0;
  let seen = 0;
  const check = (key, rec) => {
    if (!Object.prototype.hasOwnProperty.call(sig, key)) added++;
    else {
      seen++;
      if (sig[key] !== hash53(canon(rec))) changed++;
    }
  };
  for (const e of db.entries) check('e:' + e.id, e);
  for (const j of db.jobs) check('j:' + j.id, j);
  const removed = Object.keys(sig).length - seen;
  return { added, changed, removed, total: added + changed + removed };
}

export function buildBackup(db, now = new Date(), kind = 'backup') {
  const counts = { entries: db.entries.length, jobs: db.jobs.length };
  const env = { format: FORMAT, version: VERSION, createdAt: now.toISOString(), rev: db.rev || 0, counts, data: db };
  const text = JSON.stringify(env);
  return {
    text,
    name: `shifts-${kind}_${stamp(now)}_e${counts.entries}.json`,
    kind,
    counts,
    rev: db.rev || 0,
    createdAt: env.createdAt,
    bytes: new TextEncoder().encode(text).length,
    sig: makeSig(db),
  };
}

// Before a backup: are there fewer records than in the last backup? The last backup of the same place
// counts; when this place has none yet, the other place. Returns null when nothing is wrong.
export function countDrop(status, kind, nowCount) {
  const otherKind = kind === 'drive' ? 'local' : 'drive';
  // (after a restore of an older, smaller copy `refEntries` still remembers the bigger number)
  const count = (o) => (Number.isFinite(o.refEntries) ? o.refEntries : o.entries);
  const has = (o) => o && Number.isFinite(count(o));
  const own = status && status[kind] && status[kind].lastOk;
  const other = status && status[otherKind] && status[otherKind].lastOk;
  const ref = has(own) ? own : has(other) ? other : null;
  if (!ref || nowCount >= count(ref)) return null;
  return { before: count(ref), now: nowCount, at: ref.at, from: ref === own ? kind : otherKind };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function validateDb(db) {
  const bad = (m) => {
    throw new BackupError('invalid_data', m);
  };
  if (!db || typeof db !== 'object') bad('no data');
  if (db.schema !== 1) bad('unsupported schema');
  if (!Array.isArray(db.jobs) || db.jobs.length < 1) bad('no jobs');
  if (!Array.isArray(db.entries)) bad('no entries');
  const jobIds = new Set();
  for (const j of db.jobs) {
    if (!j || typeof j.id !== 'string' || typeof j.name !== 'string' || typeof j.settings !== 'object' || j.settings === null) bad('bad job');
    jobIds.add(j.id);
  }
  const ids = new Set();
  for (const e of db.entries) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id)) bad('bad or duplicate entry id');
    ids.add(e.id);
    if (!jobIds.has(e.jobId)) bad('entry of unknown job');
    if (e.type === 'shift') {
      if (!DT_RE.test(e.start || '') || !DT_RE.test(e.end || '')) bad('bad shift time');
    } else if (e.type === 'sick' || e.type === 'dayoff' || e.type === 'holiday') {
      if (!DATE_RE.test(e.date || '')) bad('bad date');
    } else bad('unknown entry type');
  }
  return true;
}

export function parseBackup(text) {
  let env;
  try {
    env = JSON.parse(text);
  } catch {
    throw new BackupError('not_json', 'not a JSON file');
  }
  if (!env || env.format !== FORMAT) throw new BackupError('bad_format', 'not a backup of this app');
  if (typeof env.version !== 'number' || env.version > VERSION) throw new BackupError('too_new', 'backup made by a newer version');
  validateDb(env.data);
  if (env.counts && (env.counts.entries !== env.data.entries.length || env.counts.jobs !== env.data.jobs.length)) {
    throw new BackupError('count_mismatch', 'record counts do not match');
  }
  return { db: env.data, env };
}

// ---------- status (what the screen shows) ----------

export async function getStatus() {
  return (await kvGet('backupStatus')) || { drive: {}, local: {} };
}
async function setStatus(s) {
  await kvSet('backupStatus', s);
}

// ---------- phone folder ----------

export const localFolderSupported = () => typeof globalThis.showDirectoryPicker === 'function';

export async function pickLocalFolder() {
  const h = await globalThis.showDirectoryPicker({ mode: 'readwrite', id: 'shiftlog' });
  const t = await h.getFileHandle('.write-test', { create: true });
  const w = await t.createWritable();
  await w.write('ok');
  await w.close();
  await h.removeEntry('.write-test');
  await kvSet('localDir', h);
  return h;
}
export async function getLocalFolder() {
  return (await kvGet('localDir')) || null;
}
export async function forgetLocalFolder() {
  await kvSet('localDir', null);
}
// must be called from a tap when `request` is true
export async function localPermission(h, request = false) {
  const opts = { mode: 'readwrite' };
  let p = await h.queryPermission(opts);
  if (p !== 'granted' && request) p = await h.requestPermission(opts);
  return p;
}

async function listLocal(dir) {
  const out = [];
  for await (const [name, handle] of dir.entries()) {
    if (handle.kind !== 'file') continue;
    const p = parseName(name);
    if (p && p.kind === 'backup') out.push(p);
  }
  return out.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

// Protection against an accidentally empty (or sharply smaller) database pushing good copies out.
// `files` = copies that already exist (parsed names). The reference is the copy with the MOST entries,
// not just the newest one, so repeated empty backups cannot wash good copies out one by one.
// `ack` = entry count the user explicitly accepted as the new normal (see acceptSmallDb).
export function checkGuard(files, builtEntries, ack = 0) {
  const list = Array.isArray(files) ? files : files ? [files] : [];
  let ref = null;
  for (const f of list) if (!ref || f.entries > ref.entries) ref = f;
  if (!ref || ref.entries <= 0) return null;
  const suspicious = builtEntries === 0 || (ref.entries >= 5 && builtEntries < ref.entries * 0.5);
  if (!suspicious) return null;
  if (ack > 0 && builtEntries >= ack) return null;
  return { now: builtEntries, before: ref.entries, name: ref.name };
}

// Which files may be removed. Normal case: everything beyond the newest KEEP.
// Guard case: the same, but "good" copies (at least half of the reference size) are never removed.
export function planRotation(sortedNewestFirst, guard) {
  const rest = sortedNewestFirst.slice(CONFIG.KEEP);
  if (!guard) return rest;
  const floor = Math.max(1, guard.before * 0.5);
  return rest.filter((f) => f.entries < floor);
}

// The user confirms that the current (smaller) amount of data is right.
export async function acceptSmallDb(entries) {
  await kvSet('guardAck', Math.max(0, entries | 0));
}
async function getAck() {
  return Number(await kvGet('guardAck')) || 0;
}

export async function backupToLocal(built) {
  const dir = await getLocalFolder();
  if (!dir) return { skipped: true };
  const perm = await dir.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new BackupError('local_permission', 'folder access must be confirmed');
  const guard = checkGuard(await listLocal(dir), built.counts.entries, await getAck());
  const fh = await dir.getFileHandle(built.name, { create: true });
  const w = await fh.createWritable();
  await w.write(built.text);
  await w.close();
  const back = await (await fh.getFile()).text();
  if (back !== built.text) {
    try {
      await dir.removeEntry(built.name);
    } catch {
      /* ignore */
    }
    throw new BackupError('verify_failed', 'file on the phone differs from the source');
  }
  // rotation: only after the new file is verified
  let rotated = 0;
  const all = await listLocal(dir);
  for (const f of planRotation(all, guard)) {
    try {
      await dir.removeEntry(f.name);
      rotated++;
    } catch {
      /* ignore */
    }
  }
  return { ok: true, name: built.name, rotated, guard, folderName: dir.name };
}

// manual download (no folder access): cannot be verified from the page
export function downloadBackup(built) {
  const blob = new Blob([built.text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = built.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------- Drive ----------

function sortedParsed(files) {
  return files
    .map((f) => ({ ...parseName(f.name), id: f.id, size: Number(f.size) || 0 }))
    .filter((f) => f.key)
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

// ---------- progress (what the screen shows while a backup runs) ----------

// the steps of a Drive backup, in order
export const DRIVE_STEPS = ['prepare', 'auth', 'folder', 'upload', 'verify', 'cleanup'];

// A tracker remembers which step is running and how long every finished step took.
export function makeTracker(keys, onChange) {
  const t = {
    keys,
    startedAt: Date.now(),
    index: -1,
    stepStartedAt: 0,
    steps: keys.map((key) => ({ key, ms: null })),
    failedAt: -1,
    done: false,
    totalMs: null,
  };
  const notify = () => {
    try {
      if (onChange) onChange(t);
    } catch {
      /* the screen must never break a backup */
    }
  };
  const closeCurrent = () => {
    if (t.index >= 0 && t.steps[t.index].ms == null) t.steps[t.index].ms = Date.now() - t.stepStartedAt;
  };
  t.step = (key) => {
    closeCurrent();
    t.index = keys.indexOf(key);
    t.stepStartedAt = Date.now();
    notify();
  };
  t.fail = () => {
    t.failedAt = t.index;
  };
  t.end = () => {
    closeCurrent();
    t.done = true;
    t.totalMs = Date.now() - t.startedAt;
    notify();
  };
  t.snapshot = () => ({
    steps: t.steps.map((x) => ({ ...x })),
    failedAt: t.failedAt,
    totalMs: t.totalMs != null ? t.totalMs : Date.now() - t.startedAt,
  });
  return t;
}

let progressHook = null;
export function onProgress(fn) {
  progressHook = fn;
}

// ---------- Drive ----------

// Call from a tap handler: the first statement starts sign-in synchronously when needed.
// Steps: auth -> folder -> upload (and list the old copies at the same time) -> verify -> cleanup.
export async function backupToDrive(built, { interactive = false, tracker = null, signal = null } = {}) {
  const step = (k) => {
    if (tracker) tracker.step(k);
  };
  // after "cancel" or the time limit no further request may start (a late answer must not write anything)
  const alive = () => {
    if (signal && signal.aborted) throw new BackupError('cancelled', 'cancelled');
  };
  step('auth');
  const tokenP = drive.getToken({ interactive });
  const token = await tokenP;
  alive(); // the Google window may answer long after the user pressed "cancel"

  step('folder');
  const folder = await drive.ensureFolder(token);
  alive();

  step('upload');
  const [listed, uploaded] = await Promise.allSettled([
    drive.listFiles(token, folder.id, 'backup'),
    drive.uploadFile(token, { name: built.name, parent: folder.id, text: built.text, kind: 'backup' }),
  ]);
  if (uploaded.status === 'rejected') throw uploaded.reason;
  const up = uploaded.value;
  if (signal && signal.aborted) {
    // stopped after the upload: the new file was never checked, so it must not stay as the newest copy
    drive.trashFile(token, up.id).catch(() => {});
    throw new BackupError('cancelled', 'cancelled');
  }
  // if the list of old copies could not be read, nothing is removed this time (the next run will clean up)
  const listOk = listed.status === 'fulfilled';

  step('verify');
  let back;
  try {
    back = await drive.downloadText(token, up.id);
  } catch (e) {
    await drive.trashFile(token, up.id).catch(() => {});
    throw e;
  }
  if (back !== built.text || Number(up.size) !== built.bytes) {
    await drive.trashFile(token, up.id).catch(() => {});
    throw new BackupError('verify_failed', 'file on Drive differs from the source');
  }
  if (signal && signal.aborted) {
    drive.trashFile(token, up.id).catch(() => {});
    throw new BackupError('cancelled', 'cancelled');
  }

  step('cleanup');
  const existing = listOk ? sortedParsed(listed.value).filter((f) => f.id !== up.id) : [];
  // protection against an accidentally empty database replacing good copies
  const guard = listOk ? checkGuard(existing, built.counts.entries, await getAck()) : null;
  const all = sortedParsed([...existing.map((f) => ({ id: f.id, name: f.name, size: f.size })), { id: up.id, name: built.name, size: up.size }]);
  // the copy that was just verified is never the one that goes (copies are ordered by the time in their
  // names, and a wrong clock on the phone once could put it behind ten "newer" files)
  const doomed = listOk ? planRotation(all, guard).filter((f) => f.id !== up.id) : [];
  const trashed = await Promise.allSettled(doomed.map((f) => drive.trashFile(token, f.id)));
  const rotated = trashed.filter((r) => r.status === 'fulfilled').length;
  return { ok: true, id: up.id, name: built.name, rotated, guard, folderId: folder.id, account: drive.accountEmail() };
}

export async function listDriveBackups({ interactive = false } = {}) {
  const tokenP = drive.getToken({ interactive });
  const token = await tokenP;
  const folder = await drive.ensureFolder(token);
  return sortedParsed(await drive.listFiles(token, folder.id, 'backup'));
}
export async function fetchDriveBackup(id, { interactive = false } = {}) {
  const tokenP = drive.getToken({ interactive });
  const token = await tokenP;
  return drive.downloadText(token, id);
}

// ---------- orchestrator ----------

let inflight = null;
let currentCtl = null;
export function errorCode(e) {
  return (e && e.code) || 'error';
}

// The user pressed "cancel" while a backup is running.
export function cancelBackup() {
  if (currentCtl) currentCtl.abort();
}

// A whole Drive backup may take this long at most, then it stops by itself.
export const LIMITS = { total: 120000 };

// Status is written in a queue, so the Drive and phone parts never overwrite each other.
let statusChain = Promise.resolve();
function updateStatus(fn) {
  const run = statusChain.then(async () => {
    const s = await getStatus();
    s.drive = s.drive || {};
    s.local = s.local || {};
    fn(s);
    await setStatus(s);
  });
  statusChain = run.catch(() => {});
  return run;
}

// Called after every change of the data: remembers since when there are changes that no Drive backup
// has (the screen turns red when they are older than three days).
export async function noteChange(db) {
  await updateStatus((s) => {
    const ok = s.drive.lastOk;
    let dirty;
    if (isEmptyDb(db)) dirty = false;
    else if (!ok) dirty = true;
    else if (ok.sig) dirty = diffSig(db, ok.sig).total > 0;
    else dirty = (ok.rev || 0) < (db.rev || 0);
    if (dirty) {
      if (!s.drive.dirtySince) s.drive.dirtySince = new Date().toISOString();
    } else delete s.drive.dirtySince;
  });
}

// After a restore from a copy on Drive the data IS that copy: it counts as the last Drive backup,
// so the screen does not claim that everything is unsaved.
export async function markRestored(db, { at, name }) {
  const sig = makeSig(db);
  await updateStatus((s) => {
    // an older, smaller copy must not lower the number the next backup is compared with
    const prev = s.drive.lastOk;
    const prevCount = prev ? (Number.isFinite(prev.refEntries) ? prev.refEntries : prev.entries) : 0;
    const refEntries = Math.max(Number.isFinite(prevCount) ? prevCount : 0, db.entries.length);
    s.drive.lastOk = { at, name, entries: db.entries.length, refEntries, rev: db.rev || 0, account: drive.accountEmail(), guard: null, ms: null, restored: true, sig };
    delete s.drive.lastFail;
    delete s.drive.dirtySince;
  });
}

// Backup to Drive (only by a tap on the button, after a confirmation; nothing is automatic).
// Returns {at, built, drive, local: null, steps, manual}. A call that arrives while a backup is
// running joins it. Changes made while it runs are not lost: they simply stay "not in the backup yet"
// (the screen counts them), and the next tap saves them.
let runManual = false;
export function runBackup(db, { interactive = false, manual = false } = {}) {
  if (inflight) {
    if (manual) runManual = true;
    return inflight;
  }
  runManual = manual;
  const run = doRun(db, { interactive });
  inflight = run.finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRun(db, { interactive }) {
  const ctl = new AbortController();
  currentCtl = ctl;
  drive.setRunSignal(ctl.signal);
  let timedOut = false;
  const watchdog = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, LIMITS.total);
  const tracker = makeTracker(DRIVE_STEPS, (t) => {
    if (progressHook) progressHook(t);
  });
  tracker.step('prepare');
  const built = buildBackup(db);
  // NOTE: nothing may be awaited before this call (Google sign-in must start inside the tap)
  const driveP = backupToDrive(built, { interactive, tracker, signal: ctl.signal });
  // "cancel" and the time limit also end a wait that has no request of its own (the Google window)
  const stopped = new Promise((_, reject) => {
    ctl.signal.addEventListener('abort', () => reject(new BackupError('cancelled', 'cancelled')), { once: true });
  });
  let d;
  try {
    d = { ok: true, value: await Promise.race([driveP, stopped]) };
  } catch (e) {
    tracker.fail();
    d = { ok: false, reason: e };
    if (ctl.signal.aborted) drive.abandonSignIn();
  } finally {
    clearTimeout(watchdog);
    drive.setRunSignal(null);
    currentCtl = null;
    tracker.end();
  }
  const at = new Date().toISOString();
  const steps = tracker.snapshot();

  const result = { at, built, drive: null, local: null, steps, manual: runManual };
  if (d.ok) {
    result.drive = d.value;
  } else {
    let code = errorCode(d.reason);
    if (code === 'cancelled' && timedOut) code = 'timeout';
    result.drive = { ok: false, code, message: String(d.reason?.message || '') };
  }
  await updateStatus((status) => {
    if (d.ok) {
      status.drive.lastOk = { at, name: built.name, entries: built.counts.entries, rev: built.rev, account: d.value.account, guard: d.value.guard || null, ms: steps.totalMs, sig: built.sig };
      delete status.drive.lastFail;
      // changes made while the backup was running are not in it
      const latest = globalThis.__shiftlogDb || db;
      if (diffSig(latest, built.sig).total > 0) status.drive.dirtySince = at;
      else delete status.drive.dirtySince;
    } else {
      const code = result.drive.code;
      // A silent run without a valid Google token is not a failure, it was simply not attempted:
      // the screen then asks for one tap instead of showing a red error. Cancelled by the user: same.
      const notAttempted = code === 'not_configured' || code === 'redirecting' || code === 'cancelled' || (!interactive && (code === 'need_login' || code === 'unauthorized'));
      if (!notAttempted) status.drive.lastFail = { at, code, message: result.drive.message };
    }
  });
  return result;
}

// The phone copy: the browser saves a file into the "Downloads" folder (no folder access needed).
// The page cannot check afterwards that the file is really there, so it is marked "not verified".
export async function backupToPhone(db) {
  const built = buildBackup(db);
  downloadBackup(built);
  const at = new Date().toISOString();
  await updateStatus((status) => {
    status.local.lastOk = { at, name: built.name, entries: built.counts.entries, rev: built.rev, via: 'download', guard: null };
    delete status.local.lastFail;
  });
  return { ok: true, name: built.name, at, entries: built.counts.entries, verified: false, bytes: built.bytes };
}

// ---------- restore ----------

export async function saveSafety(db) {
  const built = buildBackup(db, new Date(), 'safety');
  const list = (await kvGet('safety')) || [];
  list.unshift({ name: built.name, at: built.createdAt, entries: built.counts.entries, text: built.text });
  await kvSet('safety', list.slice(0, 5));
  return built;
}
export async function listSafety() {
  return (await kvGet('safety')) || [];
}

// best effort: also keep the safety copy on Drive (does not block the restore)
export async function safetyToDrive(built) {
  try {
    const token = await drive.getToken({ interactive: false });
    const folder = await drive.ensureFolder(token);
    const up = await drive.uploadFile(token, { name: built.name, parent: folder.id, text: built.text, kind: 'safety' });
    const files = sortedParsed(await drive.listFiles(token, folder.id, 'safety'));
    for (const f of files.slice(5)) await drive.trashFile(token, f.id).catch(() => {});
    return !!up.id;
  } catch {
    return false;
  }
}

export function describeDb(db) {
  let last = '';
  for (const e of db.entries) {
    const d = e.type === 'shift' ? e.start.slice(0, 10) : e.date;
    if (d > last) last = d;
  }
  return { entries: db.entries.length, jobs: db.jobs.length, lastDate: last };
}
