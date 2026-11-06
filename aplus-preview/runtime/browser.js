'use strict';
// Browser glue for the A+ Hub experimental preview. Starts the original server code inside this tab, then shows the
// original page it serves (team sign-in or the academy app) exactly as the Node server would.
// Requests the page makes to /api/... (synchronous and asynchronous XMLHttpRequest, fetch, download links) are answered by
// the original request handler. Files (the SQLite database and backups) are kept in this browser's IndexedDB.
globalThis.Buffer = globalThis.Buffer || require('buffer').Buffer;
globalThis.process = globalThis.process || { env: {}, platform: 'browser', version: 'v22.0.0', versions: {}, nextTick: (f, ...a) => Promise.resolve().then(() => f(...a)), exit() {}, on() {}, cwd: () => '/app' };
const { createRuntime } = require('./core.js');

const IDB_NAME = 'aplus-hub-experimental-preview', STORE = 'files', KEY = 'snapshot-v1', COOKIE_KEY = 'aplus-preview-session';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(IDB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet() { const d = await idb(); return new Promise((res, rej) => { const q = d.transaction(STORE).objectStore(STORE).get(KEY); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); }
async function idbPut(v) { const d = await idb(); return new Promise((res, rej) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, KEY); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
async function idbClear() { const d = await idb(); return new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = () => res(); }); }

const isApi = (u) => { try { const x = new URL(u, location.href); return x.origin === location.origin && x.pathname.startsWith('/api/'); } catch (_) { return false; } };
const rel = (u) => { const x = new URL(u, location.href); return x.pathname + x.search; };

async function main() {
  const status = document.getElementById('aplus-boot');
  let snapshot = null;
  try { snapshot = await idbGet(); } catch (e) { console.warn('[A+ Hub preview] browser storage unavailable; data will not be kept', e); }
  const rt = await createRuntime({
    locateFile: (f) => '/aplus/' + f,
    snapshot,
    cookie: localStorage.getItem(COOKIE_KEY) || '',
    onCookie: (c) => { if (c) localStorage.setItem(COOKIE_KEY, c); else localStorage.removeItem(COOKIE_KEY); },
  });
  window.__APLUS_PREVIEW__ = rt;

  let saveTimer = null, saving = Promise.resolve();
  const save = () => { saving = saving.then(() => idbPut(rt.snapshot())).catch((e) => console.error('[A+ Hub preview] could not save', e)); return saving; };
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
  if (rt.created || !snapshot) await save();
  setInterval(save, 60000); // scheduled automatic backups run inside the original scheduler

  function call(method, url, headers, body) {
    const r = rt.dispatch(method, rel(url), headers, body);
    if (String(method).toUpperCase() !== 'GET') scheduleSave();
    return r;
  }

  // XMLHttpRequest: the original page uses synchronous requests (open(m, u, false)) as well as asynchronous ones.
  const RealXHR = window.XMLHttpRequest;
  class PreviewXHR {
    constructor() { this._real = null; this.readyState = 0; this.status = 0; this.statusText = ''; this.responseText = ''; this.response = ''; this.responseType = ''; this._h = {}; this._ls = {}; this.timeout = 0; this.withCredentials = false; this.upload = { addEventListener() {} }; }
    open(m, u, async = true) {
      if (!isApi(u)) { this._real = new RealXHR(); this._real.open(m, u, async); const self = this; ['onload', 'onerror', 'onreadystatechange', 'onloadend', 'ontimeout'].forEach((k) => { this._real[k] = (ev) => { ['readyState', 'status', 'statusText', 'responseText', 'response'].forEach((p) => { try { self[p] = self._real[p]; } catch (_) {} }); self[k] && self[k](ev); }; }); return; }
      this._m = m; this._u = u; this._async = async !== false; this.readyState = 1;
    }
    setRequestHeader(k, v) { if (this._real) return this._real.setRequestHeader(k, v); this._h[k] = v; }
    addEventListener(n, f) { if (this._real) return this._real.addEventListener(n, f); (this._ls[n] = this._ls[n] || []).push(f); }
    removeEventListener() {}
    getResponseHeader(n) { if (this._real) return this._real.getResponseHeader(n); return this._rh ? this._rh[String(n).toLowerCase()] ?? null : null; }
    getAllResponseHeaders() { if (this._real) return this._real.getAllResponseHeaders(); return Object.entries(this._rh || {}).map(([k, v]) => k + ': ' + v).join('\r\n'); }
    abort() { if (this._real) this._real.abort(); }
    overrideMimeType() {}
    _fire(n) { const ev = { type: n, target: this, currentTarget: this }; if (typeof this['on' + n] === 'function') this['on' + n](ev); (this._ls[n] || []).forEach((f) => f.call(this, ev)); }
    send(body) {
      if (this._real) return this._real.send(body);
      const run = () => {
        let r;
        try { r = call(this._m, this._u, this._h, body); } catch (e) { console.error('[A+ Hub preview]', e); this.readyState = 4; this.status = 0; this._fire('readystatechange'); this._fire('error'); this._fire('loadend'); return; }
        this.status = r.status; this.statusText = String(r.status); this._rh = r.headers; this.responseText = r.text(); this.responseURL = new URL(this._u, location.href).href;
        this.response = this.responseType === 'json' ? JSON.parse(this.responseText || 'null') : this.responseType === 'blob' ? new Blob([r.body], { type: r.headers['content-type'] }) : this.responseType === 'arraybuffer' ? r.body.buffer : this.responseText;
        this.readyState = 4; this._fire('readystatechange'); this._fire('load'); this._fire('loadend');
      };
      if (this._async) setTimeout(run, 0); else run();
    }
  }
  window.XMLHttpRequest = PreviewXHR;

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    if (!isApi(url)) return realFetch(input, init);
    const headers = {}; const src = init.headers || (input instanceof Request ? input.headers : {});
    if (src instanceof Headers) src.forEach((v, k) => { headers[k] = v; }); else Object.assign(headers, src);
    const body = init.body ?? (input instanceof Request && !['GET', 'HEAD'].includes(input.method) ? await input.text() : undefined);
    await new Promise((r) => setTimeout(r, 0));
    const r = call(init.method || (input instanceof Request ? input.method : 'GET'), url, headers, body);
    const h = new Headers(); for (const [k, v] of Object.entries(r.headers)) if (k !== 'set-cookie' && k !== 'content-length') h.set(k, v);
    return new Response([204, 304].includes(r.status) ? null : r.body, { status: r.status, headers: h });
  };

  // Links to /api/... (exports, calendar file) download what the original handler returns.
  function apiDownload(href) {
    const r = call('GET', href, {});
    if (r.status !== 200) { alert(r.text()); return; }
    const cd = r.headers['content-disposition'] || ''; const m = /filename="([^"]+)"/.exec(cd);
    const name = m ? m[1] : new URL(href, location.href).pathname.split('/').pop();
    const url = URL.createObjectURL(new Blob([r.body], { type: r.headers['content-type'] || 'application/octet-stream' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  const clickGuard = (ev) => { const a = ev.target && ev.target.closest && ev.target.closest('a[href]'); if (a && isApi(a.getAttribute('href'))) { ev.preventDefault(); ev.stopPropagation(); apiDownload(a.getAttribute('href')); } };

  function previewBadge() {
    if (document.getElementById('aplus-preview-badge')) return;
    const box = document.createElement('div'); box.id = 'aplus-preview-badge';
    box.setAttribute('style', 'position:fixed;z-index:2147483647;bottom:8px;left:8px;max-width:min(420px,92vw);font:12px/1.4 system-ui,sans-serif;background:#fff7d6;color:#3b2f00;border:1px solid #c9a227;border-radius:8px;padding:6px 10px;box-shadow:0 2px 8px rgba(0,0,0,.25);direction:ltr;text-align:left');
    const login = !!document.getElementById('login');
    box.innerHTML = '<b>EXPERIMENTAL PREVIEW · SYNTHETIC TEST DATA ONLY</b> · بيانات تجريبية وهمية' +
      ' <button type="button" id="aplus-preview-more" style="all:revert;font:inherit;cursor:pointer;margin-left:4px">' + (login ? 'hide' : 'details') + '</button>' +
      '<div id="aplus-preview-details" style="display:' + (login ? 'block' : 'none') + ';margin-top:4px">Runs entirely in this browser tab; not shared and not a deployment. Test accounts (password <code>' + rt.password + '</code>): ' +
      rt.accounts.map((a) => '<code>' + a.username + '</code> (' + a.role + ')').join(', ') +
      '. <button type="button" id="aplus-preview-reset" style="all:revert;font:inherit;cursor:pointer">Reset synthetic data</button></div>';
    document.body.appendChild(box);
    box.querySelector('#aplus-preview-more').onclick = () => { const d = box.querySelector('#aplus-preview-details'); const open = d.style.display !== 'none'; d.style.display = open ? 'none' : 'block'; box.querySelector('#aplus-preview-more').textContent = open ? 'details' : 'hide'; };
    box.querySelector('#aplus-preview-reset').onclick = async () => { if (!confirm('Delete all synthetic preview data in this browser and start again?')) return; clearInterval(); await idbClear(); localStorage.removeItem(COOKIE_KEY); location.reload(); };
  }

  // Serve "/" through the original handler: team sign-in when signed out, otherwise index.html with token + CURRENT_USER.
  const page = rt.dispatch('GET', '/', {});
  if (status) status.textContent = '';
  window.addEventListener('pagehide', () => { save(); });
  document.open(); document.write(page.text()); document.close();
  const after = () => { document.addEventListener('click', clickGuard, true); window.addEventListener('pagehide', () => { save(); }); previewBadge(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', after); else after();
}

main().catch((e) => {
  console.error('[A+ Hub preview] failed to start', e);
  const el = document.getElementById('aplus-boot');
  if (el) el.textContent = 'The A+ Hub preview could not start: ' + (e && e.message ? e.message : e);
});
