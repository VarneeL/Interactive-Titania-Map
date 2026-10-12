import { store, resolveUrl } from './store.js';
import { h, btn, icon, progressBar } from './ui.js';
import { listProgress } from './model.js';
import { catById } from './players.js';

function greeting(d) {
  const hr = d.getHours();
  if (hr < 5) return 'Late-night session';
  if (hr < 12) return 'Good morning';
  if (hr < 18) return 'Good afternoon';
  return 'Good evening';
}

function plural(n, one, many) { return `${n} ${n === 1 ? one : many}`; }

export function mount(ctx) {
  ctx.setTitle('Home');
  ctx.setActions(btn('Add map', { icon: 'image', onClick: () => (location.hash = '#/maps/new') }));

  const wrap = h('div');
  ctx.view.append(wrap);

  const render = () => {
    const s = store.state;
    const now = new Date();
    const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
    const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

    const openTasks = s.lists.reduce((n, l) => n + l.items.length - l.items.filter((it) => listProgress({ items: [it] }).done).length, 0);
    const activeLists = s.lists.filter((l) => listProgress(l).done < l.items.length).length;
    const online = s.players.filter((p) => p.cache && p.cache.onlineState && p.cache.onlineState !== 'offline');
    const enemyOnline = online.filter((p) => p.category === 'enemy').length;

    const parts = [];
    if (s.lists.length) parts.push(openTasks ? `${plural(openTasks, 'task', 'tasks')} left across ${plural(activeLists, 'checklist', 'checklists')}.` : 'Every checklist is cleared.');
    else parts.push('Start with a checklist for your next session, or drop in a map to mark it up.');
    if (s.players.length && !store.liveSteam) parts.push(`${plural(s.players.length, 'player', 'players')} on your watch list.`);
    else if (s.players.length) parts.push(enemyOnline ? `${plural(enemyOnline, 'enemy is', 'enemies are')} online right now.` : online.length ? `${plural(online.length, 'saved player is', 'saved players are')} online.` : 'None of your saved players are online.');

    // --- checklists card
    const listsCard = h('section', { class: 'panel span-7' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Checklists'), h('a', { class: 'panel-link', href: '#/lists' }, 'Open all')),
      s.lists.length
        ? h('div', { class: 'mini-list' }, s.lists.slice().sort((a, b) => listProgress(a).pct - listProgress(b).pct).slice(0, 6).map((l) => {
          const p = listProgress(l);
          return h('a', { class: 'mini-row', href: '#/lists/' + l.id },
            h('span', { class: 't' }, l.name),
            h('span', { class: 'v num' }, `${p.done}/${p.total}`),
            progressBar(Math.round(p.pct * 100), 100));
        }))
        : h('p', { class: 'muted' }, 'No checklists yet. Track kills, locations to visit or anything else you need to get done.'));

    // --- players card
    const counts = s.categories.map((c) => ({ c, n: s.players.filter((p) => p.category === c.id).length })).filter((x) => x.n);
    const playersCard = h('section', { class: 'panel span-5' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Players'), h('a', { class: 'panel-link', href: '#/players' }, 'Open all')),
      s.players.length && !store.liveSteam
        ? h('div', {},
          h('div', { class: 'stat-big' }, h('span', { class: 'num' }, s.players.length), h('span', { class: 'muted' }, 'saved')),
          h('div', { class: 'cat-counts' }, counts.map(({ c, n }) => h('span', { class: 'chip', style: { '--c': c.color } }, h('i', { class: 'dot' }), `${c.name} ${n}`))))
        : s.players.length
        ? h('div', {},
          h('div', { class: 'stat-big' }, h('span', { class: 'num' }, online.length), h('span', { class: 'muted' }, `of ${s.players.length} online`)),
          online.length ? h('div', { class: 'online-list', style: { marginBottom: '16px' } }, online.slice(0, 5).map((p) => {
            const cat = catById(p.category);
            return h('div', { class: 'online-row' },
              p.cache.avatar ? h('img', { src: p.cache.avatar, alt: '' }) : null,
              h('span', { class: 'n' }, p.cache.name || p.steamid),
              h('span', { class: 'chip cat-chip', style: { '--c': cat.color } }, h('i', { class: 'dot' }), cat.name),
            );
          })) : h('p', { class: 'muted small', style: { margin: '0 0 14px' } }, 'Everyone you saved is offline.'),
          h('div', { class: 'cat-counts' }, counts.map(({ c, n }) => h('span', { class: 'chip', style: { '--c': c.color } }, h('i', { class: 'dot' }), `${c.name} ${n}`))))
        : h('p', { class: 'muted' }, 'Save Steam IDs as enemies, friends or teammates, with a note on each.'));

    // --- maps card
    const mapsCard = h('section', { class: 'panel span-12' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Maps'), h('a', { class: 'panel-link', href: '#/maps' }, 'Open all')),
      s.maps.length
        ? h('div', { class: 'thumbs' }, s.maps.slice(-8).reverse().map((m) => h('a', { class: 'thumb', href: '#/maps/' + m.id }, h('img', { src: resolveUrl(m.image), alt: '', loading: 'lazy' }), h('span', {}, m.name))))
        : h('p', { class: 'muted' }, 'Upload a PNG or paste a screenshot, then draw on it and pin locations from your checklists.'));

    wrap.replaceChildren(
      h('section', { class: 'hero' },
        h('div', { class: 'hero-greet' }, h('i'), greeting(now)),
        h('h2', { class: 'hero-date' }, h('span', {}, day), h('span', { class: 'd2' }, date)),
        h('p', { class: 'hero-sum' }, parts.join(' ')),
        h('div', { class: 'hero-actions' },
          btn('New checklist', { kind: 'primary', icon: 'plus', onClick: () => (location.hash = '#/lists/new') }),
          btn('Add player', { icon: 'users', onClick: () => (location.hash = '#/players') }),
        )),
      h('div', { class: 'home-grid' }, listsCard, playersCard, mapsCard),
    );
  };

  render();
  window.addEventListener('players-updated', render);
  return () => window.removeEventListener('players-updated', render);
}
