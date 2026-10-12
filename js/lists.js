import { store, save } from './store.js';
import { h, btn, icon, menu, toast, confirmBox, promptBox, progressBar, empty } from './ui.js';
import { listProgress, itemProgress, itemDone, newList, newItem, newSub, mapById, listById, groupColor, nextPinColor, editGroupColor } from './model.js';
import { colorPicker, sortable, applyOrder } from './ui.js';

const TYPE_KEY = 'gamehelper-new-type';

export function mount(ctx) {
  const s = store.state;
  ctx.setTitle('Checklists');
  ctx.setActions(btn('New checklist', { kind: 'primary', icon: 'plus', onClick: createList }));

  async function createList() {
    const name = await promptBox('New checklist', { label: 'Name', placeholder: 'e.g. Wipe day, Story act 2, Daily challenges', okLabel: 'Create' });
    if (!name) { if (ctx.params[0] === 'new') location.hash = '#/lists'; return; }
    const l = newList(name);
    location.hash = '#/lists/' + l.id;
  }

  if (ctx.params[0] === 'new') { setTimeout(createList, 0); }

  if (!s.lists.length) {
    ctx.view.append(empty('No checklists yet', 'Make one for each game or session. Add simple tasks, counters like “6 kills”, or named lists like locations to visit.',
      btn('New checklist', { kind: 'primary', icon: 'plus', onClick: createList })));
    return;
  }

  const list = listById(ctx.params[0]) || s.lists[0];
  ctx.setTitle(list.name);
  const nav = h('nav', { class: 'list-nav', 'aria-label': 'Checklists' });
  const main = h('section', { class: 'list-main' });
  ctx.view.append(h('div', { class: 'split' }, nav, main));

  function renderNav() {
    nav.replaceChildren(...s.lists.map((l) => {
      const p = listProgress(l);
      return h('a', { href: '#/lists/' + l.id, 'data-id': l.id, class: l === list ? 'active' : '', 'aria-current': l === list ? 'page' : null },
        h('div', { class: 'ln-top' }, h('b', {}, l.name), h('span', { class: 'num' }, `${p.done}/${p.total}`)),
        progressBar(Math.round(p.pct * 100), 100));
    }));
  }

  // ---------- adder ----------
  let type = 'check';
  try { type = localStorage.getItem(TYPE_KEY) || 'check'; } catch {}
  const TYPES = [
    { id: 'check', label: 'Checkbox', icon: 'check' },
    { id: 'count', label: 'Counter', icon: 'plus' },
    { id: 'multi', label: 'Named list', icon: 'list' },
  ];
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Task type' });
  const nameIn = h('input', { class: 'input grow', 'aria-label': 'Task name' });
  const targetIn = h('input', { class: 'input', type: 'number', min: 1, max: 100000, value: 6, style: { width: '110px' }, 'aria-label': 'Target' });
  const subsIn = h('textarea', { class: 'input', placeholder: 'Bridge, Ocean, Outpost — separate with commas or new lines', 'aria-label': 'Entries' });
  const hint = h('p', { class: 'hint' });
  const reorderHint = h('p', { class: 'muted small', style: { margin: '-8px 0 12px' } }, 'Hold and drag a task, an entry or a checklist on the left to change the order.');
  const extra = h('div', { class: 'adder-row' });
  let picker = null;

  function renderSeg() {
    seg.replaceChildren(...TYPES.map((t) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(type === t.id), class: type === t.id ? 'on' : '',
      onclick: () => { type = t.id; try { localStorage.setItem(TYPE_KEY, type); } catch {} renderSeg(); } }, icon(t.icon, 15), t.label)));
    nameIn.placeholder = { check: 'Task, e.g. Craft a workbench', count: 'What to count, e.g. Get kills', multi: 'List name, e.g. Visit locations' }[type];
    targetIn.style.display = type === 'count' ? '' : 'none';
    picker = colorPicker(nextPinColor());
    extra.replaceChildren(...(type === 'multi' ? [subsIn, h('div', { class: 'field', style: { width: '100%' } }, h('span', {}, 'Pin colour on the map'), picker.el)] : []));
    extra.style.display = type === 'multi' ? '' : 'none';
    hint.textContent = {
      check: 'One click marks it done.',
      count: 'Each click adds one until you reach the target.',
      multi: list.mapId ? `Tick entries off one by one. You can pin each entry on ${mapById(list.mapId)?.name || 'the linked map'} and it hides there once done.` : 'Tick entries off one by one. Link a map to this checklist to pin entries on it.',
    }[type];
  }

  const adder = h('form', { class: 'adder', onsubmit: (e) => {
    e.preventDefault();
    const name = nameIn.value.trim();
    if (!name) return nameIn.focus();
    const subs = subsIn.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    newItem(list, { type, name, target: targetIn.value, subs, color: type === 'multi' ? picker?.value : undefined });
    if (type === 'multi') renderSeg();
    nameIn.value = ''; subsIn.value = '';
    renderItems(); renderNav(); nameIn.focus();
  } },
  h('div', { class: 'adder-row' }, seg),
  h('div', { class: 'adder-row' }, nameIn, targetIn, h('button', { type: 'submit', class: 'btn btn-primary' }, icon('plus'), h('span', {}, 'Add task'))),
  extra, hint);

  // ---------- head ----------
  const title = h('input', { class: 'list-title', value: list.name, 'aria-label': 'Checklist name',
    onchange: (e) => { const v = e.target.value.trim(); if (v) { list.name = v; save(); ctx.setTitle(v); renderNav(); } else e.target.value = list.name; },
    onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); } });

  const mapSel = h('select', { class: 'select', style: { width: 'auto', minWidth: '180px', height: '38px' }, 'aria-label': 'Linked map',
    onchange: (e) => { list.mapId = e.target.value || null; save(); renderSeg(); renderItems(); } },
  h('option', { value: '' }, 'No linked map'),
  s.maps.map((m) => h('option', { value: m.id, selected: m.id === list.mapId }, 'Map: ' + m.name)));

  const hideBtn = btn('', { icon: list.hideDone ? 'eyeOff' : 'eye', kind: 'ghost', aria: 'Show or hide finished tasks' });
  hideBtn.title = list.hideDone ? 'Show finished tasks' : 'Hide finished tasks';
  hideBtn.onclick = () => { list.hideDone = !list.hideDone; save(); ctx.rerender(); };

  const moreBtn = btn('', { icon: 'dots', aria: 'Checklist options', onClick: (e) => menu(e.currentTarget, [
    list.mapId ? { label: 'Open linked map', icon: 'map', onClick: () => (location.hash = '#/maps/' + list.mapId) } : null,
    { label: 'Reset all progress', icon: 'reset', onClick: async () => {
      if (!(await confirmBox('Reset progress?', 'Every task in this checklist goes back to not done. Tasks and map pins stay.', 'Reset'))) return;
      for (const it of list.items) { it.done = false; it.count = 0; it.subs.forEach((x) => (x.done = false)); }
      save(); renderItems(); renderNav();
    } },
    { label: 'Duplicate checklist', icon: 'copy', onClick: () => {
      const copy = JSON.parse(JSON.stringify(list));
      const re = (o) => { o.id = Math.random().toString(36).slice(2, 12); return o; };
      re(copy); copy.name = list.name + ' (copy)'; copy.items.forEach((it) => { re(it); it.done = false; it.count = 0; it.subs.forEach((x) => { re(x); x.done = false; x.point = null; }); });
      s.lists.push(copy); save(); location.hash = '#/lists/' + copy.id;
    } },
    '-',
    { label: 'Delete checklist', icon: 'trash', danger: true, onClick: async () => {
      if (!(await confirmBox('Delete checklist?', `“${list.name}” and its ${list.items.length} tasks will be deleted, including any map pins they own.`))) return;
      s.lists = s.lists.filter((l) => l !== list); save(); location.hash = '#/lists';
    } },
  ]) });

  const meta = h('div', { class: 'list-meta' });
  const itemsEl = h('div', { class: 'items' });
  sortable(itemsEl, { items: '.item', onEnd: (ids) => { list.items = applyOrder(list.items, ids); save(); } });
  sortable(nav, { items: 'a', onEnd: (ids) => { s.lists = applyOrder(s.lists, ids); save(); } });
  main.append(h('div', { class: 'list-head' }, title, mapSel, hideBtn, moreBtn), meta, adder, reorderHint, itemsEl);

  function renderMeta() {
    const p = listProgress(list);
    meta.replaceChildren(progressBar(Math.round(p.pct * 100), 100), h('span', { class: 'num' }, `${p.done} of ${p.total} done`));
  }

  // ---------- items ----------
  function touched() { save(); renderMeta(); renderNav(); }

  function itemMenu(e, it) {
    menu(e.currentTarget, [
      { label: 'Rename', icon: 'edit', onClick: async () => { const v = await promptBox('Rename task', { value: it.name }); if (v) { it.name = v; save(); renderItems(); } } },
      it.type === 'count' ? { label: 'Change target', icon: 'target', onClick: async () => {
        const v = await promptBox('Change target', { label: 'Target', value: String(it.target) });
        const n = parseInt(v, 10); if (n > 0) { it.target = n; save(); renderItems(); renderNav(); }
      } } : null,
      it.type === 'multi' ? { label: 'Pin colour', icon: 'pin', onClick: () => editGroupColor(it, () => renderItems()) } : null,
      it.type === 'multi' ? { label: 'Untick all entries', icon: 'reset', onClick: () => { it.subs.forEach((x) => (x.done = false)); save(); renderItems(); renderNav(); } } : null,
      { label: 'Move up', icon: 'upload', onClick: () => move(it, -1) },
      { label: 'Move down', icon: 'download', onClick: () => move(it, 1) },
      '-',
      { label: 'Delete task', icon: 'trash', danger: true, onClick: async () => {
        if (it.type === 'multi' && it.subs.some((x) => x.point) && !(await confirmBox('Delete task?', 'Its pins will be removed from the map too.'))) return;
        list.items = list.items.filter((x) => x !== it); save(); renderItems(); renderNav();
      } },
    ]);
  }
  function move(it, d) {
    const i = list.items.indexOf(it), j = i + d;
    if (j < 0 || j >= list.items.length) return;
    [list.items[i], list.items[j]] = [list.items[j], list.items[i]]; save(); renderItems();
  }

  function renderCheck(it) {
    const el = h('div', { class: 'item' + (it.done ? ' done' : '') });
    const tick = h('button', { type: 'button', class: 'tick' + (it.done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(!!it.done), 'aria-label': it.name,
      onclick: () => { it.done = !it.done; touched(); swap(el, it); } }, icon('check', 18));
    el.append(tick, h('div', {}, h('div', { class: 'item-name' }, it.name)), btn('', { icon: 'dots', small: true, kind: 'flat', aria: 'Task options', onClick: (e) => itemMenu(e, it) }));
    return el;
  }

  function renderCount(it) {
    const done = itemDone(it);
    const el = h('div', { class: 'item' + (done ? ' done' : ''), style: { gridTemplateColumns: '1fr auto auto' } });
    const change = (d) => { it.count = Math.max(0, (it.count || 0) + d); touched(); swap(el, it); };
    el.append(
      h('div', { class: 'count-body', title: 'Click to add one', onclick: () => change(1) },
        h('div', { class: 'item-name' }, it.name),
        progressBar(Math.min(it.count, it.target), it.target)),
      h('div', { class: 'counter' },
        btn('', { icon: 'minus', small: true, aria: 'Remove one', onClick: () => change(-1) }),
        h('span', { class: 'num', 'aria-live': 'polite' }, String(it.count || 0), h('small', {}, '/' + it.target)),
        btn('', { icon: 'plus', small: true, aria: 'Add one', onClick: () => change(1) })),
      btn('', { icon: 'dots', small: true, kind: 'flat', aria: 'Task options', onClick: (e) => itemMenu(e, it) }));
    return el;
  }

  function renderMulti(it) {
    const p = itemProgress(it);
    const el = h('div', { class: 'item multi' + (itemDone(it) ? ' done' : '') });
    const color = groupColor(it);
    const subs = h('div', { class: 'subs' });
    sortable(subs, { items: '.sub', axis: 'xy', onEnd: (ids) => { it.subs = applyOrder(it.subs, ids); save(); } });
    const draw = () => {
      const shown = list.hideDone ? it.subs.filter((x) => !x.done) : it.subs;
      subs.replaceChildren(...shown.map((sub) => {
        const chip = h('button', { type: 'button', 'data-id': sub.id, class: 'sub' + (sub.done ? ' on' : ''), role: 'checkbox', 'aria-checked': String(sub.done),
          title: sub.point ? `Pinned on ${mapById(sub.point.mapId)?.name || 'a map'} · right-click for options` : 'Right-click for options',
          onclick: () => { sub.done = !sub.done; touched(); swap(el, it); },
          oncontextmenu: (e) => { e.preventDefault(); subMenu({ x: e.clientX, y: e.clientY }, sub); } },
        h('span', { class: 'box' }, icon('check', 13)),
        h('span', { class: 'lbl' }, sub.name),
        sub.point ? h('span', { class: 'pinmark', style: { '--c': color } }, icon('pin', 15)) : null);
        return chip;
      }));
    };
    const subMenu = (anchor, sub) => menu(anchor, [
      sub.point ? { label: 'Show on map', icon: 'map', onClick: () => (location.hash = `#/maps/${sub.point.mapId}/focus/${sub.id}`) } : null,
      list.mapId && !sub.point ? { label: 'Place on map', icon: 'pin', onClick: () => (location.hash = `#/maps/${list.mapId}/place/${sub.id}`) } : null,
      sub.point ? { label: 'Remove from map', icon: 'x', onClick: () => { sub.point = null; save(); swap(el, it); } } : null,
      { label: 'Rename', icon: 'edit', onClick: async () => { const v = await promptBox('Rename entry', { value: sub.name }); if (v) { sub.name = v; save(); swap(el, it); } } },
      { label: 'Delete entry', icon: 'trash', danger: true, onClick: () => { it.subs = it.subs.filter((x) => x !== sub); touched(); swap(el, it); } },
    ]);
    draw();
    const addIn = h('input', { class: 'input', placeholder: 'Add entry', 'aria-label': `Add entry to ${it.name}` });
    const addForm = h('form', { class: 'sub-add', onsubmit: (e) => {
      e.preventDefault();
      const names = addIn.value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!names.length) return;
      names.forEach((n) => newSub(it, n));
      touched();
      const n = renderItem(it); el.replaceWith(n); n.querySelector('.sub-add input')?.focus();
    } }, addIn, btn('', { icon: 'plus', small: true, aria: 'Add entry', attrs: { type: 'submit' } }));
    addForm.querySelector('button').type = 'submit';

    el.append(
      h('div', {}, h('div', { class: 'item-name', style: { display: 'flex', alignItems: 'center', gap: '9px' } }, h('i', { class: 'dot', style: { width: '9px', height: '9px', borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` } }), it.name),
        h('div', { class: 'item-sub num' }, `${p.done} of ${p.total}`)),
      btn('', { icon: 'dots', small: true, kind: 'flat', aria: 'Task options', onClick: (e) => itemMenu(e, it) }),
      h('div', { class: 'multi-body' }, progressBar(p.done, p.total), subs, addForm));
    return el;
  }

  function swap(el, it) {
    if (list.hideDone && itemDone(it)) renderItems();
    else el.replaceWith(renderItem(it));
  }

  function renderItem(it) {
    const el = it.type === 'count' ? renderCount(it) : it.type === 'multi' ? renderMulti(it) : renderCheck(it);
    el.dataset.id = it.id;
    return el;
  }

  function renderItems() {
    renderMeta();
    const shown = list.hideDone ? list.items.filter((it) => !itemDone(it)) : list.items;
    if (!list.items.length) {
      itemsEl.replaceChildren(h('p', { class: 'muted' }, 'Add your first task above.'));
    } else if (!shown.length) {
      itemsEl.replaceChildren(h('p', { class: 'muted' }, 'Everything here is done. Finished tasks are hidden.'));
    } else {
      itemsEl.replaceChildren(...shown.map(renderItem));
    }
  }

  renderSeg();
  renderNav();
  renderItems();
}
