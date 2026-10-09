// ui-backup.js: the "backup" tab, restore flows and the first-run screen.

import { h, icon, openSheet, confirmDialog, toast } from './dom.js';
import { ctx, commit } from './ctx.js';
import * as B from './backup.js';
import * as drive from './drive.js';
import { CONFIG } from './config.js';
import { isEmptyDb, kvSet } from './store.js';
import { runBackupNow, signInGoogle, refreshLocalPerm, requestAutoBackup } from './autobackup.js';
import { describeTarget, dot } from './ui-common.js';
import { T, f, lri, errText, fmtStamp, fmtDMY } from './strings.js';

const errCode = (e) => (e && e.code) || 'error';

// ---------- restore ----------

async function applyRestore(newDb) {
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
  await commit({ tap: false });
  await kvSet('started', true);
  ctx.started = true;
  ctx.render();
  toast(f(T.bRestoreDone, { n: ctx.db.entries.length }));
}

// shows what was found and asks. Returns true when restored.
async function confirmRestore(parsed, whenText) {
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
    await applyRestore(parsed.db);
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
  const loading = h('div', { class: 'empty' }, T.loading);
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
                  const text = await B.fetchDriveBackup(it.id, { interactive: true });
                  const parsed = parseOrToast(text);
                  if (!parsed) return;
                  const done = await confirmRestore(parsed, fmtStamp(it.date.toISOString()));
                  if (done) sheet.close();
                } catch (e) {
                  toast(errText(errCode(e)), { kind: 'err' });
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

function resultLines() {
  const r = ctx.lastResult;
  if (!r || !r.manual) return null;
  const lines = [];
  const stamp = fmtStamp(r.at);
  if (r.drive) {
    lines.push(
      r.drive.ok
        ? h('div', { class: 'res ok' }, icon('check', 18), h('b', null, T.bDrive), h('span', { dir: 'ltr' }, stamp))
        : h('div', { class: 'res bad' }, icon('x', 18), h('b', null, T.bDrive), h('span', null, errText(r.drive.code))),
    );
  }
  if (r.local) {
    if (r.local.skipped) lines.push(h('div', { class: 'res off' }, icon('minus', 18), h('span', null, T.bPhoneSkipped)));
    else
      lines.push(
        r.local.ok
          ? h('div', { class: 'res ok' }, icon('check', 18), h('b', null, T.bPhone), h('span', { dir: 'ltr' }, stamp))
          : h('div', { class: 'res bad' }, icon('x', 18), h('b', null, T.bPhone), h('span', null, errText(r.local.code))),
      );
  }
  return h('div', { class: 'card result' }, h('div', { class: 'card-title' }, T.bResult), lines);
}

function targetCard(kind) {
  const d = describeTarget(kind);
  const big = d.lastOk ? fmtStamp(d.lastOk.at) : d.enabled ? T.bNone : '—';
  let status;
  if (d.code === 'ok') status = h('div', { class: 'status-line ok' }, icon('check', 18), T.bOk);
  else if (d.code === 'guard') status = h('div', { class: 'status-line warn' }, icon('alert', 18), T.bGuardShort);
  else if (d.code === 'not_configured') status = h('div', { class: 'status-line bad' }, notConfText());
  else if (d.code === 'no_folder') status = h('div', { class: 'status-line muted' }, T.bFolderNone);
  else if (d.code === 'failed' || d.code === 'none') status = h('div', { class: 'status-line bad' }, icon('x', 18), d.text, d.sub ? h('div', { class: 'status-sub' }, d.sub) : null);
  else status = h('div', { class: 'status-line ' + d.level }, icon('alert', 18), d.sub);
  return h(
    'div',
    { class: 'card target ' + d.level },
    h('div', { class: 'target-head' }, dot(d.level), h('b', null, d.label)),
    h('div', { class: 'target-date', dir: 'ltr' }, big),
    status,
    d.lastOk ? h('div', { class: 'file-line', dir: 'ltr' }, `${d.lastOk.name}`) : null,
    d.lastOk ? h('div', { class: 'file-line' }, f(T.bEntries, { n: d.lastOk.entries }), d.lastOk.account && kind === 'drive' ? ` · ${d.lastOk.account}` : '', d.lastOk.folder && kind === 'local' ? ` · ${d.lastOk.folder}` : '') : null,
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

function folderCard() {
  const supported = B.localFolderSupported();
  const dir = ctx.localDir;
  const needPerm = dir && ctx.localPerm && ctx.localPerm !== 'granted';
  const pick = async () => {
    try {
      const handle = await B.pickLocalFolder();
      ctx.localDir = handle;
      await refreshLocalPerm();
      toast(f(T.bFolderPicked, { name: handle.name }));
      ctx.render();
      requestAutoBackup({ fromTap: false });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      toast(`${T.bRestoreFail}: ${e && e.message ? e.message : e}`, { kind: 'err', ms: 6000 });
    }
  };
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'card-title' }, icon('folder', 20), T.bFolder),
    supported
      ? h(
          'div',
          null,
          h('div', { class: 'kv' }, dir ? h('b', { dir: 'ltr' }, dir.name) : h('span', { class: 'muted' }, T.bFolderNone)),
          needPerm ? h('div', { class: 'status-line warn' }, icon('alert', 18), T.bFolderPermission) : null,
          h(
            'div',
            { class: 'btn-row' },
            needPerm
              ? h(
                  'button',
                  {
                    class: 'btn primary',
                    type: 'button',
                    onclick: () => {
                      // straight from the tap: ask the browser for access again
                      ctx.localDir
                        .requestPermission({ mode: 'readwrite' })
                        .then(async (p) => {
                          ctx.localPerm = p;
                          if (p === 'granted') {
                            toast(T.bFolderApproved);
                            requestAutoBackup({ fromTap: false });
                          }
                          ctx.render();
                        })
                        .catch((e) => toast(String(e && e.message ? e.message : e), { kind: 'err' }));
                    },
                  },
                  T.bFolderApprove,
                )
              : null,
            h('button', { class: 'btn' + (dir || needPerm ? '' : ' primary'), type: 'button', onclick: pick }, dir ? T.bFolderChange : T.bFolderPick),
            dir
              ? h(
                  'button',
                  {
                    class: 'btn ghost',
                    type: 'button',
                    onclick: async () => {
                      await B.forgetLocalFolder();
                      ctx.localDir = null;
                      ctx.localPerm = null;
                      ctx.render();
                    },
                  },
                  T.bFolderRemove,
                )
              : null,
          ),
          h('div', { class: 'hint' }, T.bFolderHint),
        )
      : h('p', { class: 'muted' }, T.bFolderUnsupported),
    h('div', { class: 'divider' }),
    h(
      'button',
      {
        class: 'btn wide',
        type: 'button',
        onclick: () => {
          if (isEmptyDb(ctx.db)) return toast(T.bEmptyNow, { kind: 'warn' });
          B.downloadBackup(B.buildBackup(ctx.db));
          toast(T.bDownloaded);
        },
      },
      icon('download', 20),
      T.bDownload,
    ),
    h('div', { class: 'hint' }, T.bDownloadHint),
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

function guardNote() {
  const g = ['drive', 'local'].map((k) => targetState2(k)).find((s) => s && s.guard);
  if (!g) return null;
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
              await B.acceptSmallDb(ctx.db.entries.length);
              toast(T.bGuardAccepted);
              runBackupNow({ interactive: true, manual: true });
            },
          },
          T.bGuardAccept,
        )
      : null,
  );
}
function targetState2(kind) {
  return describeTarget(kind);
}

export function backupScreen() {
  const head = h('div', { class: 'screen-head' }, h('div', { class: 'screen-title' }, T.backupTitle));
  const btn = h(
    'button',
    {
      class: 'btn primary big',
      type: 'button',
      disabled: ctx.busy,
      onclick: () => {
        // straight from the tap: sign-in to Google may have to start right here
        runBackupNow({ interactive: true, manual: true }).then((r) => {
          if (!r || (r.drive && r.drive.code === 'redirecting')) return;
          const dOk = r.drive && r.drive.ok;
          const lOk = r.local && (r.local.ok || r.local.skipped);
          const parts = [];
          if (r.drive) parts.push(dOk ? T.bDriveOk : T.bDriveFail);
          if (r.local && !r.local.skipped) parts.push(r.local.ok ? T.bPhoneOk : T.bPhoneFail);
          toast(parts.join(' · '), { kind: dOk && lOk ? 'ok' : 'err', ms: 5000 });
        });
      },
    },
    icon(ctx.busy ? 'refresh' : 'cloud', 24, ctx.busy ? 'spin' : ''),
    ctx.busy ? T.bBusy : T.bNow,
  );
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
    h('div', { class: 'stack' }, targetCard('drive'), targetCard('local'), btn, resultLines(), guardNote(), googleCard(), folderCard(), restoreCard(), storage, h('div', { class: 'version' }, f(T.bVersion, { v: CONFIG.APP_VERSION }))),
    h('div', { class: 'spacer-bottom' }),
  );
  return [head, body];
}
