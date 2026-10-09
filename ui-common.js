// ui-common.js: small pieces used by several screens.

import { h, icon } from './dom.js';
import { targetState } from './autobackup.js';
import { clientIdProblem } from './drive.js';
import { T, f, fmtStamp, errText, ago } from './strings.js';

// one line about one backup target: {level, label, text, sub}
export function describeTarget(kind) {
  const s = targetState(kind);
  const label = kind === 'drive' ? T.bDrive : T.bPhone;
  const stamp = s.lastOk ? fmtStamp(s.lastOk.at) : '';
  let text = '';
  let sub = '';
  let short = '';
  let oldNote = '';
  switch (s.code) {
    case 'ok':
      text = stamp;
      // the phone copy is made by hand now and then: just say how long ago it was
      if (kind === 'local') {
        sub = ago(s.lastOk.at);
        short = sub;
      }
      break;
    case 'pending': {
      // "N changes are not in the backup yet" (red when they are old)
      const n = s.unsaved;
      text = stamp;
      sub = n == null ? T.bPendingAny : n === 1 ? T.bPendingOne : f(T.bPendingN, { n });
      short = n == null ? T.stripPending : n === 1 ? T.stripPendingOne : f(T.stripPendingN, { n });
      if (s.old) {
        oldNote = f(T.bPendingOld, { d: s.days });
        short = f(T.stripPendingOld, { t: short, d: s.days });
      }
      break;
    }
    case 'guard':
      text = stamp;
      sub = f(T.bGuard, { now: s.guard.now, before: s.guard.before });
      short = T.stripGuard;
      break;
    case 'failed':
      text = T.bFailed + ' · ' + errText(s.lastFail.code);
      sub = `${T.bLastSuccess}: ${stamp}`;
      short = T.stripFailed;
      break;
    case 'none':
      text = kind === 'local' ? T.bPhoneNone : s.lastFail ? T.bFailed + ' · ' + errText(s.lastFail.code) : T.bNone;
      sub = s.lastFail ? T.bNoSuccessYet : '';
      short = s.lastFail ? T.stripFailed : '';
      break;
    case 'not_configured':
      text = clientIdProblem() === 'bad' ? T.bBadClientIdTitle : T.bNotConfiguredTitle;
      break;
    default:
      text = '';
  }
  return { ...s, label, text, sub, short, oldNote };
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
    const main = d.code === 'failed' || d.code === 'none' || d.code === 'not_configured' ? d.text : d.lastOk ? fmtStamp(d.lastOk.at) : d.text;
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
