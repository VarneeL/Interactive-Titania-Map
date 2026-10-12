import { store, save, download, replaceState, exportBackup, importImages } from './store.js';
import { h, btn, toast, confirmBox } from './ui.js';
import { applySettings } from './main.js';
import { editCategories } from './players.js';

export function mount(ctx) {
  ctx.setTitle('Settings');
  const st = store.state.settings;

  const sw = (on, onToggle, label) => {
    const b = h('button', { type: 'button', class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), 'aria-label': label });
    b.onclick = () => { const v = !b.classList.contains('on'); b.classList.toggle('on', v); b.setAttribute('aria-checked', String(v)); onToggle(v); };
    return b;
  };

  const speed = h('input', { type: 'range', min: 1, max: 10, value: st.rgbSpeed, style: { width: '220px' }, 'aria-label': 'RGB speed',
    oninput: (e) => { st.rgbSpeed = +e.target.value; applySettings(); save(); } });
  const hue = h('input', { type: 'range', class: 'hue-range', min: 0, max: 359, value: st.hue, 'aria-label': 'Accent colour',
    oninput: (e) => { st.hue = +e.target.value; applySettings(); save(); } });
  const speedRow = h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, h('b', {}, 'RGB speed'), h('span', {}, 'How fast the colours cycle.')), speed);
  const hueRow = h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, h('b', {}, 'Accent colour'), h('span', {}, 'Used when RGB cycling is off.')), hue);
  const sync = () => { speedRow.style.display = st.rgb ? '' : 'none'; hueRow.style.display = st.rgb ? 'none' : ''; };

  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: async () => {
    const f = fileIn.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.lists) || !Array.isArray(data.maps)) throw new Error('That file isn’t a GameHelper backup');
      if (!(await confirmBox('Restore backup?', 'Your current maps, checklists and players are replaced by the backup. Map images already on this page are kept for maps with the same name in the backup.', 'Restore'))) return;
      const cur = new Map(store.state.maps.map((m) => [m.id, m]));
      data.maps = data.maps.map((m) => {
        const c = cur.get(m.id);
        return c && !/^(idb:|data:)/.test(m.image || '') ? { ...m, image: c.image, drawing: c.drawing, drawingV: c.drawingV, w: c.w, h: c.h } : m;
      });
      await importImages(data);
      replaceState({ ...store.state, ...data });
      save(); applySettings(); toast('Backup restored', 'ok'); ctx.rerender();
    } catch (e) { toast(e.message, 'error'); }
    fileIn.value = '';
  } });

  ctx.view.append(h('div', { class: 'settings' },
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Look')),
      h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, h('b', {}, 'RGB cycling'), h('span', {}, 'Accents, buttons and the date sweep through the colour wheel.')),
        sw(st.rgb, (v) => { st.rgb = v; applySettings(); save(); sync(); }, 'RGB cycling')),
      speedRow, hueRow),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Players')),
      h('div', { class: 'set-row' }, h('div', { class: 'lbl' }, h('b', {}, 'Categories'), h('span', {}, store.state.categories.map((c) => c.name).join(', '))),
        btn('Edit categories', { onClick: () => editCategories(() => ctx.rerender()) }))),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', {}, 'Your data')),
      h('p', { class: 'muted', style: { marginTop: 0 } }, store.online
        ? 'Everything you do here is saved in this browser only. Nobody else sees it, and it doesn’t follow you to other devices. To move it, download a backup (it includes your map images) and restore it in the other browser. Restore also accepts the state.json file from the GameHelper PC app; maps from there need Replace image afterwards.'
        : 'Claude account storage isn’t available in this view, so data is only kept in this browser.'),
      h('div', { class: 'row' },
        btn('Download backup', { icon: 'download', onClick: async () => download(`gamehelper-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup()) }),
        btn('Restore backup', { icon: 'upload', onClick: () => fileIn.click() }), fileIn)),
  ));
  sync();
}
