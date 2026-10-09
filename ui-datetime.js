// ui-datetime.js: compact date and time fields for the entry sheet, with our own pickers.
// The browser's own date fields follow the phone's region (month/day/year, English names) and on
// Android open only when one particular spot of the field is touched. These show day.month.year and
// 24 hours always, and open our own calendar (Hebrew, Sunday first) and our own wheel (hours / minutes).

import { h, icon, openSheet } from './dom.js';
import { fmtDate } from './calc.js';
import { T, MONTHS, WEEKDAYS, fmtDMYshort, weekdayLetter } from './strings.js';

const pad = (n) => String(n).padStart(2, '0');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// A date field: a button that shows the day of the week and the date, and opens the calendar.
// Returns {el, set(value)}.
export function dateChip({ value, onChange, label }) {
  let cur = value;
  const text = h('span', { class: 'dtchip-text' });
  const el = h(
    'button',
    {
      class: 'dtchip date',
      type: 'button',
      'aria-label': label,
      onclick: async () => {
        const d = await pickDate(cur);
        if (d) onChange(d);
      },
    },
    text,
  );
  const set = (v) => {
    cur = v;
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

const ITEM = 40; // height of one wheel row in px (also in style.css; the wheel is the one thing not in rem)

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

// ---------- calendar ----------

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const DOW_LETTERS = WEEKDAYS.map((w) => w.replace('יום ', '').replace('׳', '')); // א ב ג ד ה ו ש (Sunday first)
const daysIn = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12
const dowOfDate = (y, m, d) => new Date(y, m - 1, d).getDay(); // 0 = Sunday
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const clampYear = (y) => Math.max(YEAR_MIN, Math.min(YEAR_MAX, y));

// Asks for a date. Resolves "YYYY-MM-DD" or null (cancelled).
// Days of the month; tap the month name for a list of months (and the year name for a list of years).
export function pickDate(initial) {
  return new Promise((resolve) => {
    const today = fmtDate(new Date());
    const sel = DATE_RE.test(initial || '') ? initial : null;
    const [by, bm] = (sel || today).split('-').map(Number);
    let vy = clampYear(by); // the year and month on the screen
    let vm = by < YEAR_MIN ? 1 : by > YEAR_MAX ? 12 : bm;
    let mode = 'days'; // days | months | years
    let pageStart = 0; // first year of the years page
    let answered = false;
    let sheet;
    const answer = (v) => {
      answered = true;
      resolve(v);
      sheet.close();
    };

    const root = h('div', { class: 'calpick' });
    const navBtn = (name, label, fn, disabled) => h('button', { class: 'cal-nav', type: 'button', 'aria-label': label, disabled: !!disabled, onclick: fn }, icon(name, 22));

    function head(titleNode, onPrev, onNext, prevLabel, nextLabel, prevOff, nextOff) {
      // (right to left: "previous" is on the right, like the month arrows on the shifts screen)
      return h('div', { class: 'cal-head' }, navBtn('chevR', prevLabel, onPrev, prevOff), titleNode, navBtn('chevL', nextLabel, onNext, nextOff));
    }

    function daysView() {
      const first = dowOfDate(vy, vm, 1);
      const count = daysIn(vy, vm);
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = i - first + 1;
        if (d < 1 || d > count) {
          cells.push(h('span', { class: 'cal-blank' }));
          continue;
        }
        const date = ymd(vy, vm, d);
        cells.push(h('button', { class: 'cal-day' + (date === sel ? ' sel' : '') + (date === today ? ' today' : ''), type: 'button', 'aria-label': date, onclick: () => answer(date) }, h('span', { dir: 'ltr' }, String(d))));
      }
      const step = (n) => {
        let m = vm + n;
        let y = vy;
        if (m < 1) {
          m = 12;
          y--;
        } else if (m > 12) {
          m = 1;
          y++;
        }
        vy = clampYear(y);
        vm = m;
        draw();
      };
      const title = h('button', { class: 'cal-title', type: 'button', 'aria-label': T.calPickMonth, onclick: () => { mode = 'months'; draw(); } }, h('span', null, `${MONTHS[vm - 1]} ${vy}`), icon('chevD', 18));
      return [
        head(title, () => step(-1), () => step(1), T.prevMonth, T.nextMonth, vy <= YEAR_MIN && vm === 1, vy >= YEAR_MAX && vm === 12),
        h('div', { class: 'cal-grid' }, DOW_LETTERS.map((l) => h('span', { class: 'cal-dow' }, l)), cells),
      ];
    }

    function monthsView() {
      const [sy, sm] = sel ? sel.split('-').map(Number) : [0, 0];
      const [ty, tm] = today.split('-').map(Number);
      const title = h('button', { class: 'cal-title', type: 'button', 'aria-label': T.calPickYear, onclick: () => { pageStart = Math.max(YEAR_MIN, Math.min(YEAR_MAX - 11, vy - 5)); mode = 'years'; draw(); } }, h('span', { dir: 'ltr' }, String(vy)), icon('chevD', 18));
      const grid = h(
        'div',
        { class: 'cal-pick-grid' },
        MONTHS.map((name, i) => h('button', { class: 'cal-cell' + (vy === sy && i + 1 === sm ? ' sel' : '') + (vy === ty && i + 1 === tm ? ' today' : ''), type: 'button', onclick: () => { vm = i + 1; mode = 'days'; draw(); } }, name)),
      );
      return [
        head(title, () => { vy = clampYear(vy - 1); draw(); }, () => { vy = clampYear(vy + 1); draw(); }, T.calPrevYear, T.calNextYear, vy <= YEAR_MIN, vy >= YEAR_MAX),
        grid,
      ];
    }

    function yearsView() {
      const sy = sel ? +sel.slice(0, 4) : 0;
      const ty = +today.slice(0, 4);
      const years = Array.from({ length: 12 }, (_, i) => pageStart + i).filter((y) => y <= YEAR_MAX);
      const title = h('span', { class: 'cal-title static', dir: 'ltr' }, `${years[0]}–${years[years.length - 1]}`);
      const grid = h(
        'div',
        { class: 'cal-pick-grid' },
        years.map((y) => h('button', { class: 'cal-cell' + (y === sy ? ' sel' : '') + (y === ty ? ' today' : ''), type: 'button', onclick: () => { vy = y; mode = 'months'; draw(); } }, h('span', { dir: 'ltr' }, String(y)))),
      );
      const page = (n) => {
        pageStart = Math.max(YEAR_MIN, Math.min(YEAR_MAX - 11, pageStart + n));
        draw();
      };
      return [head(title, () => page(-12), () => page(12), T.calPrevYears, T.calNextYears, pageStart <= YEAR_MIN, pageStart + 11 >= YEAR_MAX), grid];
    }

    function draw() {
      const body = mode === 'days' ? daysView() : mode === 'months' ? monthsView() : yearsView();
      root.replaceChildren(
        ...body,
        h('div', { class: 'cal-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => answer(today) }, T.calToday), h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(null) }, T.cancel)),
      );
    }

    draw();
    sheet = openSheet(root, {
      small: true,
      onClose: () => {
        if (!answered) resolve(null);
      },
    });
  });
}
