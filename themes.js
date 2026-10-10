// themes.js: the color themes (11 accent colors) and the dark backgrounds that go with each of them.
//
// One theme = one accent color + a hue. Every dark surface (rows, cards, lines, the bottom bar...) is the
// same lightness in every theme and is tinted with the theme's hue; only the strength of the tint (S) differs,
// because a dark blue tint is much harder to see than a dark red or green one. "S" is the one number to change
// if a tint looks too strong or too weak on the real phone.
// The status colors (ok = green, warning = amber, error = red) do not depend on the theme, except that the
// yellow theme uses orange for the warning so that it does not melt into the accent.

export const DEFAULT_THEME = 'turquoise';
export const DEFAULT_BG = 'black';

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

export const BGS = ['black', 'gray'];

// lightness (percent) of every surface; "gray" lifts them all by a step, the tint stays
const LADDER = {
  black: { bg: 0, nav: 6, sheet: 5, rowA: 4, rowB: 6, card: 7, card2: 10, input: 3, line: 11, strip: 5 },
  gray: { bg: 8, nav: 12, sheet: 11, rowA: 11, rowB: 13.5, card: 14, card2: 17, input: 7, line: 20, strip: 12 },
};
// how much weaker than S each kind of surface is tinted (percent points)
const TINT_LESS = { bg: 6, nav: 4, sheet: 4, rowA: 0, rowB: 0, card: 4, card2: 4, input: 2, line: 8, strip: 4 };
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

// relative luminance of a '#rrggbb' color (WCAG)
const lumOf = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
// the knob of a switch that is ON: white, but dark on the light accents (white, yellow, lime, green), where white would vanish
const knobOf = (acc) => (1.05 / (lumOf(acc) + 0.05) < 2 ? INK : '#ffffff');

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ');

// all the CSS variables of one theme on one background: {'--accent': '#1eb7d3', ...}
export function themeVars(themeId, bg = DEFAULT_BG) {
  const t = themeById(themeId);
  const L = LADDER[bg] || LADDER[DEFAULT_BG];
  const surface = (key) => hslToHex(t.hue, Math.max(0, t.S - TINT_LESS[key]), L[key]);
  const vars = {
    '--accent': t.acc,
    '--accent-rgb': rgbOf(t.acc),
    '--accent-ink': INK,
    '--knob': knobOf(t.acc),
    '--warn': t.warn || WARN,
    '--bg': bg === 'black' ? '#000000' : surface('bg'),
    '--nav': surface('nav'),
    '--sheet': surface('sheet'),
    '--row-a': surface('rowA'),
    '--row-b': surface('rowB'),
    '--card': surface('card'),
    '--card2': surface('card2'),
    '--input': surface('input'),
    '--line': surface('line'),
    '--strip': surface('strip'),
    '--muted': hslToHex(t.hue, t.S === 0 ? 0 : 6, 62),
  };
  return vars;
}

// the sizes of the text: root font size in px for every step (the middle one is the usual size)
export const SIZE_PX = [12, 13, 14, 15, 16];

// Puts a theme, a background and a text size on the page (the <html> element and the browser's bar color).
export function applyAppearance({ theme = DEFAULT_THEME, bg = DEFAULT_BG, size = 2 } = {}) {
  const root = document.documentElement;
  const vars = themeVars(theme, bg);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.dataset.theme = themeById(theme).id;
  root.dataset.bg = bg;
  root.dataset.size = String(size);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--bg']);
}
