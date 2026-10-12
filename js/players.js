import { store, save, uid, steamLookup } from './store.js';
import { h, btn, icon, toast, menu, modal, confirmBox, promptBox, timeAgo, empty } from './ui.js';

// ---------- shared helpers ----------
export function catById(id) {
  return store.state.categories.find((c) => c.id === id) || { id: 'none', name: 'No category', color: '#5b6180' };
}

export function statusText(c) {
  if (!c) return 'Not loaded yet';
  if (c.onlineState === 'in-game') {
    const game = (c.stateMessage || '').replace(/^In-Game\s*·?\s*/i, '').trim();
    return game ? 'Playing ' + game : 'In game';
  }
  if (c.onlineState === 'online') return 'Online';
  if (c.privacy && c.privacy !== 'public') return 'Offline · private profile';
  return 'Offline';
}

const refresh = { running: false, at: null };

function applyResult(p, data) {
  const prev = p.cache?.name;
  if (prev && data.name && prev !== data.name) {
    p.names = [prev, ...(p.names || []).filter((n) => n !== prev && n !== data.name)].slice(0, 10);
  }
  p.steamid = data.steamid;
  p.cache = { ...(p.cache || {}), ...data };
  p.error = null;
}

async function refreshOne(p) {
  try {
    applyResult(p, await steamLookup(p.steamid || p.input));
  } catch (e) {
    p.error = e.message;
  }
  window.dispatchEvent(new CustomEvent('player-updated', { detail: p.id }));
}

// Called on start-up and from the Refresh button.
export async function refreshAll() {
  if (!store.liveSteam || refresh.running || !store.online || !store.state.players.length) return;
  refresh.running = true;
  window.dispatchEvent(new Event('players-refreshing'));
  const queue = store.state.players.slice();
  const worker = async () => {
    while (queue.length) {
      await refreshOne(queue.shift());
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await Promise.all([worker(), worker()]);
  refresh.running = false;
  refresh.at = new Date().toISOString();
  save();
  window.dispatchEvent(new Event('players-updated'));
}

// ---------- view ----------
const FILTER_KEY = 'gamehelper-player-filter';

export function mount(ctx) {
  ctx.setTitle('Players');
  const s = store.state;
  let filter = 'all';
  try { filter = localStorage.getItem(FILTER_KEY) || 'all'; } catch {}
  let query = '';

  const refreshBtn = h('span');
  ctx.setActions(btn('Categories', { icon: 'settings', onClick: () => editCategories(renderAll) }));

  // --- add form
  const input = h('input', { class: 'input', placeholder: 'SteamID64 or steamcommunity.com/profiles/… link', 'aria-label': 'Steam profile' });
  const nameIn = h('input', { class: 'input', placeholder: 'Name (optional)', 'aria-label': 'Player name', style: { flex: '0 1 220px', minWidth: '160px' } });
  const catSel = h('select', { class: 'select', 'aria-label': 'Category' });
  const addBtn = btn('Add player', { kind: 'primary', icon: 'plus' });
  const form = h('form', { class: 'p-add', onsubmit: async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return input.focus();
    addBtn.disabled = true; addBtn.querySelector('span').textContent = 'Looking up…';
    try {
      const data = await steamLookup(q);
      const exist = s.players.find((p) => p.steamid === data.steamid);
      if (exist) {
        toast(`${exist.cache?.name || exist.label || exist.steamid} is already saved as ${catById(exist.category).name}`);
      } else {
        const p = { id: uid(), input: q, steamid: data.steamid, label: nameIn.value.trim(), category: catSel.value, note: '', names: [], added: Date.now(), cache: null };
        applyResult(p, data);
        s.players.unshift(p);
        save();
        toast(`Added ${p.label || p.steamid}`, 'ok');
        input.value = ''; nameIn.value = '';
        if (filter !== 'all' && filter !== p.category) { filter = 'all'; }
        renderAll();
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      addBtn.disabled = false; addBtn.querySelector('span').textContent = 'Add player';
    }
  } }, input, nameIn, catSel, addBtn);
  addBtn.type = 'submit';

  const filterRow = h('div', { class: 'p-filter' });
  const search = h('input', { class: 'input search', placeholder: 'Search names and notes', 'aria-label': 'Search players', oninput: (e) => { query = e.target.value.toLowerCase(); renderGrid(); } });
  const status = h('p', { class: 'muted small', style: { margin: 0 } });
  const grid = h('div', { class: 'players' });
  const cards = new Map();

  ctx.view.append(h('div', { class: 'p-toolbar' }, form, filterRow, status), grid);

  function renderFilters() {
    catSel.replaceChildren(...s.categories.map((c) => h('option', { value: c.id }, c.name)));
    const mk = (id, name, color, n) => h('button', {
      type: 'button', class: 'chip' + (filter === id ? ' on' : ''), style: color ? { '--c': color } : null, 'aria-pressed': String(filter === id),
      onclick: () => { filter = id; try { localStorage.setItem(FILTER_KEY, id); } catch {} renderFilters(); renderGrid(); },
    }, color ? h('i', { class: 'dot' }) : null, `${name} ${n}`);
    filterRow.replaceChildren(
      mk('all', 'All', null, s.players.length),
      ...s.categories.map((c) => mk(c.id, c.name, c.color, s.players.filter((p) => p.category === c.id).length)),
      search,
    );
  }

  function renderStatus() {
    status.textContent = 'Keep Steam IDs, names, categories and notes here. Live names, avatars and online status can’t be loaded from Steam on this site.';
  }

  function visible() {
    return s.players.filter((p) => {
      if (filter !== 'all' && p.category !== filter) return false;
      if (!query) return true;
      return [p.cache?.name, p.label, ...(p.names || []), p.note, p.steamid, p.cache?.realname].some((v) => v && String(v).toLowerCase().includes(query));
    });
  }

  function renderGrid() {
    cards.clear();
    const list = visible();
    if (!s.players.length) {
      grid.replaceChildren(h('div', { style: { gridColumn: '1 / -1' } }, empty('No players saved', 'Paste a Steam profile link above. You can mark people as enemies, friends or teammates and keep notes on them.')));
      return;
    }
    if (!list.length) { grid.replaceChildren(h('p', { class: 'muted' }, 'No players match this filter.')); return; }
    grid.replaceChildren(...list.map((p) => { const c = card(p); cards.set(p.id, c); return c; }));
  }

  function renderAll() { renderFilters(); renderGrid(); renderStatus(); }

  function card(p) {
    const c = p.cache || {};
    const cat = catById(p.category);
    const st = c.onlineState || 'offline';
    const el = h('article', { class: 'pcard', style: { '--c': cat.color } });

    const noteEl = p.note
      ? h('div', { class: 'note', tabindex: 0, role: 'button', 'aria-label': 'Edit note', onclick: () => editNote() }, p.note)
      : h('div', { class: 'note emptynote', tabindex: 0, role: 'button', onclick: () => editNote() }, 'Add a note…');
    noteEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); editNote(); } });

    function editNote() {
      const ta = h('textarea', { class: 'input', placeholder: 'Where you met them, base location, what they play…' });
      ta.value = p.note || '';
      const done = () => { p.note = ta.value.trim(); save(); el.replaceWith(rebuild()); };
      ta.addEventListener('blur', done);
      ta.addEventListener('keydown', (e) => { if (e.key === 'Escape') { ta.value = p.note || ''; ta.blur(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ta.blur(); });
      noteEl.replaceWith(ta);
      ta.focus();
    }
    function rebuild() { const n = card(p); cards.set(p.id, n); return n; }

    const catBtn = h('button', { type: 'button', class: 'chip cat-chip', style: { '--c': cat.color }, title: 'Change category',
      onclick: (e) => menu(e.currentTarget, s.categories.map((k) => ({ label: k.name, icon: k.id === p.category ? 'check' : null, onClick: () => {
        p.category = k.id; save(); renderFilters();
        if (filter !== 'all' && filter !== k.id) renderGrid(); else el.replaceWith(rebuild());
      } }))) }, h('i', { class: 'dot' }), cat.name);

    const badges = [
      c.vacBanned ? h('span', { class: 'badge bad' }, icon('shield', 13), 'VAC ban') : null,
      c.tradeBan && c.tradeBan !== 'None' ? h('span', { class: 'badge warn' }, 'Trade ban') : null,
      c.privacy && c.privacy !== 'public' ? h('span', { class: 'badge' }, c.privacy === 'friendsonly' ? 'Friends-only' : 'Private') : null,
      c.limited ? h('span', { class: 'badge' }, 'Limited') : null,
    ].filter(Boolean);

    el.append(
      h('div', { class: 'av' },
        c.avatar ? h('img', { src: c.avatar, alt: '', loading: 'lazy', onerror: (e) => e.target.replaceWith(h('div', { class: 'ph' }, icon('users', 26))) }) : h('div', { class: 'ph' }, icon('users', 26)),
        h('i', { class: 'st ' + st, title: statusText(c) })),
      h('div', { class: 'pc-main' },
        h('div', { class: 'pname', title: c.name || p.label || '' }, c.name || p.label || p.steamid || p.input),
        h('div', { class: 'pstate ' + st }, c.onlineState ? statusText(c) + (c.fetchedAt ? ` · ${timeAgo(c.fetchedAt)}` : '') : p.steamid),
        p.names?.length ? h('div', { class: 'aka', title: p.names.join(', ') }, 'Was: ' + p.names.join(', ')) : null,
        badges.length ? h('div', { class: 'badges' }, badges) : null,
        p.error ? h('div', { class: 'err' }, p.error) : null),
      noteEl,
      h('div', { class: 'pc-foot' },
        catBtn,
        h('span', { class: 'grow' }),
        btn('', { icon: 'copy', small: true, kind: 'flat', aria: 'Copy SteamID64', onClick: async () => {
          try { await navigator.clipboard.writeText(p.steamid); toast('SteamID copied'); } catch { toast(p.steamid); }
        } }),
        h('a', { class: 'btn btn-flat btn-sm btn-icon', href: c.profileUrl || `https://steamcommunity.com/profiles/${p.steamid}`, target: '_blank', rel: 'noopener', 'aria-label': 'Open Steam profile', title: 'Open Steam profile' }, icon('external', 16)),
        btn('', { icon: 'dots', small: true, kind: 'flat', aria: 'More', onClick: (e) => menu(e.currentTarget, [
          { label: 'Set name', icon: 'edit', onClick: async () => {
            const v = await promptBox('Player name', { value: p.label || c.name || '' });
            if (v) { p.label = v; if (p.cache) p.cache.name = ''; save(); el.replaceWith(rebuild()); }
          } },
          { label: 'Edit note', icon: 'edit', onClick: editNote },
          '-',
          { label: 'Remove player', icon: 'trash', danger: true, onClick: async () => {
            if (!(await confirmBox('Remove player?', `${c.name || p.label || p.steamid} will be removed from your list along with your note.`, 'Remove'))) return;
            s.players = s.players.filter((x) => x !== p); save(); renderAll();
          } },
        ]) })),
    );
    return el;
  }

  const onOne = (e) => {
    const old = cards.get(e.detail);
    const p = s.players.find((x) => x.id === e.detail);
    if (old && p && !old.contains(document.activeElement)) { const n = card(p); old.replaceWith(n); cards.set(p.id, n); }
  };
  const onAll = () => renderStatus();
  window.addEventListener('player-updated', onOne);
  window.addEventListener('players-updated', onAll);
  window.addEventListener('players-refreshing', onAll);

  renderAll();
  return () => {
    window.removeEventListener('player-updated', onOne);
    window.removeEventListener('players-updated', onAll);
    window.removeEventListener('players-refreshing', onAll);
  };
}

// ---------- categories ----------
export function editCategories(after) {
  const s = store.state;
  const draft = s.categories.map((c) => ({ ...c }));
  const rows = h('div', { class: 'cat-editor' });
  const renderRows = () => rows.replaceChildren(...draft.map((c, i) => h('div', { class: 'cat-row' },
    h('input', { type: 'color', value: c.color, 'aria-label': 'Colour', oninput: (e) => (c.color = e.target.value) }),
    h('input', { class: 'input', value: c.name, 'aria-label': 'Category name', oninput: (e) => (c.name = e.target.value) }),
    btn('', { icon: 'trash', kind: 'flat', aria: 'Delete category', onClick: () => { if (draft.length > 1) { draft.splice(i, 1); renderRows(); } else toast('Keep at least one category'); } }),
  )));
  renderRows();
  modal({
    title: 'Player categories',
    body: h('div', { class: 'cat-editor' },
      h('p', { class: 'muted small' }, 'Players in a deleted category move to the first one in this list.'),
      rows,
      btn('Add category', { icon: 'plus', onClick: () => { draft.push({ id: uid(), name: 'New category', color: '#b388ff' }); renderRows(); } })),
    actions: [
      { label: 'Cancel', onClick: (c) => c() },
      { label: 'Save categories', kind: 'primary', onClick: (close) => {
        const clean = draft.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() }));
        if (!clean.length) return toast('Keep at least one category', 'error');
        const ids = new Set(clean.map((c) => c.id));
        for (const p of s.players) if (!ids.has(p.category)) p.category = clean[0].id;
        s.categories = clean; save(); close(); after?.();
        toast('Categories saved', 'ok');
      } },
    ],
  });
}
