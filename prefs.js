// prefs.js: the settings of the app itself (look, feel, reminders). They are kept on this phone only
// (IndexedDB key "prefs"), NOT in the data and NOT in the backup file; on a new phone they start from the defaults.

import { kvGet, kvSet } from './store.js';
import { THEMES, BGS, DEFAULT_THEME, DEFAULT_BG } from './themes.js';

export const STALE_CHOICES = [1, 3, 7, 14];

export const DEFAULT_PREFS = {
  theme: DEFAULT_THEME,
  size: 2, // 0..4, the middle one is the usual size
  bg: DEFAULT_BG, // black | gray
  vibrate: true, // a short buzz when the time wheel passes a row
  sound: false, // a short tick when the time wheel passes a row
  strip: true, // the backup reminder strip on the shifts screen
  staleDays: 3, // unsaved changes turn red after this many days
  warnUnusual: true, // ask before saving a very long shift or a strange date
};

// the live object (everybody reads it directly)
export const prefs = { ...DEFAULT_PREFS };

const CHECK = {
  theme: (v) => THEMES.some((t) => t.id === v),
  size: (v) => Number.isInteger(v) && v >= 0 && v <= 4,
  bg: (v) => BGS.includes(v),
  vibrate: (v) => typeof v === 'boolean',
  sound: (v) => typeof v === 'boolean',
  strip: (v) => typeof v === 'boolean',
  staleDays: (v) => STALE_CHOICES.includes(v),
  warnUnusual: (v) => typeof v === 'boolean',
};

// a stored object -> a complete valid object (anything missing or wrong is replaced by the default)
export function normalizePrefs(raw) {
  const out = { ...DEFAULT_PREFS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_PREFS)) if (k in raw && CHECK[k](raw[k])) out[k] = raw[k];
  }
  return out;
}

const listeners = [];
// fn(prefs, key) is called after every change
export function onPrefsChange(fn) {
  listeners.push(fn);
}

export async function loadPrefs() {
  let raw = null;
  try {
    raw = await kvGet('prefs');
  } catch (e) {
    console.error('settings could not be read', e);
  }
  Object.assign(prefs, normalizePrefs(raw));
  globalThis.__shiftlogPrefs = prefs;
  return prefs;
}

let saving = Promise.resolve();
export function setPref(key, value) {
  if (!(key in DEFAULT_PREFS) || !CHECK[key](value)) throw new Error('bad setting ' + key);
  prefs[key] = value;
  const snapshot = { ...prefs };
  // writes follow each other, so the last choice is the one that stays
  saving = saving.then(() => kvSet('prefs', snapshot)).catch((e) => console.error('settings were not saved', e));
  for (const fn of listeners) {
    try {
      fn(prefs, key);
    } catch (e) {
      console.error(e);
    }
  }
  return saving;
}
