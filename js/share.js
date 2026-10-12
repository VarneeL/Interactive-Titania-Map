// Share one map as a single self-contained page, and import such a page back.
import { VIEWER } from './share-template.js';
import { store, save, uid, upload } from './store.js';
import { pointsForMap, groupColor, newList, newItem, newSub } from './model.js';

const MAX_SIDE = 4096;

// Map image with the drawing baked in, as a compact WEBP data URL.
async function composite(img, drawCanvas, w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, c.width, c.height);
  if (drawCanvas) g.drawImage(drawCanvas, 0, 0, c.width, c.height);
  let url = c.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.88);
  return url;
}

export function mapGroups(map) {
  const groups = new Map();
  for (const { item, sub } of pointsForMap(map.id)) {
    if (!groups.has(item.id)) groups.set(item.id, { id: item.id, name: item.name, color: groupColor(item), pins: [] });
    groups.get(item.id).pins.push(sub);
  }
  const order = map.groupOrder || [];
  const rank = (g) => { const i = order.indexOf(g.id); return i < 0 ? 1e9 : i; };
  return [...groups.values()].sort((a, b) => rank(a) - rank(b));
}

export async function buildShareHtml(map, { img, drawCanvas, groupIds, includeDone }) {
  const groups = mapGroups(map)
    .filter((g) => groupIds.includes(g.id))
    .map((g) => ({
      id: g.id, name: g.name, color: g.color,
      pins: g.pins.map((s) => ({ id: s.id, name: s.name, x: +s.point.x.toFixed(5), y: +s.point.y.toFixed(5), ...(includeDone && s.done ? { done: true } : {}) })),
    }));
  const data = {
    kind: 'gamehelper-map', v: 1,
    id: map.id + '-' + Date.now().toString(36),
    name: map.name, w: map.w, h: map.h,
    image: await composite(img, drawCanvas, map.w, map.h),
    groups,
    exportedAt: new Date().toISOString(),
  };
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return VIEWER.split('__TITLE__').join(esc(map.name)).split('__DATA__').join(json);
}

export function parseShareFile(text) {
  let raw = text.trim();
  const m = raw.match(/<script type="application\/json" id="gamehelper-map">([\s\S]*?)<\/script>/);
  if (m) raw = m[1];
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error('That file isn’t a shared GameHelper map'); }
  if (data?.kind !== 'gamehelper-map' || !data.image || !Array.isArray(data.groups)) throw new Error('That file isn’t a shared GameHelper map');
  return data;
}

// Adds the shared map as a new map with its own checklist, one named list per pin group.
export async function importShared(data) {
  const blob = await (await fetch(data.image)).blob();
  const url = await upload(blob);
  const map = { id: uid(), name: data.name, image: url, drawing: null, w: data.w, h: data.h, showDone: false, hiddenGroups: {}, created: Date.now() };
  store.state.maps.push(map);
  const list = newList(data.name);
  list.mapId = map.id;
  for (const g of data.groups) {
    const item = newItem(list, { type: 'multi', name: g.name, subs: [] });
    for (const p of g.pins) {
      const s = newSub(item, p.name, { mapId: map.id, x: p.x, y: p.y });
      if (p.done) s.done = true;
    }
  }
  save();
  return map;
}
