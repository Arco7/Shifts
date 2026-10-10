// app.js: start-up, tabs, rendering.

import { h, icon, clear, initSheets } from './dom.js';
import { ctx } from './ctx.js';
import { loadDb, emptyDb, isEmptyDb, requestPersist, kvGet } from './store.js';
import { validateDb, setExtrasHooks } from './backup.js';
import { fmtDate } from './calc.js';
import { loadStatus, worstLevel, onDataChanged, handleRedirectResult } from './autobackup.js';
import { shiftsScreen } from './ui-shifts.js';
import { workScreen } from './ui-work.js';
import { backupScreen, firstRunScreen, startRestoreFromDrive } from './ui-backup.js';
import { settingsScreen } from './ui-settings.js';
import { isConfigured, loadGis, consumeRedirectResult, signInMode } from './drive.js';
import { prefs, loadPrefs, onPrefsChange, colorExtrasHooks } from './prefs.js';
import { applyAppearance } from './themes.js';
import { T } from './strings.js';

const TABS = [
  ['shifts', 'navShifts', 'list'],
  ['work', 'navWork', 'briefcase'],
  ['backup', 'navBackup', 'cloud'],
  ['settings', 'navSettings', 'gear'],
];

let lastTab = null;

function needsFirstRun() {
  return isEmptyDb(ctx.db) && (!ctx.started || ctx.corrupt);
}

function goTab(tab) {
  ctx.tab = tab;
  ctx.editMode = false;
  render();
}

function renderNav(nav) {
  clear(nav);
  const level = worstLevel();
  for (const [id, label, ic] of TABS) {
    const on = ctx.tab === id;
    nav.append(
      h(
        'button',
        { class: 'nav-item' + (on ? ' on' : ''), type: 'button', 'aria-current': on ? 'page' : null, onclick: () => goTab(id) },
        h('span', { class: 'nav-ic' }, icon(ic, 23), id === 'backup' && (level === 'bad' || level === 'warn') ? h('span', { class: 'nav-dot ' + level }) : null),
        h('span', null, T[label]),
      ),
    );
  }
}

export function render() {
  ctx.sliding = false; // whatever redraws the screen ends a slider drag (the slider is a new element now)
  const view = document.getElementById('view');
  const nav = document.getElementById('nav');
  const prevScroll = view.querySelector('.scroll');
  const keep = prevScroll && lastTab === ctx.tab ? prevScroll.scrollTop : 0;

  if (needsFirstRun()) {
    nav.hidden = true;
    view.replaceChildren(firstRunScreen());
    lastTab = 'firstrun';
    return;
  }
  nav.hidden = false;
  let parts;
  if (ctx.tab === 'work') parts = workScreen();
  else if (ctx.tab === 'backup') parts = backupScreen();
  else if (ctx.tab === 'settings') parts = settingsScreen();
  else parts = shiftsScreen({ goBackup: () => goTab('backup') });
  view.replaceChildren(...parts);
  const sc = view.querySelector('.scroll');
  if (sc && keep) sc.scrollTop = keep;
  lastTab = ctx.tab;
  renderNav(nav);
}

async function boot() {
  initSheets();
  ctx.render = render;
  ctx.afterCommit = () => onDataChanged();
  ctx.month = fmtDate(new Date()).slice(0, 7);

  // the look (color, text size, background) is on the page before the first drawing, so nothing flashes
  try {
    await loadPrefs();
  } catch (e) {
    console.error(e);
  }
  applyAppearance(prefs);
  setExtrasHooks(colorExtrasHooks()); // "my colors" travel in the backup file as a harmless extra
  onPrefsChange(() => {
    applyAppearance(prefs);
    // a color slider is being dragged: the colors change at once, but the screen is not redrawn under the finger
    if (ctx.sliding) return;
    // the screen is drawn again: remember which control had the focus and give it back
    const a = document.activeElement;
    const d = a && a.dataset ? { pref: a.dataset.pref, value: a.dataset.value, theme: a.dataset.theme, slot: a.dataset.slot } : null;
    render();
    if (d && (d.pref || d.theme || d.slot !== undefined)) {
      const sel = d.theme ? `[data-theme="${d.theme}"]` : d.slot !== undefined ? `[data-slot="${d.slot}"]` : `[data-pref="${d.pref}"]` + (d.value !== undefined ? `[data-value="${d.value}"]` : '');
      document.querySelector('#view ' + sel)?.focus({ preventScroll: true });
    }
  });

  let db = null;
  try {
    db = await loadDb();
  } catch (e) {
    console.error(e);
  }
  try {
    ctx.hadData = localStorage.getItem('shiftlog.hadData') === '1';
  } catch {
    /* ignore */
  }
  try {
    if (await kvGet('hadData')) ctx.hadData = true;
    ctx.started = !!(await kvGet('started'));
  } catch {
    /* ignore */
  }

  if (db) {
    try {
      validateDb(db);
    } catch (e) {
      // damaged data: never overwrite it silently, offer restore instead
      console.error('stored data is damaged', e);
      ctx.corruptRaw = db;
      ctx.corrupt = true;
      db = null;
    }
  }
  ctx.db = db || emptyDb();
  globalThis.__shiftlogDb = ctx.db;

  let saved = null;
  try {
    saved = localStorage.getItem('shiftlog.job');
  } catch {
    /* ignore */
  }
  ctx.jobId = ctx.db.jobs.some((j) => j.id === saved) ? saved : ctx.db.jobs[0].id;

  try {
    await loadStatus();
  } catch (e) {
    console.error(e);
  }
  // came back from Google (redirect sign-in): take the token out of the address first
  let redirectResult = null;
  try {
    redirectResult = await consumeRedirectResult();
  } catch (e) {
    console.error(e);
  }
  render();
  if (redirectResult) {
    handleRedirectResult(redirectResult)
      .then(() => {
        if (redirectResult.ok && redirectResult.pending === 'restore') startRestoreFromDrive();
      })
      .catch((e) => console.error(e));
  }
  requestPersist().then((p) => {
    ctx.persisted = p;
    render();
  });
  // popup sign-in only: load the Google script early (the window must open straight from a tap)
  if (isConfigured() && signInMode() === 'popup') loadGis().catch(() => {});
  document.addEventListener('visibilitychange', () => {
    // another window (the Google sign-in tab) may have changed the status meanwhile
    if (document.visibilityState === 'visible') loadStatus().then(() => render());
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e));
  }
  window.__booted = true;
}

boot().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  if (view) view.textContent = 'שגיאת טעינה: ' + (e && e.message ? e.message : e);
  window.__bootError = String(e && e.stack ? e.stack : e);
});
