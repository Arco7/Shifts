// ui-settings.js: the "settings" tab: look (color, text size, background), feel (buzz, tick), reminders.
// These settings are about the app itself; the pay settings of a job stay on the "work" tab.
// Everything is stored on this phone only (prefs.js) and is not part of the backup.

import { h, icon } from './dom.js';
import { prefs, setPref, STALE_CHOICES } from './prefs.js';
import { THEMES } from './themes.js';
import { sample } from './feedback.js';
import { openRecoveryHelp } from './ui-backup.js';
import { APP_VERSION } from './version.js';
import { T, f } from './strings.js';

// a switch with a name and a line of explanation
function toggleRow(key, label, hint, { onChange } = {}) {
  const input = h('input', {
    class: 'switch',
    type: 'checkbox',
    role: 'switch',
    'aria-label': label,
    checked: prefs[key],
    dataset: { pref: key },
    onchange: () => {
      setPref(key, input.checked);
      if (onChange) onChange(input.checked);
    },
  });
  return h('label', { class: 'set-row' }, h('span', { class: 'set-text' }, h('b', null, label), hint ? h('small', { class: 'hint' }, hint) : null), input);
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

function colorGrid() {
  return h(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': T.stColor },
    THEMES.map((t) => {
      const on = prefs.theme === t.id;
      return h(
        'button',
        { class: 'swatch' + (on ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': String(on), 'aria-label': t.name, dataset: { theme: t.id }, onclick: () => setPref('theme', t.id) },
        h('span', { class: 'swatch-dot', style: { background: t.acc } }, on ? icon('check', 22) : null),
        h('span', { class: 'swatch-name' }, t.name),
      );
    }),
  );
}

function lookCard() {
  const letterPx = [11, 13, 15, 18, 21]; // only for the picture of the button: a bigger letter for a bigger text
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('sun', 20), T.stLook),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, T.stColor), colorGrid()),
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
    h(
      'div',
      { class: 'field' },
      h('span', { class: 'field-label' }, T.stBg),
      segRow(
        'bg',
        [
          { value: 'black', name: T.stBgBlack, label: T.stBgBlack },
          { value: 'gray', name: T.stBgGray, label: T.stBgGray },
        ],
        { label: T.stBg },
      ),
    ),
  );
}

function feelCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('clock', 20), T.stFeel),
    toggleRow('vibrate', T.stVibrate, T.stVibrateHint, { onChange: (on) => on && sample('vibrate') }),
    toggleRow('sound', T.stSound, T.stSoundHint, { onChange: (on) => on && sample('sound') }),
  );
}

function remindersCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('alert', 20), T.stReminders),
    toggleRow('strip', T.stStrip, T.stStripHint),
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
    toggleRow('warnUnusual', T.stUnusual, T.stUnusualHint),
  );
}

function prefsStaleText() {
  return prefs.staleDays === 1 ? T.stStaleDay : f(T.stStaleDays, { n: prefs.staleDays });
}

function safeCard() {
  return h('div', { class: 'card' }, h('div', { class: 'card-title' }, icon('lock', 20), T.stSafeTitle), h('div', { class: 'hint' }, T.stSafe));
}

function linksCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('info', 20), T.stAbout),
    h('div', { class: 'btn-col' }, h('a', { class: 'btn', href: 'about.html' }, icon('info', 20), T.stAboutOpen), h('button', { class: 'btn', type: 'button', onclick: () => openRecoveryHelp() }, icon('shield', 20), T.stRecovery)),
  );
}

export function settingsScreen() {
  const head = h('div', { class: 'screen-head' }, h('div', { class: 'screen-title' }, T.setTitle));
  const body = h(
    'div',
    { class: 'scroll' },
    h('div', { class: 'stack' }, lookCard(), feelCard(), remindersCard(), safeCard(), linksCard(), h('div', { class: 'hint center' }, T.stLocalNote), h('div', { class: 'version' }, f(T.bVersion, { v: APP_VERSION }))),
    h('div', { class: 'spacer-bottom' }),
  );
  return [head, body];
}
