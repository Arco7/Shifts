// drive.js: Google sign-in (token flow) and the few Drive calls the backup needs.
//
// Scope drive.file: the app sees ONLY files and folders that it created itself.
// Files you drop into the folder by hand are not visible to the app, but can always be
// restored with "restore from file".
//
// Without a server Google gives a token that lives about 1 hour. When it expires, the next
// upload opens the Google window (it normally closes by itself). The browser only allows that
// window right after a tap, so it is requested inside the tap handler.

import { CONFIG } from './config.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`;
const LS_TOKEN = 'shiftlog.gtoken';
const LS_EMAIL = 'shiftlog.gemail';

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

export function isConfigured() {
  const id = CONFIG.GOOGLE_CLIENT_ID || '';
  return id.length > 10 && !id.startsWith('PASTE');
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

let tokenInflight = null;

// IMPORTANT: when there is no valid token this must be called synchronously from a tap
// (no `await` before it), otherwise the browser blocks the Google window.
export function getToken({ interactive = false } = {}) {
  const c = cachedToken();
  if (c) return Promise.resolve(c);
  if (!isConfigured()) return Promise.reject(new DriveError('not_configured'));
  if (!interactive) return Promise.reject(new DriveError('need_login'));
  if (tokenInflight) return tokenInflight;
  const oauth = g().google?.accounts?.oauth2;
  if (!oauth) return Promise.reject(new DriveError('gis_not_loaded'));

  tokenInflight = new Promise((resolve, reject) => {
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
  }).finally(() => {
    tokenInflight = null;
  });
  return tokenInflight;
}

async function fetchEmail(token) {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return;
    const j = await r.json();
    if (j.email) ls()?.setItem(LS_EMAIL, j.email);
  } catch {
    /* ignore */
  }
}

async function api(token, url, { method = 'GET', body, headers } = {}) {
  let r;
  try {
    r = await fetch(url, { method, body, headers: { Authorization: `Bearer ${token}`, ...(headers || {}) } });
  } catch {
    throw new DriveError('offline', 'no connection');
  }
  if (r.status === 401) {
    clearToken();
    throw new DriveError('unauthorized');
  }
  if (!r.ok) {
    let t = '';
    try {
      t = (await r.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    throw new DriveError('http_' + r.status, t);
  }
  return r;
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
