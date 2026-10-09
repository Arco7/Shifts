// strings.js: every text of the screen lives here (Hebrew). To add a language later,
// copy this file's T object and translate it; nothing else has to change.

import { dowOf, fmtHM } from './calc.js';

export const LANG = 'he';

export const T = {
  app: 'משמרות ושכר',

  // navigation
  navShifts: 'משמרות',
  navWork: 'עבודה',
  navBackup: 'גיבוי',

  // common
  save: 'שמירה',
  cancel: 'ביטול',
  done: 'סיום',
  edit: 'עריכה',
  delete: 'מחיקה',
  close: 'סגירה',
  ok: 'אישור',
  back: 'חזרה',
  add: 'הוספה',
  rename: 'שינוי שם',
  soon: 'בקרוב',
  hours: 'שעות',
  minutes: 'דקות',
  days: 'ימים',
  yes: 'כן',
  no: 'לא',
  off: 'כבוי',
  on: 'פעיל',
  saved: 'נשמר',
  loading: 'רגע…',
  undo: 'ביטול מחיקה',
  deleted: 'נמחק',
  invalidNumber: 'מספר לא תקין',

  // shifts screen
  addEntry: 'הוספה',
  emptyMonth: 'אין רשומות בחודש הזה',
  emptyMonthHint: 'לחץ על + כדי להוסיף משמרת',
  prevMonth: 'חודש קודם',
  nextMonth: 'חודש הבא',
  totalsOpen: 'פרטי החודש',
  rowFrom: 'מ-',
  rowTo: 'עד-',
  rowHours: 'שעות',
  rowBreak: 'הפסקה',
  rowOvertime: 'נוספות',
  rowDayoff: 'יום חופש',
  rowSick: 'מחלה',
  rowHoliday: 'חג',
  rowSickN: 'יום מחלה {n} · {pct}%',
  rowNotCounted: 'לא נספר (שישי/שבת)',
  rowNextDay: '(למחרת)',
  rowTariffPct: 'תעריף {n}%',
  rowTariffRate: 'שכר {n} ₪',
  deleteTitle: 'למחוק את הרשומה?',
  deleteYes: 'מחיקה',
  deletedToast: 'הרשומה נמחקה',

  // totals sheet
  totalsTitle: 'סיכום החודש',
  tShifts: 'משמרות רגילות',
  tSickDays: 'ימי מחלה',
  tDayoffDays: 'ימי חופש',
  tHolidayDays: 'ימי חג',
  tGross: 'שעות ברוטו (ללא הפסקות)',
  tNet: 'שעות נטו',
  tRegular: 'שעות רגילות',
  tOvertime: 'שעות נוספות',
  tWages: 'שכר משעות',
  tSickPay: 'תשלום מחלה',
  tDayoffPay: 'תשלום חופש',
  tHolidayPay: 'תשלום חג',
  tTravel: 'נסיעות',
  tBonuses: 'בונוסים (טיפ)',
  tExpenses: 'הוצאות (מנוכות)',
  tTotal: 'סה״כ',
  tRate: 'שכר לשעה בחודש זה',
  tSince: 'מאז {month}',
  tSinceStart: 'מההתחלה',
  tRateNotSet: 'שכר לשעה עדיין לא הוגדר. עבור ללשונית עבודה ← שכר.',
  tChanged: 'הגדרות שהשתנו מהחודש הקודם: {list}',

  // entry sheet
  newEntry: 'משמרת חדשה',
  editShift: 'עריכת משמרת',
  editDayoff: 'עריכת יום חופש',
  editSick: 'עריכת יום מחלה',
  editHoliday: 'עריכת חג',
  tabShift: 'משמרת חדשה',
  tabDayoff: 'יום חופש',
  tabSick: 'מחלה',
  tabHoliday: 'חג',
  fIn: 'כניסה',
  fOut: 'יציאה',
  fTariff: 'תעריף',
  fTariffSettings: 'לפי הגדרות',
  fTariffPct: 'אחוז',
  fTariffRate: 'שכר לשעה',
  fTariffPctLabel: 'אחוז מהשכר (למשל 150)',
  fTariffRateLabel: 'שכר לשעה במשמרת הזו (₪)',
  fTip: 'טיפ',
  fExpenses: 'הוצאות',
  fNote: 'משהו שחשוב לזכור?',
  fFrom: 'מתאריך',
  fTo: 'עד תאריך',
  fDate: 'תאריך',
  fDayHours: 'שעות ליום',
  fDayHoursHint: 'ריק = ברירת מחדל ({n})',
  pvHours: 'שעות',
  pvDays: 'ימים',
  pvSkipped: 'דולגו {n} (שישי/שבת)',
  errEndBeforeStart: 'היציאה חייבת להיות אחרי הכניסה',
  errBadTime: 'חסר זמן כניסה או יציאה',
  errLong: 'המשמרת ארוכה מ-24 שעות. לשמור בכל זאת?',
  errRange: 'תאריך הסיום מוקדם מתאריך ההתחלה',
  errRangeLong: 'טווח ארוך מדי (מעל 120 יום)',
  errNoDate: 'חסר תאריך',
  errNothingNew: 'כל התאריכים האלה כבר קיימים',
  addedDays: 'נוספו {n} ימים',
  addedDaysSkipped: 'נוספו {n} ימים, דולגו {m} שכבר קיימים',
  keep: 'שמירה בכל זאת',
  notSavedTitle: 'לא נשמר!',
  notSavedText: 'הנתונים לא נשמרו בזיכרון הטלפון: {err}',

  // work tab
  workTitle: 'עבודה',
  jobsEditTitle: 'עריכת עבודה',
  jobsPick: 'בחירת עבודה',
  jobRename: 'שינוי שם',
  jobAdd: 'הוספת עבודה חדשה',
  jobNameLabel: 'שם העבודה',
  jobNameEmpty: 'חסר שם',
  jobAdded: 'העבודה נוספה',
  tileRate: 'שכר',
  tileTravel: 'נסיעות',
  tileOvertime: 'שעות נוספות',
  tileBreaks: 'הפסקות',
  tileSick: 'ימי מחלה',
  tileDays: 'ימי חופש וחג',
  tileTariffs: 'תעריפים',
  tileNet: 'נטו',
  subNotSet: 'לא הוגדר',
  subNone: 'ללא',
  subNotCounted: 'לא מחושבות',
  subPerHour: '{n} ₪ לשעה',
  subPerShift: '{n} ₪ למשמרת',
  subPerMonth: '{n} ₪ לחודש',
  subAfter: 'לאחר {n} שעות',
  subBreak: '{n} דקות',
  subHoursPerDay: '{n} שעות ליום',
  subShabbat: 'שבת {n}%',
  subNetSoon: 'חישוב אחרי מס · בקרוב',

  // settings sheets
  setEffective: 'תקף מחודש',
  setEffectiveHint: 'השינוי יחול מהחודש הזה ואילך. חודשים קודמים לא ישתנו.',
  setFirstHint: 'הערך הראשון חל על כל החודשים. שינויים אחר כך — מהחודש שתבחר.',
  setHistory: 'היסטוריית שינויים',
  setHistoryEmpty: 'עדיין אין שינויים',
  setDeleteRev: 'מחיקת שינוי',
  setDeleteRevAsk: 'למחוק את השינוי הזה?',
  setCurrent: 'בתוקף עכשיו',
  setNothingChanged: 'לא שונה כלום',
  setSavedN: 'נשמר ({n})',
  setNeedValid: 'בדוק את השדה: {label}',
  setFromStart: 'מההתחלה',
  setFromMonth: 'מ-{month}',
  fieldHm: 'שעות:דקות',

  // fields
  f_rate: 'שכר לשעה (₪)',
  f_travelMode: 'סוג נסיעות',
  f_travelAmount: 'סכום (₪)',
  f_otEnabled: 'חישוב שעות נוספות',
  f_otThresholdMin: 'שעות נוספות מתחילות אחרי (ביום)',
  f_otTier1Pct: 'אחוז לשלב הראשון (%)',
  f_otTier1Min: 'אורך השלב הראשון',
  f_otTier2Pct: 'אחוז אחרי השלב הראשון (%)',
  f_breakEnabled: 'ניכוי הפסקה',
  f_breakMin: 'אורך ההפסקה (דקות)',
  f_breakMinShiftMin: 'מנכים רק במשמרת מעל',
  f_shabbatEnabled: 'תעריף שבת',
  f_shabbatStart: 'תחילת שבת (יום שישי)',
  f_shabbatEnd: 'סוף שבת (יום שבת)',
  f_shabbatPct: 'אחוז שבת (%)',
  f_sickPct1: 'יום מחלה ראשון (%)',
  f_sickPct2: 'יום מחלה שני (%)',
  f_sickPct3: 'יום מחלה שלישי (%)',
  f_sickPct4: 'יום מחלה רביעי ואילך (%)',
  f_dayHours: 'שעות ליום (חופש/מחלה/חג)',
  f_dayoffPct: 'תשלום ליום חופש (%)',
  f_holidayPct: 'תשלום לחג (%)',
  f_skipFriSat: 'לא לספור חופש/מחלה בשישי ושבת',
  opt_none: 'ללא',
  opt_perShift: 'לכל משמרת',
  opt_perMonth: 'לחודש',
  h_otThresholdMin: 'ברירת מחדל 8:00. אם אתה עובד 5 ימים בשבוע, בדוק מול החוזה שלך.',
  h_otTier: 'כל משמרות היום מצטברות. למשל 2 שעות ראשונות ב-125%, אחר כך 150%.',
  h_break: 'ההפסקה מנוכה מסוף המשמרת, רק במשמרת ארוכה מהמינימום.',
  h_shabbat: 'כל דקה בין שישי לשבת בחלון הזה משולמת באחוז שבת. שעות נוספות בשבת מצטברות (למשל 150% + 25% = 175%).',
  h_sick: 'יום מחלה במחלה רצופה: האחוז לפי מספר היום ברצף.',
  h_days: 'שעות ליום משמשות ליום חופש, מחלה וחג כשלא כתבת שעות ידנית.',
  h_net: 'חישוב שכר נטו אחרי מס יתווסף בהמשך.',

  // backup tab
  backupTitle: 'גיבוי',
  bLast: 'גיבוי אחרון',
  bDrive: 'Google Drive',
  bPhone: 'טלפון',
  bNone: 'עדיין לא נעשה גיבוי',
  bOff: 'לא מוגדר',
  bOk: 'מגובה',
  bPending: 'יש שינויים שעדיין לא גובו',
  bPendingLogin: 'יש שינויים שלא גובו. לחץ "גבה עכשיו" (נדרש חיבור ל-Google)',
  bFailed: 'לא הועלה',
  bFailedPhone: 'לא נשמר בטלפון',
  bLastSuccess: 'הצלחה אחרונה',
  bNoSuccessYet: 'אין עדיין גיבוי מוצלח',
  bGuard: 'בבסיס הנתונים יש עכשיו פחות רשומות ({now}) מבגיבוי קודם ({before}). הגיבויים הישנים נשמרו ולא נמחקו.',
  bGuardTitle: 'שים לב',
  bGuardShort: 'מספר הרשומות ירד חדות. הגיבויים הישנים נשמרו (פרטים למטה).',
  bGuardAccept: 'הכמות נכונה, להמשיך כרגיל',
  bGuardAccepted: 'בסדר, ממשיכים כרגיל',
  bNow: 'גבה עכשיו',
  bBusy: 'מגבה…',
  bResult: 'תוצאה',
  bDriveOk: 'Drive ✓',
  bDriveFail: 'Drive ✗',
  bPhoneOk: 'טלפון ✓',
  bPhoneFail: 'טלפון ✗',
  bPhoneSkipped: 'טלפון: לא הוגדרה תיקייה',
  bDone: 'הושלם',
  bEmptyNow: 'אין נתונים לגבות',
  bEntries: '{n} רשומות',
  bFile: 'קובץ',
  bAccount: 'חשבון',
  bGoogle: 'חשבון Google',
  bConnect: 'התחברות ל-Google',
  bConnected: 'מחובר',
  bNotConnected: 'לא מחובר',
  bDisconnect: 'התנתקות',
  bConnectedToast: 'התחברת ל-Google',
  bNotConfiguredTitle: 'Drive עדיין לא הוגדר',
  bNotConfiguredText: 'כדי לגבות ל-Google Drive צריך להדביק Client ID בקובץ config.js (ההוראות במדריך). בינתיים אפשר לגבות לתיקייה בטלפון.',
  bFolder: 'תיקייה בטלפון',
  bFolderNone: 'לא נבחרה תיקייה',
  bFolderPick: 'בחירת תיקייה',
  bFolderChange: 'שינוי תיקייה',
  bFolderRemove: 'הסרה',
  bFolderPermission: 'צריך לאשר שוב גישה לתיקייה',
  bFolderApprove: 'אישור גישה',
  bFolderApproved: 'הגישה אושרה',
  bFolderUnsupported: 'הדפדפן הזה לא תומך בבחירת תיקייה. אפשר להוריד קובץ ידנית.',
  bFolderPicked: 'התיקייה נבחרה: {name}',
  bFolderHint: 'הגיבוי נשמר בקבצים בתיקייה הזו. 10 האחרונים נשמרים.',
  bDownload: 'הורדת קובץ גיבוי',
  bDownloadHint: 'שומר קובץ בתיקיית ההורדות. את הקובץ הזה האפליקציה לא יכולה לבדוק, והיא לא מוחקת קבצים ישנים.',
  bDownloaded: 'הקובץ הורד',
  bRestore: 'שחזור',
  bRestoreDrive: 'שחזור מ-Drive',
  bRestoreFile: 'שחזור מקובץ',
  bRestoreSafety: 'גיבויי ביטחון (נוצרים לפני שחזור)',
  bRestorePick: 'בחירת גיבוי לשחזור',
  bRestoreNone: 'לא נמצאו גיבויים ב-Drive',
  bRestoreNoSafety: 'אין גיבויי ביטחון',
  bRestoreFound: 'נמצא גיבוי מתאריך {date}',
  bRestoreInfo: '{n} רשומות, הרשומה האחרונה: {last}',
  bRestoreInfoEmpty: 'אין רשומות',
  bRestoreWarn: 'הנתונים הנוכחיים ({n} רשומות) יוחלפו. לפני כן ייווצר גיבוי ביטחון.',
  bRestoreAsk: 'לשחזר?',
  bRestoreYes: 'שחזור',
  bRestoreDone: 'שוחזר: {n} רשומות',
  bRestoreFail: 'השחזור נכשל',
  bRestoreBadFile: 'הקובץ לא תקין: {err}',
  bRestoreSafetyDone: 'נשמר גיבוי ביטחון של הנתונים הנוכחיים',
  bStorage: 'אחסון בטלפון',
  bPersistOk: 'מוגן מפני ניקוי אוטומטי',
  bPersistNo: 'לא מוגן: הדפדפן עלול לנקות נתונים כשנגמר מקום. הגיבוי חשוב.',
  bAuto: 'גיבוי אוטומטי אחרי שינויים (לא יותר מפעם בכמה שעות), ובפתיחה של האפליקציה. הכפתור "גבה עכשיו" תמיד עובד.',
  bVersion: 'גרסה {v}',

  // strip
  stripDrive: 'Drive',
  stripPending: 'שינויים לא גובו',
  stripPendingLogin: 'ממתין לגיבוי · הקש כאן',
  stripGuard: 'שים לב',
  stripFailed: 'לא הועלה',
  stripPermission: 'צריך לאשר גישה',
  stripPhone: 'טלפון',
  stripTap: 'פרטים',

  // first run
  frTitle: 'ברוך הבא',
  frText: 'עדיין אין נתונים באפליקציה.',
  frLostTitle: 'הנתונים ריקים!',
  frLostText: 'בעבר נשמרו כאן נתונים, אבל עכשיו האפליקציה ריקה. אל תוסיף משמרות לפני שבדקת: שחזר מגיבוי.',
  frRestoreDrive: 'שחזור מ-Drive',
  frRestoreFile: 'שחזור מקובץ',
  frStart: 'להתחיל מאפס',
  frStartAsk: 'להתחיל בלי נתונים?',
  frStartText: 'אם יש לך גיבוי, עדיף לשחזר אותו קודם.',
  frNoDrive: 'Drive עדיין לא הוגדר, אפשר לשחזר מקובץ.',
  emptyBanner: 'האפליקציה ריקה. אם זה לא צפוי, שחזר מגיבוי.',
  emptyBannerBtn: 'לשחזור',

  // errors
  e_not_configured: 'Drive לא הוגדר',
  e_need_login: 'צריך להתחבר ל-Google',
  e_unauthorized: 'ההתחברות ל-Google פגה',
  e_offline: 'אין חיבור לאינטרנט',
  e_verify_failed: 'הקובץ שנשמר לא תואם למקור',
  e_local_permission: 'צריך לאשר גישה לתיקייה',
  e_popup_failed_to_open: 'חלון Google לא נפתח',
  e_popup_closed: 'חלון Google נסגר',
  e_access_denied: 'הגישה ל-Google נדחתה',
  e_scope_denied: 'לא ניתנה הרשאה ל-Drive',
  e_gis_not_loaded: 'Google עדיין לא נטען, נסה שוב',
  e_invalid_data: 'הנתונים בקובץ לא תקינים',
  e_not_json: 'זה לא קובץ גיבוי',
  e_bad_format: 'זה לא קובץ גיבוי של האפליקציה',
  e_too_new: 'הגיבוי נוצר בגרסה חדשה יותר',
  e_count_mismatch: 'הקובץ פגום (מספר הרשומות לא תואם)',
  e_generic: 'שגיאה ({code})',
  e_http_403: 'אין הרשאה ב-Drive (403)',
  e_http_404: 'לא נמצא (404)',
};

// keeps a date/number run in its own direction inside Hebrew text
export const lri = (t) => `\u2066${t}\u2069`;

export function f(text, params = {}) {
  return String(text).replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : ''));
}

export function errText(code) {
  return T['e_' + code] || f(T.e_generic, { code });
}

const pad = (n) => String(n).padStart(2, '0');

export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
export const WEEKDAYS = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'יום ש׳'];

export function monthTitle(m) {
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${y}`;
}
export function weekdayShort(dateStr) {
  return WEEKDAYS[dowOf(dateStr)];
}
// '2026-10-09' -> '09/10'
export function fmtDM(dateStr) {
  return `${dateStr.slice(8, 10)}/${dateStr.slice(5, 7)}`;
}
// '2026-10-09' -> '09.10.2026'
export function fmtDMY(dateStr) {
  return `${dateStr.slice(8, 10)}.${dateStr.slice(5, 7)}.${dateStr.slice(0, 4)}`;
}
// ISO instant -> '09.10.2026 18:22' (local time)
export function fmtStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtTime(isoLocal) {
  return isoLocal.slice(11, 16);
}
// '2026-10-09T18:22' -> '09/10, 18:22'
export function fmtDT(local) {
  return `${local.slice(8, 10)}/${local.slice(5, 7)}, ${local.slice(11, 16)}`;
}
export function ago(iso, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'עכשיו';
  if (min < 60) return `לפני ${min} דקות`;
  const h = Math.round(min / 60);
  if (h < 24) return `לפני ${h} שעות`;
  const d = Math.round(h / 24);
  return d === 1 ? 'אתמול' : `לפני ${d} ימים`;
}
export const hmText = (min) => fmtHM(min);

// "HH:MM" or whole hours -> minutes. null when invalid.
export function parseHM(s) {
  const t = String(s ?? '')
    .trim()
    .replace('.', ':');
  let m = /^(\d{1,2}):(\d{1,2})$/.exec(t);
  if (m) {
    const h = +m[1];
    const mi = +m[2];
    if (mi > 59) return null;
    return h * 60 + mi;
  }
  m = /^(\d{1,2})$/.exec(t);
  if (m) return +m[1] * 60;
  return null;
}
