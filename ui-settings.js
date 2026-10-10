// ui-settings.js: the "settings" tab: look (color, my colors, sliders, tint, text size), feel (buzz, tick), reminders.
// These settings are about the app itself; the pay settings of a job stay on the "work" tab.
// Everything is stored on this phone only (prefs.js). "My colors" also travel in the backup file as an extra (see backup.js).

import { h, icon, openSheet, confirmDialog, toast } from './dom.js';
import { ctx } from './ctx.js';
import { prefs, setPref, setPrefs, STALE_CHOICES } from './prefs.js';
import { THEMES, accentOf, inkFor, sameSlot } from './themes.js';
import { sample, press } from './feedback.js';
import { openRecoveryHelp } from './ui-backup.js';
import { APP_VERSION } from './version.js';
import { T, f } from './strings.js';

// a switch with a name
function toggleRow(key, label, { onChange } = {}) {
  const input = h('input', {
    class: 'switch',
    type: 'checkbox',
    role: 'switch',
    'aria-label': label,
    checked: prefs[key],
    dataset: { pref: key },
    onchange: () => {
      setPref(key, input.checked);
      press(); // a short buzz on every press, switching on and off (if "buzz on buttons" is on)
      if (onChange) onChange(input.checked);
    },
  });
  return h('label', { class: 'set-row' }, h('span', { class: 'set-text' }, h('b', null, label)), input);
}

// a row of buttons, one of them chosen: options = [{value, label (string|Node), name}]
function segRow(key, options, { cls = '', label = '' } = {}) {
  return h(
    'div',
    { class: 'seg ' + cls, role: 'radiogroup', 'aria-label': label || null },
    options.map((o) =>
      h(
        'button',
        {
          class: 'seg-btn' + (prefs[key] === o.value ? ' on' : ''),
          type: 'button',
          role: 'radio',
          'aria-checked': String(prefs[key] === o.value),
          'aria-label': o.name,
          dataset: { pref: key, value: String(o.value) },
          onclick: () => setPref(key, o.value),
        },
        o.label,
      ),
    ),
  );
}

// ---- the 11 colors, and "my colors" (three saved places) ----
const currentSlot = () => ({ theme: prefs.theme, accentSat: prefs.accentSat, tintSat: prefs.tintSat, accentLight: prefs.accentLight });

function colorGrid() {
  return h(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': T.stColor },
    THEMES.map((t) => {
      const on = prefs.theme === t.id;
      return h(
        'button',
        { class: 'swatch' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(on), 'aria-label': t.name, dataset: { theme: t.id }, onclick: () => setPref('theme', t.id) },
        h('span', { class: 'swatch-dot', style: { background: t.acc, color: inkFor(t.acc) } }, on ? icon('check', 22) : null),
        h('span', { class: 'swatch-name' }, t.name),
      );
    }),
  );
}

// one of the three places, as a round dot like the other colors; onclick decides what a tap does
function slotButton(i, { on = false, onclick, roleRadio = true }) {
  const slot = prefs.myColors[i];
  const color = slot ? accentOf(slot.theme, slot) : null;
  return h(
    'button',
    {
      class: 'swatch slot' + (on ? ' on' : '') + (slot ? '' : ' empty'),
      type: 'button',
      role: roleRadio ? 'radio' : null,
      'aria-checked': roleRadio ? String(on) : null,
      'aria-label': `${T.stSlot} ${i + 1}`,
      dataset: { slot: String(i) },
      onclick,
    },
    h('span', { class: 'swatch-dot', style: color ? { background: color, color: inkFor(color) } : null }, slot ? (on ? icon('check', 22) : null) : icon('plus', 20)),
    h('span', { class: 'swatch-name' }, String(i + 1)),
  );
}

function myColorsBlock() {
  const cur = currentSlot();
  return h(
    'div',
    { class: 'my-colors' },
    h('span', { class: 'field-label' }, T.stMyColors),
    h(
      'div',
      { class: 'swatches', role: 'radiogroup', 'aria-label': T.stMyColors },
      prefs.myColors.map((slot, i) =>
        slotButton(i, {
          on: sameSlot(slot, cur),
          // a filled place applies its color and its three sliders; an empty one opens the "save" window
          onclick: () => (slot ? setPrefs({ ...slot }) : openSaveSheet()),
        }),
      ),
    ),
  );
}

// the window "where to save": the user picks the place; a taken place asks before it is replaced
function openSaveSheet() {
  const cur = currentSlot();
  const nowColor = accentOf(cur.theme, cur);
  let sheet;
  const save = async (i) => {
    const old = prefs.myColors[i];
    if (old && !sameSlot(old, cur)) {
      const ok = await confirmDialog({ title: T.stReplaceQ, okText: T.stReplace, cancelText: T.cancel });
      if (!ok) return;
    }
    const next = prefs.myColors.slice();
    next[i] = cur;
    setPref('myColors', next);
    sheet.close();
    toast(T.stSaved);
  };
  const body = h(
    'div',
    { class: 'confirm save-slot' },
    h('h2', { class: 'save-title' }, h('span', { class: 'save-now', style: { background: nowColor } }), T.stSaveWhere),
    h('div', { class: 'swatches' }, prefs.myColors.map((_, i) => slotButton(i, { roleRadio: false, onclick: () => save(i) }))),
    h('div', { class: 'btn-col' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => sheet.close() }, T.cancel)),
  );
  sheet = openSheet(body, { small: true });
}

// a slider 0..100 in steps of 5; 100 = the colors as designed. Dragging changes the colors at once, without redrawing the
// screen (a redraw under the finger would drop the slider); the screen is redrawn when the finger lets go.
function sliderRow(key, label, { disabled = false } = {}) {
  const input = h('input', {
    class: 'slider',
    type: 'range',
    min: '0',
    max: '100',
    step: '5',
    value: String(prefs[key]),
    disabled,
    'aria-label': label,
    dataset: { pref: key },
  });
  input.style.setProperty('--p', prefs[key] + '%'); // how much of the line is filled (a custom property needs setProperty)
  let mine = false; // THIS slider is being moved (another slider's blur must not end it)
  const finish = () => {
    if (!mine) return;
    mine = false;
    ctx.sliding = false;
    setPref(key, Number(input.value));
  };
  input.addEventListener('input', () => {
    mine = true;
    ctx.sliding = true;
    input.style.setProperty('--p', input.value + '%');
    setPref(key, Number(input.value));
  });
  for (const ev of ['change', 'pointerup', 'pointercancel', 'blur']) input.addEventListener(ev, finish);
  return h('div', { class: 'field slider-field' + (disabled ? ' off' : '') }, h('span', { class: 'field-label' }, label), input);
}

function lookCard() {
  const letterPx = [11, 13, 15, 18, 21]; // only for the picture of the button: a bigger letter for a bigger text
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('sun', 20), T.stLook),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, T.stColor), colorGrid()),
    myColorsBlock(),
    toggleRow('tint', T.stTint),
    sliderRow('accentSat', T.stAccentSat),
    sliderRow('tintSat', T.stTintSat, { disabled: !prefs.tint }),
    sliderRow('accentLight', T.stAccentLight),
    h('button', { class: 'btn', type: 'button', onclick: () => openSaveSheet() }, T.stSaveColor),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, T.stSize),
      segRow(
        'size',
        T.stSizeNames.map((name, i) => ({ value: i, name, label: h('span', { style: { fontSize: letterPx[i] + 'px', lineHeight: 1 } }, 'א') })),
        { cls: 'size-seg', label: T.stSize },
      ),
      h('div', { class: 'hint center size-name' }, T.stSizeNames[prefs.size]),
    ),
  );
}

function feelCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('clock', 20), T.stFeel),
    toggleRow('vibrate', T.stVibrate, { onChange: (on) => on && sample('vibrate') }),
    toggleRow('sound', T.stSound, { onChange: (on) => on && sample('sound') }),
    toggleRow('pressBuzz', T.stPressBuzz),
  );
}

function remindersCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('alert', 20), T.stReminders),
    toggleRow('strip', T.stStrip),
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, T.stStale),
      segRow(
        'staleDays',
        STALE_CHOICES.map((n) => ({ value: n, name: n === 1 ? T.stStaleDay : f(T.stStaleDays, { n }), label: h('span', { dir: 'ltr' }, String(n)) })),
        { label: T.stStale },
      ),
      h('div', { class: 'hint center' }, prefsStaleText(), ' · ', T.stStaleHint),
    ),
  );
}

function prefsStaleText() {
  return prefs.staleDays === 1 ? T.stStaleDay : f(T.stStaleDays, { n: prefs.staleDays });
}

function linksCard() {
  return h('div', { class: 'card' }, h('div', { class: 'btn-col' }, h('a', { class: 'btn', href: 'about.html' }, icon('info', 20), T.stAboutOpen), h('button', { class: 'btn', type: 'button', onclick: () => openRecoveryHelp() }, icon('shield', 20), T.stRecovery)));
}

export function settingsScreen() {
  const head = h('div', { class: 'screen-head' }, h('div', { class: 'screen-title' }, T.setTitle));
  const body = h(
    'div',
    { class: 'scroll' },
    h('div', { class: 'stack' }, lookCard(), feelCard(), remindersCard(), linksCard(), h('div', { class: 'version' }, f(T.bVersion, { v: APP_VERSION }))),
    h('div', { class: 'spacer-bottom' }),
  );
  return [head, body];
}
