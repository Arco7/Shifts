// ui-work.js: the "work" tab: setting tiles, settings sheets with history, jobs.

import { h, icon, openSheet, confirmDialog, promptDialog, toast, ltr } from './dom.js';
import { ctx, job, commit } from './ctx.js';
import { newId } from './store.js';
import { effective, setField, removeRevision, getList, shiftMonth, BASE } from './settings.js';
import { fmtDate, fmtHM, fmtMoney } from './calc.js';
import { T, f, parseHM, monthTitle } from './strings.js';

const todayMonth = () => fmtDate(new Date()).slice(0, 7);

// ---------- what each tile edits ----------
// kinds: money | num | pct | min | hm | bool | time | choice
const DEFS = [
  {
    id: 'rate',
    icon: 'money',
    title: 'tileRate',
    fields: [{ key: 'rate', kind: 'money' }],
    sub: (S) => (S.rate > 0 ? f(T.subPerHour, { n: fmtMoney(S.rate) }) : T.subNotSet),
  },
  {
    id: 'travel',
    icon: 'bus',
    title: 'tileTravel',
    fields: [
      { key: 'travelMode', kind: 'choice', options: ['none', 'perShift', 'perMonth'] },
      { key: 'travelAmount', kind: 'money', showIf: (v) => v.travelMode !== 'none' },
    ],
    sub: (S) => (S.travelMode === 'perShift' ? f(T.subPerShift, { n: fmtMoney(S.travelAmount) }) : S.travelMode === 'perMonth' ? f(T.subPerMonth, { n: fmtMoney(S.travelAmount) }) : T.subNone),
  },
  {
    id: 'overtime',
    icon: 'clock',
    title: 'tileOvertime',
    hint: 'h_otTier',
    fields: [
      { key: 'otEnabled', kind: 'bool' },
      { key: 'otThresholdMin', kind: 'hm', hint: 'h_otThresholdMin', showIf: (v) => v.otEnabled },
      { key: 'otTier1Pct', kind: 'pct', showIf: (v) => v.otEnabled },
      { key: 'otTier1Min', kind: 'hm', showIf: (v) => v.otEnabled },
      { key: 'otTier2Pct', kind: 'pct', showIf: (v) => v.otEnabled },
    ],
    sub: (S) => (S.otEnabled ? f(T.subAfter, { n: fmtHM(S.otThresholdMin) }) : T.subNotCounted),
  },
  {
    id: 'breaks',
    icon: 'coffee',
    title: 'tileBreaks',
    hint: 'h_break',
    fields: [
      { key: 'breakEnabled', kind: 'bool' },
      { key: 'breakMin', kind: 'min', showIf: (v) => v.breakEnabled },
      { key: 'breakMinShiftMin', kind: 'hm', showIf: (v) => v.breakEnabled },
    ],
    sub: (S) => (S.breakEnabled ? f(T.subBreak, { n: S.breakMin }) : T.subNotCounted),
  },
  {
    id: 'sick',
    icon: 'sick',
    title: 'tileSick',
    hint: 'h_sick',
    fields: [
      { key: 'sickPct1', kind: 'pct' },
      { key: 'sickPct2', kind: 'pct' },
      { key: 'sickPct3', kind: 'pct' },
      { key: 'sickPct4', kind: 'pct' },
      { key: 'skipFriSat', kind: 'bool' },
    ],
    sub: (S) => `${S.sickPct1}% · ${S.sickPct2}% · ${S.sickPct3}% · ${S.sickPct4}%`,
  },
  {
    id: 'days',
    icon: 'sun',
    title: 'tileDays',
    hint: 'h_days',
    fields: [
      { key: 'dayHours', kind: 'num' },
      { key: 'dayoffPct', kind: 'pct' },
      { key: 'holidayPct', kind: 'pct' },
      { key: 'skipFriSat', kind: 'bool' },
    ],
    sub: (S) => f(T.subHoursPerDay, { n: S.dayHours }),
  },
  {
    id: 'tariffs',
    icon: 'percent',
    title: 'tileTariffs',
    hint: 'h_shabbat',
    fields: [
      { key: 'shabbatEnabled', kind: 'bool' },
      { key: 'shabbatStart', kind: 'time', showIf: (v) => v.shabbatEnabled },
      { key: 'shabbatEnd', kind: 'time', showIf: (v) => v.shabbatEnabled },
      { key: 'shabbatPct', kind: 'pct', showIf: (v) => v.shabbatEnabled },
    ],
    sub: (S) => (S.shabbatEnabled ? f(T.subShabbat, { n: S.shabbatPct }) : T.off),
  },
  { id: 'net', icon: 'calc', title: 'tileNet', disabled: true, sub: () => T.subNetSoon },
];

function valueToText(kind, v) {
  switch (kind) {
    case 'bool':
      return v ? T.on : T.off;
    case 'choice':
      return T['opt_' + v] || String(v);
    case 'hm':
      return fmtHM(v);
    case 'pct':
      return `${v}%`;
    case 'money':
      return `${fmtMoney(v)} ₪`;
    case 'min':
      return `${v} ${T.minutes}`;
    default:
      return String(v ?? '');
  }
}

// text in the input -> value, or undefined when invalid
function parseField(field, text, boolVal) {
  const t = String(text ?? '').trim().replace(',', '.');
  switch (field.kind) {
    case 'bool':
      return !!boolVal;
    case 'choice':
      return text;
    case 'time':
      return /^\d{2}:\d{2}$/.test(t) ? t : undefined;
    case 'hm': {
      const m = parseHM(text);
      return m == null ? undefined : m;
    }
    case 'min': {
      const n = Number(t);
      return t !== '' && Number.isInteger(n) && n >= 0 && n <= 1440 ? n : undefined;
    }
    case 'pct': {
      const n = Number(t);
      return t !== '' && Number.isFinite(n) && n >= 0 && n <= 1000 ? n : undefined;
    }
    case 'num': {
      const n = Number(t);
      return t !== '' && Number.isFinite(n) && n > 0 && n <= 24 ? n : undefined;
    }
    default: {
      // money
      const n = Number(t);
      return t !== '' && Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : undefined;
    }
  }
}
function valueToInput(field, v) {
  if (field.kind === 'hm') return fmtHM(v);
  return v == null ? '' : String(v);
}

// ---------- settings sheet ----------
export function openSettingsSheet(def) {
  const j = job();
  let fromMonth = todayMonth();
  const vals = {}; // key -> current value (typed value for text inputs, parsed for others)
  const dirty = new Set();
  for (const fl of def.fields) vals[fl.key] = effective(j, fromMonth)[fl.key];

  const monthLabel = h('div', { class: 'month-title small' });
  const formEl = h('div', { class: 'card form' });
  const historyEl = h('div', { class: 'card history' });
  let sheet;

  function resetClean() {
    const eff = effective(j, fromMonth);
    for (const fl of def.fields) if (!dirty.has(fl.key)) vals[fl.key] = eff[fl.key];
  }

  const textOf = new Map(); // key -> raw text typed

  function drawForm() {
    formEl.replaceChildren();
    for (const fl of def.fields) {
      if (fl.showIf && !fl.showIf(currentValuesForShow())) continue;
      const label = T['f_' + fl.key];
      if (fl.kind === 'bool') {
        formEl.append(
          h(
            'label',
            { class: 'switch-row' },
            h('span', null, label),
            h('input', {
              type: 'checkbox',
              class: 'switch',
              checked: !!vals[fl.key],
              onchange: (ev) => {
                vals[fl.key] = ev.target.checked;
                dirty.add(fl.key);
                drawForm();
              },
            }),
          ),
        );
      } else if (fl.kind === 'choice') {
        formEl.append(
          h(
            'div',
            { class: 'field' },
            h('div', { class: 'field-label' }, label),
            h(
              'div',
              { class: 'seg' },
              fl.options.map((o) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'seg-btn' + (vals[fl.key] === o ? ' on' : ''),
                    onclick: () => {
                      vals[fl.key] = o;
                      dirty.add(fl.key);
                      drawForm();
                    },
                  },
                  T['opt_' + o],
                ),
              ),
            ),
          ),
        );
      } else {
        const initial = textOf.has(fl.key) ? textOf.get(fl.key) : valueToInput(fl, vals[fl.key]);
        const input = h('input', {
          class: 'input' + (fl.kind === 'hm' ? ' center' : ''),
          type: fl.kind === 'time' ? 'time' : 'text',
          inputmode: fl.kind === 'hm' ? 'numeric' : fl.kind === 'time' ? null : 'decimal',
          autocomplete: 'off',
          dir: 'ltr',
          'aria-label': label,
          placeholder: fl.kind === 'hm' ? T.fieldHm : '',
          value: initial,
          oninput: (ev) => {
            textOf.set(fl.key, ev.target.value);
            dirty.add(fl.key);
            const p = parseField(fl, ev.target.value);
            if (p !== undefined) vals[fl.key] = p;
            input.classList.toggle('bad', p === undefined);
          },
        });
        formEl.append(h('div', { class: 'field' }, h('label', { class: 'field-label' }, label), input, fl.hint ? h('div', { class: 'hint' }, T[fl.hint]) : null));
      }
    }
    if (def.hint) formEl.append(h('div', { class: 'hint' }, icon('info', 16), ' ', T[def.hint]));
  }

  function currentValuesForShow() {
    // values of all settings as they are in the form now (for showIf)
    return { ...effective(j, fromMonth), ...vals };
  }

  function drawMonth() {
    monthLabel.textContent = monthTitle(fromMonth);
  }

  function drawHistory() {
    historyEl.replaceChildren(h('div', { class: 'card-title' }, T.setHistory));
    const rows = [];
    for (const fl of def.fields) {
      const list = getList(j, fl.key);
      list.forEach((rev, i) => {
        const inForce = list.filter((r) => r.from <= fromMonth).pop() === rev;
        rows.push({ fl, rev, single: list.length <= 1, inForce, i });
      });
    }
    if (rows.length === 0) {
      historyEl.append(h('div', { class: 'muted' }, T.setHistoryEmpty));
      return;
    }
    rows.sort((a, b) => (a.rev.from < b.rev.from ? 1 : a.rev.from > b.rev.from ? -1 : 0));
    for (const r of rows) {
      historyEl.append(
        h(
          'div',
          { class: 'hist-row' + (r.inForce ? ' now' : '') },
          h('div', { class: 'hist-main' }, h('b', null, T['f_' + r.fl.key]), h('span', null, ltr(valueToText(r.fl.kind, r.rev.value))), h('small', { class: 'muted' }, r.rev.from === BASE ? T.setFromStart : f(T.setFromMonth, { month: monthTitle(r.rev.from) }), r.inForce ? ' · ' + T.setCurrent : '')),
          r.single
            ? h('span')
            : h(
                'button',
                {
                  class: 'icon-btn',
                  type: 'button',
                  'aria-label': T.setDeleteRev,
                  onclick: async () => {
                    const ok = await confirmDialog({ title: T.setDeleteRevAsk, text: `${T['f_' + r.fl.key]}: ${valueToText(r.fl.kind, r.rev.value)}`, okText: T.deleteYes, danger: true });
                    if (!ok) return;
                    if (removeRevision(j, r.fl.key, r.rev.from)) {
                      await commit();
                      resetClean();
                      drawForm();
                      drawHistory();
                    }
                  },
                },
                icon('trash', 20),
              ),
        ),
      );
    }
  }

  async function save() {
    // validate every field the user touched
    const changes = [];
    const eff = effective(j, fromMonth);
    for (const fl of def.fields) {
      if (!dirty.has(fl.key)) continue;
      let v;
      if (fl.kind === 'bool' || fl.kind === 'choice') v = vals[fl.key];
      else {
        const raw = textOf.has(fl.key) ? textOf.get(fl.key) : valueToInput(fl, vals[fl.key]);
        v = parseField(fl, raw);
        if (v === undefined) return toast(f(T.setNeedValid, { label: T['f_' + fl.key] }), { kind: 'err' });
      }
      if (v !== eff[fl.key]) changes.push([fl.key, v]);
    }
    if (changes.length === 0) {
      toast(T.setNothingChanged, { kind: 'warn' });
      return;
    }
    for (const [k, v] of changes) setField(j, k, v, fromMonth);
    await commit();
    sheet.close();
    toast(f(T.setSavedN, { n: changes.length }));
  }

  const hasAny = def.fields.some((fl) => getList(j, fl.key).length > 0);
  const monthRow = h(
    'div',
    { class: 'card eff' },
    h('div', { class: 'card-title' }, T.setEffective),
    h(
      'div',
      { class: 'monthnav small' },
      h('button', { class: 'nav-btn', type: 'button', 'aria-label': T.prevMonth, onclick: () => { fromMonth = shiftMonth(fromMonth, -1); resetClean(); drawMonth(); drawForm(); drawHistory(); } }, icon('chevR', 24)),
      monthLabel,
      h('button', { class: 'nav-btn', type: 'button', 'aria-label': T.nextMonth, onclick: () => { fromMonth = shiftMonth(fromMonth, 1); resetClean(); drawMonth(); drawForm(); drawHistory(); } }, icon('chevL', 24)),
    ),
    h('div', { class: 'hint' }, hasAny ? T.setEffectiveHint : T.setFirstHint),
  );

  drawMonth();
  drawForm();
  drawHistory();
  sheet = openSheet(
    h(
      'div',
      { class: 'sheet-col' },
      h('div', { class: 'sheet-head' }, h('button', { class: 'link-btn', type: 'button', onclick: save }, T.save), h('div', { class: 'head-mid' }, h('div', { class: 'sheet-title' }, T[def.title]), h('div', { class: 'head-sub' }, j.name)), h('button', { class: 'link-btn', type: 'button', onclick: () => sheet.close() }, T.cancel)),
      h('div', { class: 'sheet-scroll' }, monthRow, formEl, historyEl),
    ),
    { full: true },
  );
  return sheet;
}

// ---------- jobs ----------
function pickJob(id) {
  ctx.jobId = id;
  try {
    localStorage.setItem('shiftlog.job', id);
  } catch {
    /* ignore */
  }
  ctx.render();
}

const jobNameValidate = (v) => (v ? '' : T.jobNameEmpty);

export function openJobPicker() {
  let sheet;
  const list = h(
    'div',
    { class: 'card' },
    ctx.db.jobs.map((jb) =>
      h(
        'button',
        {
          class: 'pick-row' + (jb.id === job().id ? ' on' : ''),
          type: 'button',
          onclick: () => {
            pickJob(jb.id);
            sheet.close();
          },
        },
        h('span', null, jb.name),
        jb.id === job().id ? icon('check', 22) : null,
      ),
    ),
  );
  sheet = openSheet(
    h(
      'div',
      { class: 'sheet-col' },
      h('div', { class: 'sheet-head' }, h('span'), h('div', { class: 'head-mid' }, h('div', { class: 'sheet-title' }, T.jobsPick)), h('button', { class: 'link-btn', type: 'button', onclick: () => sheet.close() }, T.close)),
      h('div', { class: 'sheet-scroll' }, list),
    ),
    { small: true },
  );
  return sheet;
}

export function openJobEdit() {
  let sheet;
  const rename = async () => {
    sheet.close();
    const cur = job();
    const name = await promptDialog({ title: T.jobRename, label: T.jobNameLabel, value: cur.name, validate: jobNameValidate });
    if (!name) return;
    cur.name = name;
    await commit();
  };
  const addJob = async () => {
    sheet.close();
    const name = await promptDialog({ title: T.jobAdd, label: T.jobNameLabel, value: '', validate: jobNameValidate });
    if (!name) return;
    const jb = { id: 'job' + newId().slice(0, 8), name, settings: {} };
    ctx.db.jobs.push(jb);
    pickJob(jb.id);
    await commit();
    toast(T.jobAdded);
  };
  sheet = openSheet(
    h(
      'div',
      { class: 'sheet-col' },
      h('div', { class: 'sheet-head' }, h('span'), h('div', { class: 'head-mid' }, h('div', { class: 'sheet-title' }, T.jobsEditTitle)), h('button', { class: 'link-btn', type: 'button', onclick: () => sheet.close() }, T.close)),
      h(
        'div',
        { class: 'sheet-scroll' },
        h(
          'div',
          { class: 'card' },
          h('button', { class: 'pick-row', type: 'button', onclick: rename }, h('span', null, T.jobRename), icon('pencil', 22)),
          h('button', { class: 'pick-row', type: 'button', onclick: addJob }, h('span', null, T.jobAdd), icon('plus', 22)),
        ),
      ),
    ),
    { small: true },
  );
  return sheet;
}

// ---------- the tab ----------
export function workScreen() {
  const j = job();
  const S = effective(j, todayMonth());
  const head = h(
    'div',
    { class: 'screen-head work-head' },
    h('button', { class: 'job-title', type: 'button', onclick: () => openJobPicker() }, h('span', null, j.name), icon('chevD', 22)),
    h('button', { class: 'round-btn', type: 'button', 'aria-label': T.jobsEditTitle, onclick: () => openJobEdit() }, icon('dots', 24)),
  );
  const tiles = h(
    'div',
    { class: 'tiles' },
    DEFS.map((def) =>
      h(
        'button',
        {
          class: 'tile' + (def.disabled ? ' disabled' : ''),
          type: 'button',
          disabled: !!def.disabled,
          onclick: () => openSettingsSheet(def),
        },
        h('span', { class: 'tile-icon' }, icon(def.icon, 30)),
        h('span', { class: 'tile-title' }, T[def.title]),
        h('span', { class: 'tile-sub' }, def.sub(S)),
      ),
    ),
  );
  return [head, h('div', { class: 'scroll' }, tiles, h('div', { class: 'spacer-bottom' }))];
}

