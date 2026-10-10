// themes.js: the color themes (11 accent colors) and the dark surfaces that go with each of them.
//
// The page itself is always black. One theme = one accent color + a hue. Every dark surface (rows, cards, the
// bottom bar...) is the same lightness in every theme and is tinted with the theme's hue; only the strength of the
// tint (S) differs, because a dark blue tint is much harder to see than a dark red or green one. "S" is the one
// number to change if a tint looks too strong or too weak on the real phone. With the tint switched off every
// surface is pure black ("true black"). Three sliders (accent saturation, tint saturation, accent brightness) work
// on top of any theme; 100 = the colors as designed, lower = paler / darker.
// The status colors (ok = green, warning = amber, error = red) do not depend on the theme, except that the
// yellow theme uses orange for the warning so that it does not melt into the accent.

export const DEFAULT_THEME = 'turquoise';

// name: Hebrew name; hue: 0..360; S: strength of the tint in percent (0 = neutral gray)
export const THEMES = [
  { id: 'turquoise', name: 'טורקיז', acc: '#1eb7d3', hue: 189, S: 18 },
  { id: 'aqua', name: 'אקווה', acc: '#19c3a0', hue: 168, S: 16 },
  { id: 'green', name: 'ירוק', acc: '#3ddc84', hue: 147, S: 16 },
  { id: 'sky', name: 'תכלת', acc: '#2f9bff', hue: 209, S: 30 },
  { id: 'blue', name: 'כחול', acc: '#4070ff', hue: 225, S: 36 },
  { id: 'indigo', name: 'אינדיגו', acc: '#8a6dff', hue: 252, S: 36 },
  { id: 'steel', name: 'פלדה', acc: '#8fa8c4', hue: 212, S: 28 },
  { id: 'white', name: 'לבן', acc: '#f1f4f7', hue: 210, S: 0 },
  { id: 'red', name: 'אדום', acc: '#ff2d55', hue: 349, S: 16 },
  { id: 'yellow', name: 'צהוב', acc: '#fcee0a', hue: 57, S: 14, warn: '#ff8a2b' },
  { id: 'lime', name: 'ליים', acc: '#c8f01e', hue: 71, S: 14 },
];

// lightness (percent) of every surface
const LADDER = { nav: 6, sheet: 5, rowA: 4, rowB: 6, card: 7, card2: 10, input: 3, strip: 5 };
const LINE_L = 19; // the thin gray outlines and separators: neutral gray, never tinted
// how much weaker than S each kind of surface is tinted (percent points)
const TINT_LESS = { nav: 4, sheet: 4, rowA: 0, rowB: 0, card: 4, card2: 4, input: 2, strip: 4 };
const INK = '#03171b'; // dark text on top of the accent color
const WARN = '#f4b73f';

export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// ---- the three sliders: 100 = as designed; 0 = very pale / half as bright, never plain gray ----
export const ACCENT_SAT_MIN = 0.15; // the accent's saturation at slider 0, as a part of the designed one
export const TINT_SAT_MIN = 0.22; // the same for the tint of the cards and windows
export const ACCENT_SAT_FLOOR = 8; // ...but never below this many percent (steel is already pale), so the hue never turns plain gray
export const LIGHT_MIN = 0.5; // the accent's lightness at slider 0, as a part of the designed one
export const LUM_FLOOR = 0.12; // a dark accent is never darker than this (WCAG luminance), so it stays readable on black
const mixMin = (min, v) => min + (1 - min) * (v / 100);
const pct = (v) => (Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 100);

// relative luminance of a '#rrggbb' color (WCAG)
export const lumOf = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
export const contrast = (a, b) => {
  const la = lumOf(a);
  const lb = lumOf(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
// '#rrggbb' -> [hue 0..360, saturation %, lightness %]
export function hexToHsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (d > 0) {
    sat = d / (1 - Math.abs(2 * l - 1));
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return [hue, sat * 100, l * 100];
}

// the accent color of a theme with the saturation and brightness sliders applied (100/100 = the designed color, exactly)
export function accentOf(themeId, { accentSat = 100, accentLight = 100 } = {}) {
  const t = themeById(themeId);
  const sv = pct(accentSat);
  const lv = pct(accentLight);
  if (sv === 100 && lv === 100) return t.acc;
  const [hue, sat0, l0] = hexToHsl(t.acc);
  const spread = (l) => 1 - Math.abs((2 * l) / 100 - 1); // how much room a color has to be colorful at this lightness
  let sat;
  if (t.S === 0) sat = sat0; // the white theme has no color to fade
  else sat = Math.max(sat0 * mixMin(ACCENT_SAT_MIN, sv), Math.min(sat0, ACCENT_SAT_FLOOR));
  const colorAt = (l) => {
    // the white theme keeps its (tiny) amount of color when it gets darker, instead of turning blue
    const s2 = t.S === 0 && spread(l) > 0 ? Math.min(100, (sat * spread(l0)) / spread(l)) : sat;
    return hslToHex(hue, s2, l);
  };
  // the darkest lightness allowed: half of the designed one, but never so dark that the accent is hard to read on black
  let lo = l0 * LIGHT_MIN;
  if (lumOf(colorAt(lo)) < LUM_FLOOR) {
    if (lumOf(colorAt(l0)) >= LUM_FLOOR) {
      let a = lo;
      let b = l0;
      for (let i = 0; i < 24; i++) {
        const mid = (a + b) / 2;
        if (lumOf(colorAt(mid)) >= LUM_FLOOR) b = mid;
        else a = mid;
      }
      lo = b;
    } else lo = l0;
  }
  // the slider runs evenly from that darkest value (0) to the designed lightness (100): no steps that look the same
  return colorAt(lo + (l0 - lo) * (lv / 100));
}
// text on top of the accent: the dark ink, or white when the accent has become dark
export const inkFor = (acc) => (contrast(INK, acc) >= contrast('#ffffff', acc) ? INK : '#ffffff');
// the knob of a switch: white, except in the white theme where it is dark
const knobOf = (t) => (t.id === 'white' ? INK : '#ffffff');

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

// all the CSS variables of one theme: {'--accent': '#1eb7d3', ...}
// opts: tint (false = every surface pure black), accentSat / tintSat / accentLight (0..100, 100 = as designed)
export function themeVars(themeId, { tint = true, accentSat = 100, tintSat = 100, accentLight = 100 } = {}) {
  const t = themeById(themeId);
  const acc = accentOf(t.id, { accentSat, accentLight });
  const tm = mixMin(TINT_SAT_MIN, pct(tintSat));
  const surface = (key) => (tint ? hslToHex(t.hue, Math.max(0, t.S - TINT_LESS[key]) * tm, LADDER[key]) : '#000000');
  const designed = acc === t.acc;
  return {
    '--accent': acc,
    '--accent-rgb': rgbOf(acc),
    '--accent-ink': designed ? INK : inkFor(acc),
    '--knob': knobOf(t),
    '--warn': t.warn || WARN,
    '--bg': '#000000',
    '--nav': surface('nav'),
    '--sheet': surface('sheet'),
    '--row-a': surface('rowA'),
    '--row-b': surface('rowB'),
    '--card': surface('card'),
    '--card2': surface('card2'),
    '--input': surface('input'),
    '--line': hslToHex(0, 0, LINE_L),
    '--strip': surface('strip'),
    '--muted': hslToHex(t.hue, t.S === 0 ? 0 : 6, 62),
  };
}

// ---- the three saved colors of the user ("my colors"): a theme + the three slider values ----
export const SLOT_COUNT = 3;
const isPct = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
// anything -> {theme, accentSat, tintSat, accentLight} or null (nothing invalid gets through)
export function sanitizeSlot(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.theme !== 'string' || !THEMES.some((t) => t.id === raw.theme)) return null;
  if (!isPct(raw.accentSat) || !isPct(raw.tintSat) || !isPct(raw.accentLight)) return null;
  const step = (v) => Math.round(v / 5) * 5; // the sliders move in steps of 5; anything else in a file is rounded to the nearest step
  return { theme: raw.theme, accentSat: step(raw.accentSat), tintSat: step(raw.tintSat), accentLight: step(raw.accentLight) };
}
// anything -> a list of exactly SLOT_COUNT places, each a valid slot or null (one bad slot does not spoil the others)
export function sanitizeSlots(raw) {
  const out = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    let v = null;
    try {
      v = Array.isArray(raw) ? sanitizeSlot(raw[i]) : null;
    } catch {
      v = null;
    }
    out.push(v);
  }
  return out;
}
export const sameSlot = (a, b) => !!a && !!b && a.theme === b.theme && a.accentSat === b.accentSat && a.tintSat === b.tintSat && a.accentLight === b.accentLight;

// the sizes of the text: root font size in px for every step (the middle one is the usual size)
export const SIZE_PX = [12, 13, 14, 15, 16];

// Puts the look (theme, tint, sliders, text size) on the page (the <html> element and the browser's bar color).
export function applyAppearance({ theme = DEFAULT_THEME, tint = true, accentSat = 100, tintSat = 100, accentLight = 100, size = 2 } = {}) {
  const root = document.documentElement;
  const vars = themeVars(theme, { tint, accentSat, tintSat, accentLight });
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = themeById(theme).id;
  root.dataset.tint = tint ? 'on' : 'off';
  root.dataset.size = String(size);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--bg']);
}
