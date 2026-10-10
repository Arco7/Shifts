// ui-backup.js: the "backup" tab, restore flows and the first-run screen.

import { h, icon, openSheet, confirmDialog, toast, sheetsSettled } from './dom.js';
import { ctx, commit } from './ctx.js';
import * as B from './backup.js';
import * as drive from './drive.js';
import { APP_VERSION } from './version.js';
import { isEmptyDb, kvSet } from './store.js';
import { runBackupNow, runPhoneBackup, cancelRun, signInGoogle, loadStatus } from './autobackup.js';
import { describeTarget, dot } from './ui-common.js';
import { T, f, lri, errText, fmtStamp, fmtDMY } from './strings.js';

const errCode = (e) => (e && e.code) || 'error';

// ---------- live timers: "how long has this been going on" ----------
// An element with data-since counts seconds by itself, so a stuck step is visible at once.
// An element with data-show-at stays hidden until that moment (the "this takes long" hint).
let tickerOn = false;
function startTicker() {
  if (tickerOn) return;
  tickerOn = true;
  setInterval(() => {
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-since]')) {
      el.textContent = f(el.dataset.tpl, { n: Math.max(0, Math.round((now - Number(el.dataset.since)) / 1000)) });
    }
    for (const el of document.querySelectorAll('[data-show-at]')) {
      el.hidden = now < Number(el.dataset.showAt);
    }
  }, 500);
}
export function liveSpan(tpl, since) {
  startTicker();
  return h('span', { dir: 'auto', dataset: { since: String(since), tpl } }, f(tpl, { n: Math.max(0, Math.round((Date.now() - since) / 1000)) }));
}
const secs = (ms) => f(T.pgSec, { n: (ms / 1000).toFixed(1) });

// ---------- restore ----------

async function applyRestore(newDb, source = null) {
  // 1. safety copy of what is in the app now (kept on the phone, and on Drive when possible)
  if (!isEmptyDb(ctx.db)) {
    const built = await B.saveSafety(ctx.db);
    await Promise.race([B.safetyToDrive(built), new Promise((r) => setTimeout(r, 6000))]);
  }
  // 2. replace
  newDb.rev = Math.max(ctx.db.rev || 0, newDb.rev || 0);
  ctx.db = newDb;
  globalThis.__shiftlogDb = newDb;
  if (!ctx.db.jobs.some((j) => j.id === ctx.jobId)) ctx.jobId = ctx.db.jobs[0].id;
  ctx.editMode = false;
  await commit();
  await kvSet('started', true);
  ctx.started = true;
  // restored from a copy on Drive: the data IS that copy, so it counts as the last Drive backup
  if (source && source.kind === 'drive') {
    try {
      await B.markRestored(ctx.db, source);
    } catch (e) {
      console.error(e);
    }
  }
  await loadStatus();
  ctx.render();
  toast(f(T.bRestoreDone, { n: ctx.db.entries.length }));
}

// shows what was found and asks. Returns true when restored.
async function confirmRestore(parsed, whenText, source = null) {
  const info = B.describeDb(parsed.db);
  const cur = B.describeDb(ctx.db);
  const details = h(
    'div',
    { class: 'restore-info' },
    h('div', null, info.entries ? f(T.bRestoreInfo, { n: info.entries, last: fmtDMY(info.lastDate) }) : T.bRestoreInfoEmpty),
    cur.entries > 0 ? h('div', { class: 'warn-text' }, icon('alert', 18), ' ', f(T.bRestoreWarn, { n: cur.entries })) : null,
  );
  const ok = await confirmDialog({ title: f(T.bRestoreFound, { date: lri(whenText) }), text: T.bRestoreAsk, details, okText: T.bRestoreYes, cancelText: T.cancel, danger: cur.entries > 0 });
  if (!ok) return false;
  try {
    await applyRestore(parsed.db, source);
    return true;
  } catch (e) {
    toast(`${T.bRestoreFail}: ${errText(errCode(e))}`, { kind: 'err' });
    return false;
  }
}

function parseOrToast(text) {
  try {
    return B.parseBackup(text);
  } catch (e) {
    toast(f(T.bRestoreBadFile, { err: errText(errCode(e)) }), { kind: 'err', ms: 6000 });
    return null;
  }
}

const badId = () => drive.clientIdProblem() === 'bad';
const notConfTitle = () => (badId() ? T.bBadClientIdTitle : T.bNotConfiguredTitle);
const notConfText = () => (badId() ? T.bBadClientId : T.bNotConfiguredText);

// MUST be called straight from a tap (Google sign-in may be needed)
export function startRestoreFromDrive() {
  if (!drive.isConfigured()) {
    toast(notConfTitle(), { kind: 'warn' });
    return;
  }
  drive.expectIntent('restore');
  const listP = B.listDriveBackups({ interactive: true });
  const loading = h('div', { class: 'empty' }, liveSpan(T.loadingList, Date.now()));
  const body = h('div', { class: 'sheet-col' }, header(T.bRestorePick, () => sheet.close()), h('div', { class: 'sheet-scroll' }, loading));
  const sheet = openSheet(body, { full: true });

  const show = (list) => {
    const rows = list.length
      ? list.map((it, i) =>
          h(
            'button',
            {
              class: 'pick-row',
              type: 'button',
              onclick: async () => {
                try {
                  sheet.setContent(h('div', { class: 'sheet-col' }, header(T.bRestorePick, () => sheet.close()), h('div', { class: 'sheet-scroll' }, h('div', { class: 'empty' }, liveSpan(T.loadingFile, Date.now())))));
                  const text = await B.fetchDriveBackup(it.id, { interactive: true });
                  const parsed = parseOrToast(text);
                  if (!parsed) return show(list);
                  const done = await confirmRestore(parsed, fmtStamp(it.date.toISOString()), { kind: 'drive', at: it.date.toISOString(), name: it.name });
                  if (done) sheet.close();
                  else show(list);
                } catch (e) {
                  toast(errText(errCode(e)), { kind: 'err' });
                  show(list);
                }
              },
            },
            h('span', { class: 'pick-main' }, h('b', { dir: 'ltr' }, fmtStamp(it.date.toISOString())), h('small', { class: 'muted' }, f(T.bEntries, { n: it.entries }), i === 0 ? ' · ★' : '')),
            icon('chevL', 20),
          ),
        )
      : [h('div', { class: 'empty' }, T.bRestoreNone)];
    sheet.setContent(h('div', { class: 'sheet-col' }, header(T.bRestorePick, () => sheet.close()), h('div', { class: 'sheet-scroll' }, h('div', { class: 'card' }, rows))));
  };
  listP.then(show).catch((e) => {
    if (errCode(e) === 'redirecting') {
      // the page is on its way to Google: closing the sheet now would go "back" in history
      // and cancel that trip, so just say what is happening
      loading.textContent = errText('redirecting');
      return;
    }
    sheet.close();
    toast(errText(errCode(e)), { kind: 'err' });
  });
}

function header(title, onClose) {
  return h('div', { class: 'sheet-head' }, h('span'), h('div', { class: 'head-mid' }, h('div', { class: 'sheet-title' }, title)), h('button', { class: 'link-btn', type: 'button', onclick: onClose }, T.close));
}

// MUST be called straight from a tap (opens the file chooser)
export function startRestoreFromFile() {
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: { display: 'none' } });
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (e) {
      toast(T.bRestoreFail, { kind: 'err' });
      return;
    }
    const parsed = parseOrToast(text);
    if (!parsed) return;
    await confirmRestore(parsed, fmtStamp(parsed.env.createdAt));
  });
  document.body.append(input);
  input.click();
}

export async function openSafetyList() {
  const list = await B.listSafety();
  let sheet;
  const rows = list.length
    ? list.map((it) =>
        h(
          'button',
          {
            class: 'pick-row',
            type: 'button',
            onclick: async () => {
              const parsed = parseOrToast(it.text);
              if (!parsed) return;
              const done = await confirmRestore(parsed, fmtStamp(it.at));
              if (done) sheet.close();
            },
          },
          h('span', { class: 'pick-main' }, h('b', { dir: 'ltr' }, fmtStamp(it.at)), h('small', { class: 'muted' }, f(T.bEntries, { n: it.entries }))),
          icon('chevL', 20),
        ),
      )
    : [h('div', { class: 'empty' }, T.bRestoreNoSafety)];
  sheet = openSheet(h('div', { class: 'sheet-col' }, header(T.bRestoreSafety, () => sheet.close()), h('div', { class: 'sheet-scroll' }, h('div', { class: 'card' }, rows))), { full: true });
}

// ---------- first run (empty app) ----------
export function firstRunScreen() {
  const lost = ctx.hadData;
  const configured = drive.isConfigured();
  return h(
    'div',
    { class: 'firstrun' },
    h('div', { class: 'fr-icon' + (lost ? ' bad' : '') }, icon(lost ? 'alert' : 'shield', 56)),
    h('h1', null, lost ? T.frLostTitle : T.frTitle),
    h('p', { class: 'muted' }, lost ? T.frLostText : T.frText),
    h(
      'div',
      { class: 'btn-col' },
      h('button', { class: 'btn primary', type: 'button', disabled: !configured, onclick: () => startRestoreFromDrive() }, icon('cloud', 22), T.frRestoreDrive),
      configured ? null : h('div', { class: 'hint' }, T.frNoDrive),
      h('button', { class: 'btn', type: 'button', onclick: () => startRestoreFromFile() }, icon('file', 22), T.frRestoreFile),
      h(
        'button',
        {
          class: 'btn ghost',
          type: 'button',
          onclick: async () => {
            const ok = await confirmDialog({ title: T.frStartAsk, text: T.frStartText, okText: T.frStart, cancelText: T.cancel });
            if (!ok) return;
            ctx.started = true;
            await kvSet('started', true);
            ctx.render();
          },
        },
        T.frStart,
      ),
    ),
  );
}

// ---------- the tab ----------

// the list "step - time" of a finished or stopped backup
function stepTimes(steps) {
  if (!steps) return null;
  const done = steps.steps.filter((x) => x.ms != null);
  if (!done.length) return null;
  return h(
    'div',
    { class: 'step-times' },
    h('div', { class: 'muted' }, T.pgTimes),
    done.map((x, i) => h('div', { class: 'st-row' + (steps.failedAt === steps.steps.indexOf(x) ? ' bad' : '') }, h('span', null, T['pg_' + x.key]), h('b', { dir: 'ltr' }, secs(x.ms)))),
  );
}

function driveResult() {
  const r = ctx.lastResult;
  if (!r || r.kind !== 'drive' || !r.manual) return null;
  if (r.ok) {
    return h(
      'div',
      { class: 'result ok' },
      h('div', { class: 'res ok' }, icon('check', 18), h('b', null, T.resDriveOk), h('span', { dir: 'ltr' }, fmtStamp(r.at))),
      h('div', { class: 'muted' }, T.bVerifiedDrive),
      h('div', { class: 'muted' }, f(T.pgDone, { n: (r.steps.totalMs / 1000).toFixed(1) })),
      stepTimes(r.steps),
    );
  }
  const failed = r.steps && r.steps.failedAt >= 0 ? r.steps.steps[r.steps.failedAt] : null;
  return h(
    'div',
    { class: 'result bad' },
    h('div', { class: 'res bad' }, icon('x', 18), h('b', null, T.resDriveFail), h('span', null, errText(r.code))),
    failed ? h('div', { class: 'muted' }, f(T.pgFailedAt, { step: T['pg_' + failed.key] })) : null,
    stepTimes(r.steps),
  );
}

// the running backup: a bar with one segment per step, the list of steps and live seconds
function progressBlock() {
  const t = ctx.progress;
  if (!t) return null;
  const cur = t.index;
  return h(
    'div',
    { class: 'progress', role: 'status' },
    h('div', { class: 'pg-head' }, h('b', null, f(T.pgStep, { n: Math.max(1, cur + 1), m: t.keys.length })), liveSpan(T.pgSec, t.startedAt)),
    h('div', { class: 'pbar', 'aria-hidden': 'true' }, t.keys.map((k, i) => h('i', { class: i < cur ? 'done' : i === cur ? 'run' : '' }))),
    h(
      'div',
      { class: 'pg-list' },
      t.keys.map((k, i) => {
        const state = i < cur ? 'done' : i === cur ? 'run' : 'wait';
        return h(
          'div',
          { class: 'pg-row ' + state },
          h('span', { class: 'pg-ic' }, state === 'done' ? icon('check', 18) : state === 'run' ? icon('refresh', 18, 'spin') : h('span', { class: 'pg-dot' })),
          h('span', { class: 'pg-label' }, T['pg_' + k]),
          h('span', { class: 'pg-time', dir: 'ltr' }, state === 'done' ? secs(t.steps[i].ms) : state === 'run' ? liveSpan(T.pgSec, t.stepStartedAt) : ''),
        );
      }),
    ),
    h('div', { class: 'pg-slow', hidden: true, dataset: { showAt: String(t.stepStartedAt + 15000) } }, T.pgSlow),
    h('button', { class: 'btn small', type: 'button', onclick: () => cancelRun() }, T.pgCancel),
  );
}

function targetCard(kind, extra) {
  const d = describeTarget(kind);
  const big = d.lastOk ? fmtStamp(d.lastOk.at) : d.enabled ? (kind === 'local' ? T.bPhoneNone : T.bNone) : '—';
  let status;
  if (kind === 'local') {
    status = d.lastOk ? h('div', { class: 'status-line muted' }, icon('info', 18), T.bPhoneUnverified, d.sub ? h('div', { class: 'status-sub' }, d.sub) : null) : null;
  } else if (d.code === 'ok') status = h('div', { class: 'status-line ok' }, icon('check', 18), T.bOk);
  else if (d.code === 'guard') status = h('div', { class: 'status-line warn' }, icon('alert', 18), T.bGuardShort);
  else if (d.code === 'not_configured') status = h('div', { class: 'status-line bad' }, notConfText());
  else if (d.code === 'failed' || d.code === 'none') status = h('div', { class: 'status-line bad' }, icon('x', 18), d.text, d.sub ? h('div', { class: 'status-sub' }, d.sub) : null);
  else status = h('div', { class: 'status-line ' + d.level }, icon('alert', 18), d.sub, d.oldNote ? h('div', { class: 'status-sub' }, d.oldNote) : null);
  return h(
    'div',
    { class: 'card target ' + d.level },
    h('div', { class: 'target-head' }, dot(d.level), h('b', null, d.label)),
    h('div', { class: 'target-date', dir: 'ltr' }, big),
    status,
    d.lastOk ? h('div', { class: 'file-line', dir: 'ltr' }, `${d.lastOk.name}`) : null,
    d.lastOk ? h('div', { class: 'file-line' }, f(T.bEntries, { n: d.lastOk.entries }), d.lastOk.account && kind === 'drive' ? ` · ${d.lastOk.account}` : '') : null,
    extra,
  );
}

// The one window before a backup. When there are fewer records than in the last backup it says so
// (numbers and date) and asks "back up anyway?"; otherwise the usual short question.
async function confirmBackup(kind) {
  const drop = B.countDrop(ctx.status, kind, ctx.db.entries.length);
  if (drop) {
    const text = f(T.bDropText, { where: drop.from === 'drive' ? T.bDropWhereDrive : T.bDropWhereLocal, when: lri(fmtStamp(drop.at)), before: drop.before, now: drop.now });
    return confirmDialog({ title: T.bDropTitle, text, okText: T.bDropYes, cancelText: T.cancel, danger: true });
  }
  if (kind === 'drive') return confirmDialog({ title: T.bConfirmDriveTitle, text: T.bConfirmDriveText, okText: T.bConfirmDriveYes, cancelText: T.cancel });
  return confirmDialog({ title: T.bConfirmPhoneTitle, text: T.bConfirmPhoneText, okText: T.bConfirmPhoneYes, cancelText: T.cancel });
}

async function onDriveBackup() {
  if (isEmptyDb(ctx.db)) return toast(T.bEmptyNow, { kind: 'warn' });
  const ok = await confirmBackup('drive');
  if (!ok) return;
  // the confirm sheet steps back in the history; a trip to Google must not start in the middle of that
  await sheetsSettled();
  const r = await runBackupNow({ interactive: true, manual: true });
  if (!r || (r.drive && r.drive.code === 'redirecting')) return;
  const good = !!(r.drive && r.drive.ok);
  toast(good ? T.resDriveOk : `${T.resDriveFail}: ${errText(r.drive.code)}`, { kind: good ? 'ok' : 'err', ms: 5000 });
}

async function onPhoneBackup() {
  if (isEmptyDb(ctx.db)) return toast(T.bEmptyNow, { kind: 'warn' });
  const ok = await confirmBackup('local');
  if (!ok) return;
  await sheetsSettled();
  await runPhoneBackup();
}

function driveCard() {
  const running = !!ctx.progress;
  const btn = h(
    'button',
    { class: 'btn primary big', type: 'button', disabled: ctx.busy, onclick: () => onDriveBackup() },
    icon(ctx.busy ? 'refresh' : 'cloud', 24, ctx.busy ? 'spin' : ''),
    ctx.busy ? T.bBusy : T.bNowDrive,
  );
  return targetCard('drive', h('div', { class: 'card-extra' }, running ? progressBlock() : [btn, driveResult()]));
}

function phoneCard() {
  const r = ctx.lastPhone;
  const res = r && r.ok ? h('div', { class: 'res ok' }, icon('check', 18), h('b', null, T.resPhoneOk), h('span', { dir: 'ltr' }, fmtStamp(r.at))) : r && !r.ok ? h('div', { class: 'res bad' }, icon('x', 18), h('span', null, errText(r.code))) : null;
  return targetCard(
    'local',
    h(
      'div',
      { class: 'card-extra' },
      h('button', { class: 'btn wide', type: 'button', onclick: () => onPhoneBackup() }, icon('download', 22), T.bNowPhone),
      res,
      h('div', { class: 'hint' }, T.bPhoneNote),
    ),
  );
}

function googleCard() {
  if (!drive.isConfigured()) {
    return h('div', { class: 'card warn-card' }, h('div', { class: 'card-title' }, icon('alert', 20), notConfTitle()), h('p', { class: 'muted' }, notConfText()));
  }
  const email = drive.accountEmail();
  const connected = !!drive.cachedToken();
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('user', 20), T.bGoogle),
    h('div', { class: 'kv' }, h('span', { class: 'muted' }, connected ? T.bConnected : T.bNotConnected), email ? h('b', { dir: 'ltr' }, email) : null),
    !connected && drive.signInMode() === 'redirect' ? h('div', { class: 'hint' }, T.bRedirectHint, h('div', { dir: 'ltr', class: 'redirect-uri' }, drive.redirectUri())) : null,
    h(
      'div',
      { class: 'btn-row' },
      h(
        'button',
        {
          class: 'btn' + (connected ? '' : ' primary'),
          type: 'button',
          onclick: async () => {
            try {
              await signInGoogle();
              toast(T.bConnectedToast);
            } catch (e) {
              if (errCode(e) !== 'redirecting') toast(errText(errCode(e)), { kind: 'err', ms: 6000 });
            }
            ctx.render();
          },
        },
        icon('refresh', 20),
        T.bConnect,
      ),
      email
        ? h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onclick: () => {
                drive.signOutLocal();
                ctx.render();
              },
            },
            T.bDisconnect,
          )
        : null,
    ),
  );
}

function restoreCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('upload', 20), T.bRestore),
    h(
      'div',
      { class: 'btn-col' },
      h('button', { class: 'btn', type: 'button', disabled: !drive.isConfigured(), onclick: () => startRestoreFromDrive() }, icon('cloud', 20), T.bRestoreDrive),
      h('button', { class: 'btn', type: 'button', onclick: () => startRestoreFromFile() }, icon('file', 20), T.bRestoreFile),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openSafetyList() }, icon('shield', 20), T.bRestoreSafety),
    ),
  );
}

// "If something breaks": what to do, written for a day when nobody is around to help
export function openRecoveryHelp() {
  let sheet;
  const sec = (title, text) => h('div', { class: 'help-sec' }, h('b', null, title), h('p', null, text));
  const body = h(
    'div',
    { class: 'sheet-col' },
    header(T.rcSheetTitle, () => sheet.close()),
    h(
      'div',
      { class: 'sheet-scroll' },
      h(
        'div',
        { class: 'card help' },
        h('p', null, T.rcIntro),
        sec(T.rcS1Title, f(T.rcS1, { url: lri(drive.redirectUri()) })),
        sec(T.rcS2Title, T.rcS2),
        sec(T.rcS3Title, T.rcS3),
        sec(T.rcS4Title, T.rcS4),
      ),
    ),
  );
  sheet = openSheet(body, { full: true });
}

function helpCard() {
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('shield', 20), T.rcTitle),
    h('button', { class: 'btn', type: 'button', onclick: () => openRecoveryHelp() }, icon('info', 20), T.rcOpen),
  );
}

function guardNote() {
  const g = describeTarget('drive');
  if (!g || !g.guard) return null;
  return h(
    'div',
    { class: 'card warn-card' },
    h('div', { class: 'card-title' }, icon('alert', 20), T.bGuardTitle),
    h('p', null, f(T.bGuard, { now: g.guard.now, before: g.guard.before })),
    ctx.db.entries.length > 0
      ? h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: async () => {
              // like every Drive backup: one confirmation first; the new size is accepted only after "yes"
              const yes = await confirmBackup('drive');
              if (!yes) return;
              await B.acceptSmallDb(ctx.db.entries.length);
              toast(T.bGuardAccepted);
              await sheetsSettled();
              runBackupNow({ interactive: true, manual: true });
            },
          },
          T.bGuardAccept,
        )
      : null,
  );
}

export function backupScreen() {
  const head = h('div', { class: 'screen-head' }, h('div', { class: 'screen-title' }, T.backupTitle));
  const storage = h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('lock', 20), T.bStorage),
    h('div', { class: 'status-line ' + (ctx.persisted ? 'ok' : 'warn') }, icon(ctx.persisted ? 'check' : 'alert', 18), ctx.persisted ? T.bPersistOk : T.bPersistNo),
    h('div', { class: 'hint' }, T.bAuto),
  );
  const body = h(
    'div',
    { class: 'scroll' },
    h('div', { class: 'stack' }, driveCard(), phoneCard(), guardNote(), googleCard(), restoreCard(), helpCard(), storage, h('div', { class: 'version' }, f(T.bVersion, { v: APP_VERSION }))),
    h('div', { class: 'spacer-bottom' }),
  );
  return [head, body];
}
