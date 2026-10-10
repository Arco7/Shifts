// report.js: the month as a plain PDF table: date, entry, exit, hours. No money, no overtime, nothing else.
// The page builds a print-only block and opens the browser's print window ("Save as PDF").
// When there are two shifts in one day they are two rows with the same date; hours are written as h:mm,
// like in the app. The total at the bottom is the sum of the hours above it.

import { h, ltr, toast } from './dom.js';
import { ctx, job } from './ctx.js';
import { calcMonth, fmtHM } from './calc.js';
import { T, monthTitle, fmtDMY, fmtTime } from './strings.js';

// one row per shift, in time order: [{date, start, end, min, nextDay, brk}]
// (min = the hours of the app: after the automatic break was taken off; brk = that break in minutes)
export function reportRows(res) {
  return res.rows
    .filter((r) => r.kind === 'shift')
    .map((r) => ({ date: r.date, start: fmtTime(r.entry.start), end: fmtTime(r.entry.end), min: r.netMin, nextDay: r.entry.end.slice(0, 10) !== r.entry.start.slice(0, 10), brk: r.breakMin || 0 }));
}

export const reportTotalMin = (rows) => rows.reduce((s, r) => s + r.min, 0);

// the element that is printed (hidden on the screen, the only thing visible in print: see style.css)
export function buildReport(jobName, month, rows) {
  const body = rows.map((r) => h('tr', null, h('td', null, ltr(fmtDMY(r.date))), h('td', null, ltr(r.start)), h('td', null, ltr(r.end), r.nextDay ? ` ${T.rowNextDay}` : null), h('td', { class: 'rp-h' }, ltr(fmtHM(r.min)))));
  return h(
    'div',
    { id: 'print-root', dir: 'rtl' },
    h('h1', null, T.rpTitle),
    h('div', { class: 'rp-sub' }, `${jobName} · ${monthTitle(month)}`),
    h(
      'table',
      { class: 'rp-table' },
      h('thead', null, h('tr', null, h('th', null, T.rpDate), h('th', null, T.rpIn), h('th', null, T.rpOut), h('th', { class: 'rp-h' }, T.rpHours))),
      h('tbody', null, body),
      h('tfoot', null, h('tr', null, h('td', { colspan: '3' }, T.rpTotal), h('td', { class: 'rp-h' }, ltr(fmtHM(reportTotalMin(rows)))))),
    ),
    // when a break was taken off some shifts, say so: the hours are then shorter than exit minus entry
    rows.some((r) => r.brk > 0) ? h('div', { class: 'rp-note' }, T.rpBreakNote) : null,
  );
}

// the title of the page before the first report (printing twice in a row must not keep the report title)
const PAGE_TITLE = document.title;

// the "PDF report" button of the month summary
export function printMonthReport() {
  const j = job();
  const res = calcMonth(j, ctx.db.entries, ctx.month);
  const rows = reportRows(res);
  if (!rows.length) {
    toast(T.rpEmpty, { kind: 'warn' });
    return;
  }
  document.getElementById('print-root')?.remove();
  document.body.append(buildReport(j.name, ctx.month, rows));
  // the browser suggests the page title as the name of the file
  document.title = `shifts-report_${ctx.month}`;
  const restore = () => {
    document.title = PAGE_TITLE;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  setTimeout(restore, 120000);
  window.print();
}
