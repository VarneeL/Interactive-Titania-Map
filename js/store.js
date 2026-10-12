// Web version (GitHub Pages): everything stays in this browser.
// Maps, checklists, players and settings go in localStorage; map images and
// drawings go in IndexedDB (they're too big for localStorage).

const LS_KEY = 'gamehelper-state';
const DB_NAME = 'gamehelper';
const STORE = 'images';

export const DEFAULT_CATEGORIES = [
  { id: 'enemy', name: 'Enemy', color: '#ff4d6d' },
  { id: 'friend', name: 'Friend', color: '#3df5a3' },
  { id: 'team', name: 'Teammate', color: '#4dc3ff' },
  { id: 'sus', name: 'Suspicious', color: '#ffb547' },
  { id: 'neutral', name: 'Neutral', color: '#9aa0bd' },
];

function defaults() {
  return {
    version: 1,
    settings: { rgb: true, rgbSpeed: 8, hue: 190 },
    maps: [],
    lists: [],
    players: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  };
}

export const store = {
  state: defaults(),
  status: 'loading', // loading | saved | saving | error
  online: true, // storage works
  canWrite: true,
  canUpload: true,
  liveSteam: false,
  web: true,
  firstVisit: false,
};

const listeners = new Set();
export function onStatus(fn) { listeners.add(fn); fn(store.status); return () => listeners.delete(fn); }
function setStatus(s) { store.status = s; listeners.forEach((fn) => fn(s)); }

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);

function normalize(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  return {
    ...d,
    ...s,
    settings: { ...d.settings, ...(s.settings || {}) },
    maps: Array.isArray(s.maps) ? s.maps : [],
    lists: Array.isArray(s.lists) ? s.lists : [],
    players: Array.isArray(s.players) ? s.players : [],
    categories: Array.isArray(s.categories) && s.categories.length ? s.categories : d.categories,
  };
}
export function replaceState(s) { store.state = normalize(s); }

// ---------- IndexedDB images ----------
let dbp = null;
function idb() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Storage is full'));
  });
}
const objectUrls = new Map(); // "idb:<id>" -> blob: URL

// Turns a stored image reference into something an <img> can show.
export function resolveUrl(ref) {
  if (!ref) return '';
  if (ref.startsWith('idb:')) return objectUrls.get(ref) || '';
  return ref;
}

async function loadImages() {
  const db = await idb();
  await new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly');
    const cur = t.objectStore(STORE).openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (!c) return;
      objectUrls.set('idb:' + c.key, URL.createObjectURL(c.value));
      c.continue();
    };
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}

export async function upload(blob, replaceRef) {
  const id = uid() + uid();
  await tx('readwrite', (s) => s.put(blob, id));
  const ref = 'idb:' + id;
  objectUrls.set(ref, URL.createObjectURL(blob));
  if (replaceRef && replaceRef !== ref) deleteUpload(replaceRef);
  return ref;
}

export async function deleteUpload(ref) {
  if (!ref || !ref.startsWith('idb:')) return;
  const id = ref.slice(4);
  try { await tx('readwrite', (s) => s.delete(id)); } catch {}
  const u = objectUrls.get(ref);
  if (u) { URL.revokeObjectURL(u); objectUrls.delete(ref); }
}

export async function imageBlob(ref) {
  if (!ref) return null;
  if (ref.startsWith('idb:')) return await tx('readonly', (s) => s.get(ref.slice(4)));
  try { const r = await fetch(ref); return r.ok ? await r.blob() : null; } catch { return null; }
}

// ---------- load / save ----------
export async function load() {
  try { await loadImages(); } catch { store.canUpload = false; }
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch {}
  if (saved) {
    store.state = normalize(saved);
  } else {
    store.firstVisit = true;
    store.state = defaults();
    try { await loadStarter(); } catch (e) { console.warn('Starter map not loaded', e); }
    save();
  }
  setStatus('saved');
  return store.state;
}

// First visit: copy the starter map (and its pins) into this browser.
// starter/starter.js defines window.GAMEHELPER_STARTER; its image stays a plain file next to the page.
async function loadStarter() {
  const starter = window.GAMEHELPER_STARTER;
  if (!starter) return;
  store.state = normalize({ ...defaults(), ...JSON.parse(JSON.stringify(starter)), settings: defaults().settings, players: [] });
}

let timer = null;
function flush() {
  timer = null;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store.state));
    setStatus('saved');
  } catch {
    setStatus('error');
  }
}
export function save() {
  setStatus('saving');
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
window.addEventListener('beforeunload', () => { if (timer) { clearTimeout(timer); flush(); } });
window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); flush(); } });

// ---------- downloads ----------
export async function download(filename, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.html') ? 'text/html' : filename.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

// Backups carry the images too, so they can be restored in another browser.
const blobToDataUrl = (b) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });

export async function exportBackup() {
  const copy = JSON.parse(JSON.stringify(store.state));
  for (const m of copy.maps) {
    for (const key of ['image', 'drawing']) {
      if (m[key] && !m[key].startsWith('data:')) { const b = await imageBlob(m[key]); if (b) m[key] = await blobToDataUrl(b); }
    }
  }
  return JSON.stringify(copy);
}

export async function importImages(data) {
  for (const m of data.maps || []) {
    for (const key of ['image', 'drawing']) {
      if (m[key]?.startsWith('data:')) m[key] = await upload(await (await fetch(m[key])).blob());
    }
  }
  return data;
}

// ---------- Steam IDs (no live lookup on this site) ----------
const STEAM64_BASE = 76561197960265728n;
export function parseSteamId(raw) {
  const s = String(raw || '').trim();
  let m;
  if ((m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i))) return m[1];
  if (/^\d{17}$/.test(s)) return s;
  if ((m = s.match(/^STEAM_[0-5]:([01]):(\d+)$/i))) return (STEAM64_BASE + BigInt(m[2]) * 2n + BigInt(m[1])).toString();
  if ((m = s.match(/^\[?U:1:(\d+)\]?$/i))) return (STEAM64_BASE + BigInt(m[1])).toString();
  return null;
}

export async function steamLookup(q) {
  const id = parseSteamId(q);
  if (!id) {
    if (/steamcommunity\.com\/id\//i.test(q) || /^[A-Za-z0-9_-]{2,64}$/.test(String(q).trim()))
      throw new Error('Custom URL names can’t be looked up here. Paste the SteamID64 or a /profiles/ link.');
    throw new Error('That doesn’t look like a SteamID or profile link');
  }
  return { steamid: id, profileUrl: `https://steamcommunity.com/profiles/${id}` };
}
