(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // js/store.js
  var LS_KEY = "gamehelper-state";
  var DB_NAME = "gamehelper";
  var STORE = "images";
  var DEFAULT_CATEGORIES = [
    { id: "enemy", name: "Enemy", color: "#ff4d6d" },
    { id: "friend", name: "Friend", color: "#3df5a3" },
    { id: "team", name: "Teammate", color: "#4dc3ff" },
    { id: "sus", name: "Suspicious", color: "#ffb547" },
    { id: "neutral", name: "Neutral", color: "#9aa0bd" }
  ];
  function defaults() {
    return {
      version: 1,
      settings: { rgb: true, rgbSpeed: 8, hue: 190 },
      maps: [],
      lists: [],
      players: [],
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c }))
    };
  }
  var store = {
    state: defaults(),
    status: "loading",
    // loading | saved | saving | error
    online: true,
    // storage works
    canWrite: true,
    canUpload: true,
    liveSteam: false,
    web: true,
    firstVisit: false
  };
  var listeners = /* @__PURE__ */ new Set();
  function onStatus(fn) {
    listeners.add(fn);
    fn(store.status);
    return () => listeners.delete(fn);
  }
  function setStatus(s) {
    store.status = s;
    listeners.forEach((fn) => fn(s));
  }
  var uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-3);
  function normalize(s) {
    const d = defaults();
    if (!s || typeof s !== "object") return d;
    return {
      ...d,
      ...s,
      settings: { ...d.settings, ...s.settings || {} },
      maps: Array.isArray(s.maps) ? s.maps : [],
      lists: Array.isArray(s.lists) ? s.lists : [],
      players: Array.isArray(s.players) ? s.players : [],
      categories: Array.isArray(s.categories) && s.categories.length ? s.categories : d.categories
    };
  }
  function replaceState(s) {
    store.state = normalize(s);
  }
  var dbp = null;
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
      t.onabort = () => rej(t.error || new Error("Storage is full"));
    });
  }
  var objectUrls = /* @__PURE__ */ new Map();
  function resolveUrl(ref) {
    if (!ref) return "";
    if (ref.startsWith("idb:")) return objectUrls.get(ref) || "";
    return ref;
  }
  async function loadImages() {
    const db = await idb();
    await new Promise((res, rej) => {
      const t = db.transaction(STORE, "readonly");
      const cur = t.objectStore(STORE).openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        objectUrls.set("idb:" + c.key, URL.createObjectURL(c.value));
        c.continue();
      };
      t.oncomplete = res;
      t.onerror = () => rej(t.error);
    });
  }
  async function upload(blob, replaceRef) {
    const id = uid() + uid();
    await tx("readwrite", (s) => s.put(blob, id));
    const ref = "idb:" + id;
    objectUrls.set(ref, URL.createObjectURL(blob));
    if (replaceRef && replaceRef !== ref) deleteUpload(replaceRef);
    return ref;
  }
  async function deleteUpload(ref) {
    if (!ref || !ref.startsWith("idb:")) return;
    const id = ref.slice(4);
    try {
      await tx("readwrite", (s) => s.delete(id));
    } catch {
    }
    const u = objectUrls.get(ref);
    if (u) {
      URL.revokeObjectURL(u);
      objectUrls.delete(ref);
    }
  }
  async function imageBlob(ref) {
    if (!ref) return null;
    if (ref.startsWith("idb:")) return await tx("readonly", (s) => s.get(ref.slice(4)));
    try {
      const r = await fetch(ref);
      return r.ok ? await r.blob() : null;
    } catch {
      return null;
    }
  }
  async function load() {
    try {
      await loadImages();
    } catch {
      store.canUpload = false;
    }
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    } catch {
    }
    if (saved) {
      store.state = normalize(saved);
    } else {
      store.firstVisit = true;
      store.state = defaults();
      try {
        await loadStarter();
      } catch (e) {
        console.warn("Starter map not loaded", e);
      }
      save();
    }
    setStatus("saved");
    return store.state;
  }
  async function loadStarter() {
    const starter = window.GAMEHELPER_STARTER;
    if (!starter) return;
    store.state = normalize({ ...defaults(), ...JSON.parse(JSON.stringify(starter)), settings: defaults().settings, players: [] });
  }
  var timer = null;
  function flush() {
    timer = null;
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store.state));
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  }
  function save() {
    setStatus("saving");
    clearTimeout(timer);
    timer = setTimeout(flush, 300);
  }
  window.addEventListener("beforeunload", () => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  });
  window.addEventListener("pagehide", () => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  });
  async function download(filename, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith(".html") ? "text/html" : filename.endsWith(".json") ? "application/json" : "application/octet-stream" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4e3);
    return true;
  }
  var blobToDataUrl = (b) => new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(b);
  });
  async function exportBackup() {
    const copy = JSON.parse(JSON.stringify(store.state));
    for (const m of copy.maps) {
      for (const key of ["image", "drawing"]) {
        if (m[key] && !m[key].startsWith("data:")) {
          const b = await imageBlob(m[key]);
          if (b) m[key] = await blobToDataUrl(b);
        }
      }
    }
    return JSON.stringify(copy);
  }
  async function importImages(data) {
    for (const m of data.maps || []) {
      for (const key of ["image", "drawing"]) {
        if (m[key]?.startsWith("data:")) m[key] = await upload(await (await fetch(m[key])).blob());
      }
    }
    return data;
  }
  var STEAM64_BASE = 76561197960265728n;
  function parseSteamId(raw) {
    const s = String(raw || "").trim();
    let m;
    if (m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i)) return m[1];
    if (/^\d{17}$/.test(s)) return s;
    if (m = s.match(/^STEAM_[0-5]:([01]):(\d+)$/i)) return (STEAM64_BASE + BigInt(m[2]) * 2n + BigInt(m[1])).toString();
    if (m = s.match(/^\[?U:1:(\d+)\]?$/i)) return (STEAM64_BASE + BigInt(m[1])).toString();
    return null;
  }
  async function steamLookup(q) {
    const id = parseSteamId(q);
    if (!id) {
      if (/steamcommunity\.com\/id\//i.test(q) || /^[A-Za-z0-9_-]{2,64}$/.test(String(q).trim()))
        throw new Error("Custom URL names can\u2019t be looked up here. Paste the SteamID64 or a /profiles/ link.");
      throw new Error("That doesn\u2019t look like a SteamID or profile link");
    }
    return { steamid: id, profileUrl: `https://steamcommunity.com/profiles/${id}` };
  }

  // js/ui.js
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") {
        for (const [sk, sv] of Object.entries(v)) {
          if (sv == null) continue;
          if (sk.startsWith("--")) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      } else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  var P = {
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
    bolt: '<path d="M13 2 5 13.5h6L10 22l8-11.5h-6z"/>'
  };
  function icon(name, size = 18) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", size);
    s.setAttribute("height", size);
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "1.8");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    s.classList.add("ico");
    s.innerHTML = P[name] || "";
    return s;
  }
  function btn(label, opts = {}) {
    const { icon: ic, kind = "ghost", onClick, title, small, attrs = {} } = opts;
    return h("button", {
      type: "button",
      class: `btn btn-${kind}${small ? " btn-sm" : ""}${label ? "" : " btn-icon"}`,
      title: title || (label ? null : opts.aria),
      "aria-label": label ? null : opts.aria || title,
      onclick: onClick,
      ...attrs
    }, ic ? icon(ic, small ? 16 : 18) : null, label ? h("span", {}, label) : null);
  }
  var toastWrap;
  function toast(msg, kind = "info") {
    if (!toastWrap) {
      toastWrap = h("div", { class: "toasts", role: "status", "aria-live": "polite" });
      document.body.append(toastWrap);
    }
    const t = h("div", { class: `toast toast-${kind}` }, msg);
    toastWrap.append(t);
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 300);
    }, kind === "error" ? 5e3 : 2600);
  }
  function modal({ title, body, actions = [], onClose, wide }) {
    const prevFocus = document.activeElement;
    const back = h("div", { class: "modal-back" });
    const close = (val) => {
      back.remove();
      document.removeEventListener("keydown", onKey);
      prevFocus?.focus?.();
      onClose?.(val);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
    };
    const box = h(
      "div",
      { class: "modal" + (wide ? " modal-wide" : ""), role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "modal-head" }, h("h2", {}, title), btn("", { icon: "x", aria: "Close", onClick: () => close(null) })),
      h("div", { class: "modal-body" }, body),
      actions.length ? h("div", { class: "modal-foot" }, actions.map((a) => btn(a.label, { kind: a.kind || "ghost", icon: a.icon, onClick: () => a.onClick(close) }))) : null
    );
    back.addEventListener("mousedown", (e) => {
      if (e.target === back) close(null);
    });
    document.addEventListener("keydown", onKey);
    back.append(box);
    document.body.append(back);
    setTimeout(() => (box.querySelector("[autofocus], input, select, textarea, .btn-primary") || box).focus(), 20);
    return close;
  }
  function confirmBox(title, text, okLabel = "Delete") {
    return new Promise((resolve) => {
      modal({
        title,
        body: h("p", { class: "muted" }, text),
        onClose: (v) => resolve(!!v),
        actions: [
          { label: "Cancel", onClick: (c) => c(false) },
          { label: okLabel, kind: "danger", onClick: (c) => c(true) }
        ]
      });
    });
  }
  function promptBox(title, { label, value = "", placeholder = "", okLabel = "Save" } = {}) {
    return new Promise((resolve) => {
      const input = h("input", { class: "input", value, placeholder, autofocus: true });
      const form = h("form", { onsubmit: (e) => {
        e.preventDefault();
        done();
      } }, h("label", { class: "field" }, h("span", {}, label || "Name"), input));
      let closeFn;
      const done = () => {
        const v = input.value.trim();
        if (v) closeFn(v);
        else input.focus();
      };
      closeFn = modal({
        title,
        body: form,
        onClose: (v) => resolve(v || null),
        actions: [{ label: "Cancel", onClick: (c) => c(null) }, { label: okLabel, kind: "primary", onClick: done }]
      });
      setTimeout(() => input.select(), 30);
    });
  }
  var openMenu = null;
  function menu(anchor, items) {
    closeMenu();
    const m = h(
      "div",
      { class: "menu", role: "menu" },
      items.filter(Boolean).map((it) => it === "-" ? h("div", { class: "menu-sep" }) : h(
        "button",
        { type: "button", role: "menuitem", class: "menu-item" + (it.danger ? " danger" : ""), onclick: () => {
          closeMenu();
          it.onClick();
        } },
        it.icon ? icon(it.icon, 16) : null,
        h("span", {}, it.label)
      ))
    );
    document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let x = Math.min(r.right - mw, window.innerWidth - mw - 8);
    if (x < 8) x = Math.min(r.left, window.innerWidth - mw - 8);
    let y = r.bottom + 6;
    if (y + mh > window.innerHeight - 8) y = r.top - mh - 6;
    m.style.left = Math.max(8, x) + "px";
    m.style.top = Math.max(8, y) + "px";
    openMenu = m;
    m.querySelector("button")?.focus();
    setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    document.addEventListener("keydown", escMenu);
  }
  function outside(e) {
    if (openMenu && !openMenu.contains(e.target)) closeMenu();
  }
  function escMenu(e) {
    if (e.key === "Escape") closeMenu();
  }
  function closeMenu() {
    openMenu?.remove();
    openMenu = null;
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("keydown", escMenu);
  }
  function progressBar(done, total) {
    const pct = total ? Math.round(done / total * 100) : 0;
    return h(
      "div",
      { class: "bar" + (total && done >= total ? " full" : ""), role: "progressbar", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": done },
      h("i", { style: { width: pct + "%" } })
    );
  }
  function empty(title, text, action) {
    return h("div", { class: "empty" }, h("div", { class: "empty-mark" }, icon("target", 28)), h("h3", {}, title), h("p", { class: "muted" }, text), action || null);
  }
  function timeAgo(iso) {
    if (!iso) return "never";
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1e3);
    if (s < 45) return "just now";
    const m = Math.round(s / 60);
    if (m < 60) return m + " min ago";
    const hr = Math.round(m / 60);
    if (hr < 24) return hr + " h ago";
    const d = Math.round(hr / 24);
    return d + " d ago";
  }
  var PIN_COLORS = ["#00e5ff", "#ff3df2", "#ffe14d", "#3df5a3", "#ff4d6d", "#b388ff", "#ff9f43", "#4d7cff", "#ffffff", "#9aa0bd"];
  function colorPicker(initial) {
    let value = /^#[0-9a-f]{6}$/i.test(initial || "") ? initial.toLowerCase() : PIN_COLORS[0];
    const custom = h("input", { type: "color", class: "cp-custom", value, title: "Pick any colour", "aria-label": "Custom colour" });
    const swatches = PIN_COLORS.map((c) => h("button", {
      type: "button",
      class: "swatch",
      style: { "--c": c },
      role: "radio",
      "aria-label": "Colour " + c,
      onclick: () => {
        value = c;
        custom.value = c;
        mark();
      }
    }));
    const preview = h("span", { class: "cp-preview" });
    const mark = () => {
      swatches.forEach((b, i) => {
        const on = PIN_COLORS[i] === value;
        b.classList.toggle("on", on);
        b.setAttribute("aria-checked", String(on));
      });
      custom.classList.toggle("on", !PIN_COLORS.includes(value));
      preview.style.setProperty("--c", value);
    };
    custom.addEventListener("input", (e) => {
      value = e.target.value.toLowerCase();
      mark();
    });
    const el = h("div", { class: "cp", role: "radiogroup", "aria-label": "Pin colour" }, swatches, custom);
    mark();
    return { el, get value() {
      return value;
    } };
  }
  function sortable(container, { items, axis = "y", scroller = null, onEnd }) {
    let st = null;
    const children = () => [...container.children].filter((c) => c.matches(items));
    const cleanup2 = () => {
      clearTimeout(st?.timer);
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("touchmove", blockScroll, { capture: true });
      document.removeEventListener("contextmenu", blockMenu, true);
      if (st?.el) st.el.classList.remove("sort-drag", "sort-ready");
      container.classList.remove("sorting");
      st = null;
    };
    const blockScroll = (e) => {
      if (st?.active && e.cancelable) e.preventDefault();
    };
    const blockMenu = (e) => {
      if (st) e.preventDefault();
    };
    function begin() {
      if (!st) return;
      st.active = true;
      st.el.classList.add("sort-drag");
      container.classList.add("sorting");
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
        c.style.transition = "none";
        c.style.transform = `translate(${dx}px, ${dy}px)`;
        requestAnimationFrame(() => {
          c.style.transition = "transform .16s ease";
          c.style.transform = "";
        });
      }
    }
    function autoScroll(y) {
      const edge = 48, speed = 14;
      const sc = typeof scroller === "function" ? scroller() : scroller;
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
        if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) cleanup2();
        return;
      }
      e.preventDefault();
      autoScroll(e.clientY);
      for (const sib of children()) {
        if (sib === st.el) continue;
        const r = sib.getBoundingClientRect();
        const inY = e.clientY >= r.top && e.clientY <= r.bottom;
        const inX = e.clientX >= r.left && e.clientX <= r.right;
        if (!inY || axis === "xy" && !inX) continue;
        const beforeSib = axis === "xy" ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
        const target = beforeSib ? sib : sib.nextSibling;
        if (target !== st.el && target !== st.el.nextSibling) flipMove(() => container.insertBefore(st.el, target));
        break;
      }
    }
    function up(e) {
      if (!st || e.pointerId !== st.id) return;
      const wasActive = st.active;
      const startIds = st.startIds;
      cleanup2();
      if (!wasActive) return;
      const swallow = (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener("click", swallow, true);
      setTimeout(() => document.removeEventListener("click", swallow, true), 0);
      const ids = children().map((c) => c.dataset.id);
      if (ids.join() !== startIds) onEnd(ids);
    }
    function cancel(e) {
      if (st && e.pointerId === st.id) cleanup2();
    }
    container.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.__sortClaimed || st) return;
      if (e.target.closest("input, textarea, select, [data-nodrag]")) return;
      const el = e.target.closest(items);
      if (!el || el.parentElement !== container) return;
      e.__sortClaimed = true;
      st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, active: false, startIds: children().map((c) => c.dataset.id).join() };
      el.classList.add("sort-ready");
      st.timer = setTimeout(begin, e.pointerType === "mouse" ? 220 : 380);
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", cancel, true);
      document.addEventListener("touchmove", blockScroll, { capture: true, passive: false });
      document.addEventListener("contextmenu", blockMenu, true);
    });
  }
  function applyOrder(arr, ids) {
    const want = new Set(ids);
    const slots = [];
    arr.forEach((x, i) => {
      if (want.has(x.id)) slots.push(i);
    });
    const byId = new Map(arr.map((x) => [x.id, x]));
    const moved = ids.map((id) => byId.get(id)).filter(Boolean);
    const out = arr.slice();
    slots.forEach((slot, k) => {
      if (moved[k]) out[slot] = moved[k];
    });
    return out;
  }

  // js/home.js
  var home_exports = {};
  __export(home_exports, {
    mount: () => mount2
  });

  // js/model.js
  var S = () => store.state;
  function itemProgress(it) {
    if (it.type === "count") return { done: Math.min(it.count || 0, it.target || 1), total: it.target || 1 };
    if (it.type === "multi") return { done: it.subs.filter((s) => s.done).length, total: it.subs.length };
    return { done: it.done ? 1 : 0, total: 1 };
  }
  function itemDone(it) {
    const p = itemProgress(it);
    return p.total > 0 && p.done >= p.total;
  }
  function listProgress(list) {
    const total = list.items.length;
    const done = list.items.filter(itemDone).length;
    let frac = 0;
    for (const it of list.items) {
      const p = itemProgress(it);
      frac += p.total ? p.done / p.total : 0;
    }
    return { done, total, pct: total ? frac / total : 0 };
  }
  function newList(name) {
    const l = { id: uid(), name, mapId: null, hideDone: false, items: [], created: Date.now() };
    S().lists.push(l);
    save();
    return l;
  }
  function newItem(list, { type, name, target, subs, color }) {
    const it = { id: uid(), type, name, done: false, count: 0, target: Math.max(1, Number(target) || 1), subs: [] };
    if (color) it.color = color;
    if (type === "multi") it.subs = (subs || []).map((n) => ({ id: uid(), name: n, done: false, point: null }));
    list.items.push(it);
    save();
    return it;
  }
  function newSub(item, name, point = null) {
    const s = { id: uid(), name, done: false, point };
    item.subs.push(s);
    save();
    return s;
  }
  function findSub(subId) {
    for (const list of S().lists) for (const item of list.items) if (item.type === "multi") {
      const sub = item.subs.find((s) => s.id === subId);
      if (sub) return { list, item, sub };
    }
    return null;
  }
  function allGroups() {
    const out = [];
    for (const list of S().lists) for (const item of list.items) if (item.type === "multi") out.push({ list, item });
    return out;
  }
  function pointsForMap(mapId) {
    const out = [];
    for (const { list, item } of allGroups()) for (const sub of item.subs) if (sub.point && sub.point.mapId === mapId) out.push({ list, item, sub });
    return out;
  }
  function unplacedForMap(mapId) {
    const out = [];
    for (const { list, item } of allGroups()) if (list.mapId === mapId) {
      for (const sub of item.subs) if (!sub.point) out.push({ list, item, sub });
    }
    return out;
  }
  function mapById(id) {
    return S().maps.find((m) => m.id === id);
  }
  function listById(id) {
    return S().lists.find((l) => l.id === id);
  }
  var GROUP_HUES = [190, 320, 50, 140, 270, 15, 95, 230];
  function groupColor(item) {
    if (item.color) return item.color;
    let n = 0;
    for (const c of item.id) n = n * 31 + c.charCodeAt(0) >>> 0;
    return `hsl(${GROUP_HUES[n % GROUP_HUES.length]} 95% 62%)`;
  }
  function nextPinColor() {
    const used = new Set(allGroups().map(({ item }) => item.color).filter(Boolean));
    return PIN_COLORS.find((c) => !used.has(c)) || PIN_COLORS[allGroups().length % PIN_COLORS.length];
  }
  function editGroupColor(item, after) {
    const picker = colorPicker(item.color || "");
    modal({
      title: "Pin colour",
      body: h("div", { style: { display: "grid", gap: "12px" } }, h("p", { class: "muted" }, `Colour for every \u201C${item.name}\u201D pin on the map.`), picker.el),
      actions: [
        { label: "Cancel", onClick: (c) => c() },
        { label: "Save colour", kind: "primary", onClick: (c) => {
          item.color = picker.value;
          save();
          c();
          after?.();
        } }
      ]
    });
  }

  // js/players.js
  var players_exports = {};
  __export(players_exports, {
    catById: () => catById,
    editCategories: () => editCategories,
    mount: () => mount,
    refreshAll: () => refreshAll,
    statusText: () => statusText
  });
  function catById(id) {
    return store.state.categories.find((c) => c.id === id) || { id: "none", name: "No category", color: "#5b6180" };
  }
  function statusText(c) {
    if (!c) return "Not loaded yet";
    if (c.onlineState === "in-game") {
      const game = (c.stateMessage || "").replace(/^In-Game\s*·?\s*/i, "").trim();
      return game ? "Playing " + game : "In game";
    }
    if (c.onlineState === "online") return "Online";
    if (c.privacy && c.privacy !== "public") return "Offline \xB7 private profile";
    return "Offline";
  }
  var refresh = { running: false, at: null };
  function applyResult(p, data) {
    const prev = p.cache?.name;
    if (prev && data.name && prev !== data.name) {
      p.names = [prev, ...(p.names || []).filter((n) => n !== prev && n !== data.name)].slice(0, 10);
    }
    p.steamid = data.steamid;
    p.cache = { ...p.cache || {}, ...data };
    p.error = null;
  }
  async function refreshOne(p) {
    try {
      applyResult(p, await steamLookup(p.steamid || p.input));
    } catch (e) {
      p.error = e.message;
    }
    window.dispatchEvent(new CustomEvent("player-updated", { detail: p.id }));
  }
  async function refreshAll() {
    if (!store.liveSteam || refresh.running || !store.online || !store.state.players.length) return;
    refresh.running = true;
    window.dispatchEvent(new Event("players-refreshing"));
    const queue = store.state.players.slice();
    const worker = async () => {
      while (queue.length) {
        await refreshOne(queue.shift());
        await new Promise((r) => setTimeout(r, 250));
      }
    };
    await Promise.all([worker(), worker()]);
    refresh.running = false;
    refresh.at = (/* @__PURE__ */ new Date()).toISOString();
    save();
    window.dispatchEvent(new Event("players-updated"));
  }
  var FILTER_KEY = "gamehelper-player-filter";
  function mount(ctx) {
    ctx.setTitle("Players");
    const s = store.state;
    let filter = "all";
    try {
      filter = localStorage.getItem(FILTER_KEY) || "all";
    } catch {
    }
    let query = "";
    const refreshBtn = h("span");
    ctx.setActions(btn("Categories", { icon: "settings", onClick: () => editCategories(renderAll) }));
    const input = h("input", { class: "input", placeholder: "SteamID64 or steamcommunity.com/profiles/\u2026 link", "aria-label": "Steam profile" });
    const nameIn = h("input", { class: "input", placeholder: "Name (optional)", "aria-label": "Player name", style: { flex: "0 1 220px", minWidth: "160px" } });
    const catSel = h("select", { class: "select", "aria-label": "Category" });
    const addBtn = btn("Add player", { kind: "primary", icon: "plus" });
    const form = h("form", { class: "p-add", onsubmit: async (e) => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return input.focus();
      addBtn.disabled = true;
      addBtn.querySelector("span").textContent = "Looking up\u2026";
      try {
        const data = await steamLookup(q);
        const exist = s.players.find((p) => p.steamid === data.steamid);
        if (exist) {
          toast(`${exist.cache?.name || exist.label || exist.steamid} is already saved as ${catById(exist.category).name}`);
        } else {
          const p = { id: uid(), input: q, steamid: data.steamid, label: nameIn.value.trim(), category: catSel.value, note: "", names: [], added: Date.now(), cache: null };
          applyResult(p, data);
          s.players.unshift(p);
          save();
          toast(`Added ${p.label || p.steamid}`, "ok");
          input.value = "";
          nameIn.value = "";
          if (filter !== "all" && filter !== p.category) {
            filter = "all";
          }
          renderAll();
        }
      } catch (err) {
        toast(err.message, "error");
      } finally {
        addBtn.disabled = false;
        addBtn.querySelector("span").textContent = "Add player";
      }
    } }, input, nameIn, catSel, addBtn);
    addBtn.type = "submit";
    const filterRow = h("div", { class: "p-filter" });
    const search = h("input", { class: "input search", placeholder: "Search names and notes", "aria-label": "Search players", oninput: (e) => {
      query = e.target.value.toLowerCase();
      renderGrid();
    } });
    const status = h("p", { class: "muted small", style: { margin: 0 } });
    const grid = h("div", { class: "players" });
    const cards = /* @__PURE__ */ new Map();
    ctx.view.append(h("div", { class: "p-toolbar" }, form, filterRow, status), grid);
    function renderFilters() {
      catSel.replaceChildren(...s.categories.map((c) => h("option", { value: c.id }, c.name)));
      const mk = (id, name, color, n) => h("button", {
        type: "button",
        class: "chip" + (filter === id ? " on" : ""),
        style: color ? { "--c": color } : null,
        "aria-pressed": String(filter === id),
        onclick: () => {
          filter = id;
          try {
            localStorage.setItem(FILTER_KEY, id);
          } catch {
          }
          renderFilters();
          renderGrid();
        }
      }, color ? h("i", { class: "dot" }) : null, `${name} ${n}`);
      filterRow.replaceChildren(
        mk("all", "All", null, s.players.length),
        ...s.categories.map((c) => mk(c.id, c.name, c.color, s.players.filter((p) => p.category === c.id).length)),
        search
      );
    }
    function renderStatus() {
      status.textContent = "Keep Steam IDs, names, categories and notes here. Live names, avatars and online status can\u2019t be loaded from Steam on this site.";
    }
    function visible() {
      return s.players.filter((p) => {
        if (filter !== "all" && p.category !== filter) return false;
        if (!query) return true;
        return [p.cache?.name, p.label, ...p.names || [], p.note, p.steamid, p.cache?.realname].some((v) => v && String(v).toLowerCase().includes(query));
      });
    }
    function renderGrid() {
      cards.clear();
      const list = visible();
      if (!s.players.length) {
        grid.replaceChildren(h("div", { style: { gridColumn: "1 / -1" } }, empty("No players saved", "Paste a Steam profile link above. You can mark people as enemies, friends or teammates and keep notes on them.")));
        return;
      }
      if (!list.length) {
        grid.replaceChildren(h("p", { class: "muted" }, "No players match this filter."));
        return;
      }
      grid.replaceChildren(...list.map((p) => {
        const c = card(p);
        cards.set(p.id, c);
        return c;
      }));
    }
    function renderAll() {
      renderFilters();
      renderGrid();
      renderStatus();
    }
    function card(p) {
      const c = p.cache || {};
      const cat = catById(p.category);
      const st = c.onlineState || "offline";
      const el = h("article", { class: "pcard", style: { "--c": cat.color } });
      const noteEl = p.note ? h("div", { class: "note", tabindex: 0, role: "button", "aria-label": "Edit note", onclick: () => editNote() }, p.note) : h("div", { class: "note emptynote", tabindex: 0, role: "button", onclick: () => editNote() }, "Add a note\u2026");
      noteEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          editNote();
        }
      });
      function editNote() {
        const ta = h("textarea", { class: "input", placeholder: "Where you met them, base location, what they play\u2026" });
        ta.value = p.note || "";
        const done = () => {
          p.note = ta.value.trim();
          save();
          el.replaceWith(rebuild());
        };
        ta.addEventListener("blur", done);
        ta.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            ta.value = p.note || "";
            ta.blur();
          }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) ta.blur();
        });
        noteEl.replaceWith(ta);
        ta.focus();
      }
      function rebuild() {
        const n = card(p);
        cards.set(p.id, n);
        return n;
      }
      const catBtn = h("button", {
        type: "button",
        class: "chip cat-chip",
        style: { "--c": cat.color },
        title: "Change category",
        onclick: (e) => menu(e.currentTarget, s.categories.map((k) => ({ label: k.name, icon: k.id === p.category ? "check" : null, onClick: () => {
          p.category = k.id;
          save();
          renderFilters();
          if (filter !== "all" && filter !== k.id) renderGrid();
          else el.replaceWith(rebuild());
        } })))
      }, h("i", { class: "dot" }), cat.name);
      const badges = [
        c.vacBanned ? h("span", { class: "badge bad" }, icon("shield", 13), "VAC ban") : null,
        c.tradeBan && c.tradeBan !== "None" ? h("span", { class: "badge warn" }, "Trade ban") : null,
        c.privacy && c.privacy !== "public" ? h("span", { class: "badge" }, c.privacy === "friendsonly" ? "Friends-only" : "Private") : null,
        c.limited ? h("span", { class: "badge" }, "Limited") : null
      ].filter(Boolean);
      el.append(
        h(
          "div",
          { class: "av" },
          c.avatar ? h("img", { src: c.avatar, alt: "", loading: "lazy", onerror: (e) => e.target.replaceWith(h("div", { class: "ph" }, icon("users", 26))) }) : h("div", { class: "ph" }, icon("users", 26)),
          h("i", { class: "st " + st, title: statusText(c) })
        ),
        h(
          "div",
          { class: "pc-main" },
          h("div", { class: "pname", title: c.name || p.label || "" }, c.name || p.label || p.steamid || p.input),
          h("div", { class: "pstate " + st }, c.onlineState ? statusText(c) + (c.fetchedAt ? ` \xB7 ${timeAgo(c.fetchedAt)}` : "") : p.steamid),
          p.names?.length ? h("div", { class: "aka", title: p.names.join(", ") }, "Was: " + p.names.join(", ")) : null,
          badges.length ? h("div", { class: "badges" }, badges) : null,
          p.error ? h("div", { class: "err" }, p.error) : null
        ),
        noteEl,
        h(
          "div",
          { class: "pc-foot" },
          catBtn,
          h("span", { class: "grow" }),
          btn("", { icon: "copy", small: true, kind: "flat", aria: "Copy SteamID64", onClick: async () => {
            try {
              await navigator.clipboard.writeText(p.steamid);
              toast("SteamID copied");
            } catch {
              toast(p.steamid);
            }
          } }),
          h("a", { class: "btn btn-flat btn-sm btn-icon", href: c.profileUrl || `https://steamcommunity.com/profiles/${p.steamid}`, target: "_blank", rel: "noopener", "aria-label": "Open Steam profile", title: "Open Steam profile" }, icon("external", 16)),
          btn("", { icon: "dots", small: true, kind: "flat", aria: "More", onClick: (e) => menu(e.currentTarget, [
            { label: "Set name", icon: "edit", onClick: async () => {
              const v = await promptBox("Player name", { value: p.label || c.name || "" });
              if (v) {
                p.label = v;
                if (p.cache) p.cache.name = "";
                save();
                el.replaceWith(rebuild());
              }
            } },
            { label: "Edit note", icon: "edit", onClick: editNote },
            "-",
            { label: "Remove player", icon: "trash", danger: true, onClick: async () => {
              if (!await confirmBox("Remove player?", `${c.name || p.label || p.steamid} will be removed from your list along with your note.`, "Remove")) return;
              s.players = s.players.filter((x) => x !== p);
              save();
              renderAll();
            } }
          ]) })
        )
      );
      return el;
    }
    const onOne = (e) => {
      const old = cards.get(e.detail);
      const p = s.players.find((x) => x.id === e.detail);
      if (old && p && !old.contains(document.activeElement)) {
        const n = card(p);
        old.replaceWith(n);
        cards.set(p.id, n);
      }
    };
    const onAll = () => renderStatus();
    window.addEventListener("player-updated", onOne);
    window.addEventListener("players-updated", onAll);
    window.addEventListener("players-refreshing", onAll);
    renderAll();
    return () => {
      window.removeEventListener("player-updated", onOne);
      window.removeEventListener("players-updated", onAll);
      window.removeEventListener("players-refreshing", onAll);
    };
  }
  function editCategories(after) {
    const s = store.state;
    const draft = s.categories.map((c) => ({ ...c }));
    const rows = h("div", { class: "cat-editor" });
    const renderRows = () => rows.replaceChildren(...draft.map((c, i) => h(
      "div",
      { class: "cat-row" },
      h("input", { type: "color", value: c.color, "aria-label": "Colour", oninput: (e) => c.color = e.target.value }),
      h("input", { class: "input", value: c.name, "aria-label": "Category name", oninput: (e) => c.name = e.target.value }),
      btn("", { icon: "trash", kind: "flat", aria: "Delete category", onClick: () => {
        if (draft.length > 1) {
          draft.splice(i, 1);
          renderRows();
        } else toast("Keep at least one category");
      } })
    )));
    renderRows();
    modal({
      title: "Player categories",
      body: h(
        "div",
        { class: "cat-editor" },
        h("p", { class: "muted small" }, "Players in a deleted category move to the first one in this list."),
        rows,
        btn("Add category", { icon: "plus", onClick: () => {
          draft.push({ id: uid(), name: "New category", color: "#b388ff" });
          renderRows();
        } })
      ),
      actions: [
        { label: "Cancel", onClick: (c) => c() },
        { label: "Save categories", kind: "primary", onClick: (close) => {
          const clean = draft.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() }));
          if (!clean.length) return toast("Keep at least one category", "error");
          const ids = new Set(clean.map((c) => c.id));
          for (const p of s.players) if (!ids.has(p.category)) p.category = clean[0].id;
          s.categories = clean;
          save();
          close();
          after?.();
          toast("Categories saved", "ok");
        } }
      ]
    });
  }

  // js/home.js
  function greeting(d) {
    const hr = d.getHours();
    if (hr < 5) return "Late-night session";
    if (hr < 12) return "Good morning";
    if (hr < 18) return "Good afternoon";
    return "Good evening";
  }
  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }
  function mount2(ctx) {
    ctx.setTitle("Home");
    ctx.setActions(btn("Add map", { icon: "image", onClick: () => location.hash = "#/maps/new" }));
    const wrap = h("div");
    ctx.view.append(wrap);
    const render = () => {
      const s = store.state;
      const now = /* @__PURE__ */ new Date();
      const day = now.toLocaleDateString("en-GB", { weekday: "long" });
      const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
      const openTasks = s.lists.reduce((n, l) => n + l.items.length - l.items.filter((it) => listProgress({ items: [it] }).done).length, 0);
      const activeLists = s.lists.filter((l) => listProgress(l).done < l.items.length).length;
      const online = s.players.filter((p) => p.cache && p.cache.onlineState && p.cache.onlineState !== "offline");
      const enemyOnline = online.filter((p) => p.category === "enemy").length;
      const parts = [];
      if (s.lists.length) parts.push(openTasks ? `${plural(openTasks, "task", "tasks")} left across ${plural(activeLists, "checklist", "checklists")}.` : "Every checklist is cleared.");
      else parts.push("Start with a checklist for your next session, or drop in a map to mark it up.");
      if (s.players.length && !store.liveSteam) parts.push(`${plural(s.players.length, "player", "players")} on your watch list.`);
      else if (s.players.length) parts.push(enemyOnline ? `${plural(enemyOnline, "enemy is", "enemies are")} online right now.` : online.length ? `${plural(online.length, "saved player is", "saved players are")} online.` : "None of your saved players are online.");
      const listsCard = h(
        "section",
        { class: "panel span-7" },
        h("div", { class: "panel-head" }, h("h2", {}, "Checklists"), h("a", { class: "panel-link", href: "#/lists" }, "Open all")),
        s.lists.length ? h("div", { class: "mini-list" }, s.lists.slice().sort((a, b) => listProgress(a).pct - listProgress(b).pct).slice(0, 6).map((l) => {
          const p = listProgress(l);
          return h(
            "a",
            { class: "mini-row", href: "#/lists/" + l.id },
            h("span", { class: "t" }, l.name),
            h("span", { class: "v num" }, `${p.done}/${p.total}`),
            progressBar(Math.round(p.pct * 100), 100)
          );
        })) : h("p", { class: "muted" }, "No checklists yet. Track kills, locations to visit or anything else you need to get done.")
      );
      const counts = s.categories.map((c) => ({ c, n: s.players.filter((p) => p.category === c.id).length })).filter((x) => x.n);
      const playersCard = h(
        "section",
        { class: "panel span-5" },
        h("div", { class: "panel-head" }, h("h2", {}, "Players"), h("a", { class: "panel-link", href: "#/players" }, "Open all")),
        s.players.length && !store.liveSteam ? h(
          "div",
          {},
          h("div", { class: "stat-big" }, h("span", { class: "num" }, s.players.length), h("span", { class: "muted" }, "saved")),
          h("div", { class: "cat-counts" }, counts.map(({ c, n }) => h("span", { class: "chip", style: { "--c": c.color } }, h("i", { class: "dot" }), `${c.name} ${n}`)))
        ) : s.players.length ? h(
          "div",
          {},
          h("div", { class: "stat-big" }, h("span", { class: "num" }, online.length), h("span", { class: "muted" }, `of ${s.players.length} online`)),
          online.length ? h("div", { class: "online-list", style: { marginBottom: "16px" } }, online.slice(0, 5).map((p) => {
            const cat = catById(p.category);
            return h(
              "div",
              { class: "online-row" },
              p.cache.avatar ? h("img", { src: p.cache.avatar, alt: "" }) : null,
              h("span", { class: "n" }, p.cache.name || p.steamid),
              h("span", { class: "chip cat-chip", style: { "--c": cat.color } }, h("i", { class: "dot" }), cat.name)
            );
          })) : h("p", { class: "muted small", style: { margin: "0 0 14px" } }, "Everyone you saved is offline."),
          h("div", { class: "cat-counts" }, counts.map(({ c, n }) => h("span", { class: "chip", style: { "--c": c.color } }, h("i", { class: "dot" }), `${c.name} ${n}`)))
        ) : h("p", { class: "muted" }, "Save Steam IDs as enemies, friends or teammates, with a note on each.")
      );
      const mapsCard = h(
        "section",
        { class: "panel span-12" },
        h("div", { class: "panel-head" }, h("h2", {}, "Maps"), h("a", { class: "panel-link", href: "#/maps" }, "Open all")),
        s.maps.length ? h("div", { class: "thumbs" }, s.maps.slice(-8).reverse().map((m) => h("a", { class: "thumb", href: "#/maps/" + m.id }, h("img", { src: resolveUrl(m.image), alt: "", loading: "lazy" }), h("span", {}, m.name)))) : h("p", { class: "muted" }, "Upload a PNG or paste a screenshot, then draw on it and pin locations from your checklists.")
      );
      wrap.replaceChildren(
        h(
          "section",
          { class: "hero" },
          h("div", { class: "hero-greet" }, h("i"), greeting(now)),
          h("h2", { class: "hero-date" }, h("span", {}, day), h("span", { class: "d2" }, date)),
          h("p", { class: "hero-sum" }, parts.join(" ")),
          h(
            "div",
            { class: "hero-actions" },
            btn("New checklist", { kind: "primary", icon: "plus", onClick: () => location.hash = "#/lists/new" }),
            btn("Add player", { icon: "users", onClick: () => location.hash = "#/players" })
          )
        ),
        h("div", { class: "home-grid" }, listsCard, playersCard, mapsCard)
      );
    };
    render();
    window.addEventListener("players-updated", render);
    return () => window.removeEventListener("players-updated", render);
  }

  // js/maps.js
  var maps_exports = {};
  __export(maps_exports, {
    mount: () => mount3
  });

  // js/share-template.js
  var VIEWER = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>__TITLE__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=Tektur:wdth,wght@75..100,600..900&display=swap" rel="stylesheet">
<style>
/* GameHelper shared map \u2014 one map, its pins, ticked off per viewer. Single dark look on purpose. */
@property --h { syntax: '<number>'; inherits: true; initial-value: 190; }
:root {
  --void: #05060b; --panel: #0d0f18; --panel-2: #141725; --panel-3: #1b1f31;
  --line: #23283d; --line-2: #30364f; --text: #e9ecf7; --muted: #8c92ae; --dim: #5b6180; --ok: #3df5a3;
  --h: 190;
  --a: hsl(var(--h) 100% 60%); --b: hsl(calc(var(--h) + 120) 100% 62%); --c: hsl(calc(var(--h) + 240) 100% 62%);
  --rgb: linear-gradient(90deg, var(--a), var(--b), var(--c));
  --display: 'Tektur', 'Chakra Petch', 'Bahnschrift', system-ui, sans-serif;
  --ui: 'Chakra Petch', 'Bahnschrift', 'Segoe UI', system-ui, sans-serif;
  color-scheme: dark; background: var(--void);
  animation: spin 9s linear infinite;
}
@keyframes spin { from { --h: 0; } to { --h: 360; } }
@media (prefers-reduced-motion: reduce) { :root { animation: none; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--void); color: var(--text); font: 500 15px/1.5 var(--ui); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--a); outline-offset: 2px; }
.wrap { padding: 18px 20px 20px; display: grid; gap: 14px; }
.top { display: flex; align-items: flex-end; gap: 18px; flex-wrap: wrap; }
.top-l { flex: 1; min-width: 0; }
.brand { color: var(--muted); font-weight: 600; font-size: 13px; letter-spacing: .06em; display: flex; align-items: center; gap: 8px; }
.brand i { width: 7px; height: 7px; transform: rotate(45deg); background: var(--a); box-shadow: 0 0 10px var(--a); border-radius: 1px; }
h1 { margin: 2px 0 0; font: 800 clamp(30px, 5vw, 52px)/1 var(--display); font-stretch: 80%; text-transform: uppercase; letter-spacing: .005em;
  background: var(--rgb); -webkit-background-clip: text; background-clip: text; color: transparent; overflow-wrap: anywhere; }
.prog { display: grid; gap: 6px; min-width: 200px; flex: 0 1 280px; }
.prog-t { display: flex; justify-content: space-between; font-size: 13.5px; color: var(--muted); }
.prog-t b { color: var(--text); font: 700 18px var(--display); font-variant-numeric: tabular-nums; }
.bar { height: 6px; border-radius: 6px; background: var(--panel-3); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--rgb); border-radius: inherit; transition: width .25s; }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; height: calc(100vh - 130px); min-height: 480px; }
.vp { position: relative; overflow: hidden; border-radius: 12px; border: 1px solid var(--line); touch-action: none; user-select: none; cursor: grab;
  background: linear-gradient(var(--line) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, var(--line) 1px, transparent 1px) 0 0 / 32px 32px, #07080e; }
.vp.drag { cursor: grabbing; }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.stage img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; -webkit-user-drag: none; }
.mk { position: absolute; inset: 0; }
.pin { position: absolute; transform: translate(-50%, -100%) scale(var(--inv, 1)); transform-origin: 50% 100%; display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 0; border: 0; background: none; cursor: pointer; }
.pin svg { width: 30px; height: 30px; filter: drop-shadow(0 2px 6px rgba(0,0,0,.6)); }
.pin span { padding: 2px 8px; border-radius: 4px; background: rgba(5,6,11,.86); border: 1px solid var(--pc); font: 600 13px/1.3 var(--ui); color: var(--text);
  white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.pin:hover span, .pin:focus-visible span { background: var(--pc); color: #05060b; }
.pin.done { opacity: .85; }
.pin.done svg { filter: grayscale(1) brightness(.7) drop-shadow(0 2px 6px rgba(0,0,0,.6)); }
.pin.done span { color: var(--muted); border-color: var(--line-2); text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--text); }
.pin.done:hover span { background: var(--muted); color: #05060b; }
.pin.flash svg { animation: flash 1s ease 2; }
@keyframes flash { 50% { transform: scale(1.5); } }
.labels-off .pin span { display: none; }
.ctl { position: absolute; right: 10px; bottom: 10px; display: flex; gap: 6px; z-index: 2; }
.lvl { position: absolute; left: 10px; bottom: 10px; z-index: 2; font-size: 12.5px; color: var(--muted); background: rgba(13,15,24,.88); padding: 4px 9px; border-radius: 4px; border: 1px solid var(--line); }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; min-width: 34px; padding: 0 11px; border-radius: 6px;
  border: 1px solid var(--line-2); background: rgba(20,23,37,.92); font-weight: 600; font-size: 13.5px; cursor: pointer; white-space: nowrap; }
.btn:hover { background: var(--panel-3); border-color: #444c6c; }
.btn.on { border-color: var(--a); background: hsl(var(--h) 100% 60% / .14); }
.btn svg { width: 16px; height: 16px; }
.panel { display: flex; flex-direction: column; gap: 12px; min-height: 0; padding: 16px; border-radius: 12px; border: 1px solid var(--line); background: linear-gradient(180deg, var(--panel), #0a0b13); }
.panel-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.panel-h h2 { margin: 0; flex: 1; font: 700 18px var(--display); }
.groups { overflow: auto; display: grid; gap: 14px; align-content: start; margin: 0 -6px; padding: 0 6px; min-height: 0; }
.g-h { display: flex; align-items: center; gap: 8px; }
.g-h .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--pc); box-shadow: 0 0 8px var(--pc); flex: none; }
.g-name { flex: 1; min-width: 0; font: 700 14.5px var(--display); background: none; border: 0; padding: 0; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.g-n { color: var(--muted); font-size: 12.5px; font-variant-numeric: tabular-nums; }
.eye { width: 30px; height: 30px; min-width: 30px; padding: 0; }
.g.off .g-name, .g.off .g-n { opacity: .45; }
.g.off .g-name { text-decoration: line-through; }
.rows { display: grid; gap: 1px; margin-top: 6px; }
.g.closed .rows { display: none; }
.row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 5px; }
.row:hover { background: var(--panel-2); }
.tick { width: 22px; height: 22px; flex: none; border-radius: 5px; border: 1.5px solid var(--line-2); background: var(--void); display: grid; place-items: center; color: transparent; cursor: pointer; padding: 0; }
.tick svg { width: 14px; height: 14px; }
.tick.on { background: var(--ok); border-color: var(--ok); color: #04130c; }
.row .n { flex: 1; min-width: 0; text-align: left; background: none; border: 0; padding: 0; cursor: pointer; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row.done .n { color: var(--muted); text-decoration: line-through; }
.foot { margin: 0; color: var(--dim); font-size: 12.5px; }
@media (max-width: 860px) {
  .wrap { padding: 14px 16px 18px; }
  .top-l, .prog { flex-basis: 100%; }
  .layout { grid-template-columns: minmax(0, 1fr); height: auto; }
  .vp { height: 68vh; min-height: 360px; }
  .panel { max-height: none; }
  .groups { overflow: visible; }
}
</style>
<div class="wrap">
  <header class="top">
    <div class="top-l">
      <div class="brand"><i></i><span id="sub">Shared map</span></div>
      <h1 id="title"></h1>
    </div>
    <div class="prog" aria-live="polite">
      <div class="prog-t"><span>Your progress</span><b id="prog">0/0</b></div>
      <div class="bar"><i id="bar"></i></div>
    </div>
  </header>
  <div class="layout">
    <div class="vp" id="vp" aria-label="Map">
      <div class="stage" id="stage"><img id="img" alt=""><div class="mk" id="mk"></div></div>
      <div class="lvl" id="lvl">100%</div>
      <div class="ctl">
        <button class="btn" id="zo" type="button" aria-label="Zoom out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg></button>
        <button class="btn" id="fit" type="button" aria-label="Fit map">Fit</button>
        <button class="btn" id="zi" type="button" aria-label="Zoom in"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </div>
    <aside class="panel" aria-label="Pins">
      <div class="panel-h">
        <h2>Pins</h2>
        <button class="btn" id="showDone" type="button">Hide ticked</button>
        <button class="btn" id="labels" type="button">Labels</button>
      </div>
      <div class="groups" id="groups"></div>
      <div class="panel-h">
        <button class="btn" id="allOn" type="button">Show all groups</button>
        <button class="btn" id="reset" type="button">Untick all</button>
      </div>
      <p class="foot">Tap a pin to tick it off; ticked pins turn grey. Your ticks are saved in this browser only.</p>
    </aside>
  </div>
</div>
<script type="application/json" id="gamehelper-map">__DATA__<\/script>
<script>
(function () {
  var D = JSON.parse(document.getElementById('gamehelper-map').textContent);
  var KEY = 'gamehelper-share-' + D.id;
  var st = { done: {}, hidden: {}, closed: {}, showDone: true, labels: window.innerWidth > 860 };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) for (var k in saved) st[k] = saved[k]; } catch (e) {}
  if (!saved) (D.groups || []).forEach(function (g) { (g.pins || []).forEach(function (p) { if (p.done) st.done[p.id] = true; }); });
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  var $ = function (id) { return document.getElementById(id); };
  var vp = $('vp'), stage = $('stage'), img = $('img'), mk = $('mk');
  document.title = D.name;
  $('title').textContent = D.name;
  $('sub').textContent = D.by ? 'Shared map from ' + D.by : 'Shared map';
  img.src = D.image;
  stage.style.width = D.w + 'px';
  stage.style.height = D.h + 'px';

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.7M6.6 6.7C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/></svg>';
  function pinSvg(c, done) {
    return '<svg viewBox="0 0 24 24"><path d="M12 22.5s-7.5-6.8-7.5-12.6a7.5 7.5 0 0 1 15 0c0 5.8-7.5 12.6-7.5 12.6z" fill="' + c + '" stroke="#05060b" stroke-width="1.4"/>' +
      (done ? '<path d="m8.6 10 2.4 2.4 4.4-4.6" fill="none" stroke="#05060b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="12" cy="9.9" r="2.6" fill="#05060b"/>') + '</svg>';
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------- view ----------
  var view = { x: 0, y: 0, s: 1, fit: 1 };
  function apply() {
    stage.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.s + ')';
    stage.style.setProperty('--inv', String(1 / view.s));
    $('lvl').textContent = Math.round(view.s / view.fit * 100) + '%';
  }
  function fit() {
    var r = vp.getBoundingClientRect();
    if (!r.width) return;
    view.fit = Math.min(r.width / D.w, r.height / D.h) * 0.96;
    view.s = view.fit;
    view.x = (r.width - D.w * view.s) / 2;
    view.y = (r.height - D.h * view.s) / 2;
    apply();
  }
  function zoomAt(mx, my, f) {
    var ns = Math.min(Math.max(view.s * f, view.fit * 0.5), view.fit * 16), k = ns / view.s;
    view.x = mx - (mx - view.x) * k; view.y = my - (my - view.y) * k; view.s = ns; apply();
  }
  function zoomBy(f) { var r = vp.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); }
  function centerOn(fx, fy) {
    var r = vp.getBoundingClientRect();
    view.s = Math.max(view.s, view.fit * 2.2);
    view.x = r.width / 2 - fx * D.w * view.s; view.y = r.height / 2 - fy * D.h * view.s; apply();
  }
  $('zi').onclick = function () { zoomBy(1.3); };
  $('zo').onclick = function () { zoomBy(1 / 1.3); };
  $('fit').onclick = fit;
  vp.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = vp.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });

  var ptrs = {}, drag = null, pinch = null;
  function count() { return Object.keys(ptrs).length; }
  vp.addEventListener('pointerdown', function (e) {
    if (e.target.closest('.pin, .ctl')) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    vp.setPointerCapture(e.pointerId);
    if (count() === 2) {
      var p = Object.values(ptrs);
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: view.s };
      drag = null;
    } else {
      drag = { sx: e.clientX, sy: e.clientY, x: view.x, y: view.y };
      vp.classList.add('drag');
    }
  });
  vp.addEventListener('pointermove', function (e) {
    if (!ptrs[e.pointerId]) return;
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch && count() === 2) {
      var p = Object.values(ptrs), r = vp.getBoundingClientRect();
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      zoomAt((p[0].x + p[1].x) / 2 - r.left, (p[0].y + p[1].y) / 2 - r.top, (pinch.s * d / pinch.d) / view.s);
    } else if (drag) {
      view.x = drag.x + e.clientX - drag.sx; view.y = drag.y + e.clientY - drag.sy; apply();
    }
  });
  function up(e) {
    delete ptrs[e.pointerId];
    if (count() < 2) pinch = null;
    if (!count()) { drag = null; vp.classList.remove('drag'); }
  }
  vp.addEventListener('pointerup', up);
  vp.addEventListener('pointercancel', up);

  // ---------- pins & panel ----------
  function totals() {
    var all = 0, done = 0;
    D.groups.forEach(function (g) { g.pins.forEach(function (p) { all++; if (st.done[p.id]) done++; }); });
    return { all: all, done: done };
  }
  function renderPins(flashId) {
    mk.replaceChildren();
    D.groups.forEach(function (g) {
      if (st.hidden[g.id]) return;
      g.pins.forEach(function (p) {
        var done = !!st.done[p.id];
        if (done && !st.showDone) return;
        var b = el('button', 'pin' + (done ? ' done' : '') + (p.id === flashId ? ' flash' : ''));
        b.type = 'button';
        b.style.left = p.x * 100 + '%'; b.style.top = p.y * 100 + '%';
        b.style.setProperty('--pc', g.color);
        b.title = p.name + ' (' + g.name + ')';
        b.setAttribute('aria-label', p.name + ', ' + (done ? 'ticked' : 'not ticked'));
        b.append(el('span', null, p.name));
        b.insertAdjacentHTML('beforeend', pinSvg(g.color, done));
        b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        b.onclick = function () { toggle(p.id); };
        mk.append(b);
      });
    });
    vp.classList.toggle('labels-off', !st.labels);
  }
  function renderPanel() {
    var t = totals();
    $('prog').textContent = t.done + '/' + t.all;
    $('bar').style.width = (t.all ? t.done / t.all * 100 : 0) + '%';
    $('showDone').classList.toggle('on', !st.showDone);
    $('showDone').textContent = st.showDone ? 'Hide ticked' : 'Show ticked';
    $('labels').classList.toggle('on', st.labels);
    var box = $('groups');
    box.replaceChildren();
    D.groups.forEach(function (g) {
      var off = !!st.hidden[g.id];
      var gd = el('div', 'g' + (off ? ' off' : '') + (st.closed[g.id] ? ' closed' : ''));
      gd.style.setProperty('--pc', g.color);
      var head = el('div', 'g-h');
      head.append(el('i', 'dot'));
      var name = el('button', 'g-name', g.name); name.type = 'button';
      name.setAttribute('aria-expanded', String(!st.closed[g.id]));
      name.onclick = function () { st.closed[g.id] = !st.closed[g.id]; persist(); renderPanel(); };
      var dn = g.pins.filter(function (p) { return st.done[p.id]; }).length;
      var eye = el('button', 'btn eye'); eye.type = 'button';
      eye.innerHTML = off ? EYE_OFF : EYE;
      eye.title = off ? 'Show this group on the map' : 'Hide this group on the map';
      eye.setAttribute('aria-pressed', String(!off));
      eye.setAttribute('aria-label', (off ? 'Show ' : 'Hide ') + g.name);
      eye.onclick = function () { st.hidden[g.id] = !off; persist(); renderPins(); renderPanel(); };
      head.append(name, el('span', 'g-n', dn + '/' + g.pins.length), eye);
      var rows = el('div', 'rows');
      g.pins.forEach(function (p) {
        var done = !!st.done[p.id];
        var r = el('div', 'row' + (done ? ' done' : ''));
        var tk = el('button', 'tick' + (done ? ' on' : '')); tk.type = 'button';
        tk.setAttribute('role', 'checkbox'); tk.setAttribute('aria-checked', String(done)); tk.setAttribute('aria-label', p.name);
        tk.innerHTML = CHECK;
        tk.onclick = function () { toggle(p.id); };
        var n = el('button', 'n', p.name); n.type = 'button'; n.title = 'Show on map';
        n.onclick = function () {
          if (st.hidden[g.id]) { st.hidden[g.id] = false; }
          if (st.done[p.id]) st.showDone = true;
          persist(); centerOn(p.x, p.y); renderPins(p.id); renderPanel();
        };
        r.append(tk, n);
        rows.append(r);
      });
      gd.append(head, rows);
      box.append(gd);
    });
  }
  function toggle(id) { st.done[id] = !st.done[id]; persist(); renderPins(); renderPanel(); }
  $('showDone').onclick = function () { st.showDone = !st.showDone; persist(); renderPins(); renderPanel(); };
  $('labels').onclick = function () { st.labels = !st.labels; persist(); renderPins(); renderPanel(); };
  $('allOn').onclick = function () { st.hidden = {}; persist(); renderPins(); renderPanel(); };
  var resetArmed = false;
  $('reset').onclick = function () {
    var b = $('reset');
    if (!resetArmed) { resetArmed = true; b.textContent = 'Click again to untick'; setTimeout(function () { resetArmed = false; b.textContent = 'Untick all'; }, 3000); return; }
    resetArmed = false; b.textContent = 'Untick all'; st.done = {}; persist(); renderPins(); renderPanel();
  };

  renderPins(); renderPanel();
  if (img.complete && img.naturalWidth) fit(); else img.onload = fit;
  window.addEventListener('resize', function () { if (Math.abs(view.s - view.fit) < 1e-6) fit(); });
})();
<\/script>
`;

  // js/share.js
  var MAX_SIDE = 4096;
  async function composite(img, drawCanvas, w, h2) {
    const k = Math.min(1, MAX_SIDE / Math.max(w, h2));
    const c = document.createElement("canvas");
    c.width = Math.round(w * k);
    c.height = Math.round(h2 * k);
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, c.width, c.height);
    if (drawCanvas) g.drawImage(drawCanvas, 0, 0, c.width, c.height);
    let url = c.toDataURL("image/webp", 0.85);
    if (!url.startsWith("data:image/webp")) url = c.toDataURL("image/jpeg", 0.88);
    return url;
  }
  function mapGroups(map) {
    const groups = /* @__PURE__ */ new Map();
    for (const { item, sub } of pointsForMap(map.id)) {
      if (!groups.has(item.id)) groups.set(item.id, { id: item.id, name: item.name, color: groupColor(item), pins: [] });
      groups.get(item.id).pins.push(sub);
    }
    const order = map.groupOrder || [];
    const rank = (g) => {
      const i = order.indexOf(g.id);
      return i < 0 ? 1e9 : i;
    };
    return [...groups.values()].sort((a, b) => rank(a) - rank(b));
  }
  async function buildShareHtml(map, { img, drawCanvas, groupIds, includeDone }) {
    const groups = mapGroups(map).filter((g) => groupIds.includes(g.id)).map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      pins: g.pins.map((s) => ({ id: s.id, name: s.name, x: +s.point.x.toFixed(5), y: +s.point.y.toFixed(5), ...includeDone && s.done ? { done: true } : {} }))
    }));
    const data = {
      kind: "gamehelper-map",
      v: 1,
      id: map.id + "-" + Date.now().toString(36),
      name: map.name,
      w: map.w,
      h: map.h,
      image: await composite(img, drawCanvas, map.w, map.h),
      groups,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
    const json = JSON.stringify(data).replace(/</g, "\\u003c");
    return VIEWER.split("__TITLE__").join(esc(map.name)).split("__DATA__").join(json);
  }
  function parseShareFile(text) {
    let raw = text.trim();
    const m = raw.match(/<script type="application\/json" id="gamehelper-map">([\s\S]*?)<\/script>/);
    if (m) raw = m[1];
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("That file isn\u2019t a shared GameHelper map");
    }
    if (data?.kind !== "gamehelper-map" || !data.image || !Array.isArray(data.groups)) throw new Error("That file isn\u2019t a shared GameHelper map");
    return data;
  }
  async function importShared(data) {
    const blob = await (await fetch(data.image)).blob();
    const url = await upload(blob);
    const map = { id: uid(), name: data.name, image: url, drawing: null, w: data.w, h: data.h, showDone: false, hiddenGroups: {}, created: Date.now() };
    store.state.maps.push(map);
    const list = newList(data.name);
    list.mapId = map.id;
    for (const g of data.groups) {
      const item = newItem(list, { type: "multi", name: g.name, subs: [] });
      for (const p of g.pins) {
        const s = newSub(item, p.name, { mapId: map.id, x: p.x, y: p.y });
        if (p.done) s.done = true;
      }
    }
    save();
    return map;
  }

  // js/maps.js
  var COLORS = ["#00e5ff", "#ff3df2", "#ffe14d", "#3df5a3", "#ff4d6d", "#ffffff"];
  var PREF_KEY = "gamehelper-map-tool";
  function mount3(ctx) {
    const map = mapById(ctx.params[0]);
    if (ctx.params[0] && ctx.params[0] !== "new" && !map) {
      location.hash = "#/maps";
      return;
    }
    return map ? editor(ctx, map) : library(ctx);
  }
  function readImageSize(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        res({ w: img.naturalWidth, h: img.naturalHeight });
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        rej(new Error("That file isn\u2019t an image GameHelper can open"));
        URL.revokeObjectURL(url);
      };
      img.src = url;
    });
  }
  async function prepareImage(blob) {
    if (blob.size < 8e6) return blob;
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      const out = await new Promise((r) => c.toBlob(r, "image/webp", 0.9));
      return out && out.size < blob.size ? out : blob;
    } catch {
      return blob;
    }
  }
  async function addMapFromBlob(blob, defaultName) {
    if (!store.canUpload) {
      toast("Only people who can edit this page can add maps", "error");
      return;
    }
    if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) {
      toast("Use a PNG, JPG, WEBP or GIF image", "error");
      return;
    }
    const name = await promptBox("Name this map", { value: defaultName, okLabel: "Add map" });
    if (!name) return;
    try {
      const { w, h: hh } = await readImageSize(blob);
      toast("Uploading map\u2026");
      const url = await upload(await prepareImage(blob));
      const m = { id: uid(), name, image: url, drawing: null, w, h: hh, hideDone: false, created: Date.now() };
      store.state.maps.push(m);
      save();
      location.hash = "#/maps/" + m.id;
    } catch (e) {
      toast(e.message, "error");
    }
  }
  function pickFile() {
    const inp = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
    inp.onchange = () => {
      const f = inp.files[0];
      if (f) addMapFromBlob(f, f.name.replace(/\.[^.]+$/, ""));
    };
    inp.click();
  }
  function pickShared() {
    const inp = h("input", { type: "file", accept: ".html,.htm,.json,text/html,application/json" });
    inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      try {
        const data = parseShareFile(await f.text());
        toast("Importing " + data.name + "\u2026");
        const m = await importShared(data);
        toast(`Imported ${data.name} with ${data.groups.reduce((n, g) => n + g.pins.length, 0)} pins`, "ok");
        location.hash = "#/maps/" + m.id;
      } catch (e) {
        toast(e.message, "error");
      }
    };
    inp.click();
  }
  function library(ctx) {
    const s = store.state;
    ctx.setTitle("Maps");
    ctx.setActions(store.canUpload ? btn("Import shared map", { icon: "download", onClick: pickShared }) : null, store.canUpload ? btn("Upload map", { kind: "primary", icon: "upload", onClick: pickFile }) : null);
    const drop = h(
      "div",
      {
        class: "dropzone",
        tabindex: 0,
        role: "button",
        "aria-label": "Upload a map image",
        onclick: pickFile,
        onkeydown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickFile();
          }
        }
      },
      icon("image", 30),
      h("b", {}, "Drop a map here"),
      h("span", { class: "small" }, "or click to choose a PNG/JPG, or press Ctrl + V to paste a screenshot")
    );
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) addMapFromBlob(f, f.name.replace(/\.[^.]+$/, ""));
    });
    const cards = s.maps.slice().reverse().map((m) => {
      const n = pointsForMap(m.id).length;
      return h(
        "a",
        { class: "map-card", href: "#/maps/" + m.id },
        h("div", { class: "thumb" }, h("img", { src: resolveUrl(m.image), alt: "", loading: "lazy" })),
        h("div", { class: "mc-meta" }, h("b", {}, m.name), h("span", {}, n === 1 ? "1 pin" : `${n} pins`))
      );
    });
    ctx.view.append(
      s.maps.length ? null : h("p", { class: "muted", style: { marginTop: 0, maxWidth: "62ch" } }, "Add a map, then draw routes on it and drop pins for places you need to visit. Pins tick off with your checklists."),
      h("div", { class: "map-grid" }, store.canUpload ? drop : null, cards)
    );
    const onPaste = (e) => {
      const item = [...e.clipboardData?.items || []].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      e.preventDefault();
      addMapFromBlob(item.getAsFile(), "Screenshot " + (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }
  function editor(ctx, map) {
    const s = store.state;
    ctx.setTitle(map.name);
    let prefs = { tool: "pan", color: COLORS[0], size: 6 };
    try {
      prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREF_KEY) || "{}") };
    } catch {
    }
    const storePrefs = () => {
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
      } catch {
      }
    };
    let placing = ctx.params[1] === "place" ? ctx.params[2] : null;
    const focusId = ctx.params[1] === "focus" ? ctx.params[2] : null;
    const view = { x: 0, y: 0, s: 1, fit: 1 };
    let spaceDown = false;
    const img = h("img", { src: resolveUrl(map.image), alt: map.name, draggable: false });
    const canvas = h("canvas");
    const g = canvas.getContext("2d");
    const markersEl = h("div", { class: "markers" });
    const stage = h("div", { class: "stage" }, img, canvas, markersEl);
    const zoomLbl = h("div", { class: "zoom-lvl" });
    const viewport = h(
      "div",
      { class: "viewport" },
      stage,
      zoomLbl,
      h(
        "div",
        { class: "zoom-ctl" },
        btn("", { icon: "zoomOut", small: true, aria: "Zoom out", onClick: () => zoomBy(1 / 1.3) }),
        btn("", { icon: "fit", small: true, aria: "Fit map to screen (0)", onClick: fit }),
        btn("", { icon: "zoomIn", small: true, aria: "Zoom in", onClick: () => zoomBy(1.3) })
      )
    );
    const TOOLS = [
      { id: "pan", label: "Move", icon: "hand", key: "V" },
      { id: "pen", label: "Draw", icon: "pen", key: "B" },
      { id: "eraser", label: "Erase", icon: "eraser", key: "E" },
      { id: "point", label: "Add pin", icon: "pin", key: "P" }
    ];
    const toolSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Tool" });
    const swatches = h("div", { class: "swatches", role: "radiogroup", "aria-label": "Pen colour" });
    const sizeIn = h("input", { type: "range", class: "size-range", min: 2, max: 40, value: prefs.size, "aria-label": "Brush size", oninput: (e) => {
      prefs.size = +e.target.value;
      storePrefs();
    } });
    const undoBtn = btn("", { icon: "undo", aria: "Undo drawing (Ctrl+Z)", onClick: undo });
    const doneBtn = btn("", { icon: map.hideDone ? "eyeOff" : "eye", aria: "Hide ticked pins" });
    doneBtn.onclick = () => {
      map.hideDone = !map.hideDone;
      save();
      renderDoneBtn();
      renderMarkers();
    };
    function renderDoneBtn() {
      doneBtn.replaceChildren(icon(map.hideDone ? "eyeOff" : "eye"));
      doneBtn.title = map.hideDone ? "Ticked pins are hidden \u2014 click to show them greyed out" : "Ticked pins show greyed out \u2014 click to hide them";
      doneBtn.setAttribute("aria-pressed", String(!!map.hideDone));
      doneBtn.classList.toggle("on", !!map.hideDone);
    }
    const toolbar = h(
      "div",
      { class: "toolbar" },
      toolSeg,
      h("i", { class: "sep" }),
      swatches,
      sizeIn,
      undoBtn,
      btn("", { icon: "trash", aria: "Clear drawing", onClick: clearDrawing }),
      h("i", { class: "sep" }),
      doneBtn
    );
    ctx.setActions(
      btn("Share map", { kind: "primary", icon: "external", onClick: shareDialog }),
      btn("Export PNG", { icon: "download", onClick: exportPng }),
      btn("", { icon: "dots", aria: "Map options", onClick: (e) => menu(e.currentTarget, [
        { label: "Rename map", icon: "edit", onClick: async () => {
          const v = await promptBox("Rename map", { value: map.name });
          if (v) {
            map.name = v;
            save();
            ctx.setTitle(v);
          }
        } },
        store.canUpload ? { label: "Replace image", icon: "image", onClick: replaceImage } : null,
        { label: "All maps", icon: "map", onClick: () => location.hash = "#/maps" },
        "-",
        { label: "Delete map", icon: "trash", danger: true, onClick: deleteMap }
      ]) })
    );
    const panel = h("aside", { class: "panel pt-panel", "aria-label": "Pins on this map" });
    ctx.view.append(h("div", { class: "editor" }, h("div", { class: "editor-main" }, toolbar, viewport), panel));
    function renderTools() {
      toolSeg.replaceChildren(...TOOLS.map((t) => h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(prefs.tool === t.id),
        class: prefs.tool === t.id ? "on" : "",
        title: `${t.label} (${t.key})`,
        onclick: () => setTool(t.id)
      }, icon(t.icon, 16), h("span", {}, t.label))));
      swatches.replaceChildren(...COLORS.map((c) => h("button", {
        type: "button",
        class: "swatch" + (prefs.color === c ? " on" : ""),
        style: { "--c": c },
        role: "radio",
        "aria-checked": String(prefs.color === c),
        "aria-label": "Colour " + c,
        onclick: () => {
          prefs.color = c;
          if (prefs.tool !== "pen") prefs.tool = "pen";
          storePrefs();
          renderTools();
        }
      })));
      viewport.className = "viewport tool-" + (placing ? "point" : prefs.tool);
    }
    function setTool(t) {
      prefs.tool = t;
      storePrefs();
      renderTools();
    }
    function apply() {
      stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
      stage.style.setProperty("--inv", String(1 / view.s));
      zoomLbl.textContent = Math.round(view.s / view.fit * 100) + "%";
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
      const k2 = ns / view.s;
      view.x = mx - (mx - view.x) * k2;
      view.y = my - (my - view.y) * k2;
      view.s = ns;
      apply();
    }
    function zoomBy(f) {
      const r = viewport.getBoundingClientRect();
      zoomAt(r.width / 2, r.height / 2, f);
    }
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
    const MAX_CANVAS = 4096;
    const k = Math.min(1, MAX_CANVAS / Math.max(map.w, map.h));
    canvas.width = Math.round(map.w * k);
    canvas.height = Math.round(map.h * k);
    stage.style.width = map.w + "px";
    stage.style.height = map.h + "px";
    if (map.drawing) {
      const d = new Image();
      d.onload = () => g.drawImage(d, 0, 0, canvas.width, canvas.height);
      d.src = resolveUrl(map.drawing);
    }
    const undoStack = [];
    const history = [];
    const UNDO_MAX = canvas.width * canvas.height > 6e6 ? 6 : 20;
    function snapshot() {
      undoStack.push(g.getImageData(0, 0, canvas.width, canvas.height));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
      history.push("draw");
      if (history.length > 60) history.shift();
      undoBtn.disabled = false;
    }
    function undo() {
      const last = history.pop();
      if (last && last !== "draw") {
        last.sub.point = { ...last.sub.point, ...last.from };
        save();
        renderMarkers(last.sub.id);
        toast("Moved " + last.sub.name + " back");
      } else {
        const snap = undoStack.pop();
        if (snap) {
          g.putImageData(snap, 0, 0);
          queueDrawingSave();
        }
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
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      try {
        const url = await upload(blob, map.drawing);
        map.drawing = url;
        map.drawingV = Date.now();
        save();
      } catch (e) {
        toast("Couldn\u2019t save the drawing: " + e.message, "error");
      }
    }
    async function clearDrawing() {
      if (!await confirmBox("Clear drawing?", "Everything drawn on this map is erased. Pins stay. You can undo this until you leave the map.", "Clear")) return;
      snapshot();
      g.clearRect(0, 0, canvas.width, canvas.height);
      queueDrawingSave();
    }
    let drag = null;
    viewport.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".zoom-ctl") || e.target.closest(".marker")) return;
      const panning = e.button === 1 || spaceDown || prefs.tool === "pan" && !placing && e.button === 0;
      if (panning) {
        e.preventDefault();
        drag = { kind: "pan", sx: e.clientX, sy: e.clientY, x: view.x, y: view.y, moved: false };
        viewport.classList.add("dragging");
        viewport.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      const f = toFrac(e);
      if (placing) {
        if (inside(f)) placeExisting(placing, f);
        return;
      }
      if (prefs.tool === "point") {
        if (inside(f)) addPointDialog(f);
        return;
      }
      if (prefs.tool === "pen" || prefs.tool === "eraser") {
        snapshot();
        drag = { kind: "draw", last: f };
        viewport.setPointerCapture(e.pointerId);
        stroke(f, f);
      }
    });
    viewport.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (drag.kind === "pan") {
        view.x = drag.x + (e.clientX - drag.sx);
        view.y = drag.y + (e.clientY - drag.sy);
        apply();
      } else {
        const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
        for (const ev of events.length ? events : [e]) {
          const f = toFrac(ev);
          stroke(drag.last, f);
          drag.last = f;
        }
      }
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.kind === "draw") queueDrawingSave();
      drag = null;
      viewport.classList.remove("dragging");
    };
    viewport.addEventListener("pointerup", endDrag);
    viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 15e-4));
    }, { passive: false });
    viewport.addEventListener("auxclick", (e) => e.preventDefault());
    function inside(f) {
      return f.x >= 0 && f.x <= 1 && f.y >= 0 && f.y <= 1;
    }
    function stroke(a, b) {
      const px = canvas.width / (map.w * view.s);
      g.save();
      g.globalCompositeOperation = prefs.tool === "eraser" ? "destination-out" : "source-over";
      g.strokeStyle = prefs.color;
      g.lineWidth = (prefs.tool === "eraser" ? prefs.size * 2.5 : prefs.size) * px;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(a.x * canvas.width, a.y * canvas.height);
      g.lineTo(b.x * canvas.width + 0.01, b.y * canvas.height);
      g.stroke();
      g.restore();
    }
    function visiblePoints() {
      const hidden = map.hiddenGroups || {};
      return pointsForMap(map.id).filter((p) => !hidden[p.item.id] && (!map.hideDone || !p.sub.done));
    }
    function renderMarkers(flashId) {
      markersEl.replaceChildren(...visiblePoints().map(({ list, item, sub }) => {
        const c = groupColor(item);
        const m = h(
          "button",
          {
            type: "button",
            class: "marker" + (sub.done ? " done" : "") + (sub.id === flashId ? " flash" : ""),
            style: { left: sub.point.x * 100 + "%", top: sub.point.y * 100 + "%", "--c": c },
            title: `${sub.name} \u2014 ${item.name}. Click to ${sub.done ? "untick" : "tick off"}, drag to move, right-click for options`,
            "aria-label": `${sub.name}, ${sub.done ? "done" : "not done"}`,
            onclick: (e) => {
              e.stopPropagation();
              if (m.dataset.dragged) {
                delete m.dataset.dragged;
                return;
              }
              toggle(sub);
            },
            oncontextmenu: (e) => {
              e.preventDefault();
              pinMenu({ x: e.clientX, y: e.clientY }, list, item, sub);
            }
          },
          h("span", { class: "lbl" }, sub.name),
          h("span", { class: "pin" }, pinSvg(c, sub.done))
        );
        m.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          if (e.button !== 0) return;
          startPinDrag(e, m, sub);
        });
        return m;
      }));
    }
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
          el.classList.add("moving");
          viewport.classList.add("pin-moving");
        }
        const f = toFrac(ev);
        const x = Math.min(1, Math.max(0, from.x + f.x - grab.x));
        const y = Math.min(1, Math.max(0, from.y + f.y - grab.y));
        el.style.left = x * 100 + "%";
        el.style.top = y * 100 + "%";
        el._pos = { x, y };
      };
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        viewport.classList.remove("pin-moving");
        el.classList.remove("moving");
        if (!moving || !el._pos) return;
        el.dataset.dragged = "1";
        setTimeout(() => {
          delete el.dataset.dragged;
        }, 50);
        sub.point = { ...sub.point, x: el._pos.x, y: el._pos.y };
        history.push({ sub, from });
        undoBtn.disabled = false;
        save();
        setTimeout(() => renderMarkers(), 0);
      };
      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    }
    function pinSvg(c, done) {
      const sv = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      sv.setAttribute("viewBox", "0 0 24 24");
      sv.innerHTML = `<path d="M12 22.5s-7.5-6.8-7.5-12.6a7.5 7.5 0 0 1 15 0c0 5.8-7.5 12.6-7.5 12.6z" fill="${c}" stroke="#05060b" stroke-width="1.4"/>` + (done ? '<path d="m8.6 10 2.4 2.4 4.4-4.6" fill="none" stroke="#05060b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="12" cy="9.9" r="2.6" fill="#05060b"/>');
      return sv;
    }
    function toggle(sub) {
      sub.done = !sub.done;
      save();
      renderMarkers();
      renderPanel();
      if (sub.done && map.hideDone) toast(`${sub.name} ticked off \u2014 pin hidden`, "ok");
    }
    function pinMenu(anchor, list, item, sub) {
      menu(anchor, [
        { label: sub.done ? "Mark as not done" : "Tick off", icon: "check", onClick: () => toggle(sub) },
        { label: "Rename", icon: "edit", onClick: async () => {
          const v = await promptBox("Rename pin", { value: sub.name });
          if (v) {
            sub.name = v;
            save();
            renderMarkers();
            renderPanel();
          }
        } },
        { label: "Move pin", icon: "target", onClick: () => startPlacing(sub.id) },
        { label: `Rename group \u201C${item.name}\u201D`, icon: "edit", onClick: () => renameGroup(item) },
        { label: `Colour of ${item.name}`, icon: "pin", onClick: () => editGroupColor(item, () => {
          renderMarkers();
          renderPanel();
        }) },
        { label: "Open checklist", icon: "list", onClick: () => location.hash = "#/lists/" + list.id },
        "-",
        { label: "Remove from map", icon: "x", onClick: () => {
          sub.point = null;
          save();
          renderMarkers();
          renderPanel();
        } },
        { label: "Delete entry", icon: "trash", danger: true, onClick: async () => {
          if (!await confirmBox("Delete entry?", `\u201C${sub.name}\u201D is removed from ${item.name} in ${list.name}.`)) return;
          item.subs = item.subs.filter((x) => x !== sub);
          save();
          renderMarkers();
          renderPanel();
        } }
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
      if (history.replaceState) history.replaceState(null, "", "#/maps/" + map.id);
      if (found) {
        found.sub.point = { mapId: map.id, x: f.x, y: f.y };
        if (!found.list.mapId) found.list.mapId = map.id;
        save();
        toast(`Pinned ${found.sub.name}`, "ok");
      }
      renderTools();
      renderMarkers();
      renderPanel();
    }
    function addPointDialog(f) {
      const groups = allGroups().sort((a, b) => (b.list.mapId === map.id) - (a.list.mapId === map.id));
      const nameIn = h("input", { class: "input", placeholder: "e.g. Bridge, Outpost, Loot room", autofocus: true });
      const groupSel = h(
        "select",
        { class: "select" },
        groups.map(({ list, item }) => h("option", { value: item.id, selected: item.id === map.lastGroup }, `${list.name} \u203A ${item.name}`)),
        h("option", { value: "__new", selected: !groups.length || map.lastGroup === "__new" }, "+ New named list\u2026")
      );
      const newName = h("input", { class: "input", value: "Locations" });
      const listSel = h(
        "select",
        { class: "select" },
        h("option", { value: "__new" }, `+ New checklist \u201C${map.name}\u201D`),
        s.lists.map((l) => h("option", { value: l.id, selected: l.mapId === map.id }, l.name))
      );
      const picker = colorPicker(nextPinColor());
      const newBox = h(
        "div",
        { style: { display: "grid", gap: "14px" } },
        h("label", { class: "field" }, h("span", {}, "Named list"), newName),
        h("div", { class: "field" }, h("span", {}, "Pin colour"), picker.el),
        h("label", { class: "field" }, h("span", {}, "In checklist"), listSel)
      );
      const sync = () => {
        newBox.style.display = groupSel.value === "__new" ? "" : "none";
      };
      groupSel.onchange = sync;
      sync();
      let close;
      const submit = () => {
        const name = nameIn.value.trim();
        if (!name) return nameIn.focus();
        let item;
        if (groupSel.value === "__new") {
          const list = listSel.value === "__new" ? newList(map.name) : s.lists.find((l) => l.id === listSel.value);
          if (!list.mapId) list.mapId = map.id;
          item = newItem(list, { type: "multi", name: newName.value.trim() || "Locations", subs: [], color: picker.value });
        } else {
          const found = allGroups().find((x) => x.item.id === groupSel.value);
          item = found.item;
          if (!found.list.mapId) found.list.mapId = map.id;
        }
        map.lastGroup = item.id;
        if (map.hiddenGroups?.[item.id]) delete map.hiddenGroups[item.id];
        newSub(item, name, { mapId: map.id, x: f.x, y: f.y });
        close(true);
        renderMarkers();
        renderPanel();
      };
      close = modal({
        title: "Add pin",
        body: h(
          "form",
          { style: { display: "grid", gap: "14px" }, onsubmit: (e) => {
            e.preventDefault();
            submit();
          } },
          h("label", { class: "field" }, h("span", {}, "Name"), nameIn),
          h("label", { class: "field" }, h("span", {}, "Add to"), groupSel),
          newBox,
          h("button", { type: "submit", hidden: true })
        ),
        actions: [{ label: "Cancel", onClick: (c) => c() }, { label: "Add pin", kind: "primary", icon: "pin", onClick: submit }]
      });
    }
    let foldTimer = null;
    async function renameGroup(item) {
      const v = await promptBox("Rename group", { label: "Group name", value: item.name, okLabel: "Rename" });
      if (v && v !== item.name) {
        item.name = v;
        save();
        renderMarkers();
        renderPanel();
        toast("Renamed to " + v, "ok");
      }
    }
    function groupMenu(anchor, item, off) {
      const hidden = map.hiddenGroups || (map.hiddenGroups = {});
      menu(anchor, [
        { label: "Rename group", icon: "edit", onClick: () => renameGroup(item) },
        { label: "Pin colour", icon: "pin", onClick: () => editGroupColor(item, () => {
          renderMarkers();
          renderPanel();
        }) },
        { label: off ? "Show on map" : "Hide on map", icon: off ? "eye" : "eyeOff", onClick: () => {
          if (off) delete hidden[item.id];
          else hidden[item.id] = true;
          save();
          renderMarkers();
          renderPanel();
        } },
        { label: "Show only this group", icon: "target", onClick: () => {
          for (const g2 of pointsForMap(map.id)) if (g2.item.id !== item.id) hidden[g2.item.id] = true;
          delete hidden[item.id];
          save();
          renderMarkers();
          renderPanel();
        } }
      ]);
    }
    const COLLAPSE_KEY = "gamehelper-collapsed-" + map.id;
    let collapsed = /* @__PURE__ */ new Set();
    try {
      collapsed = new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "[]"));
    } catch {
    }
    const saveCollapsed = () => {
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
      } catch {
      }
    };
    function renderPanel() {
      const pts = pointsForMap(map.id);
      const unplaced = unplacedForMap(map.id);
      const done = pts.filter((p) => p.sub.done).length;
      const groups = /* @__PURE__ */ new Map();
      for (const p of pts) {
        if (!groups.has(p.item)) groups.set(p.item, { list: p.list, subs: [] });
        groups.get(p.item).subs.push(p.sub);
      }
      const order = map.groupOrder || [];
      const rank = (it) => {
        const i = order.indexOf(it.id);
        return i < 0 ? 1e9 : i;
      };
      const groupList = [...groups.entries()].sort(([a], [b]) => rank(a) - rank(b));
      let scrollEl = null;
      const pinRows = (item, subs, row) => {
        const rows = h("div", { class: "pt-rows" }, subs.map(row));
        sortable(rows, { items: ".pt-row", scroller: () => scrollEl, onEnd: (ids) => {
          item.subs = applyOrder(item.subs, ids);
          save();
        } });
        return rows;
      };
      const placingSub = placing ? findSub(placing)?.sub : null;
      const hidden = map.hiddenGroups || (map.hiddenGroups = {});
      const anyHidden = [...groups.keys()].some((it) => hidden[it.id]);
      const setHidden = (ids, on) => {
        for (const id of ids) {
          if (on) hidden[id] = true;
          else delete hidden[id];
        }
        save();
        renderMarkers();
        renderPanel();
      };
      panel.replaceChildren(...[
        h(
          "div",
          { class: "panel-head" },
          h("h3", {}, "Pins"),
          h("span", { class: "muted small num" }, `${done}/${pts.length} done`),
          groups.size ? btn(anyHidden ? "Show all" : "Hide all", {
            small: true,
            kind: "flat",
            icon: anyHidden ? "eye" : "eyeOff",
            onClick: () => setHidden([...groups.keys()].map((it) => it.id), !anyHidden)
          }) : null
        ),
        placingSub ? h(
          "div",
          { class: "place-hint" },
          icon("pin", 16),
          h("span", { class: "grow" }, `Click the map to place \u201C${placingSub.name}\u201D.`),
          btn("Cancel", { small: true, kind: "flat", onClick: () => {
            placing = null;
            renderTools();
            renderPanel();
          } })
        ) : null,
        h(
          "div",
          { class: "pt-scroll" },
          !pts.length && !unplaced.length ? h("p", { class: "muted small", style: { margin: 0 } }, "Pick \u201CAdd pin\u201D and click the map to mark a place. Each pin is an entry in a checklist, so ticking it off in either place hides it here.") : null,
          groupList.map(([item, { list, subs }]) => {
            const c = groupColor(item);
            const off = !!hidden[item.id];
            const shut = collapsed.has(item.id);
            return h(
              "div",
              { "data-id": item.id, class: "pt-group" + (off ? " off" : "") + (shut ? " closed" : "") },
              h(
                "h4",
                {},
                h("button", {
                  type: "button",
                  class: "dot dot-btn",
                  style: { "--c": c },
                  title: "Change pin colour",
                  "aria-label": "Change pin colour for " + item.name,
                  onclick: () => editGroupColor(item, () => {
                    renderMarkers();
                    renderPanel();
                  })
                }),
                h("button", {
                  type: "button",
                  class: "g-name",
                  "aria-expanded": String(!shut),
                  title: (shut ? "Show the list" : "Fold the list") + " \xB7 double-click to rename",
                  onclick: (e) => {
                    if (e.detail > 1) return;
                    clearTimeout(foldTimer);
                    foldTimer = setTimeout(() => {
                      shut ? collapsed.delete(item.id) : collapsed.add(item.id);
                      saveCollapsed();
                      renderPanel();
                    }, 220);
                  },
                  ondblclick: () => {
                    clearTimeout(foldTimer);
                    renameGroup(item);
                  },
                  oncontextmenu: (e) => {
                    e.preventDefault();
                    groupMenu({ x: e.clientX, y: e.clientY }, item, off);
                  }
                }, item.name),
                h("span", {}, `${subs.filter((x) => x.done).length}/${subs.length}`),
                btn("", {
                  icon: off ? "eyeOff" : "eye",
                  small: true,
                  kind: off ? "ghost" : "flat",
                  aria: (off ? "Show " : "Hide ") + item.name + " on the map",
                  attrs: { "aria-pressed": String(!off), title: off ? "Hidden on the map \u2014 click to show" : "Hide this group on the map" },
                  onClick: () => setHidden([item.id], !off)
                }),
                btn("", { icon: "dots", small: true, kind: "flat", aria: item.name + " options", onClick: (e) => groupMenu(e.currentTarget, item, off) })
              ),
              shut ? null : pinRows(item, subs, (sub) => h(
                "div",
                { "data-id": sub.id, class: "pt-row" + (sub.done ? " done" : "") },
                h("button", { type: "button", class: "tick" + (sub.done ? " on" : ""), role: "checkbox", "aria-checked": String(sub.done), "aria-label": sub.name, onclick: () => toggle(sub) }, icon("check", 14)),
                h("button", { type: "button", class: "n", title: "Show on map", onclick: () => {
                  centerOn(sub.point.x, sub.point.y, Math.max(view.s, view.fit * 2));
                  if (sub.done && map.hideDone) {
                    map.hideDone = false;
                    renderDoneBtn();
                  }
                  renderMarkers(sub.id);
                } }, sub.name),
                btn("", { icon: "dots", small: true, kind: "flat", aria: "Pin options", onClick: (e) => pinMenu(e.currentTarget, list, item, sub) })
              ))
            );
          }),
          unplaced.length ? h(
            "div",
            { class: "pt-group" },
            h("h4", {}, h("span", {}, "Not on the map yet"), h("span", {}, String(unplaced.length))),
            unplaced.map(({ item, sub }) => h(
              "div",
              { class: "pt-row" + (sub.done ? " done" : "") },
              h("span", { class: "n", title: item.name }, sub.name),
              btn("Place", { small: true, icon: "pin", onClick: () => startPlacing(sub.id) })
            ))
          ) : null
        ),
        h("p", { class: "muted small", style: { margin: 0 } }, "Click a pin to tick it off (it turns grey), drag it on the map to move it (Ctrl + Z undoes a move). Right-click a pin for more. Hold and drag a group or pin in this list to reorder.")
      ].filter(Boolean));
      scrollEl = panel.querySelector(".pt-scroll");
      sortable(scrollEl, { items: ".pt-group[data-id]", scroller: scrollEl, onEnd: (ids) => {
        map.groupOrder = ids;
        save();
      } });
    }
    function shareDialog() {
      const groups = mapGroups(map);
      if (!groups.length) return toast("Add some pins first \u2014 the shared map is the picture plus its pins", "error");
      const hidden = map.hiddenGroups || {};
      const boxes = groups.map((g2) => {
        const cb = h("input", { type: "checkbox", id: "share-" + g2.id, checked: !hidden[g2.id] });
        return { g: g2, cb, row: h("label", { class: "share-row", for: "share-" + g2.id }, cb, h("i", { class: "dot", style: { "--c": g2.color } }), h("span", { class: "grow" }, g2.name), h("span", { class: "muted small" }, `${g2.pins.length} pins`)) };
      });
      const doneCb = h("input", { type: "checkbox", id: "share-done" });
      let busy = false;
      modal({
        title: "Share " + map.name,
        body: h(
          "div",
          { class: "share-body" },
          h("p", { class: "muted" }, "Makes one file with this map, your drawing and the pin groups you pick. Attach the file in a Claude chat and ask Claude to publish it. You get a link that works for anyone you share it with. Your checklists and players aren\u2019t included."),
          h("div", { class: "share-list" }, boxes.map((b) => b.row)),
          h("label", { class: "share-row", for: "share-done" }, doneCb, h("span", { class: "grow" }, "Start with my ticked pins already ticked"))
        ),
        actions: [
          { label: "Cancel", onClick: (c) => c() },
          { label: "Save share file", kind: "primary", icon: "download", onClick: async (close) => {
            if (busy) return;
            const groupIds = boxes.filter((b) => b.cb.checked).map((b) => b.g.id);
            if (!groupIds.length) return toast("Pick at least one pin group", "error");
            busy = true;
            try {
              toast("Building the share file\u2026");
              const html = await buildShareHtml(map, { img, drawCanvas: canvas, groupIds, includeDone: doneCb.checked });
              const file = map.name.replace(/[\\/:*?"<>|]+/g, "_") + " - shared map.html";
              const ok = await download(file, html);
              close();
              if (ok) modal({
                title: "Share file saved",
                body: h(
                  "div",
                  { class: "share-body" },
                  h("p", {}, `\u201C${file}\u201D is in your downloads.`),
                  h("p", { class: "muted" }, "Open a Claude chat, attach the file and send: \u201CPublish this map as a link.\u201D Claude gives you a link. Everyone who opens it can pan, zoom, hide groups and tick pins off for themselves.")
                ),
                actions: [{ label: "Got it", kind: "primary", onClick: (c) => c() }]
              });
            } catch (e) {
              toast("Couldn\u2019t build the share file: " + e.message, "error");
            }
            busy = false;
          } }
        ]
      });
    }
    async function exportPng() {
      const out = document.createElement("canvas");
      const k2 = Math.min(1, 8192 / Math.max(map.w, map.h));
      out.width = Math.round(map.w * k2);
      out.height = Math.round(map.h * k2);
      const o = out.getContext("2d");
      o.drawImage(img, 0, 0, out.width, out.height);
      o.drawImage(canvas, 0, 0, out.width, out.height);
      const base = Math.max(out.width, out.height) / 90;
      o.font = `600 ${Math.round(base * 1.05)}px "Chakra Petch", sans-serif`;
      o.textBaseline = "middle";
      for (const { item, sub } of visiblePoints()) {
        const x = sub.point.x * out.width, y = sub.point.y * out.height, c = groupColor(item);
        const pc = sub.done ? "#6b7089" : c;
        o.globalAlpha = sub.done ? 0.8 : 1;
        o.beginPath();
        o.arc(x, y, base * 0.55, 0, Math.PI * 2);
        o.fillStyle = pc;
        o.fill();
        o.lineWidth = base * 0.18;
        o.strokeStyle = "#05060b";
        o.stroke();
        const tw = o.measureText(sub.name).width, pad = base * 0.4;
        const bx = x - tw / 2 - pad, by = y - base * 2.1, bh = base * 1.35;
        o.fillStyle = "rgba(5,6,11,.85)";
        o.fillRect(bx, by, tw + pad * 2, bh);
        o.strokeStyle = pc;
        o.lineWidth = Math.max(1, base * 0.08);
        o.strokeRect(bx, by, tw + pad * 2, bh);
        o.fillStyle = sub.done ? "#8c92ae" : "#e9ecf7";
        o.fillText(sub.name, bx + pad, by + bh / 2);
        if (sub.done) {
          o.fillRect(bx + pad, by + bh / 2 - Math.max(1, base * 0.06), tw, Math.max(1.5, base * 0.12));
        }
      }
      o.globalAlpha = 1;
      out.toBlob(async (b) => {
        if (!b) return toast("Couldn\u2019t export this map", "error");
        const ok = await download(map.name.replace(/[\\/:*?"<>|]+/g, "_") + ".png", b);
        if (ok) toast("Exported " + map.name + ".png", "ok");
      }, "image/png");
    }
    function replaceImage() {
      const inp = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" });
      inp.onchange = async () => {
        const f = inp.files[0];
        if (!f) return;
        try {
          const { w, h: hh } = await readImageSize(f);
          toast("Uploading map\u2026");
          const old = map.image;
          map.image = await upload(await prepareImage(f));
          map.w = w;
          map.h = hh;
          save();
          if (old && old !== map.image) deleteUpload(old);
          ctx.rerender();
        } catch (e) {
          toast(e.message, "error");
        }
      };
      inp.click();
    }
    async function deleteMap() {
      const n = pointsForMap(map.id).length;
      if (!await confirmBox("Delete map?", `\u201C${map.name}\u201D and its drawing are deleted.${n ? ` Its ${n} pins stay in your checklists, just without a spot on a map.` : ""}`)) return;
      for (const p of pointsForMap(map.id)) p.sub.point = null;
      for (const l of s.lists) if (l.mapId === map.id) l.mapId = null;
      s.maps = s.maps.filter((m) => m !== map);
      save();
      deleteUpload(map.image);
      deleteUpload(map.drawing);
      location.hash = "#/maps";
    }
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select, [contenteditable]") || document.querySelector(".modal-back")) return;
      if (e.code === "Space") {
        if (!spaceDown) {
          spaceDown = true;
          viewport.classList.add("tool-pan");
        }
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = { v: "pan", b: "pen", e: "eraser", p: "point" }[e.key.toLowerCase()];
      if (t) return setTool(t);
      if (e.key === "+" || e.key === "=") zoomBy(1.3);
      else if (e.key === "-") zoomBy(1 / 1.3);
      else if (e.key === "0") fit();
      else if (e.key === "Escape" && placing) {
        placing = null;
        renderTools();
        renderPanel();
      }
    };
    const onKeyUp = (e) => {
      if (e.code === "Space") {
        spaceDown = false;
        renderTools();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    const start2 = () => {
      if (!map.w) {
        map.w = img.naturalWidth;
        map.h = img.naturalHeight;
        save();
      }
      fit();
      const target = focusId && findSub(focusId);
      if (target?.sub.point) {
        if (target.sub.done && map.hideDone) {
          map.hideDone = false;
          renderDoneBtn();
        }
        centerOn(target.sub.point.x, target.sub.point.y, view.fit * 2.2);
        renderMarkers(target.sub.id);
      }
    };
    if (img.complete && img.naturalWidth) requestAnimationFrame(start2);
    else img.onload = start2;
    img.onerror = () => toast("This map\u2019s image is missing in this browser \u2014 use Replace image in the map menu", "error");
    renderTools();
    renderDoneBtn();
    renderMarkers();
    renderPanel();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", onKeyUp);
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveDrawing();
      }
    };
  }

  // js/lists.js
  var lists_exports = {};
  __export(lists_exports, {
    mount: () => mount4
  });
  var TYPE_KEY = "gamehelper-new-type";
  function mount4(ctx) {
    const s = store.state;
    ctx.setTitle("Checklists");
    ctx.setActions(btn("New checklist", { kind: "primary", icon: "plus", onClick: createList }));
    async function createList() {
      const name = await promptBox("New checklist", { label: "Name", placeholder: "e.g. Wipe day, Story act 2, Daily challenges", okLabel: "Create" });
      if (!name) {
        if (ctx.params[0] === "new") location.hash = "#/lists";
        return;
      }
      const l = newList(name);
      location.hash = "#/lists/" + l.id;
    }
    if (ctx.params[0] === "new") {
      setTimeout(createList, 0);
    }
    if (!s.lists.length) {
      ctx.view.append(empty(
        "No checklists yet",
        "Make one for each game or session. Add simple tasks, counters like \u201C6 kills\u201D, or named lists like locations to visit.",
        btn("New checklist", { kind: "primary", icon: "plus", onClick: createList })
      ));
      return;
    }
    const list = listById(ctx.params[0]) || s.lists[0];
    ctx.setTitle(list.name);
    const nav = h("nav", { class: "list-nav", "aria-label": "Checklists" });
    const main = h("section", { class: "list-main" });
    ctx.view.append(h("div", { class: "split" }, nav, main));
    function renderNav() {
      nav.replaceChildren(...s.lists.map((l) => {
        const p = listProgress(l);
        return h(
          "a",
          { href: "#/lists/" + l.id, "data-id": l.id, class: l === list ? "active" : "", "aria-current": l === list ? "page" : null },
          h("div", { class: "ln-top" }, h("b", {}, l.name), h("span", { class: "num" }, `${p.done}/${p.total}`)),
          progressBar(Math.round(p.pct * 100), 100)
        );
      }));
    }
    let type = "check";
    try {
      type = localStorage.getItem(TYPE_KEY) || "check";
    } catch {
    }
    const TYPES = [
      { id: "check", label: "Checkbox", icon: "check" },
      { id: "count", label: "Counter", icon: "plus" },
      { id: "multi", label: "Named list", icon: "list" }
    ];
    const seg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Task type" });
    const nameIn = h("input", { class: "input grow", "aria-label": "Task name" });
    const targetIn = h("input", { class: "input", type: "number", min: 1, max: 1e5, value: 6, style: { width: "110px" }, "aria-label": "Target" });
    const subsIn = h("textarea", { class: "input", placeholder: "Bridge, Ocean, Outpost \u2014 separate with commas or new lines", "aria-label": "Entries" });
    const hint = h("p", { class: "hint" });
    const reorderHint = h("p", { class: "muted small", style: { margin: "-8px 0 12px" } }, "Hold and drag a task, an entry or a checklist on the left to change the order.");
    const extra = h("div", { class: "adder-row" });
    let picker = null;
    function renderSeg() {
      seg.replaceChildren(...TYPES.map((t) => h("button", {
        type: "button",
        role: "radio",
        "aria-checked": String(type === t.id),
        class: type === t.id ? "on" : "",
        onclick: () => {
          type = t.id;
          try {
            localStorage.setItem(TYPE_KEY, type);
          } catch {
          }
          renderSeg();
        }
      }, icon(t.icon, 15), t.label)));
      nameIn.placeholder = { check: "Task, e.g. Craft a workbench", count: "What to count, e.g. Get kills", multi: "List name, e.g. Visit locations" }[type];
      targetIn.style.display = type === "count" ? "" : "none";
      picker = colorPicker(nextPinColor());
      extra.replaceChildren(...type === "multi" ? [subsIn, h("div", { class: "field", style: { width: "100%" } }, h("span", {}, "Pin colour on the map"), picker.el)] : []);
      extra.style.display = type === "multi" ? "" : "none";
      hint.textContent = {
        check: "One click marks it done.",
        count: "Each click adds one until you reach the target.",
        multi: list.mapId ? `Tick entries off one by one. You can pin each entry on ${mapById(list.mapId)?.name || "the linked map"} and it hides there once done.` : "Tick entries off one by one. Link a map to this checklist to pin entries on it."
      }[type];
    }
    const adder = h(
      "form",
      { class: "adder", onsubmit: (e) => {
        e.preventDefault();
        const name = nameIn.value.trim();
        if (!name) return nameIn.focus();
        const subs = subsIn.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
        newItem(list, { type, name, target: targetIn.value, subs, color: type === "multi" ? picker?.value : void 0 });
        if (type === "multi") renderSeg();
        nameIn.value = "";
        subsIn.value = "";
        renderItems();
        renderNav();
        nameIn.focus();
      } },
      h("div", { class: "adder-row" }, seg),
      h("div", { class: "adder-row" }, nameIn, targetIn, h("button", { type: "submit", class: "btn btn-primary" }, icon("plus"), h("span", {}, "Add task"))),
      extra,
      hint
    );
    const title = h("input", {
      class: "list-title",
      value: list.name,
      "aria-label": "Checklist name",
      onchange: (e) => {
        const v = e.target.value.trim();
        if (v) {
          list.name = v;
          save();
          ctx.setTitle(v);
          renderNav();
        } else e.target.value = list.name;
      },
      onkeydown: (e) => {
        if (e.key === "Enter") e.target.blur();
      }
    });
    const mapSel = h(
      "select",
      {
        class: "select",
        style: { width: "auto", minWidth: "180px", height: "38px" },
        "aria-label": "Linked map",
        onchange: (e) => {
          list.mapId = e.target.value || null;
          save();
          renderSeg();
          renderItems();
        }
      },
      h("option", { value: "" }, "No linked map"),
      s.maps.map((m) => h("option", { value: m.id, selected: m.id === list.mapId }, "Map: " + m.name))
    );
    const hideBtn = btn("", { icon: list.hideDone ? "eyeOff" : "eye", kind: "ghost", aria: "Show or hide finished tasks" });
    hideBtn.title = list.hideDone ? "Show finished tasks" : "Hide finished tasks";
    hideBtn.onclick = () => {
      list.hideDone = !list.hideDone;
      save();
      ctx.rerender();
    };
    const moreBtn = btn("", { icon: "dots", aria: "Checklist options", onClick: (e) => menu(e.currentTarget, [
      list.mapId ? { label: "Open linked map", icon: "map", onClick: () => location.hash = "#/maps/" + list.mapId } : null,
      { label: "Reset all progress", icon: "reset", onClick: async () => {
        if (!await confirmBox("Reset progress?", "Every task in this checklist goes back to not done. Tasks and map pins stay.", "Reset")) return;
        for (const it of list.items) {
          it.done = false;
          it.count = 0;
          it.subs.forEach((x) => x.done = false);
        }
        save();
        renderItems();
        renderNav();
      } },
      { label: "Duplicate checklist", icon: "copy", onClick: () => {
        const copy = JSON.parse(JSON.stringify(list));
        const re = (o) => {
          o.id = Math.random().toString(36).slice(2, 12);
          return o;
        };
        re(copy);
        copy.name = list.name + " (copy)";
        copy.items.forEach((it) => {
          re(it);
          it.done = false;
          it.count = 0;
          it.subs.forEach((x) => {
            re(x);
            x.done = false;
            x.point = null;
          });
        });
        s.lists.push(copy);
        save();
        location.hash = "#/lists/" + copy.id;
      } },
      "-",
      { label: "Delete checklist", icon: "trash", danger: true, onClick: async () => {
        if (!await confirmBox("Delete checklist?", `\u201C${list.name}\u201D and its ${list.items.length} tasks will be deleted, including any map pins they own.`)) return;
        s.lists = s.lists.filter((l) => l !== list);
        save();
        location.hash = "#/lists";
      } }
    ]) });
    const meta = h("div", { class: "list-meta" });
    const itemsEl = h("div", { class: "items" });
    sortable(itemsEl, { items: ".item", onEnd: (ids) => {
      list.items = applyOrder(list.items, ids);
      save();
    } });
    sortable(nav, { items: "a", onEnd: (ids) => {
      s.lists = applyOrder(s.lists, ids);
      save();
    } });
    main.append(h("div", { class: "list-head" }, title, mapSel, hideBtn, moreBtn), meta, adder, reorderHint, itemsEl);
    function renderMeta() {
      const p = listProgress(list);
      meta.replaceChildren(progressBar(Math.round(p.pct * 100), 100), h("span", { class: "num" }, `${p.done} of ${p.total} done`));
    }
    function touched() {
      save();
      renderMeta();
      renderNav();
    }
    function itemMenu(e, it) {
      menu(e.currentTarget, [
        { label: "Rename", icon: "edit", onClick: async () => {
          const v = await promptBox("Rename task", { value: it.name });
          if (v) {
            it.name = v;
            save();
            renderItems();
          }
        } },
        it.type === "count" ? { label: "Change target", icon: "target", onClick: async () => {
          const v = await promptBox("Change target", { label: "Target", value: String(it.target) });
          const n = parseInt(v, 10);
          if (n > 0) {
            it.target = n;
            save();
            renderItems();
            renderNav();
          }
        } } : null,
        it.type === "multi" ? { label: "Pin colour", icon: "pin", onClick: () => editGroupColor(it, () => renderItems()) } : null,
        it.type === "multi" ? { label: "Untick all entries", icon: "reset", onClick: () => {
          it.subs.forEach((x) => x.done = false);
          save();
          renderItems();
          renderNav();
        } } : null,
        { label: "Move up", icon: "upload", onClick: () => move(it, -1) },
        { label: "Move down", icon: "download", onClick: () => move(it, 1) },
        "-",
        { label: "Delete task", icon: "trash", danger: true, onClick: async () => {
          if (it.type === "multi" && it.subs.some((x) => x.point) && !await confirmBox("Delete task?", "Its pins will be removed from the map too.")) return;
          list.items = list.items.filter((x) => x !== it);
          save();
          renderItems();
          renderNav();
        } }
      ]);
    }
    function move(it, d) {
      const i = list.items.indexOf(it), j = i + d;
      if (j < 0 || j >= list.items.length) return;
      [list.items[i], list.items[j]] = [list.items[j], list.items[i]];
      save();
      renderItems();
    }
    function renderCheck(it) {
      const el = h("div", { class: "item" + (it.done ? " done" : "") });
      const tick = h("button", {
        type: "button",
        class: "tick" + (it.done ? " on" : ""),
        role: "checkbox",
        "aria-checked": String(!!it.done),
        "aria-label": it.name,
        onclick: () => {
          it.done = !it.done;
          touched();
          swap(el, it);
        }
      }, icon("check", 18));
      el.append(tick, h("div", {}, h("div", { class: "item-name" }, it.name)), btn("", { icon: "dots", small: true, kind: "flat", aria: "Task options", onClick: (e) => itemMenu(e, it) }));
      return el;
    }
    function renderCount(it) {
      const done = itemDone(it);
      const el = h("div", { class: "item" + (done ? " done" : ""), style: { gridTemplateColumns: "1fr auto auto" } });
      const change = (d) => {
        it.count = Math.max(0, (it.count || 0) + d);
        touched();
        swap(el, it);
      };
      el.append(
        h(
          "div",
          { class: "count-body", title: "Click to add one", onclick: () => change(1) },
          h("div", { class: "item-name" }, it.name),
          progressBar(Math.min(it.count, it.target), it.target)
        ),
        h(
          "div",
          { class: "counter" },
          btn("", { icon: "minus", small: true, aria: "Remove one", onClick: () => change(-1) }),
          h("span", { class: "num", "aria-live": "polite" }, String(it.count || 0), h("small", {}, "/" + it.target)),
          btn("", { icon: "plus", small: true, aria: "Add one", onClick: () => change(1) })
        ),
        btn("", { icon: "dots", small: true, kind: "flat", aria: "Task options", onClick: (e) => itemMenu(e, it) })
      );
      return el;
    }
    function renderMulti(it) {
      const p = itemProgress(it);
      const el = h("div", { class: "item multi" + (itemDone(it) ? " done" : "") });
      const color = groupColor(it);
      const subs = h("div", { class: "subs" });
      sortable(subs, { items: ".sub", axis: "xy", onEnd: (ids) => {
        it.subs = applyOrder(it.subs, ids);
        save();
      } });
      const draw = () => {
        const shown = list.hideDone ? it.subs.filter((x) => !x.done) : it.subs;
        subs.replaceChildren(...shown.map((sub) => {
          const chip = h(
            "button",
            {
              type: "button",
              "data-id": sub.id,
              class: "sub" + (sub.done ? " on" : ""),
              role: "checkbox",
              "aria-checked": String(sub.done),
              title: sub.point ? `Pinned on ${mapById(sub.point.mapId)?.name || "a map"} \xB7 right-click for options` : "Right-click for options",
              onclick: () => {
                sub.done = !sub.done;
                touched();
                swap(el, it);
              },
              oncontextmenu: (e) => {
                e.preventDefault();
                subMenu({ x: e.clientX, y: e.clientY }, sub);
              }
            },
            h("span", { class: "box" }, icon("check", 13)),
            h("span", { class: "lbl" }, sub.name),
            sub.point ? h("span", { class: "pinmark", style: { "--c": color } }, icon("pin", 15)) : null
          );
          return chip;
        }));
      };
      const subMenu = (anchor, sub) => menu(anchor, [
        sub.point ? { label: "Show on map", icon: "map", onClick: () => location.hash = `#/maps/${sub.point.mapId}/focus/${sub.id}` } : null,
        list.mapId && !sub.point ? { label: "Place on map", icon: "pin", onClick: () => location.hash = `#/maps/${list.mapId}/place/${sub.id}` } : null,
        sub.point ? { label: "Remove from map", icon: "x", onClick: () => {
          sub.point = null;
          save();
          swap(el, it);
        } } : null,
        { label: "Rename", icon: "edit", onClick: async () => {
          const v = await promptBox("Rename entry", { value: sub.name });
          if (v) {
            sub.name = v;
            save();
            swap(el, it);
          }
        } },
        { label: "Delete entry", icon: "trash", danger: true, onClick: () => {
          it.subs = it.subs.filter((x) => x !== sub);
          touched();
          swap(el, it);
        } }
      ]);
      draw();
      const addIn = h("input", { class: "input", placeholder: "Add entry", "aria-label": `Add entry to ${it.name}` });
      const addForm = h("form", { class: "sub-add", onsubmit: (e) => {
        e.preventDefault();
        const names = addIn.value.split(",").map((x) => x.trim()).filter(Boolean);
        if (!names.length) return;
        names.forEach((n2) => newSub(it, n2));
        touched();
        const n = renderItem(it);
        el.replaceWith(n);
        n.querySelector(".sub-add input")?.focus();
      } }, addIn, btn("", { icon: "plus", small: true, aria: "Add entry", attrs: { type: "submit" } }));
      addForm.querySelector("button").type = "submit";
      el.append(
        h(
          "div",
          {},
          h("div", { class: "item-name", style: { display: "flex", alignItems: "center", gap: "9px" } }, h("i", { class: "dot", style: { width: "9px", height: "9px", borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` } }), it.name),
          h("div", { class: "item-sub num" }, `${p.done} of ${p.total}`)
        ),
        btn("", { icon: "dots", small: true, kind: "flat", aria: "Task options", onClick: (e) => itemMenu(e, it) }),
        h("div", { class: "multi-body" }, progressBar(p.done, p.total), subs, addForm)
      );
      return el;
    }
    function swap(el, it) {
      if (list.hideDone && itemDone(it)) renderItems();
      else el.replaceWith(renderItem(it));
    }
    function renderItem(it) {
      const el = it.type === "count" ? renderCount(it) : it.type === "multi" ? renderMulti(it) : renderCheck(it);
      el.dataset.id = it.id;
      return el;
    }
    function renderItems() {
      renderMeta();
      const shown = list.hideDone ? list.items.filter((it) => !itemDone(it)) : list.items;
      if (!list.items.length) {
        itemsEl.replaceChildren(h("p", { class: "muted" }, "Add your first task above."));
      } else if (!shown.length) {
        itemsEl.replaceChildren(h("p", { class: "muted" }, "Everything here is done. Finished tasks are hidden."));
      } else {
        itemsEl.replaceChildren(...shown.map(renderItem));
      }
    }
    renderSeg();
    renderNav();
    renderItems();
  }

  // js/settings.js
  var settings_exports = {};
  __export(settings_exports, {
    mount: () => mount5
  });
  function mount5(ctx) {
    ctx.setTitle("Settings");
    const st = store.state.settings;
    const sw = (on, onToggle, label) => {
      const b = h("button", { type: "button", class: "switch" + (on ? " on" : ""), role: "switch", "aria-checked": String(on), "aria-label": label });
      b.onclick = () => {
        const v = !b.classList.contains("on");
        b.classList.toggle("on", v);
        b.setAttribute("aria-checked", String(v));
        onToggle(v);
      };
      return b;
    };
    const speed = h("input", {
      type: "range",
      min: 1,
      max: 10,
      value: st.rgbSpeed,
      style: { width: "220px" },
      "aria-label": "RGB speed",
      oninput: (e) => {
        st.rgbSpeed = +e.target.value;
        applySettings();
        save();
      }
    });
    const hue = h("input", {
      type: "range",
      class: "hue-range",
      min: 0,
      max: 359,
      value: st.hue,
      "aria-label": "Accent colour",
      oninput: (e) => {
        st.hue = +e.target.value;
        applySettings();
        save();
      }
    });
    const speedRow = h("div", { class: "set-row" }, h("div", { class: "lbl" }, h("b", {}, "RGB speed"), h("span", {}, "How fast the colours cycle.")), speed);
    const hueRow = h("div", { class: "set-row" }, h("div", { class: "lbl" }, h("b", {}, "Accent colour"), h("span", {}, "Used when RGB cycling is off.")), hue);
    const sync = () => {
      speedRow.style.display = st.rgb ? "" : "none";
      hueRow.style.display = st.rgb ? "none" : "";
    };
    const fileIn = h("input", { type: "file", accept: "application/json,.json", hidden: true, onchange: async () => {
      const f = fileIn.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data || !Array.isArray(data.lists) || !Array.isArray(data.maps)) throw new Error("That file isn\u2019t a GameHelper backup");
        if (!await confirmBox("Restore backup?", "Your current maps, checklists and players are replaced by the backup. Map images already on this page are kept for maps with the same name in the backup.", "Restore")) return;
        const cur = new Map(store.state.maps.map((m) => [m.id, m]));
        data.maps = data.maps.map((m) => {
          const c = cur.get(m.id);
          return c && !/^(idb:|data:)/.test(m.image || "") ? { ...m, image: c.image, drawing: c.drawing, drawingV: c.drawingV, w: c.w, h: c.h } : m;
        });
        await importImages(data);
        replaceState({ ...store.state, ...data });
        save();
        applySettings();
        toast("Backup restored", "ok");
        ctx.rerender();
      } catch (e) {
        toast(e.message, "error");
      }
      fileIn.value = "";
    } });
    ctx.view.append(h(
      "div",
      { class: "settings" },
      h(
        "section",
        { class: "panel" },
        h("div", { class: "panel-head" }, h("h2", {}, "Look")),
        h(
          "div",
          { class: "set-row" },
          h("div", { class: "lbl" }, h("b", {}, "RGB cycling"), h("span", {}, "Accents, buttons and the date sweep through the colour wheel.")),
          sw(st.rgb, (v) => {
            st.rgb = v;
            applySettings();
            save();
            sync();
          }, "RGB cycling")
        ),
        speedRow,
        hueRow
      ),
      h(
        "section",
        { class: "panel" },
        h("div", { class: "panel-head" }, h("h2", {}, "Players")),
        h(
          "div",
          { class: "set-row" },
          h("div", { class: "lbl" }, h("b", {}, "Categories"), h("span", {}, store.state.categories.map((c) => c.name).join(", "))),
          btn("Edit categories", { onClick: () => editCategories(() => ctx.rerender()) })
        )
      ),
      h(
        "section",
        { class: "panel" },
        h("div", { class: "panel-head" }, h("h2", {}, "Your data")),
        h("p", { class: "muted", style: { marginTop: 0 } }, store.online ? "Everything you do here is saved in this browser only. Nobody else sees it, and it doesn\u2019t follow you to other devices. To move it, download a backup (it includes your map images) and restore it in the other browser. Restore also accepts the state.json file from the GameHelper PC app; maps from there need Replace image afterwards." : "Claude account storage isn\u2019t available in this view, so data is only kept in this browser."),
        h(
          "div",
          { class: "row" },
          btn("Download backup", { icon: "download", onClick: async () => download(`gamehelper-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, await exportBackup()) }),
          btn("Restore backup", { icon: "upload", onClick: () => fileIn.click() }),
          fileIn
        )
      )
    ));
    sync();
  }

  // js/main.js
  var views = { home: home_exports, maps: maps_exports, lists: lists_exports, players: players_exports, settings: settings_exports };
  var viewEl = document.getElementById("view");
  var titleEl = document.getElementById("pageTitle");
  var actionsEl = document.getElementById("topActions");
  document.querySelectorAll("[data-icon]").forEach((el) => el.append(icon(el.dataset.icon, 20)));
  function applySettings() {
    const s = store.state.settings;
    const root = document.documentElement;
    root.classList.toggle("rgb-on", !!s.rgb);
    root.style.setProperty("--rgb-dur", Math.max(2, 22 - s.rgbSpeed * 2) + "s");
    if (!s.rgb) root.style.setProperty("--h", s.hue);
    else root.style.removeProperty("--h");
  }
  var cleanup = null;
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
    const name = views[parts[0]] ? parts[0] : "home";
    document.querySelectorAll(".nav a").forEach((a) => {
      const on = a.dataset.route === name;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.querySelectorAll(".modal-back").forEach((m) => m.remove());
    if (typeof cleanup === "function") cleanup();
    cleanup = null;
    viewEl.replaceChildren();
    actionsEl.replaceChildren();
    const ctx = {
      view: viewEl,
      params: parts.slice(1),
      setTitle: (t) => {
        titleEl.textContent = t;
        document.title = t === "Home" ? "GameHelper" : `${t} \xB7 GameHelper`;
      },
      setActions: (...els) => actionsEl.replaceChildren(...els.flat().filter(Boolean)),
      rerender: () => route()
    };
    cleanup = views[name].mount(ctx);
    window.scrollTo(0, 0);
  }
  function showStatus(s) {
    const el = document.getElementById("saveState");
    el.className = "save-state " + s;
    el.querySelector("span").textContent = {
      loading: "Loading\u2026",
      saved: "Saved in this browser",
      readonly: "View only \u2014 changes aren\u2019t saved",
      saving: "Saving\u2026",
      error: "Can\u2019t reach GameHelper \u2014 retrying",
      offline: "Saved in this browser only"
    }[s] || s;
  }
  (async function start() {
    onStatus(showStatus);
    await load();
    applySettings();
    if (!store.canUpload) {
      document.getElementById("banner").replaceChildren(h(
        "div",
        { class: "banner" },
        "This browser blocks saving images (private window or blocked site data), so maps can\u2019t be added or kept. Checklists still work."
      ));
    }
    if (store.firstVisit && !location.hash && store.state.maps[0]) location.hash = "#/maps/" + store.state.maps[0].id;
    window.addEventListener("remote-change", () => {
      if (!document.querySelector(".viewport.dragging, .modal-back")) {
        applySettings();
        route();
      }
    });
    window.addEventListener("hashchange", route);
    route();
  })();
})();
