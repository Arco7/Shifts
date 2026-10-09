// ui-datetime.js: compact date and time fields for the entry sheet.
// The browser's own date-time fields show the phone's region format (12 hours, month/day/year).
// These show day.month.year and 24 hours always. The date opens the phone's calendar, the time
// opens a small wheel (hours / minutes).

import { h, openSheet } from './dom.js';
import { T, fmtDMYshort, weekdayLetter } from './strings.js';

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A date field. A transparent native date input lies over the button, so one tap opens the
// phone's calendar. Returns {el, set(value)}.
export function dateChip({ value, onChange, label }) {
  const text = h('span', { class: 'dtchip-text' });
  const input = h('input', {
    class: 'dtchip-native',
    type: 'date',
    'aria-label': label,
    onchange: (ev) => {
      if (ev.target.value) onChange(ev.target.value);
    },
  });
  const el = h('label', { class: 'dtchip date' }, text, input);
  const set = (v) => {
    input.value = DATE_RE.test(v || '') ? v : '';
    text.replaceChildren(...(DATE_RE.test(v || '') ? [h('small', null, weekdayLetter(v)), h('b', { dir: 'ltr' }, fmtDMYshort(v))] : [h('b', null, '—')]));
  };
  set(value);
  return { el, set };
}

// A time field "HH:MM" (24 hours). Returns {el, set(value)}.
export function timeChip({ value, onChange, label }) {
  let cur = value;
  const text = h('b', { dir: 'ltr' }, value);
  const el = h(
    'button',
    {
      class: 'dtchip time',
      type: 'button',
      'aria-label': label,
      onclick: async () => {
        const t = await pickTime(cur);
        if (t) onChange(t);
      },
    },
    text,
  );
  const set = (v) => {
    cur = v;
    text.textContent = v;
  };
  return { el, set };
}

const ITEM = 44; // height of one wheel row (also in style.css)

function wheel(count, value, onPick) {
  let cur = value;
  const items = Array.from({ length: count }, (_, i) =>
    h(
      'div',
      {
        class: 'wheel-item',
        role: 'option',
        onclick: () => el.scrollTo({ top: i * ITEM, behavior: 'smooth' }),
      },
      pad(i),
    ),
  );
  const el = h('div', { class: 'wheel', role: 'listbox' }, h('div', { class: 'wheel-pad' }), items, h('div', { class: 'wheel-pad' }));
  const mark = () => items.forEach((it, i) => it.classList.toggle('on', i === cur));
  el.addEventListener('scroll', () => {
    const i = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / ITEM)));
    if (i !== cur) {
      cur = i;
      mark();
      onPick(i);
    }
  });
  return {
    el,
    init: () => {
      el.scrollTop = value * ITEM;
      mark();
    },
  };
}

// Asks for a time. Resolves "HH:MM" or null (cancelled).
export function pickTime(initial) {
  return new Promise((resolve) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(initial || '');
    let hh = m ? Math.min(23, +m[1]) : 8;
    let mm = m ? Math.min(59, +m[2]) : 0;
    let answered = false;
    let sheet;
    const answer = (v) => {
      answered = true;
      resolve(v);
      sheet.close();
    };
    const hours = wheel(24, hh, (v) => {
      hh = v;
    });
    const mins = wheel(60, mm, (v) => {
      mm = v;
    });
    const body = h(
      'div',
      { class: 'confirm timepick' },
      h('h2', null, T.timePick),
      h(
        'div',
        { class: 'wheels', dir: 'ltr' },
        h('div', { class: 'wheel-col' }, h('small', { class: 'muted' }, T.timeHours), hours.el),
        h('b', { class: 'colon' }, ':'),
        h('div', { class: 'wheel-col' }, h('small', { class: 'muted' }, T.timeMinutes), mins.el),
      ),
      h(
        'div',
        { class: 'btn-col' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => answer(`${pad(hh)}:${pad(mm)}`) }, T.ok),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(null) }, T.cancel),
      ),
    );
    sheet = openSheet(body, {
      small: true,
      onClose: () => {
        if (!answered) resolve(null);
      },
    });
    // the wheels can be positioned only when they are on the screen
    hours.init();
    mins.init();
    requestAnimationFrame(() => {
      hours.init();
      mins.init();
    });
  });
}
