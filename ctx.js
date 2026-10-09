// ctx.js: the one shared state object of the app, and the single place where data is saved.

import { touch, writeDb, isEmptyDb, kvSet } from './store.js';
import { toast } from './dom.js';
import { T, f } from './strings.js';

export const ctx = {
  db: null,
  status: { drive: {}, local: {} },
  localDir: null,
  localPerm: null,
  tab: 'shifts',
  jobId: null,
  month: '',
  editMode: false,
  busy: false,
  lastResult: null,
  persisted: false,
  hadData: false,
  started: false,
  corrupt: false,
  corruptRaw: null,
  render: () => {},
  afterCommit: (_opts) => {},
};

export const job = () => ctx.db.jobs.find((j) => j.id === ctx.jobId) || ctx.db.jobs[0];

export function markHadData() {
  if (ctx.hadData) return;
  ctx.hadData = true;
  try {
    localStorage.setItem('shiftlog.hadData', '1');
  } catch {
    /* ignore */
  }
  kvSet('hadData', true).catch(() => {});
}

// Every change of the data goes through here: mark changed, write to the phone storage,
// start the automatic backup (inside the same tap, which Google sign-in needs).
// opts.tap: false for changes that do not come straight from a tap (the Google window cannot open then)
export async function commit(opts = {}) {
  const db = ctx.db;
  touch(db);
  globalThis.__shiftlogDb = db;
  const writing = writeDb(db);
  if (!isEmptyDb(db)) markHadData();
  try {
    ctx.afterCommit({ fromTap: opts.tap !== false });
  } catch (e) {
    console.error(e);
  }
  ctx.render();
  try {
    await writing;
  } catch (e) {
    toast(f(T.notSavedText, { err: String(e && e.message ? e.message : e) }), { kind: 'err', ms: 12000 });
    throw e;
  }
}
