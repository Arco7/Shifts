// ui-common.js: small pieces used by several screens.

import { h, icon } from './dom.js';
import { targetState } from './autobackup.js';
import { T, f, fmtStamp, errText } from './strings.js';

// one line about one backup target: {level, label, text, sub}
export function describeTarget(kind) {
  const s = targetState(kind);
  const label = kind === 'drive' ? T.bDrive : T.bPhone;
  const stamp = s.lastOk ? fmtStamp(s.lastOk.at) : '';
  let text = '';
  let sub = '';
  let short = '';
  switch (s.code) {
    case 'ok':
      text = stamp;
      break;
    case 'pending':
      text = stamp;
      sub = s.needLogin ? T.bPendingLogin : T.bPending;
      short = s.needLogin ? T.stripPendingLogin : T.stripPending;
      break;
    case 'guard':
      text = stamp;
      sub = f(T.bGuard, { now: s.guard.now, before: s.guard.before });
      short = T.stripGuard;
      break;
    case 'failed':
      text = (kind === 'drive' ? T.bFailed : T.bFailedPhone) + ' · ' + errText(s.lastFail.code);
      sub = `${T.bLastSuccess}: ${stamp}`;
      short = T.stripFailed;
      break;
    case 'none':
      text = s.lastFail ? (kind === 'drive' ? T.bFailed : T.bFailedPhone) + ' · ' + errText(s.lastFail.code) : T.bNone;
      sub = s.lastFail ? T.bNoSuccessYet : '';
      short = s.lastFail ? T.stripFailed : '';
      break;
    case 'not_configured':
      text = T.bNotConfiguredTitle;
      break;
    case 'permission':
      text = stamp || T.bNone;
      sub = T.bFolderPermission;
      short = T.stripPermission;
      break;
    case 'no_folder':
      text = T.bOff;
      break;
    default:
      text = '';
  }
  return { ...s, label, text, sub, short };
}

export function dot(level) {
  return h('span', { class: 'dot ' + level, 'aria-hidden': 'true' });
}

// compact strip with the date of the last backup (always visible on the shifts screen)
export function statusStrip(onTap) {
  const rows = ['drive', 'local'].map((k) => {
    const d = describeTarget(k);
    const label = k === 'drive' ? T.stripDrive : T.bPhone;
    // failed / none: the line says what is wrong; otherwise the date of the last backup
    const main = d.code === 'failed' || d.code === 'none' || d.code === 'not_configured' || d.code === 'no_folder' ? d.text : d.lastOk ? fmtStamp(d.lastOk.at) : d.text;
    return h(
      'div',
      { class: 'strip-row ' + d.level },
      dot(d.level),
      h('span', { class: 'strip-label' }, label),
      h('span', { class: 'strip-text', dir: 'auto' }, main),
      d.short && d.code !== 'failed' && d.code !== 'none' ? h('span', { class: 'strip-sub', dir: 'auto' }, d.short) : null,
      d.code === 'failed' && d.lastOk ? h('span', { class: 'strip-sub muted', dir: 'auto' }, `${T.bLastSuccess}: ${fmtStamp(d.lastOk.at)}`) : null,
    );
  });
  return h(
    'button',
    { class: 'strip', type: 'button', onclick: onTap, 'aria-label': T.bLast },
    h('div', { class: 'strip-rows' }, rows),
    icon('chevL', 18, 'strip-arrow'),
  );
}
