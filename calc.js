// calc.js: pure pay calculation. No DOM, no storage.
//
// Rules (all numbers come from settings, see settings.js):
//  - A shift belongs to the month and the day in which it STARTED.
//  - Overtime is counted per day: all shifts that start on the same date add up.
//    First `otThresholdMin` minutes are regular, next `otTier1Min` minutes get otTier1Pct,
//    the rest get otTier2Pct.
//  - Shabbat window (Friday <start> .. Saturday <end>) pays shabbatPct per minute.
//    Overtime inside the window is cumulative: shabbatPct + (tier pct - 100),
//    e.g. 150 + 25 = 175 and 150 + 50 = 200.
//  - Tariff override on a shift: 'percent' replaces the base percent (Shabbat / regular),
//    overtime is still added on top; 'rate' replaces the hourly rate.
//  - Breaks are deducted from the END of the shift, only if the shift is long enough.
//  - Time is real elapsed time (a shift across the daylight-saving change is 1 hour longer/shorter).
//  - Day off / sick / holiday: rate * hours * percent. Sick percent depends on the position of
//    the day in a run of consecutive sick days (1st, 2nd, 3rd, 4th and later).

import { effective, effectiveFrom, shiftMonth } from './settings.js';

const pad = (n) => String(n).padStart(2, '0');

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function parseLocalDT(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s || '');
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}
export function toLocalDT(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function utcFromDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
export function dowOf(dateStr) {
  return new Date(utcFromDate(dateStr)).getUTCDay(); // 0 = Sunday .. 6 = Saturday
}
export function addDays(dateStr, n) {
  const t = new Date(utcFromDate(dateStr) + n * 86400000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function daysBetween(a, b) {
  return Math.round((utcFromDate(b) - utcFromDate(a)) / 86400000);
}
const hm = (s) => {
  const [h, m] = String(s).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function entryDate(e) {
  return e.type === 'shift' ? e.start.slice(0, 10) : e.date;
}
function cmpEntries(a, b) {
  const da = entryDate(a);
  const db = entryDate(b);
  if (da !== db) return da < db ? -1 : 1;
  const sa = a.start || '';
  const sb = b.start || '';
  if (sa !== sb) return sa < sb ? -1 : 1;
  return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcShift(e, S, dayBefore) {
  const st = parseLocalDT(e.start);
  const en = parseLocalDT(e.end);
  const gross = st && en ? Math.max(0, Math.round((en - st) / 60000)) : 0;
  let brk = 0;
  if (S.breakEnabled && gross >= S.breakMinShiftMin) brk = Math.min(S.breakMin, gross);
  const net = gross - brk;

  const tariff = e.tariff || { mode: 'settings' };
  const rate = tariff.mode === 'rate' ? num(tariff.value) : S.rate;
  const winStart = hm(S.shabbatStart);
  const winEnd = hm(S.shabbatEnd);

  const buckets = new Map(); // percent -> minutes
  let regularMin = 0;
  let overtimeMin = 0;
  let pctSum = 0;
  for (let k = 0; k < net; k++) {
    let base = 100;
    if (tariff.mode === 'percent') {
      base = num(tariff.value);
    } else if (S.shabbatEnabled) {
      const d = new Date(st.getTime() + k * 60000);
      const dow = d.getDay();
      const mod = d.getHours() * 60 + d.getMinutes();
      if ((dow === 5 && mod >= winStart) || (dow === 6 && mod < winEnd)) base = S.shabbatPct;
    }
    const cum = dayBefore + k;
    let add = 0;
    if (S.otEnabled && cum >= S.otThresholdMin) {
      add = cum < S.otThresholdMin + S.otTier1Min ? S.otTier1Pct - 100 : S.otTier2Pct - 100;
      overtimeMin++;
    } else {
      regularMin++;
    }
    const pct = base + add;
    buckets.set(pct, (buckets.get(pct) || 0) + 1);
    pctSum += pct;
  }
  const wage = ((pctSum / 100) * rate) / 60;
  const tip = num(e.tip);
  const expenses = num(e.expenses);
  return {
    id: e.id,
    kind: 'shift',
    entry: e,
    date: e.start.slice(0, 10),
    grossMin: gross,
    breakMin: brk,
    netMin: net,
    regularMin,
    overtimeMin,
    wage,
    tip,
    expenses,
    total: wage + tip - expenses,
    buckets: [...buckets.entries()].sort((a, b) => a[0] - b[0]),
    rate,
    counted: true,
  };
}

// index of each sick day inside its run of consecutive days (1-based)
export function sickIndexes(entries) {
  const sick = entries.filter((e) => e.type === 'sick').sort(cmpEntries);
  const idx = new Map();
  let prev = null;
  let n = 0;
  for (const e of sick) {
    if (prev === null) n = 1;
    else if (e.date === prev) n = Math.max(n, 1);
    else if (daysBetween(prev, e.date) === 1) n += 1;
    else n = 1;
    idx.set(e.id, n);
    prev = e.date;
  }
  return idx;
}

function calcDay(e, S, sickIdx) {
  const dow = dowOf(e.date);
  const fri = dow === 5 || dow === 6;
  const skipped = S.skipFriSat && fri && e.type !== 'holiday';
  const hours = e.hours != null && e.hours !== '' ? num(e.hours) : S.dayHours;
  let pct = 100;
  if (e.type === 'sick') {
    const i = sickIdx || 1;
    pct = i === 1 ? S.sickPct1 : i === 2 ? S.sickPct2 : i === 3 ? S.sickPct3 : S.sickPct4;
  } else if (e.type === 'dayoff') pct = S.dayoffPct;
  else if (e.type === 'holiday') pct = S.holidayPct;
  const pay = skipped ? 0 : (hours * S.rate * pct) / 100;
  return {
    id: e.id,
    kind: e.type,
    entry: e,
    date: e.date,
    hours,
    pct,
    sickIndex: e.type === 'sick' ? sickIdx || 1 : undefined,
    skipped,
    counted: !skipped,
    wage: pay,
    tip: 0,
    expenses: 0,
    total: pay,
    grossMin: 0,
    netMin: 0,
    regularMin: 0,
    overtimeMin: 0,
    buckets: [],
  };
}

export function calcMonth(job, allEntries, month) {
  const S = effective(job, month);
  const mine = allEntries.filter((e) => e.jobId === job.id);
  const sickIdx = sickIndexes(mine);
  const inMonth = mine.filter((e) => entryDate(e).startsWith(month)).sort(cmpEntries);

  const dayCum = new Map();
  const rows = [];
  for (const e of inMonth) {
    if (e.type === 'shift') {
      const date = entryDate(e);
      const before = dayCum.get(date) || 0;
      const r = calcShift(e, S, before);
      dayCum.set(date, before + r.netMin);
      rows.push(r);
    } else {
      rows.push(calcDay(e, S, sickIdx.get(e.id)));
    }
  }

  const t = {
    shifts: 0,
    sickDays: 0,
    dayoffDays: 0,
    holidayDays: 0,
    grossMin: 0,
    netMin: 0,
    regularMin: 0,
    overtimeMin: 0,
    wages: 0,
    sickPay: 0,
    dayoffPay: 0,
    holidayPay: 0,
    travel: 0,
    tips: 0,
    expenses: 0,
    total: 0,
  };
  for (const r of rows) {
    if (r.kind === 'shift') {
      t.shifts++;
      t.grossMin += r.grossMin;
      t.netMin += r.netMin;
      t.regularMin += r.regularMin;
      t.overtimeMin += r.overtimeMin;
      t.wages += r.wage;
      t.tips += r.tip;
      t.expenses += r.expenses;
    } else if (r.kind === 'sick') {
      if (r.counted) t.sickDays++;
      t.sickPay += r.wage;
    } else if (r.kind === 'dayoff') {
      if (r.counted) t.dayoffDays++;
      t.dayoffPay += r.wage;
    } else if (r.kind === 'holiday') {
      t.holidayDays++;
      t.holidayPay += r.wage;
    }
  }
  if (S.travelMode === 'perShift') t.travel = S.travelAmount * t.shifts;
  else if (S.travelMode === 'perMonth') t.travel = t.shifts > 0 ? S.travelAmount : 0;
  t.total = t.wages + t.sickPay + t.dayoffPay + t.holidayPay + t.travel + t.tips - t.expenses;

  // what changed compared with the previous month (shown in the month summary)
  const prev = effective(job, shiftMonth(month, -1));
  const changed = Object.keys(S).filter((k) => prev[k] !== S[k]);

  return {
    month,
    settings: S,
    rateFrom: effectiveFrom(job, 'rate', month),
    changed,
    rows,
    rowsDesc: [...rows].reverse(),
    totals: t,
  };
}

// result for one draft entry, using the other entries of the same job (overtime, sick runs)
export function previewEntries(job, allEntries, drafts) {
  const ids = new Set(drafts.map((d) => d.id));
  const rest = allEntries.filter((e) => !ids.has(e.id));
  const months = new Set(drafts.map((d) => entryDate(d).slice(0, 7)));
  const out = [];
  for (const m of months) {
    const res = calcMonth(job, rest.concat(drafts), m);
    for (const r of res.rows) if (ids.has(r.id)) out.push(r);
  }
  return out;
}

export function fmtHM(min) {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}
export function fmtMoney(n) {
  return String(round2(n));
}
