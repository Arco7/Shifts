// drive.js: Google sign-in (token flow) and the few Drive calls the backup needs.
//
// Scope drive.file: the app sees ONLY files and folders that it created itself.
// Files you drop into the folder by hand are not visible to the app, but can always be
// restored with "restore from file".
//
// Without a server Google gives a token that lives about 1 hour. When it expires the user taps
// once and signs in again. Two ways to sign in (CONFIG.SIGNIN_MODE):
//   'redirect' (default): the whole page goes to Google and comes back with the token in the
//                         address (works in the installed app, no popup needed);
//   'popup': the Google Identity Services window (the browser allows it only right after a tap).

import { CONFIG } from './config.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`;
const LS_TOKEN = 'shiftlog.gtoken';
const LS_EMAIL = 'shiftlog.gemail';
const LS_STATE = 'shiftlog.oauthstate';
const LS_PENDING = 'shiftlog.pending';

// Every request to Google has a time limit: one stuck request must never freeze the backup.
export const LIMITS = { request: 30000, upload: 60000 };
// Answers of Google to a silent sign-in (prompt=none) that mean "I need to show something".
const SILENT_NEEDS_USER = ['interaction_required', 'login_required', 'consent_required', 'account_selection_required'];

export class DriveError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const g = () => globalThis;
const ls = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

// '' = fine, 'empty' = still the placeholder, 'bad' = pasted something that is not a Client ID
// (a real one looks like 1234567890-abcdef.apps.googleusercontent.com; Google answers
// "Client missing a project id" / invalid_client to anything else)
export function clientIdProblem() {
  const id = CONFIG.GOOGLE_CLIENT_ID || '';
  if (!id || id.startsWith('PASTE')) return 'empty';
  return /^\d{6,}-[a-z0-9_-]+\.apps\.googleusercontent\.com$/i.test(id) ? '' : 'bad';
}
export function isConfigured() {
  return clientIdProblem() === '';
}

let gisPromise = null;
export function loadGis() {
  if (g().google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new DriveError('offline', 'no connection to Google'));
      };
      document.head.append(s);
    });
  }
  return gisPromise;
}

export function cachedToken() {
  try {
    const o = JSON.parse(ls()?.getItem(LS_TOKEN) || 'null');
    if (o && o.token && o.exp > Date.now() + 60000) return o.token;
  } catch {
    /* ignore */
  }
  return null;
}
export function clearToken() {
  try {
    ls()?.removeItem(LS_TOKEN);
  } catch {
    /* ignore */
  }
}
export function accountEmail() {
  try {
    return ls()?.getItem(LS_EMAIL) || '';
  } catch {
    return '';
  }
}
export function signOutLocal() {
  clearToken();
  try {
    ls()?.removeItem(LS_EMAIL);
  } catch {
    /* ignore */
  }
}

export function signInMode() {
  return CONFIG.SIGNIN_MODE === 'popup' ? 'popup' : 'redirect';
}

// Exactly this address must be listed as "Authorized redirect URI" of the web client in Google Cloud.
export function redirectUri() {
  return new URL('./', import.meta.url).href;
}

// What to continue with after Google sends the user back: 'signin' | 'backup' | 'restore'.
let intent = 'signin';
export function expectIntent(name) {
  intent = name;
}

function randomState() {
  const a = new Uint8Array(16);
  g().crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Silent sign-in: the same trip to Google, but Google must not show anything (prompt=none).
// It works when the account is already signed in on the phone and has agreed before; otherwise
// Google sends the page back with an error and we repeat the trip the normal way (see below).
export function silentSignInWanted() {
  return CONFIG.SILENT_SIGNIN !== false && !!accountEmail();
}

function startRedirectSignIn({ silent = false, pendingName = null } = {}) {
  const state = randomState();
  const store = ls();
  if (!store) throw new DriveError('storage_blocked');
  store.setItem(LS_STATE, JSON.stringify({ state, at: Date.now(), silent }));
  store.setItem(LS_PENDING, pendingName || intent);
  intent = 'signin';
  const q = new URLSearchParams({
    client_id: CONFIG.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPES,
    state,
    include_granted_scopes: 'true',
  });
  const hint = accountEmail();
  if (hint) q.set('login_hint', hint);
  if (silent) q.set('prompt', 'none');
  g().location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q.toString());
}

// Called once at start-up: if the address carries a Google answer (#access_token=...), take it,
// remove it from the address bar and say what was pending. Returns null when there is none.
export async function consumeRedirectResult() {
  const loc = g().location;
  const hash = loc && loc.hash ? loc.hash : '';
  const search = loc && loc.search ? loc.search : '';
  let raw = '';
  if (hash.includes('access_token=') || hash.includes('error=')) raw = hash;
  else if (search.includes('error=') && search.includes('state=')) raw = search; // some errors come in the query
  if (!raw) return null;
  const params = new URLSearchParams(raw.replace(/^[#?]/, ''));
  try {
    g().history.replaceState(null, '', loc.pathname + (raw === hash ? loc.search : ''));
  } catch {
    /* ignore */
  }
  const store = ls();
  let saved = null;
  let pending = 'signin';
  try {
    saved = JSON.parse(store?.getItem(LS_STATE) || 'null');
    pending = store?.getItem(LS_PENDING) || 'signin';
    store?.removeItem(LS_STATE);
    store?.removeItem(LS_PENDING);
  } catch {
    /* ignore */
  }
  if (!saved || !saved.state || saved.state !== params.get('state') || Date.now() - saved.at > 30 * 60000) {
    return { ok: false, code: 'bad_state', pending };
  }
  const err = params.get('error');
  if (err) {
    if (saved.silent && SILENT_NEEDS_USER.includes(err)) {
      // the silent try did not work: now the normal sign-in (it is never silent, so no loop)
      try {
        startRedirectSignIn({ silent: false, pendingName: pending });
        return { ok: false, code: 'redirecting', pending };
      } catch (e) {
        return { ok: false, code: (e && e.code) || 'redirect_failed', pending };
      }
    }
    return { ok: false, code: err, pending };
  }
  const token = params.get('access_token');
  if (!token) return { ok: false, code: 'auth_error', pending };
  if (!(params.get('scope') || '').includes(DRIVE_SCOPE)) return { ok: false, code: 'scope_denied', pending };
  try {
    store?.setItem(LS_TOKEN, JSON.stringify({ token, exp: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000 }));
  } catch {
    return { ok: false, code: 'storage_blocked', pending };
  }
  await emailWithin(token);
  return { ok: true, pending };
}

let tokenInflight = null;

// IMPORTANT: when there is no valid token this must be called synchronously from a tap
// (no `await` before it), otherwise the browser blocks the Google window.
export function getToken({ interactive = false } = {}) {
  const c = cachedToken();
  if (c) return Promise.resolve(c);
  if (!isConfigured()) return Promise.reject(new DriveError('not_configured'));
  if (!interactive) return Promise.reject(new DriveError('need_login'));
  if (signInMode() === 'redirect') {
    try {
      startRedirectSignIn({ silent: silentSignInWanted() });
    } catch (e) {
      return Promise.reject(e instanceof DriveError ? e : new DriveError('redirect_failed', String(e)));
    }
    // the page is leaving for Google (or Google opens on top of the app): not an error
    return Promise.reject(new DriveError('redirecting'));
  }
  if (tokenInflight) return tokenInflight;
  const oauth = g().google?.accounts?.oauth2;
  if (!oauth) return Promise.reject(new DriveError('gis_not_loaded'));

  const p = new Promise((resolve, reject) => {
    try {
      const cfg = {
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: SCOPES,
        prompt: '',
        callback: (resp) => {
          if (!resp || resp.error) {
            reject(new DriveError(resp?.error || 'auth_error', resp?.error_description));
            return;
          }
          if (oauth.hasGrantedAllScopes && !oauth.hasGrantedAllScopes(resp, DRIVE_SCOPE)) {
            reject(new DriveError('scope_denied'));
            return;
          }
          try {
            ls()?.setItem(
              LS_TOKEN,
              JSON.stringify({ token: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 }),
            );
          } catch {
            /* ignore */
          }
          resolve(resp.access_token);
          fetchEmail(resp.access_token);
        },
        error_callback: (err) => reject(new DriveError(err?.type || 'popup_error', err?.message)),
      };
      const hint = accountEmail();
      if (hint) cfg.hint = hint;
      oauth.initTokenClient(cfg).requestAccessToken({});
    } catch (e) {
      reject(new DriveError('gis_error', String(e)));
    }
  });
  tokenInflight = p;
  const clear = () => {
    if (tokenInflight === p) tokenInflight = null;
  };
  p.then(clear, clear);
  return p;
}

// The user gave up (cancel / time limit) while the Google window was open: the next tap must open a
// new window instead of waiting for the old one. A late answer of the old window is still stored.
export function abandonSignIn() {
  tokenInflight = null;
}

// The address is only a convenience (shown on screen, used as the sign-in hint): it has its own time
// limit and nothing waits for it for long.
async function fetchEmail(token) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
    if (!r.ok) return;
    const j = await r.json();
    if (j.email) ls()?.setItem(LS_EMAIL, j.email);
  } catch {
    /* ignore */
  } finally {
    clearTimeout(timer);
  }
}
// wait for the address, but at most this long (the start of the app must not hang on it)
const EMAIL_WAIT_MS = 2500;
function emailWithin(token) {
  let t;
  const wait = new Promise((r) => {
    t = setTimeout(r, EMAIL_WAIT_MS);
  });
  return Promise.race([fetchEmail(token), wait]).finally(() => clearTimeout(t));
}

// While a backup runs the user can cancel it: every request of that run listens to this signal.
let runSignal = null;
export function setRunSignal(signal) {
  runSignal = signal || null;
}

// One request with a time limit. The whole answer (also the body) must arrive in time.
async function api(token, url, { method = 'GET', body, headers, timeoutMs = LIMITS.request } = {}) {
  const ctl = new AbortController();
  let why = '';
  const timer = setTimeout(() => {
    why = 'timeout';
    ctl.abort();
  }, timeoutMs);
  const sig = runSignal;
  const onCancel = () => {
    why = why || 'cancelled';
    ctl.abort();
  };
  if (sig) {
    if (sig.aborted) onCancel();
    else sig.addEventListener('abort', onCancel, { once: true });
  }
  try {
    let r;
    let text;
    try {
      r = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...(headers || {}) }, signal: ctl.signal });
      text = await r.text();
    } catch {
      if (why === 'timeout') throw new DriveError('timeout', 'no answer in time');
      if (why === 'cancelled') throw new DriveError('cancelled');
      throw new DriveError('offline', 'no connection');
    }
    if (r.status === 401) {
      clearToken();
      throw new DriveError('unauthorized');
    }
    if (!r.ok) throw new DriveError('http_' + r.status, text.slice(0, 300));
    return { ok: true, status: r.status, text: async () => text, json: async () => JSON.parse(text) };
  } finally {
    clearTimeout(timer);
    if (sig) sig.removeEventListener('abort', onCancel);
  }
}

const FILES = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function ensureFolder(token) {
  const q = `mimeType='${FOLDER_MIME}' and trashed=false and appProperties has { key='shiftlogKind' and value='backups' }`;
  const r = await api(token, `${FILES}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=10`);
  const j = await r.json();
  if (j.files && j.files.length) return j.files[0];
  const c = await api(token, `${FILES}?fields=id,name,createdTime`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: CONFIG.DRIVE_FOLDER, mimeType: FOLDER_MIME, appProperties: { shiftlogKind: 'backups' } }),
  });
  return c.json();
}

// kind: 'backup' | 'safety'
export async function listFiles(token, folderId, kind) {
  const q = `'${folderId}' in parents and trashed=false and appProperties has { key='shiftlogKind' and value='${kind}' }`;
  const out = [];
  let pageToken = '';
  do {
    const url = `${FILES}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,size,createdTime)&pageSize=100${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
    const j = await (await api(token, url)).json();
    out.push(...(j.files || []));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

export async function uploadFile(token, { name, parent, text, kind }) {
  const boundary = 'shiftlog' + Math.random().toString(36).slice(2);
  const meta = { name, parents: [parent], mimeType: 'application/json', appProperties: { shiftlogKind: kind } };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const r = await api(token, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    timeoutMs: LIMITS.upload,
  });
  return r.json();
}

export async function downloadText(token, id) {
  const r = await api(token, `${FILES}/${encodeURIComponent(id)}?alt=media`);
  return r.text();
}

// moved to the Drive trash (kept 30 days), not deleted for good
export async function trashFile(token, id) {
  await api(token, `${FILES}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}
