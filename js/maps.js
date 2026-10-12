import { store, save, uid, upload, deleteUpload, download, resolveUrl } from './store.js';
import { h, btn, icon, menu, toast, modal, confirmBox, promptBox, empty } from './ui.js';
import { mapById, pointsForMap, unplacedForMap, allGroups, findSub, newList, newItem, newSub, groupColor, nextPinColor, editGroupColor } from './model.js';
import { colorPicker, sortable, applyOrder } from './ui.js';
import { buildShareHtml, parseShareFile, importShared, mapGroups } from './share.js';

const COLORS = ['#00e5ff', '#ff3df2', '#ffe14d', '#3df5a3', '#ff4d6d', '#ffffff'];
const PREF_KEY = 'gamehelper-map-tool';

export function mount(ctx) {
  const map = mapById(ctx.params[0]);
  if (ctx.params[0] && ctx.params[0] !== 'new' && !map) { location.hash = '#/maps'; return; }
  return map ? editor(ctx, map) : library(ctx);
}

// ======================= adding maps =======================
function readImageSize(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { rej(new Error('That file isn’t an image GameHelper can open')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

// Big screenshots are re-encoded so they stay under the 20 MB image limit and load fast.
async function prepareImage(blob) {
  if (blob.size < 8e6) return blob;
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    const out = await new Promise((r) => c.toBlob(r, 'image/webp', 0.9));
    return out && out.size < blob.size ? out : blob;
  } catch { return blob; }
}

async function addMapFromBlob(blob, defaultName) {
  if (!store.canUpload) { toast('Only people who can edit this page can add maps', 'error'); return; }
  if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) { toast('Use a PNG, JPG, WEBP or GIF image', 'error'); return; }
  const name = await promptBox('Name this map', { value: defaultName, okLabel: 'Add map' });
  if (!name) return;
  try {
    const { w, h: hh } = await readImageSize(blob);
    toast('Uploading map…');
    const url = await upload(await prepareImage(blob));
    const m = { id: uid(), name, image: url, drawing: null, w, h: hh, hideDone: false, created: Date.now() };
    store.state.maps.push(m);
    save();
    location.hash = '#/maps/' + m.id;
  } catch (e) { toast(e.message, 'error'); }
}

function pickFile() {
  const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
  inp.onchange = () => { const f = inp.files[0]; if (f) addMapFromBlob(f, f.name.replace(/\.[^.]+$/, '')); };
  inp.click();
}

function pickShared() {
  const inp = h('input', { type: 'file', accept: '.html,.htm,.json,text/html,application/json' });
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const data = parseShareFile(await f.text());
      toast('Importing ' + data.name + '…');
      const m = await importShared(data);
      toast(`Imported ${data.name} with ${data.groups.reduce((n, g) => n + g.pins.length, 0)} pins`, 'ok');
      location.hash = '#/maps/' + m.id;
    } catch (e) { toast(e.message, 'error'); }
  };
  inp.click();
}

// ======================= library =======================
function library(ctx) {
  const s = store.state;
  ctx.setTitle('Maps');
  ctx.setActions(store.canUpload ? btn('Import shared map', { icon: 'download', onClick: pickShared }) : null, store.canUpload ? btn('Upload map', { kind: 'primary', icon: 'upload', onClick: pickFile }) : null);

  const drop = h('div', { class: 'dropzone', tabindex: 0, role: 'button', 'aria-label': 'Upload a map image', onclick: pickFile,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFile(); } } },
  icon('image', 30), h('b', {}, 'Drop a map here'), h('span', { class: 'small' }, 'or click to choose a PNG/JPG, or press Ctrl + V to paste a screenshot'));
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) addMapFromBlob(f, f.name.replace(/\.[^.]+$/, '')); });

  const cards = s.maps.slice().reverse().map((m) => {
    const n = pointsForMap(m.id).length;
    return h('a', { class: 'map-card', href: '#/maps/' + m.id },
      h('div', { class: 'thumb' }, h('img', { src: resolveUrl(m.image), alt: '', loading: 'lazy' })),
      h('div', { class: 'mc-meta' }, h('b', {}, m.name), h('span', {}, n === 1 ? '1 pin' : `${n} pins`)));
  });

  ctx.view.append(
    s.maps.length ? null : h('p', { class: 'muted', style: { marginTop: 0, maxWidth: '62ch' } }, 'Add a map, then draw routes on it and drop pins for places you need to visit. Pins tick off with your checklists.'),
    h('div', { class: 'map-grid' }, store.canUpload ? drop : null, cards));

  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    addMapFromBlob(item.getAsFile(), 'Screenshot ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));
  };
  document.addEventListener('paste', onPaste);
  return () => document.removeEventListener('paste', onPaste);
}

// ======================= editor =======================
function editor(ctx, map) {
  const s = store.state;
  ctx.setTitle(map.name);

  let prefs = { tool: 'pan', color: COLORS[0], size: 6 };
  try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch {}
  const storePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {} };

  let placing = ctx.params[1] === 'place' ? ctx.params[2] : null; // sub id waiting for a spot on the map
  const focusId = ctx.params[1] === 'focus' ? ctx.params[2] : null;
  const view = { x: 0, y: 0, s: 1, fit: 1 };
  let spaceDown = false;

  // ---------- DOM ----------
  const img = h('img', { src: resolveUrl(map.image), alt: map.name, draggable: false });
  const canvas = h('canvas');
  const g = canvas.getContext('2d');
  const markersEl = h('div', { class: 'markers' });
  const stage = h('div', { class: 'stage' }, img, canvas, markersEl);
  const zoomLbl = h('div', { class: 'zoom-lvl' });
  const viewport = h('div', { class: 'viewport' }, stage, zoomLbl,
    h('div', { class: 'zoom-ctl' },
      btn('', { icon: 'zoomOut', small: true, aria: 'Zoom out', onClick: () => zoomBy(1 / 1.3) }),
      btn('', { icon: 'fit', small: true, aria: 'Fit map to screen (0)', onClick: fit }),
      btn('', { icon: 'zoomIn', small: true, aria: 'Zoom in', onClick: () => zoomBy(1.3) })));

  const TOOLS = [
    { id: 'pan', label: 'Move', icon: 'hand', key: 'V' },
    { id: 'pen', label: 'Draw', icon: 'pen', key: 'B' },
    { id: 'eraser', label: 'Erase', icon: 'eraser', key: 'E' },
    { id: 'point', label: 'Add pin', icon: 'pin', key: 'P' },
  ];
  const toolSeg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tool' });
  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Pen colour' });
  const sizeIn = h('input', { type: 'range', class: 'size-range', min: 2, max: 40, value: prefs.size, 'aria-label': 'Brush size', oninput: (e) => { prefs.size = +e.target.value; storePrefs(); } });
  const undoBtn = btn('', { icon: 'undo', aria: 'Undo drawing (Ctrl+Z)', onClick: undo });
  const doneBtn = btn('', { icon: map.hideDone ? 'eyeOff' : 'eye', aria: 'Hide ticked pins' });
  doneBtn.onclick = () => { map.hideDone = !map.hideDone; save(); renderDoneBtn(); renderMarkers(); };
  function renderDoneBtn() {
    doneBtn.replaceChildren(icon(map.hideDone ? 'eyeOff' : 'eye'));
    doneBtn.title = map.hideDone ? 'Ticked pins are hidden — click to show them greyed out' : 'Ticked pins show greyed out — click to hide them';
    doneBtn.setAttribute('aria-pressed', String(!!map.hideDone));
    doneBtn.classList.toggle('on', !!map.hideDone);
  }

  const toolbar = h('div', { class: 'toolbar' }, toolSeg, h('i', { class: 'sep' }), swatches, sizeIn, undoBtn,
    btn('', { icon: 'trash', aria: 'Clear drawing', onClick: clearDrawing }),
    h('i', { class: 'sep' }), doneBtn);

  ctx.setActions(
    btn('Share map', { kind: 'primary', icon: 'external', onClick: shareDialog }),
    btn('Export PNG', { icon: 'download', onClick: exportPng }),
    btn('', { icon: 'dots', aria: 'Map options', onClick: (e) => menu(e.currentTarget, [
      { label: 'Rename map', icon: 'edit', onClick: async () => { const v = await promptBox('Rename map', { value: map.name }); if (v) { map.name = v; save(); ctx.setTitle(v); } } },
      store.canUpload ? { label: 'Replace image', icon: 'image', onClick: replaceImage } : null,
      { label: 'All maps', icon: 'map', onClick: () => (location.hash = '#/maps') },
      '-',
      { label: 'Delete map', icon: 'trash', danger: true, onClick: deleteMap },
    ]) }));

  const panel = h('aside', { class: 'panel pt-panel', 'aria-label': 'Pins on this map' });
  ctx.view.append(h('div', { class: 'editor' }, h('div', { class: 'editor-main' }, toolbar, viewport), panel));

  function renderTools() {
    toolSeg.replaceChildren(...TOOLS.map((t) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(prefs.tool === t.id), class: prefs.tool === t.id ? 'on' : '', title: `${t.label} (${t.key})`,
      onclick: () => setTool(t.id) }, icon(t.icon, 16), h('span', {}, t.label))));
    swatches.replaceChildren(...COLORS.map((c) => h('button', { type: 'button', class: 'swatch' + (prefs.color === c ? ' on' : ''), style: { '--c': c }, role: 'radio', 'aria-checked': String(prefs.color === c), 'aria-label': 'Colour ' + c,
      onclick: () => { prefs.color = c; if (prefs.tool !== 'pen') prefs.tool = 'pen'; storePrefs(); renderTools(); } })));
    viewport.className = 'viewport tool-' + (placing ? 'point' : prefs.tool);
  }
  function setTool(t) { prefs.tool = t; storePrefs(); renderTools(); }

  // ---------- view transform ----------
  function apply() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    stage.style.setProperty('--inv', String(1 / view.s));
    zoomLbl.textContent = Math.round((view.s / view.fit) * 100) + '%';
  }
  function fit() {
    const r = viewport.getBoundingClientRect();
    if (!r.width || !map.w) return;
    view.fit = Math.min(r.width / map.w, r.height / map.h) * 0.96;
    view.s = view.fit;
    view.x = (r.width - map.w * view.s) / 2;
    view.y = (r.height - map.h * view.s) / 2;
    apply();
  }
  function zoomAt(mx, my, factor) {
    const ns = Math.min(Math.max(view.s * factor, view.fit * 0.4), view.fit * 16);
    const k = ns / view.s;
    view.x = mx - (mx - view.x) * k;
    view.y = my - (my - view.y) * k;
    view.s = ns;
    apply();
  }
  function zoomBy(f) { const r = viewport.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
  function centerOn(fx, fy, scale) {
    const r = viewport.getBoundingClientRect();
    if (scale) view.s = scale;
    view.x = r.width / 2 - fx * map.w * view.s;
    view.y = r.height / 2 - fy * map.h * view.s;
    apply();
  }
  function toFrac(e) {
    const r = viewport.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / (map.w * view.s), y: (e.clientY - r.top - view.y) / (map.h * view.s) };
  }

  // ---------- drawing layer ----------
  const MAX_CANVAS = 4096;
  const k = Math.min(1, MAX_CANVAS / Math.max(map.w, map.h));
  canvas.width = Math.round(map.w * k);
  canvas.height = Math.round(map.h * k);
  stage.style.width = map.w + 'px';
  stage.style.height = map.h + 'px';

  if (map.drawing) {
    const d = new Image();
    d.onload = () => g.drawImage(d, 0, 0, canvas.width, canvas.height);
    d.src = resolveUrl(map.drawing);
  }

  const undoStack = [];
  const history = []; // 'draw' or { sub, from } for a pin move, newest last
  const UNDO_MAX = canvas.width * canvas.height > 6e6 ? 6 : 20;
  function snapshot() {
    undoStack.push(g.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    history.push('draw');
    if (history.length > 60) history.shift();
    undoBtn.disabled = false;
  }
  function undo() {
    const last = history.pop();
    if (last && last !== 'draw') {
      last.sub.point = { ...last.sub.point, ...last.from };
      save(); renderMarkers(last.sub.id);
      toast('Moved ' + last.sub.name + ' back');
    } else {
      const snap = undoStack.pop();
      if (snap) { g.putImageData(snap, 0, 0); queueDrawingSave(); }
    }
    undoBtn.disabled = !history.length;
  }
  undoBtn.disabled = true;

  let saveTimer = null;
  function queueDrawingSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDrawing, 900);
  }
  async function saveDrawing() {
    saveTimer = null;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    try {
      const url = await upload(blob, map.drawing);
      map.drawing = url; map.drawingV = Date.now(); save();
    } catch (e) { toast('Couldn’t save the drawing: ' + e.message, 'error'); }
  }
  async function clearDrawing() {
    if (!(await confirmBox('Clear drawing?', 'Everything drawn on this map is erased. Pins stay. You can undo this until you leave the map.', 'Clear'))) return;
    snapshot();
    g.clearRect(0, 0, canvas.width, canvas.height);
    queueDrawingSave();
  }

  // ---------- pointer input ----------
  let drag = null;
  viewport.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zoom-ctl') || e.target.closest('.marker')) return;
    const panning = e.button === 1 || spaceDown || (prefs.tool === 'pan' && !placing && e.button === 0);
    if (panning) {
      e.preventDefault();
      drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false };
      viewport.classList.add('dragging');
      viewport.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const f = toFrac(e);
    if (placing) { if (inside(f)) placeExisting(placing, f); return; }
    if (prefs.tool === 'point') { if (inside(f)) addPointDialog(f); return; }
    if (prefs.tool === 'pen' || prefs.tool === 'eraser') {
      snapshot();
      drag = { kind: 'draw', last: f };
      viewport.setPointerCapture(e.pointerId);
      stroke(f, f);
    }
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      view.x = drag.x + (e.clientX - drag.sx);
      view.y = drag.y + (e.clientY - drag.sy);
      apply();
    } else {
      const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of events.length ? events : [e]) { const f = toFrac(ev); stroke(drag.last, f); drag.last = f; }
    }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.kind === 'draw') queueDrawingSave();
    drag = null;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = viewport.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  viewport.addEventListener('auxclick', (e) => e.preventDefault());

  function inside(f) { return f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1; }

  function stroke(a, b) {
    const px = canvas.width / (map.w * view.s); // canvas px per screen px
    g.save();
    g.globalCompositeOperation = prefs.tool === 'eraser' ? 'destination-out' : 'source-over';
    g.strokeStyle = prefs.color;
    g.lineWidth = (prefs.tool === 'eraser' ? prefs.size * 2.5 : prefs.size) * px;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a.x * canvas.width, a.y * canvas.height);
    g.lineTo(b.x * canvas.width + 0.01, b.y * canvas.height);
    g.stroke();
    g.restore();
  }

  // ---------- pins ----------
  function visiblePoints() {
    const hidden = map.hiddenGroups || {};
    return pointsForMap(map.id).filter((p) => !hidden[p.item.id] && (!map.hideDone || !p.sub.done));
  }

  function renderMarkers(flashId) {
    markersEl.replaceChildren(...visiblePoints().map(({ list, item, sub }) => {
      const c = groupColor(item);
      const m = h('button', { type: 'button', class: 'marker' + (sub.done ? ' done' : '') + (sub.id === flashId ? ' flash' : ''),
        style: { left: sub.point.x * 100 + '%', top: sub.point.y * 100 + '%', '--c': c },
        title: `${sub.name} — ${item.name}. Click to ${sub.done ? 'untick' : 'tick off'}, drag to move, right-click for options`,
        'aria-label': `${sub.name}, ${sub.done ? 'done' : 'not done'}`,
        onclick: (e) => { e.stopPropagation(); if (m.dataset.dragged) { delete m.dataset.dragged; return; } toggle(sub); },
        oncontextmenu: (e) => { e.preventDefault(); pinMenu({ x: e.clientX, y: e.clientY }, list, item, sub); },
      },
      h('span', { class: 'lbl' }, sub.name),
      h('span', { class: 'pin' }, pinSvg(c, sub.done)));
      m.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (e.button !== 0) return;
        startPinDrag(e, m, sub);
      });
      return m;
    }));
  }

  // Press a pin and move it to put it somewhere else; a plain click still ticks it.
  function startPinDrag(e, el, sub) {
    const grab = toFrac(e);
    const from = { x: sub.point.x, y: sub.point.y };
    const sx = e.clientX, sy = e.clientY;
    let moving = false;
    el.setPointerCapture(e.pointerId);
    const onMove = (ev) => {
      if (!moving) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
        moving = true;
        el.classList.add('moving');
        viewport.classList.add('pin-moving');
      }
      const f = toFrac(ev);
      const x = Math.min(1, Math.max(0, from.x + f.x - grab.x));
      const y = Math.min(1, Math.max(0, from.y + f.y - grab.y));
      el.style.left = x * 100 + '%';
      el.style.top = y * 100 + '%';
      el._pos = { x, y };
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      viewport.classList.remove('pin-moving');
      el.classList.remove('moving');
      if (!moving || !el._pos) return;
      el.dataset.dragged = '1';
      setTimeout(() => { delete el.dataset.dragged; }, 50);
      sub.point = { ...sub.point, x: el._pos.x, y: el._pos.y };
      history.push({ sub, from });
      undoBtn.disabled = false;
      save();
      setTimeout(() => renderMarkers(), 0);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  }

  function pinSvg(c, done) {
    const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    sv.setAttribute('viewBox', '0 0 24 24');
    sv.innerHTML = `<path d="M12 22.5s-7.5-6.8-7.5-12.6a7.5 7.5 0 0 1 15 0c0 5.8-7.5 12.6-7.5 12.6z" fill="${c}" stroke="#05060b" stroke-width="1.4"/>` +
      (done ? '<path d="m8.6 10 2.4 2.4 4.4-4.6" fill="none" stroke="#05060b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="12" cy="9.9" r="2.6" fill="#05060b"/>');
    return sv;
  }

  function toggle(sub) {
    sub.done = !sub.done;
    save();
    renderMarkers();
    renderPanel();
    if (sub.done && map.hideDone) toast(`${sub.name} ticked off — pin hidden`, 'ok');
  }

  function pinMenu(anchor, list, item, sub) {
    menu(anchor, [
      { label: sub.done ? 'Mark as not done' : 'Tick off', icon: 'check', onClick: () => toggle(sub) },
      { label: 'Rename', icon: 'edit', onClick: async () => { const v = await promptBox('Rename pin', { value: sub.name }); if (v) { sub.name = v; save(); renderMarkers(); renderPanel(); } } },
      { label: 'Move pin', icon: 'target', onClick: () => startPlacing(sub.id) },
      { label: `Rename group “${item.name}”`, icon: 'edit', onClick: () => renameGroup(item) },
      { label: `Colour of ${item.name}`, icon: 'pin', onClick: () => editGroupColor(item, () => { renderMarkers(); renderPanel(); }) },
      { label: 'Open checklist', icon: 'list', onClick: () => (location.hash = '#/lists/' + list.id) },
      '-',
      { label: 'Remove from map', icon: 'x', onClick: () => { sub.point = null; save(); renderMarkers(); renderPanel(); } },
      { label: 'Delete entry', icon: 'trash', danger: true, onClick: async () => {
        if (!(await confirmBox('Delete entry?', `“${sub.name}” is removed from ${item.name} in ${list.name}.`))) return;
        item.subs = item.subs.filter((x) => x !== sub); save(); renderMarkers(); renderPanel();
      } },
    ]);
  }

  function startPlacing(subId) {
    placing = subId;
    renderTools();
    renderPanel();
  }

  function placeExisting(subId, f) {
    const found = findSub(subId);
    placing = null;
    if (history.replaceState) history.replaceState(null, '', '#/maps/' + map.id);
    if (found) {
      found.sub.point = { mapId: map.id, x: f.x, y: f.y };
      if (!found.list.mapId) found.list.mapId = map.id;
      save();
      toast(`Pinned ${found.sub.name}`, 'ok');
    }
    renderTools(); renderMarkers(); renderPanel();
  }

  function addPointDialog(f) {
    const groups = allGroups().sort((a, b) => (b.list.mapId === map.id) - (a.list.mapId === map.id));
    const nameIn = h('input', { class: 'input', placeholder: 'e.g. Bridge, Outpost, Loot room', autofocus: true });
    const groupSel = h('select', { class: 'select' },
      groups.map(({ list, item }) => h('option', { value: item.id, selected: item.id === map.lastGroup }, `${list.name} › ${item.name}`)),
      h('option', { value: '__new', selected: !groups.length || map.lastGroup === '__new' }, '+ New named list…'));
    const newName = h('input', { class: 'input', value: 'Locations' });
    const listSel = h('select', { class: 'select' },
      h('option', { value: '__new' }, `+ New checklist “${map.name}”`),
      s.lists.map((l) => h('option', { value: l.id, selected: l.mapId === map.id }, l.name)));
    const picker = colorPicker(nextPinColor());
    const newBox = h('div', { style: { display: 'grid', gap: '14px' } },
      h('label', { class: 'field' }, h('span', {}, 'Named list'), newName),
      h('div', { class: 'field' }, h('span', {}, 'Pin colour'), picker.el),
      h('label', { class: 'field' }, h('span', {}, 'In checklist'), listSel));
    const sync = () => { newBox.style.display = groupSel.value === '__new' ? '' : 'none'; };
    groupSel.onchange = sync; sync();

    let close;
    const submit = () => {
      const name = nameIn.value.trim();
      if (!name) return nameIn.focus();
      let item;
      if (groupSel.value === '__new') {
        const list = listSel.value === '__new' ? newList(map.name) : s.lists.find((l) => l.id === listSel.value);
        if (!list.mapId) list.mapId = map.id;
        item = newItem(list, { type: 'multi', name: newName.value.trim() || 'Locations', subs: [], color: picker.value });
      } else {
        const found = allGroups().find((x) => x.item.id === groupSel.value);
        item = found.item;
        if (!found.list.mapId) found.list.mapId = map.id;
      }
      map.lastGroup = item.id;
      if (map.hiddenGroups?.[item.id]) delete map.hiddenGroups[item.id];
      newSub(item, name, { mapId: map.id, x: f.x, y: f.y });
      close(true);
      renderMarkers(); renderPanel();
    };
    close = modal({
      title: 'Add pin',
      body: h('form', { style: { display: 'grid', gap: '14px' }, onsubmit: (e) => { e.preventDefault(); submit(); } },
        h('label', { class: 'field' }, h('span', {}, 'Name'), nameIn),
        h('label', { class: 'field' }, h('span', {}, 'Add to'), groupSel),
        newBox,
        h('button', { type: 'submit', hidden: true })),
      actions: [{ label: 'Cancel', onClick: (c) => c() }, { label: 'Add pin', kind: 'primary', icon: 'pin', onClick: submit }],
    });
  }

  // ---------- pin groups ----------
  let foldTimer = null;
  async function renameGroup(item) {
    const v = await promptBox('Rename group', { label: 'Group name', value: item.name, okLabel: 'Rename' });
    if (v && v !== item.name) { item.name = v; save(); renderMarkers(); renderPanel(); toast('Renamed to ' + v, 'ok'); }
  }
  function groupMenu(anchor, item, off) {
    const hidden = map.hiddenGroups || (map.hiddenGroups = {});
    menu(anchor, [
      { label: 'Rename group', icon: 'edit', onClick: () => renameGroup(item) },
      { label: 'Pin colour', icon: 'pin', onClick: () => editGroupColor(item, () => { renderMarkers(); renderPanel(); }) },
      { label: off ? 'Show on map' : 'Hide on map', icon: off ? 'eye' : 'eyeOff', onClick: () => { if (off) delete hidden[item.id]; else hidden[item.id] = true; save(); renderMarkers(); renderPanel(); } },
      { label: 'Show only this group', icon: 'target', onClick: () => {
        for (const g of pointsForMap(map.id)) if (g.item.id !== item.id) hidden[g.item.id] = true;
        delete hidden[item.id]; save(); renderMarkers(); renderPanel();
      } },
    ]);
  }

  // ---------- side panel ----------
  const COLLAPSE_KEY = 'gamehelper-collapsed-' + map.id;
  let collapsed = new Set();
  try { collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch {}
  const saveCollapsed = () => { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed])); } catch {} };
  function renderPanel() {
    const pts = pointsForMap(map.id);
    const unplaced = unplacedForMap(map.id);
    const done = pts.filter((p) => p.sub.done).length;

    const groups = new Map();
    for (const p of pts) { if (!groups.has(p.item)) groups.set(p.item, { list: p.list, subs: [] }); groups.get(p.item).subs.push(p.sub); }

    const order = map.groupOrder || [];
    const rank = (it) => { const i = order.indexOf(it.id); return i < 0 ? 1e9 : i; };
    const groupList = [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
    let scrollEl = null;
    const pinRows = (item, subs, row) => {
      const rows = h('div', { class: 'pt-rows' }, subs.map(row));
      sortable(rows, { items: '.pt-row', scroller: () => scrollEl, onEnd: (ids) => { item.subs = applyOrder(item.subs, ids); save(); } });
      return rows;
    };

    const placingSub = placing ? findSub(placing)?.sub : null;
    const hidden = map.hiddenGroups || (map.hiddenGroups = {});
    const anyHidden = [...groups.keys()].some((it) => hidden[it.id]);
    const setHidden = (ids, on) => { for (const id of ids) { if (on) hidden[id] = true; else delete hidden[id]; } save(); renderMarkers(); renderPanel(); };

    panel.replaceChildren(...[
      h('div', { class: 'panel-head' }, h('h3', {}, 'Pins'), h('span', { class: 'muted small num' }, `${done}/${pts.length} done`),
        groups.size ? btn(anyHidden ? 'Show all' : 'Hide all', { small: true, kind: 'flat', icon: anyHidden ? 'eye' : 'eyeOff',
          onClick: () => setHidden([...groups.keys()].map((it) => it.id), !anyHidden) }) : null),
      placingSub ? h('div', { class: 'place-hint' }, icon('pin', 16), h('span', { class: 'grow' }, `Click the map to place “${placingSub.name}”.`),
        btn('Cancel', { small: true, kind: 'flat', onClick: () => { placing = null; renderTools(); renderPanel(); } })) : null,
      h('div', { class: 'pt-scroll' },
        !pts.length && !unplaced.length ? h('p', { class: 'muted small', style: { margin: 0 } }, 'Pick “Add pin” and click the map to mark a place. Each pin is an entry in a checklist, so ticking it off in either place hides it here.') : null,
        groupList.map(([item, { list, subs }]) => {
          const c = groupColor(item);
          const off = !!hidden[item.id];
          const shut = collapsed.has(item.id);
          return h('div', { 'data-id': item.id, class: 'pt-group' + (off ? ' off' : '') + (shut ? ' closed' : '') },
            h('h4', {},
              h('button', { type: 'button', class: 'dot dot-btn', style: { '--c': c }, title: 'Change pin colour', 'aria-label': 'Change pin colour for ' + item.name,
                onclick: () => editGroupColor(item, () => { renderMarkers(); renderPanel(); }) }),
              h('button', { type: 'button', class: 'g-name', 'aria-expanded': String(!shut), title: (shut ? 'Show the list' : 'Fold the list') + ' · double-click to rename',
                onclick: (e) => {
                  if (e.detail > 1) return;
                  clearTimeout(foldTimer);
                  foldTimer = setTimeout(() => { shut ? collapsed.delete(item.id) : collapsed.add(item.id); saveCollapsed(); renderPanel(); }, 220);
                },
                ondblclick: () => { clearTimeout(foldTimer); renameGroup(item); },
                oncontextmenu: (e) => { e.preventDefault(); groupMenu({ x: e.clientX, y: e.clientY }, item, off); } }, item.name),
              h('span', {}, `${subs.filter((x) => x.done).length}/${subs.length}`),
              btn('', { icon: off ? 'eyeOff' : 'eye', small: true, kind: off ? 'ghost' : 'flat', aria: (off ? 'Show ' : 'Hide ') + item.name + ' on the map',
                attrs: { 'aria-pressed': String(!off), title: off ? 'Hidden on the map — click to show' : 'Hide this group on the map' },
                onClick: () => setHidden([item.id], !off) }),
              btn('', { icon: 'dots', small: true, kind: 'flat', aria: item.name + ' options', onClick: (e) => groupMenu(e.currentTarget, item, off) })),
            shut ? null : pinRows(item, subs, (sub) => h('div', { 'data-id': sub.id, class: 'pt-row' + (sub.done ? ' done' : '') },
              h('button', { type: 'button', class: 'tick' + (sub.done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(sub.done), 'aria-label': sub.name, onclick: () => toggle(sub) }, icon('check', 14)),
              h('button', { type: 'button', class: 'n', title: 'Show on map', onclick: () => {
                centerOn(sub.point.x, sub.point.y, Math.max(view.s, view.fit * 2));
                if (sub.done && map.hideDone) { map.hideDone = false; renderDoneBtn(); }
                renderMarkers(sub.id);
              } }, sub.name),
              btn('', { icon: 'dots', small: true, kind: 'flat', aria: 'Pin options', onClick: (e) => pinMenu(e.currentTarget, list, item, sub) }))));
        }),
        unplaced.length ? h('div', { class: 'pt-group' },
          h('h4', {}, h('span', {}, 'Not on the map yet'), h('span', {}, String(unplaced.length))),
          unplaced.map(({ item, sub }) => h('div', { class: 'pt-row' + (sub.done ? ' done' : '') },
            h('span', { class: 'n', title: item.name }, sub.name),
            btn('Place', { small: true, icon: 'pin', onClick: () => startPlacing(sub.id) })))) : null),
      h('p', { class: 'muted small', style: { margin: 0 } }, 'Click a pin to tick it off (it turns grey), drag it on the map to move it (Ctrl + Z undoes a move). Right-click a pin for more. Hold and drag a group or pin in this list to reorder.'),
    ].filter(Boolean));
    scrollEl = panel.querySelector('.pt-scroll');
    sortable(scrollEl, { items: '.pt-group[data-id]', scroller: scrollEl, onEnd: (ids) => { map.groupOrder = ids; save(); } });
  }

  // ---------- share ----------
  function shareDialog() {
    const groups = mapGroups(map);
    if (!groups.length) return toast('Add some pins first — the shared map is the picture plus its pins', 'error');
    const hidden = map.hiddenGroups || {};
    const boxes = groups.map((g) => {
      const cb = h('input', { type: 'checkbox', id: 'share-' + g.id, checked: !hidden[g.id] });
      return { g, cb, row: h('label', { class: 'share-row', for: 'share-' + g.id }, cb, h('i', { class: 'dot', style: { '--c': g.color } }), h('span', { class: 'grow' }, g.name), h('span', { class: 'muted small' }, `${g.pins.length} pins`)) };
    });
    const doneCb = h('input', { type: 'checkbox', id: 'share-done' });
    let busy = false;
    modal({
      title: 'Share ' + map.name,
      body: h('div', { class: 'share-body' },
        h('p', { class: 'muted' }, 'Makes one file with this map, your drawing and the pin groups you pick. Attach the file in a Claude chat and ask Claude to publish it. You get a link that works for anyone you share it with. Your checklists and players aren’t included.'),
        h('div', { class: 'share-list' }, boxes.map((b) => b.row)),
        h('label', { class: 'share-row', for: 'share-done' }, doneCb, h('span', { class: 'grow' }, 'Start with my ticked pins already ticked'))),
      actions: [
        { label: 'Cancel', onClick: (c) => c() },
        { label: 'Save share file', kind: 'primary', icon: 'download', onClick: async (close) => {
          if (busy) return;
          const groupIds = boxes.filter((b) => b.cb.checked).map((b) => b.g.id);
          if (!groupIds.length) return toast('Pick at least one pin group', 'error');
          busy = true;
          try {
            toast('Building the share file…');
            const html = await buildShareHtml(map, { img, drawCanvas: canvas, groupIds, includeDone: doneCb.checked });
            const file = map.name.replace(/[\\/:*?"<>|]+/g, '_') + ' - shared map.html';
            const ok = await download(file, html);
            close();
            if (ok) modal({
              title: 'Share file saved',
              body: h('div', { class: 'share-body' },
                h('p', {}, `“${file}” is in your downloads.`),
                h('p', { class: 'muted' }, 'Open a Claude chat, attach the file and send: “Publish this map as a link.” Claude gives you a link. Everyone who opens it can pan, zoom, hide groups and tick pins off for themselves.')),
              actions: [{ label: 'Got it', kind: 'primary', onClick: (c) => c() }],
            });
          } catch (e) { toast('Couldn’t build the share file: ' + e.message, 'error'); }
          busy = false;
        } },
      ],
    });
  }

  // ---------- export / delete ----------
  async function exportPng() {
    const out = document.createElement('canvas');
    const k2 = Math.min(1, 8192 / Math.max(map.w, map.h));
    out.width = Math.round(map.w * k2); out.height = Math.round(map.h * k2);
    const o = out.getContext('2d');
    o.drawImage(img, 0, 0, out.width, out.height);
    o.drawImage(canvas, 0, 0, out.width, out.height);
    const base = Math.max(out.width, out.height) / 90;
    o.font = `600 ${Math.round(base * 1.05)}px "Chakra Petch", sans-serif`;
    o.textBaseline = 'middle';
    for (const { item, sub } of visiblePoints()) {
      const x = sub.point.x * out.width, y = sub.point.y * out.height, c = groupColor(item);
      const pc = sub.done ? '#6b7089' : c;
      o.globalAlpha = sub.done ? 0.8 : 1;
      o.beginPath(); o.arc(x, y, base * 0.55, 0, Math.PI * 2);
      o.fillStyle = pc; o.fill(); o.lineWidth = base * 0.18; o.strokeStyle = '#05060b'; o.stroke();
      const tw = o.measureText(sub.name).width, pad = base * 0.4;
      const bx = x - tw / 2 - pad, by = y - base * 2.1, bh = base * 1.35;
      o.fillStyle = 'rgba(5,6,11,.85)'; o.fillRect(bx, by, tw + pad * 2, bh);
      o.strokeStyle = pc; o.lineWidth = Math.max(1, base * 0.08); o.strokeRect(bx, by, tw + pad * 2, bh);
      o.fillStyle = sub.done ? '#8c92ae' : '#e9ecf7'; o.fillText(sub.name, bx + pad, by + bh / 2);
      if (sub.done) { o.fillRect(bx + pad, by + bh / 2 - Math.max(1, base * 0.06), tw, Math.max(1.5, base * 0.12)); }
    }
    o.globalAlpha = 1;
    out.toBlob(async (b) => {
      if (!b) return toast('Couldn’t export this map', 'error');
      const ok = await download(map.name.replace(/[\\/:*?"<>|]+/g, '_') + '.png', b);
      if (ok) toast('Exported ' + map.name + '.png', 'ok');
    }, 'image/png');
  }

  function replaceImage() {
    const inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const { w, h: hh } = await readImageSize(f);
        toast('Uploading map…');
        const old = map.image;
        map.image = await upload(await prepareImage(f));
        map.w = w; map.h = hh; save();
        if (old && old !== map.image) deleteUpload(old);
        ctx.rerender();
      } catch (e) { toast(e.message, 'error'); }
    };
    inp.click();
  }

  async function deleteMap() {
    const n = pointsForMap(map.id).length;
    if (!(await confirmBox('Delete map?', `“${map.name}” and its drawing are deleted.${n ? ` Its ${n} pins stay in your checklists, just without a spot on a map.` : ''}`))) return;
    for (const p of pointsForMap(map.id)) p.sub.point = null;
    for (const l of s.lists) if (l.mapId === map.id) l.mapId = null;
    s.maps = s.maps.filter((m) => m !== map);
    save();
    deleteUpload(map.image); deleteUpload(map.drawing);
    location.hash = '#/maps';
  }

  // ---------- keyboard ----------
  const onKey = (e) => {
    if (e.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('.modal-back')) return;
    if (e.code === 'Space') { if (!spaceDown) { spaceDown = true; viewport.classList.add('tool-pan'); } e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = { v: 'pan', b: 'pen', e: 'eraser', p: 'point' }[e.key.toLowerCase()];
    if (t) return setTool(t);
    if (e.key === '+' || e.key === '=') zoomBy(1.3);
    else if (e.key === '-') zoomBy(1 / 1.3);
    else if (e.key === '0') fit();
    else if (e.key === 'Escape' && placing) { placing = null; renderTools(); renderPanel(); }
  };
  const onKeyUp = (e) => { if (e.code === 'Space') { spaceDown = false; renderTools(); } };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);

  const start = () => {
    if (!map.w) { map.w = img.naturalWidth; map.h = img.naturalHeight; save(); }
    fit();
    const target = focusId && findSub(focusId);
    if (target?.sub.point) {
      if (target.sub.done && map.hideDone) { map.hideDone = false; renderDoneBtn(); }
      centerOn(target.sub.point.x, target.sub.point.y, view.fit * 2.2);
      renderMarkers(target.sub.id);
    }
  };
  if (img.complete && img.naturalWidth) requestAnimationFrame(start); else img.onload = start;
  img.onerror = () => toast('This map’s image is missing in this browser — use Replace image in the map menu', 'error');

  renderTools();
  renderDoneBtn();
  renderMarkers();
  renderPanel();

  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKeyUp);
    if (saveTimer) { clearTimeout(saveTimer); saveDrawing(); }
  };
}
