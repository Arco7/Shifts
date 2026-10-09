// backup.js: backup file format, Drive + phone folder backup, verification, rotation, restore.
//
// A "backup date" is only recorded after the file was written AND read back and compared
// with what was sent. A failed or unverified attempt never changes the date.

import { CONFIG } from './config.js';
import * as drive from './drive.js';
import { kvGet, kvSet } from './store.js';

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
  };
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

// Call from a tap handler: the first statement starts sign-in synchronously when needed.
export async function backupToDrive(built, { interactive = false } = {}) {
  const tokenP = drive.getToken({ interactive });
  const token = await tokenP;
  const folder = await drive.ensureFolder(token);
  const existing = sortedParsed(await drive.listFiles(token, folder.id, 'backup'));

  // protection against an accidentally empty database replacing good copies
  const guard = checkGuard(existing, built.counts.entries, await getAck());

  const up = await drive.uploadFile(token, { name: built.name, parent: folder.id, text: built.text, kind: 'backup' });
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

  let rotated = 0;
  const all = sortedParsed([...existing.map((f) => ({ id: f.id, name: f.name, size: f.size })), { id: up.id, name: built.name, size: up.size }]);
  for (const f of planRotation(all, guard)) {
    try {
      await drive.trashFile(token, f.id);
      rotated++;
    } catch {
      /* the next backup will try again */
    }
  }
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
let again = false;
// called after the silent follow-up round finished, so the screen can reload the status
let followUpHook = null;
export function onFollowUp(fn) {
  followUpHook = fn;
}

export function errorCode(e) {
  return (e && e.code) || 'error';
}

// One tap = Drive + phone folder. Each part has its own result and its own date.
export function runBackup(db, { interactive = false } = {}) {
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = doRun(db, { interactive }).finally(() => {
    inflight = null;
    if (again) {
      again = false;
      // changes made while the backup was running: one more silent round
      Promise.resolve()
        .then(() => runBackup(globalThis.__shiftlogDb || db, { interactive: false }))
        .then(() => (followUpHook ? followUpHook() : null))
        .catch(() => {});
    }
  });
  return inflight;
}

async function doRun(db, { interactive }) {
  const built = buildBackup(db);
  const driveP = backupToDrive(built, { interactive }); // starts sign-in synchronously
  const localP = backupToLocal(built);
  const [d, l] = await Promise.allSettled([driveP, localP]);
  const at = new Date().toISOString();
  const status = await getStatus();
  status.drive = status.drive || {};
  status.local = status.local || {};

  const result = { at, built, drive: null, local: null };
  if (d.status === 'fulfilled') {
    result.drive = d.value;
    status.drive.lastOk = { at, name: built.name, entries: built.counts.entries, rev: built.rev, account: d.value.account, guard: d.value.guard || null };
    delete status.drive.lastFail;
  } else {
    const code = errorCode(d.reason);
    result.drive = { ok: false, code, message: String(d.reason?.message || '') };
    // A silent run without a valid Google token is not a failure, it was simply not attempted:
    // the screen then asks for one tap instead of showing a red error.
    const notAttempted = code === 'not_configured' || code === 'redirecting' || (!interactive && (code === 'need_login' || code === 'unauthorized'));
    if (!notAttempted) status.drive.lastFail = { at, code, message: result.drive.message };
  }
  if (l.status === 'fulfilled') {
    result.local = l.value;
    if (l.value.ok) {
      status.local.lastOk = { at, name: built.name, entries: built.counts.entries, rev: built.rev, folder: l.value.folderName, guard: l.value.guard || null };
      delete status.local.lastFail;
    }
  } else {
    const code = errorCode(l.reason);
    result.local = { ok: false, code, message: String(l.reason?.message || '') };
    status.local.lastFail = { at, code, message: result.local.message };
  }
  await setStatus(status);
  return result;
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
