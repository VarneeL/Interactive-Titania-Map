// Small DOM helpers, icons, toasts and dialogs.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const P = {
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  map: '<path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.8 3 2.6 3.5 5.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M4.2 6.2l2.1 2.1M17.7 15.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 17.8l2.1-2.1M17.7 8.3l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  pen: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
  eraser: '<path d="M8.5 20H20"/><path d="M4.6 15.4 14 6l5 5-7.6 7.6a2 2 0 0 1-2.8 0l-4-4a1.6 1.6 0 0 1 0-2.2z"/><path d="m9 11 5 5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V4a1.5 1.5 0 0 1 3 0v7"/><path d="M14 11V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.6-2.8L3.6 15a1.6 1.6 0 0 1 2.5-2L8 15"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5"/><path d="M5 20h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.6 6.7C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 13a8 8 0 0 0 14.7 4.3L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/>',
  dots: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/>',
  bolt: '<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/>',
};

export function icon(name, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8');
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.classList.add('ico');
  s.innerHTML = P[name] || '';
  return s;
}

export function btn(label, opts = {}) {
  const { icon: ic, kind = 'ghost', onClick, title, small, attrs = {} } = opts;
  return h('button', {
    type: 'button',
    class: `btn btn-${kind}${small ? ' btn-sm' : ''}${label ? '' : ' btn-icon'}`,
    title: title || (label ? null : opts.aria),
    'aria-label': label ? null : (opts.aria || title),
    onclick: onClick,
    ...attrs,
  }, ic ? icon(ic, small ? 16 : 18) : null, label ? h('span', {}, label) : null);
}

// ---------- toast ----------
let toastWrap;
export function toast(msg, kind = 'info') {
  if (!toastWrap) { toastWrap = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastWrap); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  toastWrap.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5000 : 2600);
}

// ---------- modal ----------
export function modal({ title, body, actions = [], onClose, wide }) {
  const prevFocus = document.activeElement;
  const back = h('div', { class: 'modal-back' });
  const close = (val) => {
    back.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
    onClose?.(val);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  const box = h('div', { class: 'modal' + (wide ? ' modal-wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), btn('', { icon: 'x', aria: 'Close', onClick: () => close(null) })),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => btn(a.label, { kind: a.kind || 'ghost', icon: a.icon, onClick: () => a.onClick(close) }))) : null,
  );
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
  document.addEventListener('keydown', onKey);
  back.append(box);
  document.body.append(back);
  setTimeout(() => (box.querySelector('[autofocus], input, select, textarea, .btn-primary') || box).focus(), 20);
  return close;
}

export function confirmBox(title, text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', { class: 'muted' }, text),
      onClose: (v) => resolve(!!v),
      actions: [
        { label: 'Cancel', onClick: (c) => c(false) },
        { label: okLabel, kind: 'danger', onClick: (c) => c(true) },
      ],
    });
  });
}

export function promptBox(title, { label, value = '', placeholder = '', okLabel = 'Save' } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { class: 'input', value, placeholder, autofocus: true });
    const form = h('form', { onsubmit: (e) => { e.preventDefault(); done(); } }, h('label', { class: 'field' }, h('span', {}, label || 'Name'), input));
    let closeFn;
    const done = () => { const v = input.value.trim(); if (v) closeFn(v); else input.focus(); };
    closeFn = modal({
      title, body: form, onClose: (v) => resolve(v || null),
      actions: [{ label: 'Cancel', onClick: (c) => c(null) }, { label: okLabel, kind: 'primary', onClick: done }],
    });
    setTimeout(() => input.select(), 30);
  });
}

// ---------- popover menu ----------
let openMenu = null;
export function menu(anchor, items) {
  closeMenu();
  const m = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((it) => it === '-' ? h('div', { class: 'menu-sep' }) :
      h('button', { type: 'button', role: 'menuitem', class: 'menu-item' + (it.danger ? ' danger' : ''), onclick: () => { closeMenu(); it.onClick(); } },
        it.icon ? icon(it.icon, 16) : null, h('span', {}, it.label))));
  document.body.append(m);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = Math.min(r.right - mw, window.innerWidth - mw - 8); if (x < 8) x = Math.min(r.left, window.innerWidth - mw - 8);
  let y = r.bottom + 6; if (y + mh > window.innerHeight - 8) y = r.top - mh - 6;
  m.style.left = Math.max(8, x) + 'px'; m.style.top = Math.max(8, y) + 'px';
  openMenu = m;
  m.querySelector('button')?.focus();
  setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  document.addEventListener('keydown', escMenu);
}
function outside(e) { if (openMenu && !openMenu.contains(e.target)) closeMenu(); }
function escMenu(e) { if (e.key === 'Escape') closeMenu(); }
export function closeMenu() {
  openMenu?.remove(); openMenu = null;
  document.removeEventListener('pointerdown', outside);
  document.removeEventListener('keydown', escMenu);
}

export function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'bar' + (total && done >= total ? ' full' : ''), role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done },
    h('i', { style: { width: pct + '%' } }));
}

export function empty(title, text, action) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-mark' }, icon('target', 28)), h('h3', {}, title), h('p', { class: 'muted' }, text), action || null);
}

export function timeAgo(iso) {
  if (!iso) return 'never';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return m + ' min ago';
  const hr = Math.round(m / 60); if (hr < 24) return hr + ' h ago';
  const d = Math.round(hr / 24); return d + ' d ago';
}

// ---------- pin colours ----------
export const PIN_COLORS = ['#00e5ff', '#ff3df2', '#ffe14d', '#3df5a3', '#ff4d6d', '#b388ff', '#ff9f43', '#4d7cff', '#ffffff', '#9aa0bd'];

export function colorPicker(initial) {
  let value = /^#[0-9a-f]{6}$/i.test(initial || '') ? initial.toLowerCase() : PIN_COLORS[0];
  const custom = h('input', { type: 'color', class: 'cp-custom', value, title: 'Pick any colour', 'aria-label': 'Custom colour' });
  const swatches = PIN_COLORS.map((c) => h('button', { type: 'button', class: 'swatch', style: { '--c': c }, role: 'radio', 'aria-label': 'Colour ' + c,
    onclick: () => { value = c; custom.value = c; mark(); } }));
  const preview = h('span', { class: 'cp-preview' });
  const mark = () => {
    swatches.forEach((b, i) => { const on = PIN_COLORS[i] === value; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    custom.classList.toggle('on', !PIN_COLORS.includes(value));
    preview.style.setProperty('--c', value);
  };
  custom.addEventListener('input', (e) => { value = e.target.value.toLowerCase(); mark(); });
  const el = h('div', { class: 'cp', role: 'radiogroup', 'aria-label': 'Pin colour' }, swatches, custom);
  mark();
  return { el, get value() { return value; } };
}

// ---------- hold-and-drag reordering ----------
// Hold an item (about 0.2 s with a mouse, a bit longer on touch), then move it.
// Items are direct children of `container` matching `items` and carry data-id.
export function sortable(container, { items, axis = 'y', scroller = null, onEnd }) {
  let st = null;
  const children = () => [...container.children].filter((c) => c.matches(items));

  const cleanup = () => {
    clearTimeout(st?.timer);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('touchmove', blockScroll, { capture: true });
    document.removeEventListener('contextmenu', blockMenu, true);
    if (st?.el) st.el.classList.remove('sort-drag', 'sort-ready');
    container.classList.remove('sorting');
    st = null;
  };
  const blockScroll = (e) => { if (st?.active && e.cancelable) e.preventDefault(); };
  const blockMenu = (e) => { if (st) e.preventDefault(); };

  function begin() {
    if (!st) return;
    st.active = true;
    st.el.classList.add('sort-drag');
    container.classList.add('sorting');
    navigator.vibrate?.(8);
  }

  function flipMove(fn) {
    const els = children();
    const before = new Map(els.map((c) => [c, c.getBoundingClientRect()]));
    fn();
    for (const c of els) {
      if (c === st.el) continue;
      const a = before.get(c), b = c.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) continue;
      c.style.transition = 'none';
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => { c.style.transition = 'transform .16s ease'; c.style.transform = ''; });
    }
  }

  function autoScroll(y) {
    const edge = 48, speed = 14;
    const sc = typeof scroller === 'function' ? scroller() : scroller;
    if (sc) {
      const r = sc.getBoundingClientRect();
      if (y < r.top + edge) sc.scrollTop -= speed;
      else if (y > r.bottom - edge) sc.scrollTop += speed;
    } else if (y < edge) window.scrollBy(0, -speed);
    else if (y > window.innerHeight - edge) window.scrollBy(0, speed);
  }

  function move(e) {
    if (!st || e.pointerId !== st.id) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) cleanup();
      return;
    }
    e.preventDefault();
    autoScroll(e.clientY);
    for (const sib of children()) {
      if (sib === st.el) continue;
      const r = sib.getBoundingClientRect();
      const inY = e.clientY >= r.top && e.clientY <= r.bottom;
      const inX = e.clientX >= r.left && e.clientX <= r.right;
      if (!inY || (axis === 'xy' && !inX)) continue;
      const beforeSib = axis === 'xy' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
      const target = beforeSib ? sib : sib.nextSibling;
      if (target !== st.el && target !== st.el.nextSibling) flipMove(() => container.insertBefore(st.el, target));
      break;
    }
  }

  function up(e) {
    if (!st || e.pointerId !== st.id) return;
    const wasActive = st.active;
    const startIds = st.startIds;
    cleanup();
    if (!wasActive) return;
    // Swallow the click that follows the drop.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', swallow, true);
    setTimeout(() => document.removeEventListener('click', swallow, true), 0);
    const ids = children().map((c) => c.dataset.id);
    if (ids.join() !== startIds) onEnd(ids);
  }
  function cancel(e) { if (st && e.pointerId === st.id) cleanup(); }

  container.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.__sortClaimed || st) return;
    if (e.target.closest('input, textarea, select, [data-nodrag]')) return;
    const el = e.target.closest(items);
    if (!el || el.parentElement !== container) return;
    e.__sortClaimed = true;
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, active: false, startIds: children().map((c) => c.dataset.id).join() };
    el.classList.add('sort-ready');
    st.timer = setTimeout(begin, e.pointerType === 'mouse' ? 220 : 380);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    document.addEventListener('touchmove', blockScroll, { capture: true, passive: false });
    document.addEventListener('contextmenu', blockMenu, true);
  });
}

// Put the items named in `ids` into that order, keeping everything else where it was.
export function applyOrder(arr, ids) {
  const want = new Set(ids);
  const slots = [];
  arr.forEach((x, i) => { if (want.has(x.id)) slots.push(i); });
  const byId = new Map(arr.map((x) => [x.id, x]));
  const moved = ids.map((id) => byId.get(id)).filter(Boolean);
  const out = arr.slice();
  slots.forEach((slot, k) => { if (moved[k]) out[slot] = moved[k]; });
  return out;
}
