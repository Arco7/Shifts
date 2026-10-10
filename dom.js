// dom.js: tiny helpers to build the screen without a framework:
// element builder, icons, bottom sheets (the phone's Back button closes them), confirm dialog, toast.

const SVGNS = 'http://www.w3.org/2000/svg';

// h('div', {class:'x', onclick: fn}, 'text', childNode, [more])
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.append(c);
    else el.append(document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// number/latin text inside Hebrew text keeps its own direction
export const ltr = (text, cls) => h('span', { dir: 'ltr', class: cls || null }, text);
export const money = (text) => h('span', { dir: 'ltr', class: 'money' }, `${text} ₪`);

// ---------- icons (24x24, drawn with lines) ----------
const ICONS = {
  list: '<line x1="8" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="20" y2="12"/><line x1="8" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><line x1="3" y1="13" x2="21" y2="13"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.6-7.96A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  minus: '<line x1="5" y1="12" x2="19" y2="12"/>',
  chevR: '<polyline points="9 5 16 12 9 19"/>',
  chevL: '<polyline points="15 5 8 12 15 19"/>',
  chevD: '<polyline points="5 9 12 16 19 9"/>',
  chevU: '<polyline points="5 15 12 8 19 15"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  check: '<polyline points="4 12 10 18 20 6"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12" y2="17.5"/>',
  money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><line x1="6" y1="12" x2="6" y2="12.1"/><line x1="18" y1="12" x2="18" y2="12.1"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><line x1="4" y1="11" x2="20" y2="11"/><line x1="7" y1="21" x2="7" y2="18"/><line x1="17" y1="21" x2="17" y2="18"/><circle cx="8.5" cy="14.5" r=".6"/><circle cx="15.5" cy="14.5" r=".6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  coffee: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H16"/><line x1="8" y1="3" x2="8" y2="6"/><line x1="12" y1="3" x2="12" y2="6"/>',
  sick: '<circle cx="12" cy="12" r="9"/><line x1="9" y1="10" x2="9" y2="10.1"/><line x1="15" y1="10" x2="15" y2="10.1"/><path d="M8.5 15.5c2-1.6 5-1.6 7 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5.3" y1="5.3" x2="7" y2="7"/><line x1="17" y1="17" x2="18.7" y2="18.7"/><line x1="5.3" y1="18.7" x2="7" y2="17"/><line x1="17" y1="7" x2="18.7" y2="5.3"/>',
  percent: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="7" cy="7" r="2.3"/><circle cx="17" cy="17" r="2.3"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="7.5" x2="16" y2="7.5"/><line x1="8" y1="12" x2="8" y2="12.1"/><line x1="12" y1="12" x2="12" y2="12.1"/><line x1="16" y1="12" x2="16" y2="12.1"/><line x1="8" y1="16" x2="8" y2="16.1"/><line x1="12" y1="16" x2="12" y2="16.1"/><line x1="16" y1="16" x2="16" y2="16.1"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  download: '<path d="M12 4v11"/><polyline points="7 11 12 16 17 11"/><line x1="5" y1="20" x2="19" y2="20"/>',
  upload: '<path d="M12 16V5"/><polyline points="7 9 12 4 17 9"/><line x1="5" y1="20" x2="19" y2="20"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4"/><polyline points="4 4 5.5 7 8.5 6"/><path d="M4 13a8 8 0 0 0 14.5 4"/><polyline points="20 20 18.5 17 15.5 18"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  trash: '<polyline points="4 7 20 7"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><line x1="14" y1="7" x2="17" y2="10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><polyline points="8.5 12 11 14.5 15.5 9.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.5" x2="12" y2="7.6"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><polyline points="14 3 14 7 18 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
};

export function icon(name, size = 24, cls = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  // sized in rem like everything else, so the one size knob in style.css scales the icons too
  svg.style.width = `${size / 16}rem`;
  svg.style.height = `${size / 16}rem`;
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] || '';
  return svg;
}
export const hasIcon = (n) => n in ICONS;

// ---------- sheets ----------
// Android Back closes the top sheet. All open sheets share ONE extra history entry (the "sentinel"):
// - the first sheet pushes it, Back pops it and closes the top sheet, then it is pushed again
//   while sheets remain;
// - when the last sheet is closed from the screen, the entry is taken back with history.go(-1).
// history.go() is asynchronous, so while it is in flight a newly opened sheet waits with its push.
const stack = [];
let root = null;
let sentinel = false; // our entry is on top of the history
let backing = false; // our own history.go(-1) has not finished yet
let backTimer = null;

function sheetRoot() {
  if (!root) {
    root = document.getElementById('sheets') || document.body.appendChild(h('div', { id: 'sheets' }));
  }
  return root;
}

function ensureSentinel() {
  if (!sentinel && !backing && stack.length) {
    history.pushState({ shiftlog: 1 }, '');
    sentinel = true;
  }
}
function dropSentinel() {
  if (sentinel && !backing) {
    backing = true;
    history.go(-1);
    // safety: if the browser never answers, do not stay blocked
    clearTimeout(backTimer);
    backTimer = setTimeout(() => {
      if (backing) {
        backing = false;
        sentinel = false;
        ensureSentinel();
      }
    }, 600);
  }
}

export function initSheets() {
  window.addEventListener('popstate', () => {
    if (backing) {
      // the end of our own go(-1)
      backing = false;
      sentinel = false;
      clearTimeout(backTimer);
      ensureSentinel();
      return;
    }
    // the Back button: the sentinel is gone, close the top sheet
    sentinel = false;
    if (stack.length) destroy(stack[stack.length - 1], { fromBack: true });
    ensureSentinel();
  });
}

// ---------- how sheets move (open: slides up, close: slides down; the totals window grows out of the bar) ----------
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'; // a soft stop, like a sheet on an iPhone
const noMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};
// the same as el.animate(), but it never throws and does nothing where animation is not available
export function play(el, frames, opts) {
  if (!el || typeof el.animate !== 'function' || noMotion()) return null;
  try {
    return el.animate(frames, { easing: EASE, ...opts });
  } catch {
    return null;
  }
}
// a big window makes the screen behind it a little smaller
function setBehind() {
  const app = document.getElementById('app');
  if (app) app.classList.toggle('behind', stack.some((x) => x.full && !x.closed));
}
const rectOf = (el) => el.getBoundingClientRect();

// the window "grows" out of the element it was opened from (the totals bar): the visible part of the window starts as the
// bar and grows upward, a copy of the bar sticks to its top edge and fades away while the content fades in
function morphSkin(from) {
  const clone = from.cloneNode(true);
  clone.removeAttribute('aria-label');
  clone.tabIndex = -1;
  clone.style.cssText = 'position:absolute;left:0;top:0;margin:0;width:100%;visibility:visible';
  const skin = h('div', { class: 'morph-skin', 'aria-hidden': 'true' }, clone);
  return { skin, clone };
}
function morphGeometry(sheet) {
  const r = rectOf(sheet.from);
  const o = rectOf(sheet.el);
  const p = sheet.panel;
  p.style.width = r.width + 'px';
  p.style.marginBottom = Math.max(0, o.bottom - r.bottom) + 'px';
  p.style.height = `max(12rem, calc(${Math.round(r.bottom - o.top)}px - env(safe-area-inset-top) - 3.25rem))`;
  return r;
}
// ends a running "grow" at once (its copy of the bar, its animations, its timer); used when the window is closed while it is
// still opening, so that two copies never lie on each other
function endRun(sheet) {
  const run = sheet.run;
  if (!run) return;
  sheet.run = null;
  clearTimeout(run.timer);
  run.skin.remove();
  for (const a of run.anims) if (a) a.cancel();
}
function morphRun(sheet, bar, dir) {
  endRun(sheet);
  const p = sheet.panel;
  const r = rectOf(bar);
  const pr = rectOf(p);
  const D = Math.max(0, pr.height - r.height);
  const R = parseFloat(getComputedStyle(bar).borderTopLeftRadius) || 16;
  const closed = `inset(${D}px 0 0 0 round ${R}px)`;
  const open = `inset(0 0 0 0 round ${R}px)`;
  const { skin, clone } = morphSkin(bar);
  p.append(skin);
  const opening = dir === 'open';
  const dur = opening ? 450 : 350;
  const content = p.querySelector('.sheet-col') || p.firstElementChild;
  const dim = getComputedStyle(sheet.el).backgroundColor;
  const anims = [
    play(p, [{ clipPath: opening ? closed : open }, { clipPath: opening ? open : closed }], { duration: dur, fill: 'both' }),
    play(clone, [{ transform: `translateY(${opening ? D : 0}px)` }, { transform: `translateY(${opening ? 0 : D}px)` }], { duration: dur, fill: 'both' }),
    play(skin, [{ opacity: opening ? 1 : 0 }, { opacity: opening ? 0 : 1 }], { duration: opening ? 300 : 250, delay: opening ? 120 : 0, easing: 'ease-out', fill: 'both' }),
    play(content, [{ opacity: opening ? 0 : 1 }, { opacity: opening ? 1 : 0 }], { duration: opening ? 320 : 180, delay: opening ? 130 : 0, easing: 'ease-out', fill: 'both' }),
    // only the dimming fades (not the whole layer): the bar must not blink at the start, it must stay solid while it grows
    play(sheet.el, [{ backgroundColor: opening ? 'rgba(0,0,0,0)' : dim }, { backgroundColor: opening ? dim : 'rgba(0,0,0,0)' }], { duration: 300, delay: opening ? 0 : 50, easing: 'ease-out', fill: 'both' }),
  ];
  const ran = anims.some(Boolean);
  if (!ran) {
    skin.remove(); // no animation here (reduced motion or an old browser): the window just appears, without the copy of the bar
    return { ran, dur, skin };
  }
  if (opening) {
    bar.style.visibility = 'hidden'; // the copy of the bar takes its place for the moment
    const timer = setTimeout(() => endRun(sheet), dur + 80);
    sheet.run = { skin, anims, timer };
  }
  return { ran, dur, skin };
}
function showBar(sheet, bar) {
  const el = bar || sheet.from;
  if (el && !stack.some((x) => x !== sheet && !x.closed && x.from === el)) el.style.visibility = '';
}

function playOpen(sheet) {
  if (sheet.from) {
    morphGeometry(sheet);
    const r = morphRun(sheet, sheet.from, 'open');
    if (!r.ran) showBar(sheet);
    return;
  }
  const dur = sheet.panel.classList.contains('small') ? 300 : 450;
  play(sheet.panel, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: dur, fill: 'backwards' });
  play(sheet.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out', fill: 'backwards' });
}

// returns how long the window needs to leave the screen (ms)
function playClose(sheet) {
  const el = sheet.el;
  const bar = sheet.from && document.contains(sheet.from) ? sheet.from : sheet.from ? document.querySelector('.totals-bar') : null;
  if (sheet.from && bar && !noMotion()) {
    const r = morphRun(sheet, bar, 'close');
    if (r.ran) {
      setTimeout(() => showBar(sheet, bar), r.dur);
      return r.dur;
    }
  }
  if (sheet.from) showBar(sheet, bar);
  const dur = sheet.panel.classList.contains('small') ? 250 : 350;
  const a = play(sheet.panel, [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }], { duration: dur, fill: 'forwards' });
  play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: dur - 50, delay: 50, easing: 'ease-out', fill: 'forwards' });
  return a ? dur : 0;
}

function destroy(sheet) {
  const i = stack.indexOf(sheet);
  if (i < 0) return false;
  stack.splice(i, 1);
  sheet.closed = true;
  sheet.el.classList.add('closing'); // no more taps while it leaves
  setBehind();
  const el = sheet.el;
  const ms = playClose(sheet);
  setTimeout(() => el.remove(), ms + 30);
  if (sheet.onClose) {
    try {
      sheet.onClose();
    } catch (e) {
      console.error(e);
    }
  }
  return true;
}

// content: Node. opts: {full: true, small: true, from: element (the window grows out of it), onClose, dismissible: true}
export function openSheet(content, opts = {}) {
  const panel = h('div', { class: 'sheet' + (opts.from ? ' morph' : opts.full ? ' full' : '') + (opts.small ? ' small' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  const overlay = h('div', { class: 'overlay' }, panel);
  const sheet = { el: overlay, panel, onClose: opts.onClose, closed: false, full: !!opts.full && !opts.from, from: opts.from || null };
  sheet.close = () => {
    if (destroy(sheet) && stack.length === 0) dropSentinel();
  };
  sheet.setContent = (node) => panel.replaceChildren(node);
  if (opts.dismissible !== false) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) sheet.close();
    });
  }
  stack.push(sheet);
  ensureSentinel();
  sheetRoot().append(overlay);
  setBehind();
  playOpen(sheet);
  return sheet;
}

export const sheetDepth = () => stack.length;

// Resolves when the history is quiet again after a sheet was closed. Going to Google (a page
// change) while the browser is still stepping back in the history would cancel that trip.
export function sheetsSettled() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (!backing || Date.now() - t0 > 900) resolve();
      else setTimeout(tick, 30);
    };
    tick();
  });
}

// ---------- confirm ----------
export function confirmDialog({ title, text, okText = 'אישור', cancelText = 'ביטול', danger = false, details = null }) {
  return new Promise((resolve) => {
    let answered = false;
    let sheet;
    const answer = (v) => {
      answered = true;
      resolve(v);
      sheet.close();
    };
    const body = h(
      'div',
      { class: 'confirm' },
      h('h2', null, title),
      text ? h('p', { class: 'muted' }, text) : null,
      details,
      h(
        'div',
        { class: 'btn-col' },
        h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), type: 'button', onclick: () => answer(true) }, okText),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(false) }, cancelText),
      ),
    );
    sheet = openSheet(body, {
      small: true,
      onClose: () => {
        if (!answered) resolve(false);
      },
    });
  });
}

// text prompt (one input)
export function promptDialog({ title, label, value = '', okText = 'שמירה', cancelText = 'ביטול', validate }) {
  return new Promise((resolve) => {
    let answered = false;
    let sheet;
    const input = h('input', { class: 'input', type: 'text', value, 'aria-label': label, maxlength: '40' });
    const err = h('div', { class: 'err-text' });
    const answer = (v) => {
      answered = true;
      resolve(v);
      sheet.close();
    };
    const ok = () => {
      const v = input.value.trim();
      const msg = validate ? validate(v) : '';
      if (msg) {
        err.textContent = msg;
        return;
      }
      answer(v);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') ok();
    });
    const body = h(
      'div',
      { class: 'confirm' },
      h('h2', null, title),
      h('label', { class: 'field-label' }, label),
      input,
      err,
      h(
        'div',
        { class: 'btn-col' },
        h('button', { class: 'btn primary', type: 'button', onclick: ok }, okText),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => answer(null) }, cancelText),
      ),
    );
    sheet = openSheet(body, {
      small: true,
      onClose: () => {
        if (!answered) resolve(null);
      },
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  });
}

// ---------- toast ----------
let toastEl = null;
let toastTimer = null;
export function toast(text, { kind = 'ok', ms = 3500, action = null } = {}) {
  if (!toastEl) toastEl = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
  if (!toastEl.isConnected) document.body.append(toastEl);
  clear(toastEl);
  toastEl.className = 'toast ' + kind + ' show';
  toastEl.append(h('span', { class: 'toast-text' }, text));
  if (action) {
    toastEl.append(
      h(
        'button',
        {
          class: 'toast-act',
          type: 'button',
          onclick: () => {
            toastEl.classList.remove('show');
            action.fn();
          },
        },
        action.label,
      ),
    );
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
