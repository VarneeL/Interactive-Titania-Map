// Checklist / map data helpers shared by every view.
import { store, uid, save } from './store.js';
import { h, modal, colorPicker, PIN_COLORS } from './ui.js';

export const S = () => store.state;

export function itemProgress(it) {
  if (it.type === 'count') return { done: Math.min(it.count || 0, it.target || 1), total: it.target || 1 };
  if (it.type === 'multi') return { done: it.subs.filter((s) => s.done).length, total: it.subs.length };
  return { done: it.done ? 1 : 0, total: 1 };
}
export function itemDone(it) { const p = itemProgress(it); return p.total > 0 && p.done >= p.total; }

// A list's progress counts each task once, so a 50-kill counter doesn't drown out the rest.
export function listProgress(list) {
  const total = list.items.length;
  const done = list.items.filter(itemDone).length;
  let frac = 0;
  for (const it of list.items) { const p = itemProgress(it); frac += p.total ? p.done / p.total : 0; }
  return { done, total, pct: total ? frac / total : 0 };
}

export function newList(name) {
  const l = { id: uid(), name, mapId: null, hideDone: false, items: [], created: Date.now() };
  S().lists.push(l); save(); return l;
}

export function newItem(list, { type, name, target, subs, color }) {
  const it = { id: uid(), type, name, done: false, count: 0, target: Math.max(1, Number(target) || 1), subs: [] };
  if (color) it.color = color;
  if (type === 'multi') it.subs = (subs || []).map((n) => ({ id: uid(), name: n, done: false, point: null }));
  list.items.push(it); save(); return it;
}

export function newSub(item, name, point = null) {
  const s = { id: uid(), name, done: false, point };
  item.subs.push(s); save(); return s;
}

export function findSub(subId) {
  for (const list of S().lists) for (const item of list.items) if (item.type === 'multi') {
    const sub = item.subs.find((s) => s.id === subId);
    if (sub) return { list, item, sub };
  }
  return null;
}

// Every "named list" task — these are the groups map points belong to.
export function allGroups() {
  const out = [];
  for (const list of S().lists) for (const item of list.items) if (item.type === 'multi') out.push({ list, item });
  return out;
}

export function pointsForMap(mapId) {
  const out = [];
  for (const { list, item } of allGroups()) for (const sub of item.subs) if (sub.point && sub.point.mapId === mapId) out.push({ list, item, sub });
  return out;
}

export function unplacedForMap(mapId) {
  const out = [];
  for (const { list, item } of allGroups()) if (list.mapId === mapId) for (const sub of item.subs) if (!sub.point) out.push({ list, item, sub });
  return out;
}

export function mapById(id) { return S().maps.find((m) => m.id === id); }
export function listById(id) { return S().lists.find((l) => l.id === id); }

// Stable colour per group so markers from different tasks are easy to tell apart.
const GROUP_HUES = [190, 320, 50, 140, 270, 15, 95, 230];
export function groupColor(item) {
  if (item.color) return item.color;
  let n = 0; for (const c of item.id) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${GROUP_HUES[n % GROUP_HUES.length]} 95% 62%)`;
}

// A colour no other pin group uses yet, so new groups stand apart.
export function nextPinColor() {
  const used = new Set(allGroups().map(({ item }) => item.color).filter(Boolean));
  return PIN_COLORS.find((c) => !used.has(c)) || PIN_COLORS[allGroups().length % PIN_COLORS.length];
}

export function editGroupColor(item, after) {
  const picker = colorPicker(item.color || '');
  modal({
    title: 'Pin colour',
    body: h('div', { style: { display: 'grid', gap: '12px' } }, h('p', { class: 'muted' }, `Colour for every “${item.name}” pin on the map.`), picker.el),
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: 'Save colour', kind: 'primary', onClick: (c) => { item.color = picker.value; save(); c(); after?.(); } },
    ],
  });
}
