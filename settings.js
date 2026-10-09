// settings.js: all calculation settings, with history ("effective from month").
// Every field keeps its own list of revisions: [{from:'YYYY-MM', value}], sorted by month.
// A month uses the last revision whose `from` is <= that month. Past months are never
// recalculated by a later change: the new value only applies from the chosen month on.

export const BASE = '0000-00'; // "from the beginning"

export const DEFAULTS = {
  // pay
  rate: 0, // hourly rate, ILS
  // travel: 'none' | 'perShift' | 'perMonth'
  travelMode: 'none',
  travelAmount: 0,
  // overtime (per day)
  otEnabled: true,
  otThresholdMin: 480, // minutes per day before overtime starts
  otTier1Pct: 125,
  otTier1Min: 120, // length of first overtime tier, minutes
  otTier2Pct: 150,
  // breaks
  breakEnabled: false,
  breakMin: 30,
  breakMinShiftMin: 360, // shorter shifts are not reduced
  // Shabbat window: from Friday <start> to Saturday <end>
  shabbatEnabled: true,
  shabbatStart: '16:00',
  shabbatEnd: '20:00',
  shabbatPct: 150,
  // sick days (consecutive sick days: 1st, 2nd, 3rd, 4th and later)
  sickPct1: 0,
  sickPct2: 50,
  sickPct3: 50,
  sickPct4: 100,
  // full-day entries
  dayHours: 8,
  dayoffPct: 100,
  holidayPct: 100,
  skipFriSat: true, // day off / sick on Friday or Saturday is not counted
  // reserved for the net (after tax) estimate, not used yet
  netCreditPoints: null,
  netPensionPct: null,
  netStudyFundPct: null,
};

export const FIELD_KEYS = Object.keys(DEFAULTS);

const pad = (n) => String(n).padStart(2, '0');

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}
export function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function isMonthKey(s) {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function getList(job, key) {
  return (job.settings && job.settings[key]) || [];
}

export function effective(job, month) {
  const out = {};
  for (const key of FIELD_KEYS) {
    let v = DEFAULTS[key];
    for (const r of getList(job, key)) {
      if (r.from <= month) v = r.value;
      else break;
    }
    out[key] = v;
  }
  return out;
}

// month in which the value in effect for `month` started, or null if it is the default
export function effectiveFrom(job, key, month) {
  let from = null;
  for (const r of getList(job, key)) {
    if (r.from <= month) from = r.from;
    else break;
  }
  return from;
}

export function sameValue(a, b) {
  return a === b || (a == null && b == null);
}

// First ever value of a field applies from the beginning. Later ones apply from `fromMonth`.
export function setField(job, key, value, fromMonth) {
  if (!FIELD_KEYS.includes(key)) throw new Error('unknown setting ' + key);
  if (!isMonthKey(fromMonth)) throw new Error('bad month ' + fromMonth);
  job.settings = job.settings || {};
  const list = (job.settings[key] = job.settings[key] || []);
  if (list.length === 0) {
    list.push({ from: BASE, value });
    return;
  }
  const i = list.findIndex((r) => r.from === fromMonth);
  if (i >= 0) list[i].value = value;
  else {
    list.push({ from: fromMonth, value });
    list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  }
}

export function removeRevision(job, key, from) {
  const list = getList(job, key);
  if (list.length <= 1) return false;
  const i = list.findIndex((r) => r.from === from);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
