// ui-shifts.js: the "shifts" tab: month list with totals.

import { h, icon, openSheet, confirmDialog, toast, money, ltr } from './dom.js';
import { ctx, job, commit } from './ctx.js';
import { calcMonth, fmtHM, fmtMoney } from './calc.js';
import { shiftMonth } from './settings.js';
import { openEntrySheet } from './ui-entry.js';
import { openJobPicker } from './ui-work.js';
import { statusStrip } from './ui-common.js';
import { isEmptyDb } from './store.js';
import { T, f, monthTitle, weekdayShort, fmtDM, fmtTime, fmtDMY } from './strings.js';

export function setMonth(m) {
  ctx.month = m;
  ctx.render();
}

function rowTags(r) {
  const tags = [];
  if (r.kind === 'shift') {
    const e = r.entry;
    if (r.breakMin > 0) tags.push(`${T.rowBreak} ${fmtHM(r.breakMin)}`);
    if (r.overtimeMin > 0) tags.push(`${T.rowOvertime} ${fmtHM(r.overtimeMin)}`);
    else {
      const top = r.buckets.length ? r.buckets[r.buckets.length - 1][0] : 100;
      if (top !== 100 && !(e.tariff && e.tariff.mode === 'percent')) tags.push(`${top}%`);
    }
    if (e.tariff && e.tariff.mode === 'percent') tags.push(f(T.rowTariffPct, { n: e.tariff.value }));
    if (e.tariff && e.tariff.mode === 'rate') tags.push(f(T.rowTariffRate, { n: e.tariff.value }));
  }
  return tags;
}

function describeRow(r) {
  if (r.kind === 'shift') return `${fmtDMY(r.date)}  ${fmtTime(r.entry.start)}–${fmtTime(r.entry.end)}`;
  const name = r.kind === 'sick' ? T.rowSick : r.kind === 'dayoff' ? T.rowDayoff : T.rowHoliday;
  return `${fmtDMY(r.date)}  ${name}`;
}

async function deleteEntry(r) {
  const ok = await confirmDialog({ title: T.deleteTitle, text: describeRow(r), okText: T.deleteYes, danger: true });
  if (!ok) return;
  const i = ctx.db.entries.findIndex((x) => x.id === r.id);
  if (i < 0) return;
  const [removed] = ctx.db.entries.splice(i, 1);
  await commit();
  toast(T.deletedToast, {
    ms: 8000,
    action: {
      label: T.undo,
      fn: async () => {
        ctx.db.entries.push(removed);
        await commit();
      },
    },
  });
}

function rowEl(r) {
  const circle = h('div', { class: 'date-wrap' }, h('div', { class: 'date-circle' }, ltr(fmtDM(r.date))), h('div', { class: 'date-wd' }, weekdayShort(r.date)));
  let main;
  let sub;
  if (r.kind === 'shift') {
    const e = r.entry;
    const nextDay = e.end.slice(0, 10) !== e.start.slice(0, 10);
    main = h(
      'div',
      { class: 'row-main' },
      h('span', null, T.rowFrom, ' ', ltr(fmtTime(e.start))),
      h('span', null, T.rowTo, ' ', ltr(fmtTime(e.end))),
      nextDay ? h('small', { class: 'muted' }, T.rowNextDay) : null,
    );
    sub = h('div', { class: 'row-sub' }, h('span', null, ltr(fmtHM(r.netMin)), ' ', T.rowHours), money(fmtMoney(r.total)), ...rowTags(r).map((t) => h('span', { class: 'tag' }, t)));
  } else {
    const name = r.kind === 'sick' ? T.rowSick : r.kind === 'dayoff' ? T.rowDayoff : T.rowHoliday;
    main = h('div', { class: 'row-main' }, h('span', null, name), h('span', { class: 'muted' }, ltr(fmtHM(r.hours * 60)), ' ', T.rowHours));
    if (r.skipped) sub = h('div', { class: 'row-sub' }, h('span', { class: 'muted' }, T.rowNotCounted));
    else {
      const extra = r.kind === 'sick' ? [h('span', { class: 'tag' }, f(T.rowSickN, { n: r.sickIndex, pct: r.pct }))] : r.pct !== 100 ? [h('span', { class: 'tag' }, `${r.pct}%`)] : [];
      sub = h('div', { class: 'row-sub' }, money(fmtMoney(r.total)), ...extra);
    }
  }
  const del = ctx.editMode
    ? h('button', { class: 'minus', type: 'button', 'aria-label': T.delete, onclick: (ev) => { ev.stopPropagation(); deleteEntry(r); } }, icon('minus', 22))
    : null;
  return h(
    'div',
    { class: 'row' + (r.skipped ? ' dim' : '') + (r.kind !== 'shift' ? ' day ' + r.kind : ''), role: 'button', tabindex: '0', onclick: () => openEntrySheet({ entry: r.entry }), onkeydown: (ev) => { if (ev.key === 'Enter') openEntrySheet({ entry: r.entry }); } },
    circle,
    h('div', { class: 'row-body' }, main, sub),
    del,
  );
}

export function openTotalsSheet() {
  const j = job();
  const res = calcMonth(j, ctx.db.entries, ctx.month);
  const t = res.totals;
  const S = res.settings;
  const line = (label, value) => h('div', { class: 'tline' }, h('span', null, label), h('b', null, value));
  const lines = [
    line(T.tShifts, ltr(String(t.shifts))),
    line(T.tSickDays, ltr(String(t.sickDays))),
    line(T.tDayoffDays, ltr(String(t.dayoffDays))),
    t.holidayDays ? line(T.tHolidayDays, ltr(String(t.holidayDays))) : null,
    line(T.tGross, [ltr(fmtHM(t.grossMin)), ' ', T.hours]),
    line(T.tNet, [ltr(fmtHM(t.netMin)), ' ', T.hours]),
    line(T.tRegular, [ltr(fmtHM(t.regularMin)), ' ', T.hours]),
    line(T.tOvertime, [ltr(fmtHM(t.overtimeMin)), ' ', T.hours]),
  ];
  const pay = [
    line(T.tWages, money(fmtMoney(t.wages))),
    t.sickPay ? line(T.tSickPay, money(fmtMoney(t.sickPay))) : null,
    t.dayoffPay ? line(T.tDayoffPay, money(fmtMoney(t.dayoffPay))) : null,
    t.holidayPay ? line(T.tHolidayPay, money(fmtMoney(t.holidayPay))) : null,
    line(T.tTravel, money(fmtMoney(t.travel))),
    line(T.tBonuses, money(fmtMoney(t.tips))),
    t.expenses ? line(T.tExpenses, money('-' + fmtMoney(t.expenses))) : null,
  ];
  const changed = res.changed.filter((k) => !k.startsWith('net')).map((k) => T['f_' + k] || k);
  const rateText = S.rate > 0 ? [money(fmtMoney(S.rate)), ' ', res.rateFrom && res.rateFrom !== '0000-00' ? f(T.tSince, { month: monthTitle(res.rateFrom) }) : ''] : [T.tRateNotSet];
  const body = h(
    'div',
    { class: 'sheet-col' },
    h('div', { class: 'sheet-head' }, h('span'), h('div', { class: 'head-mid' }, h('div', { class: 'sheet-title' }, T.totalsTitle), h('div', { class: 'head-sub' }, `${j.name} · ${monthTitle(ctx.month)}`)), h('button', { class: 'icon-btn', type: 'button', 'aria-label': T.close, onclick: () => sheet.close() }, icon('chevD', 24))),
    h(
      'div',
      { class: 'sheet-scroll' },
      h('div', { class: 'card totals' }, lines),
      h('div', { class: 'card totals' }, pay, h('div', { class: 'tline total' }, h('span', null, T.tTotal), money(fmtMoney(t.total)))),
      h('div', { class: 'card info' }, h('div', { class: 'tline' }, h('span', null, T.tRate), h('b', null, rateText)), changed.length ? h('div', { class: 'hint' }, f(T.tChanged, { list: changed.join(', ') })) : null),
    ),
  );
  const sheet = openSheet(body, { full: true });
  return sheet;
}

export function shiftsScreen({ goBackup }) {
  const j = job();
  const res = calcMonth(j, ctx.db.entries, ctx.month);
  const t = res.totals;
  const hasRows = res.rows.length > 0;

  const top = h(
    'div',
    { class: 'topbar' },
    h('button', { class: 'round-btn', type: 'button', 'aria-label': T.addEntry, onclick: () => openEntrySheet() }, icon('plus', 24)),
    h('button', { class: 'chip', type: 'button', onclick: () => openJobPicker() }, h('span', null, j.name), icon('chevD', 18)),
    h('button', { class: 'text-btn', type: 'button', onclick: () => { ctx.editMode = !ctx.editMode; ctx.render(); } }, ctx.editMode ? T.done : T.edit),
  );
  const nav = h(
    'div',
    { class: 'monthnav' },
    h('button', { class: 'nav-btn', type: 'button', 'aria-label': T.prevMonth, onclick: () => setMonth(shiftMonth(ctx.month, -1)) }, icon('chevR', 28)),
    h('div', { class: 'month-title' }, monthTitle(ctx.month)),
    h('button', { class: 'nav-btn', type: 'button', 'aria-label': T.nextMonth, onclick: () => setMonth(shiftMonth(ctx.month, 1)) }, icon('chevL', 28)),
  );
  const header = h('div', { class: 'screen-head' }, top, nav, statusStrip(goBackup));

  const banner =
    isEmptyDb(ctx.db) && ctx.hadData
      ? h('div', { class: 'banner bad' }, icon('alert', 22), h('span', null, T.emptyBanner), h('button', { class: 'btn small', type: 'button', onclick: goBackup }, T.emptyBannerBtn))
      : null;

  const list = hasRows
    ? h('div', { class: 'list' }, res.rowsDesc.length ? res.rowsDesc.map(rowEl) : null)
    : h('div', { class: 'empty' }, icon('list', 40), h('div', { class: 'empty-title' }, T.emptyMonth), h('div', { class: 'muted' }, T.emptyMonthHint));
  const scroll = h('div', { class: 'scroll' }, banner, list, h('div', { class: 'spacer-bottom' }));

  const bar = h(
    'button',
    { class: 'totals-bar', type: 'button', onclick: openTotalsSheet, 'aria-label': T.totalsOpen },
    h('span', { class: 'tb-hours' }, ltr(fmtHM(t.netMin)), ' ', T.hours),
    icon('chevU', 22),
    money(fmtMoney(t.total)),
  );
  return [header, scroll, bar];
}
