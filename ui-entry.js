// ui-entry.js: the sheet for adding / editing a shift, a day off, a sick day or a holiday.

import { h, icon, openSheet, toast, confirmDialog, money } from './dom.js';
import { ctx, job, commit } from './ctx.js';
import { newId } from './store.js';
import { effective } from './settings.js';
import { parseLocalDT, addDays, daysBetween, fmtDate, fmtHM, fmtMoney, previewEntries } from './calc.js';
import { T, f, fmtDMYshort } from './strings.js';
import { dateChip, timeChip } from './ui-datetime.js';
import { prefs } from './prefs.js';

const pad = (n) => String(n).padStart(2, '0');

// protection against typing errors (a shift that lasts a year, a date in the wrong year)
const WARN_SHIFT_MIN = 16 * 60; // longer: ask "is this right?"
const MAX_SHIFT_MIN = 24 * 60; // longer: not saved at all
const PREVIEW_MAX_MIN = 7 * 24 * 60; // the preview is not calculated for longer shifts
const WARN_RANGE_DAYS = 31; // a range of days off / sick / holiday longer than this: ask
const MAX_RANGE_DAYS = 120; // longer: not saved
const ODD_AHEAD_SHIFT_DAYS = 7; // a shift starting more than this far in the future: ask
const ODD_BACK_DAYS = 400; // a date further back than this: ask
const ODD_RANGE_DAYS = 366; // days off / sick / holiday further away than this (either way): ask

function nowLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function todayStr() {
  return fmtDate(new Date());
}

// default start for a new entry: now when the current month is shown, otherwise the 1st of the shown month
function defaultStart() {
  const today = todayStr();
  if (ctx.month === today.slice(0, 7)) return nowLocal();
  return `${ctx.month}-01T08:00`;
}
function defaultDate() {
  const today = todayStr();
  return ctx.month === today.slice(0, 7) ? today : `${ctx.month}-01`;
}

function numOrNaN(s) {
  const t = String(s ?? '').trim().replace(',', '.');
  if (t === '') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}
function numOrZero(s) {
  const t = String(s ?? '').trim();
  if (t === '') return 0;
  return numOrNaN(t);
}

const TYPE_TABS = [
  ['shift', 'tabShift'],
  ['dayoff', 'tabDayoff'],
  ['sick', 'tabSick'],
  ['holiday', 'tabHoliday'],
];
const EDIT_TITLE = { shift: 'editShift', dayoff: 'editDayoff', sick: 'editSick', holiday: 'editHoliday' };

export function openEntrySheet({ entry = null } = {}) {
  const j = job();
  const editing = !!entry;
  let type = entry ? entry.type : 'shift';

  const st = {
    start: entry && entry.type === 'shift' ? entry.start : defaultStart(),
    end: entry && entry.type === 'shift' ? entry.end : defaultStart(),
    tMode: entry && entry.type === 'shift' && entry.tariff ? entry.tariff.mode : 'settings',
    tValue: entry && entry.type === 'shift' && entry.tariff && entry.tariff.mode !== 'settings' ? String(entry.tariff.value ?? '') : '',
    tip: entry && entry.tip ? String(entry.tip) : '',
    expenses: entry && entry.expenses ? String(entry.expenses) : '',
    note: entry && entry.note ? entry.note : '',
    from: entry && entry.type !== 'shift' ? entry.date : defaultDate(),
    to: entry && entry.type !== 'shift' ? entry.date : defaultDate(),
    hours: entry && entry.type !== 'shift' && entry.hours != null ? String(entry.hours) : '',
  };

  const bodyEl = h('div', { class: 'sheet-scroll entry-body' });
  const previewEl = h('div', { class: 'preview-bar' });
  const tabsEl = h('div', { class: 'seg tabs' });
  const titleEl = h('div', { class: 'sheet-title' });
  let sheet;

  // ----- preview -----
  function shiftDraft() {
    const tariff = st.tMode === 'settings' ? { mode: 'settings' } : { mode: st.tMode, value: numOrZero(st.tValue) };
    return {
      id: entry ? entry.id : 'draft',
      jobId: j.id,
      type: 'shift',
      start: st.start,
      end: st.end,
      tariff,
      tip: numOrZero(st.tip) || 0,
      expenses: numOrZero(st.expenses) || 0,
    };
  }

  function dayList() {
    // dates of the range; when editing, only the one date
    if (editing) return st.from ? [st.from] : [];
    if (!st.from || !st.to) return [];
    const n = daysBetween(st.from, st.to);
    if (n < 0 || n > MAX_RANGE_DAYS) return [];
    const out = [];
    for (let i = 0; i <= n; i++) out.push(addDays(st.from, i));
    return out;
  }
  function existingDates() {
    return new Set(ctx.db.entries.filter((e) => e.jobId === j.id && e.type === type).map((e) => e.date));
  }
  function dayDrafts() {
    const have = editing ? new Set() : existingDates();
    const drafts = [];
    let skippedExisting = 0;
    for (const d of dayList()) {
      if (have.has(d)) {
        skippedExisting++;
        continue;
      }
      const hrs = numOrNaN(st.hours);
      drafts.push({ id: editing ? entry.id : 'draft' + d, jobId: j.id, type, date: d, hours: Number.isFinite(hrs) && hrs > 0 ? hrs : undefined });
    }
    return { drafts, skippedExisting };
  }

  function updatePreview() {
    previewEl.replaceChildren();
    if (type === 'shift') {
      const d = shiftDraft();
      let net = 0;
      let total = 0;
      const ps = parseLocalDT(d.start);
      const pe = parseLocalDT(d.end);
      // (a typing error like a wrong year would make the calculation slow, and it cannot be saved anyway)
      if (ps && pe && d.end > d.start && (pe - ps) / 60000 <= PREVIEW_MAX_MIN) {
        const r = previewEntries(j, ctx.db.entries, [d])[0];
        if (r) {
          net = r.netMin;
          total = r.total;
        }
      }
      previewEl.append(
        h('span', { class: 'pv' }, h('b', { dir: 'ltr' }, fmtHM(net)), ' ', T.pvHours),
        money(fmtMoney(total)),
      );
    } else {
      const { drafts } = dayDrafts();
      const rows = drafts.length ? previewEntries(j, ctx.db.entries, drafts) : [];
      const counted = rows.filter((r) => r.counted).length;
      const skipped = rows.filter((r) => r.skipped).length;
      const total = rows.reduce((s, r) => s + r.total, 0);
      previewEl.append(
        h('span', { class: 'pv' }, h('b', { dir: 'ltr' }, String(counted)), ' ', T.pvDays, skipped ? h('small', { class: 'muted' }, ' · ' + f(T.pvSkipped, { n: skipped })) : null),
        money(fmtMoney(total)),
      );
    }
  }

  // ----- date and time fields -----
  const dOf = (x) => x.slice(0, 10);
  const tOf = (x) => x.slice(11, 16);
  // The exit follows the entry (the same day, or the next day when the exit time is earlier)
  // until the user picks the exit date himself. An existing entry keeps its own dates.
  let endAuto = !editing;
  let toAuto = !editing;
  let chips = null;
  let durEl = null;

  function autoEnd() {
    let cand = `${dOf(st.start)}T${tOf(st.end)}`;
    if (cand < st.start) cand = `${addDays(dOf(st.start), 1)}T${tOf(st.end)}`;
    st.end = cand;
  }
  function onStartDate(d) {
    const old = dOf(st.start);
    st.start = `${d}T${tOf(st.start)}`;
    if (endAuto) autoEnd();
    else {
      // the exit date moves by the same number of days
      st.end = `${addDays(dOf(st.end), daysBetween(old, d))}T${tOf(st.end)}`;
      if (st.end < st.start) autoEnd();
    }
    syncShiftChips();
  }
  function onStartTime(t) {
    st.start = `${dOf(st.start)}T${t}`;
    if (endAuto || st.end < st.start) autoEnd();
    syncShiftChips();
  }
  function onEndDate(d) {
    endAuto = false;
    st.end = `${d}T${tOf(st.end)}`;
    syncShiftChips();
  }
  function onEndTime(t) {
    st.end = `${dOf(st.end)}T${t}`;
    if (endAuto) autoEnd();
    syncShiftChips();
  }
  function onFrom(d) {
    const old = st.from;
    st.from = d;
    if (editing || toAuto || !st.to) st.to = d;
    else {
      st.to = addDays(st.to, daysBetween(old, d));
      if (st.to < st.from) st.to = st.from;
    }
    syncDayChips();
  }
  function onTo(d) {
    toAuto = false;
    st.to = d;
    syncDayChips();
  }

  // the line under the date fields: how long, and a warning when it is not normal
  function updateDur() {
    if (!durEl) return;
    durEl.className = 'dur-line';
    durEl.textContent = '';
    const say = (cls, text) => {
      if (cls) durEl.classList.add(cls);
      durEl.textContent = text;
    };
    if (type === 'shift') {
      const s = parseLocalDT(st.start);
      const e = parseLocalDT(st.end);
      if (!s || !e) return;
      const min = Math.round((e - s) / 60000);
      const unchanged = !!entry && entry.start === st.start && entry.end === st.end;
      if (min < 0) say('bad', T.durBad);
      else if (min === 0) return;
      else if (unchanged) say('', f(T.durLine, { d: fmtHM(min) }));
      else if (min > MAX_SHIFT_MIN) say('bad', `${fmtHM(min)} · ${T.durTooLong}`);
      else if (min > WARN_SHIFT_MIN) say('warn', f(T.durLong, { d: fmtHM(min) }));
      else say('', f(T.durLine, { d: fmtHM(min) }));
    } else if (!editing && st.from && st.to) {
      const n = daysBetween(st.from, st.to);
      if (n < 0) say('bad', T.errRange);
      else if (n > MAX_RANGE_DAYS) say('bad', T.errRangeLong);
      else if (n + 1 > WARN_RANGE_DAYS) say('warn', f(T.confirmLongRange, { n: n + 1 }));
    }
  }

  function syncShiftChips() {
    if (chips) {
      chips.sd.set(dOf(st.start));
      chips.stt.set(tOf(st.start));
      chips.ed.set(dOf(st.end));
      chips.ett.set(tOf(st.end));
    }
    updateDur();
    updatePreview();
  }
  function syncDayChips() {
    if (chips) {
      chips.from.set(st.from);
      if (chips.to) chips.to.set(st.to);
    }
    updateDur();
    updatePreview();
  }

  function shiftRows() {
    chips = {
      sd: dateChip({ value: dOf(st.start), onChange: onStartDate, label: T.fIn }),
      stt: timeChip({ value: tOf(st.start), onChange: onStartTime, label: T.fIn }),
      ed: dateChip({ value: dOf(st.end), onChange: onEndDate, label: T.fOut }),
      ett: timeChip({ value: tOf(st.end), onChange: onEndTime, label: T.fOut }),
    };
    durEl = h('div', { class: 'dur-line' });
    updateDur();
    const row = (cls, labelText, iconName, a, b) =>
      h('div', { class: 'dt-row compact ' + cls }, h('span', { class: 'dt-label' }, icon(iconName, 24), h('span', null, labelText)), h('div', { class: 'chips' }, a.el, b.el));
    return [row('start', T.fIn, 'download', chips.sd, chips.stt), row('end', T.fOut, 'upload', chips.ed, chips.ett), durEl];
  }

  function dayRows() {
    chips = {
      from: dateChip({ value: st.from, onChange: onFrom, label: editing ? T.fDate : T.fFrom }),
      to: editing ? null : dateChip({ value: st.to, onChange: onTo, label: T.fTo }),
    };
    durEl = h('div', { class: 'dur-line' });
    updateDur();
    const row = (labelText, chip) => h('div', { class: 'dt-row compact date' }, h('span', { class: 'dt-label' }, icon('clock', 22), h('span', null, labelText)), h('div', { class: 'chips' }, chip.el));
    return [row(editing ? T.fDate : T.fFrom, chips.from), chips.to ? row(T.fTo, chips.to) : null, durEl];
  }

  let fieldSeq = 0;
  function field(labelText, input, hint) {
    // link the label to its input (screen readers, tapping the label focuses the input)
    const id = 'ef-' + ++fieldSeq + '-' + Math.random().toString(36).slice(2, 6);
    if (input && input.setAttribute) input.setAttribute('id', id);
    return h('div', { class: 'field' }, h('label', { class: 'field-label', for: id }, labelText), input, hint ? h('div', { class: 'hint' }, hint) : null);
  }
  function numberInput(key, ph) {
    return h('input', {
      class: 'input',
      type: 'text',
      inputmode: 'decimal',
      autocomplete: 'off',
      placeholder: ph || '0',
      value: st[key],
      oninput: (ev) => {
        st[key] = ev.target.value;
        updatePreview();
      },
    });
  }

  function tariffBlock() {
    const seg = h(
      'div',
      { class: 'seg' },
      [
        ['settings', T.fTariffSettings],
        ['percent', T.fTariffPct],
        ['rate', T.fTariffRate],
      ].map(([m, label]) =>
        h(
          'button',
          {
            type: 'button',
            class: 'seg-btn' + (st.tMode === m ? ' on' : ''),
            onclick: () => {
              st.tMode = m;
              draw();
            },
          },
          label,
        ),
      ),
    );
    return h(
      'div',
      { class: 'block' },
      h('div', { class: 'block-title' }, icon('percent', 22), T.fTariff),
      seg,
      st.tMode === 'settings' ? null : field(st.tMode === 'percent' ? T.fTariffPctLabel : T.fTariffRateLabel, numberInput('tValue', st.tMode === 'percent' ? '150' : '')),
    );
  }

  function shiftForm() {
    return [
      ...shiftRows(),
      tariffBlock(),
      h('div', { class: 'two' }, field(T.fTip, numberInput('tip')), field(T.fExpenses, numberInput('expenses'))),
      noteField(),
    ];
  }

  function noteField() {
    return h('textarea', {
      class: 'input note',
      rows: '3',
      placeholder: T.fNote,
      value: st.note,
      oninput: (ev) => {
        st.note = ev.target.value;
      },
    });
  }

  function dayForm() {
    const S = effective(j, (st.from || todayStr()).slice(0, 7));
    return [...dayRows(), field(T.fDayHours, numberInput('hours', f(T.fDayHoursHint, { n: S.dayHours })), null), noteField()];
  }

  function draw() {
    titleEl.textContent = editing ? T[EDIT_TITLE[type]] : T.newEntry;
    tabsEl.replaceChildren(
      ...(editing
        ? []
        : TYPE_TABS.map(([t, key]) =>
            h(
              'button',
              {
                type: 'button',
                class: 'seg-btn' + (type === t ? ' on' : ''),
                onclick: () => {
                  type = t;
                  draw();
                },
              },
              T[key],
            ),
          )),
    );
    tabsEl.style.display = editing ? 'none' : '';
    bodyEl.replaceChildren(...(type === 'shift' ? shiftForm() : dayForm()));
    updatePreview();
  }

  // ----- save -----
  async function save() {
    const now = new Date().toISOString();
    if (type === 'shift') {
      const s = parseLocalDT(st.start);
      const e = parseLocalDT(st.end);
      if (!s || !e) return toast(T.errBadTime, { kind: 'err' });
      if (st.end <= st.start) return toast(T.errEndBeforeStart, { kind: 'err' });
      const tip = numOrZero(st.tip);
      const exp = numOrZero(st.expenses);
      if (Number.isNaN(tip) || Number.isNaN(exp) || tip < 0 || exp < 0) return toast(T.invalidNumber, { kind: 'err' });
      let tariff = { mode: 'settings' };
      if (st.tMode !== 'settings') {
        const v = numOrNaN(st.tValue);
        if (!Number.isFinite(v) || v < 0) return toast(T.invalidNumber, { kind: 'err' });
        tariff = { mode: st.tMode, value: v };
      }
      const durMin = (e - s) / 60000;
      // an entry that is already stored and whose times were not touched is not judged again
      const timesChanged = !entry || entry.start !== st.start || entry.end !== st.end;
      if (timesChanged && durMin > MAX_SHIFT_MIN) return toast(T.errTooLong, { kind: 'err' });
      if (prefs.warnUnusual && timesChanged && durMin > WARN_SHIFT_MIN) {
        const ok = await confirmDialog({ title: f(T.confirmLongShift, { d: fmtHM(durMin) }), okText: T.keep, cancelText: T.cancel });
        if (!ok) return;
      }
      // a date that looks like a typing error (only when the date is new or was changed)
      if (prefs.warnUnusual && (!entry || entry.start !== st.start)) {
        const diff = daysBetween(todayStr(), dOf(st.start));
        if (diff > ODD_AHEAD_SHIFT_DAYS || diff < -ODD_BACK_DAYS) {
          const ok = await confirmDialog({ title: f(T.confirmOddDate, { date: fmtDMYshort(dOf(st.start)) }), okText: T.keep, cancelText: T.cancel });
          if (!ok) return;
        }
      }
      if (entry) {
        Object.assign(entry, { start: st.start, end: st.end, tariff, tip, expenses: exp, note: st.note.trim(), updatedAt: now });
      } else {
        ctx.db.entries.push({ id: newId(), jobId: j.id, type: 'shift', start: st.start, end: st.end, tariff, tip, expenses: exp, note: st.note.trim(), createdAt: now });
      }
      ctx.month = st.start.slice(0, 7);
      await commit();
      sheet.close();
      toast(T.saved);
      return;
    }

    // day entries
    if (!st.from || (!editing && !st.to)) return toast(T.errNoDate, { kind: 'err' });
    if (!editing) {
      const n = daysBetween(st.from, st.to);
      if (n < 0) return toast(T.errRange, { kind: 'err' });
      if (n > MAX_RANGE_DAYS) return toast(T.errRangeLong, { kind: 'err' });
      if (n + 1 > WARN_RANGE_DAYS) {
        const ok = await confirmDialog({ title: f(T.confirmLongRange, { n: n + 1 }), okText: T.keep, cancelText: T.cancel });
        if (!ok) return;
      }
    }
    if (prefs.warnUnusual && (!entry || entry.date !== st.from)) {
      const diff = daysBetween(todayStr(), st.from);
      if (Math.abs(diff) > ODD_RANGE_DAYS) {
        const ok = await confirmDialog({ title: f(T.confirmOddDate, { date: fmtDMYshort(st.from) }), okText: T.keep, cancelText: T.cancel });
        if (!ok) return;
      }
    }
    let hours;
    if (String(st.hours).trim() !== '') {
      hours = numOrNaN(st.hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return toast(T.invalidNumber, { kind: 'err' });
    }
    if (editing) {
      Object.assign(entry, { type, date: st.from, note: st.note.trim(), updatedAt: now });
      if (hours === undefined) delete entry.hours;
      else entry.hours = hours;
      ctx.month = st.from.slice(0, 7);
      await commit();
      sheet.close();
      toast(T.saved);
      return;
    }
    const have = existingDates();
    const dates = dayList().filter((d) => !have.has(d));
    const skipped = dayList().length - dates.length;
    if (dates.length === 0) return toast(T.errNothingNew, { kind: 'warn' });
    for (const d of dates) {
      const e = { id: newId(), jobId: j.id, type, date: d, note: st.note.trim(), createdAt: now };
      if (hours !== undefined) e.hours = hours;
      ctx.db.entries.push(e);
    }
    ctx.month = dates[0].slice(0, 7);
    await commit();
    sheet.close();
    toast(skipped ? f(T.addedDaysSkipped, { n: dates.length, m: skipped }) : dates.length === 1 ? T.saved : f(T.addedDays, { n: dates.length }));
  }

  const header = h(
    'div',
    { class: 'sheet-head' },
    h('button', { class: 'link-btn', type: 'button', onclick: save }, T.save),
    h('div', { class: 'head-mid' }, titleEl, h('div', { class: 'head-sub' }, j.name)),
    h('button', { class: 'link-btn', type: 'button', onclick: () => sheet.close() }, T.cancel),
  );

  draw();
  sheet = openSheet(h('div', { class: 'sheet-col' }, header, tabsEl, bodyEl, previewEl), { full: true });
  return sheet;
}

