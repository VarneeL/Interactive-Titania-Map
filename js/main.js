import { load, onStatus, store } from './store.js';
import { h, icon } from './ui.js';
import * as home from './home.js';
import * as maps from './maps.js';
import * as lists from './lists.js';
import * as players from './players.js';
import * as settings from './settings.js';

const views = { home, maps, lists, players, settings };
const viewEl = document.getElementById('view');
const titleEl = document.getElementById('pageTitle');
const actionsEl = document.getElementById('topActions');

document.querySelectorAll('[data-icon]').forEach((el) => el.append(icon(el.dataset.icon, 20)));

export function applySettings() {
  const s = store.state.settings;
  const root = document.documentElement;
  root.classList.toggle('rgb-on', !!s.rgb);
  root.style.setProperty('--rgb-dur', Math.max(2, 22 - s.rgbSpeed * 2) + 's');
  if (!s.rgb) root.style.setProperty('--h', s.hue);
  else root.style.removeProperty('--h');
}

let cleanup = null;
function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const name = views[parts[0]] ? parts[0] : 'home';
  document.querySelectorAll('.nav a').forEach((a) => {
    const on = a.dataset.route === name;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.querySelectorAll('.modal-back').forEach((m) => m.remove());
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  viewEl.replaceChildren();
  actionsEl.replaceChildren();
  const ctx = {
    view: viewEl,
    params: parts.slice(1),
    setTitle: (t) => { titleEl.textContent = t; document.title = t === 'Home' ? 'GameHelper' : `${t} · GameHelper`; },
    setActions: (...els) => actionsEl.replaceChildren(...els.flat().filter(Boolean)),
    rerender: () => route(),
  };
  cleanup = views[name].mount(ctx);
  window.scrollTo(0, 0);
}

function showStatus(s) {
  const el = document.getElementById('saveState');
  el.className = 'save-state ' + s;
  el.querySelector('span').textContent = {
    loading: 'Loading…',
    saved: 'Saved in this browser',
    readonly: 'View only — changes aren’t saved',
    saving: 'Saving…',
    error: 'Can’t reach GameHelper — retrying',
    offline: 'Saved in this browser only',
  }[s] || s;
}

(async function start() {
  onStatus(showStatus);
  await load();
  applySettings();
  if (!store.canUpload) {
    document.getElementById('banner').replaceChildren(h('div', { class: 'banner' },
      'This browser blocks saving images (private window or blocked site data), so maps can’t be added or kept. Checklists still work.'));
  }
  if (store.firstVisit && !location.hash && store.state.maps[0]) location.hash = '#/maps/' + store.state.maps[0].id;
  window.addEventListener('remote-change', () => {
    // Another tab or device saved — redraw, unless someone is mid-drawing on a map.
    if (!document.querySelector('.viewport.dragging, .modal-back')) { applySettings(); route(); }
  });
  window.addEventListener('hashchange', route);
  route();
})();
