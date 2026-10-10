// prefs.js: the settings of the app itself (look, feel, reminders). They are kept on this phone only
// (IndexedDB key "prefs"), NOT in the data; on a new phone they start from the defaults. The one exception is
// "my colors" (three saved looks): they also travel in the backup file as a small extra (see the end of this file
// and backup.js), and a problem with them can never stop a backup or a restore of the shifts.

import { kvGet, kvSet } from './store.js';
import { THEMES, DEFAULT_THEME, sanitizeSlots } from './themes.js';

export const STALE_CHOICES = [1, 3, 7, 14];

export const DEFAULT_PREFS = {
  theme: DEFAULT_THEME,
  size: 2, // 0..4, the middle one is the usual size
  tint: true, // false = cards, rows, windows and bars are pure black ("true black")
  accentSat: 100, // 0..100, 100 = the accent as designed, 0 = the same hue, very pale
  tintSat: 100, // the same for the tint of the cards and windows
  accentLight: 100, // 0..100, 100 = the accent as designed, 0 = about half as bright
  myColors: [null, null, null], // three saved colors: {theme, accentSat, tintSat, accentLight} or null
  vibrate: true, // a short buzz when the time wheel passes a row
  sound: false, // a short tick when the time wheel passes a row
  tickLevel: 1, // 0..2 = how loud the tick is: quiet, medium, loud (see TICK_LEVELS in feedback.js)
  pressBuzz: true, // a short buzz on the round "+" button and on every switch in the settings
  strip: true, // the backup reminder strip on the shifts screen
  staleDays: 3, // unsaved changes turn red after this many days
};

// the live object (everybody reads it directly)
export const prefs = { ...DEFAULT_PREFS };

const isBool = (v) => typeof v === 'boolean';
const isPct = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
const CHECK = {
  theme: (v) => THEMES.some((t) => t.id === v),
  size: (v) => Number.isInteger(v) && v >= 0 && v <= 4,
  tint: isBool,
  accentSat: isPct,
  tintSat: isPct,
  accentLight: isPct,
  myColors: (v) => Array.isArray(v),
  vibrate: isBool,
  sound: isBool,
  tickLevel: (v) => Number.isInteger(v) && v >= 0 && v <= 2,
  pressBuzz: isBool,
  strip: isBool,
  staleDays: (v) => STALE_CHOICES.includes(v),
};

// a stored object -> a complete valid object (anything missing or wrong is replaced by the default;
// old keys that no longer exist, such as the gray background, are simply dropped)
export function normalizePrefs(raw) {
  const out = { ...DEFAULT_PREFS };
  if (raw && typeof raw === 'object') {
    for (const k of Object.keys(DEFAULT_PREFS)) if (k in raw && CHECK[k](raw[k])) out[k] = raw[k];
  }
  out.myColors = sanitizeSlots(out.myColors); // always exactly three places; a bad one is just empty
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
function notify(key) {
  for (const fn of listeners) {
    try {
      fn(prefs, key);
    } catch (e) {
      console.error(e);
    }
  }
}
function persist() {
  const snapshot = { ...prefs };
  // writes follow each other, so the last choice is the one that stays
  saving = saving.then(() => kvSet('prefs', snapshot)).catch((e) => console.error('settings were not saved', e));
  return saving;
}
export function setPref(key, value) {
  if (!(key in DEFAULT_PREFS) || !CHECK[key](value)) throw new Error('bad setting ' + key);
  prefs[key] = key === 'myColors' ? sanitizeSlots(value) : value;
  const p = persist();
  notify(key);
  return p;
}
// several settings at once (picking one of "my colors" sets the theme and the three sliders): one save, one redraw
export function setPrefs(patch) {
  for (const [k, v] of Object.entries(patch)) if (!(k in DEFAULT_PREFS) || !CHECK[k](v)) throw new Error('bad setting ' + k);
  for (const [k, v] of Object.entries(patch)) prefs[k] = k === 'myColors' ? sanitizeSlots(v) : v;
  const p = persist();
  notify('batch');
  return p;
}

// ---- "my colors" in the backup file (see backup.js: extras) ----
// Fills only the EMPTY places from the file; a place that already holds a color is never overwritten.
export function mergeMyColors(raw) {
  const incoming = sanitizeSlots(raw); // anything invalid in the file is dropped, place by place
  const next = prefs.myColors.slice();
  let changed = false;
  for (let i = 0; i < next.length; i++) {
    if (!next[i] && incoming[i]) {
      next[i] = incoming[i];
      changed = true;
    }
  }
  if (changed) setPref('myColors', next);
  return changed;
}
export function colorExtrasHooks() {
  return {
    collect: () => (prefs.myColors.some(Boolean) ? { myColors: prefs.myColors } : null),
    apply: (extras) => mergeMyColors(extras.myColors),
  };
}
