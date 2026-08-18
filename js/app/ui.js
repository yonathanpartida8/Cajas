// Interfaz: dock, hojas, medidas con − / + y arrastre, y colocación de imágenes.
import { LIMITS, DESIGNS } from '../box/model.js';
import { MATERIALS, FINISHES } from '../box/materials.js';
import { CATEGORIES, CATALOG_LIST, CATALOG, PALETTE, LIGHT_PALETTE, propsOf } from '../objects/catalog.js';
import { MODES, MODE_NAME, ROT_MODES, isStrip, isSource, isPower, meanScale } from './objects.js';
import { state, canUndo, canRedo } from './store.js';
import { audio } from '../features/audio.js';
import { bump } from '../features/fx.js';

const $ = s => document.querySelector(s);
const PRESETS = {
  s: { largo: 16, ancho: 12, alto: 9, tapa: 4 },
  m: { largo: 24, ancho: 18, alto: 14, tapa: 5 },
  l: { largo: 40, ancho: 30, alto: 24, tapa: 8 },
};
const DIMS = [
  ['largo', 'Largo', 'profundidad de la caja'],
  ['ancho', 'Ancho', 'de lado a lado'],
  ['alto', 'Alto', 'altura de las paredes'],
  ['tapa', 'Tapa', 'cuánto baja la tapa'],
  ['grosor', 'Grosor', 'espesor del cartón'],
];
const DEG = 180 / Math.PI;
const nameOf = o => (o ? (CATALOG[o.type]?.name || 'Objeto') : '');

export function createUI(app) {
  const el = {
    scrim: $('#scrim'), dockMain: $('#dockMain'), dockSt: $('#dockSticker'),
    toast: $('#toast'), loader: $('#loader'), loaderText: $('#loaderText'),
    undo: $('#btnUndo'), redo: $('#btnRedo'), file: $('#filePick'), exit: $('#exitPreview'),
    surface: $('#surface'), surfaceName: $('#surfaceName'), surfaceMove: $('#surfaceMove'),
    drop: $('#drop'), dropImg: $('#dropImg'), lock: $('#lock'),
    dockObject: $('#dockObject'), zbar: $('#zbar'), drawbar: $('#drawbar'),
  };
  let sheet = null, toastT = 0;

  // toque base en cualquier control (los gestos con voz propia lo silencian)
  addEventListener('pointerdown', e => {
    audio.unlock();
    const b = e.target.closest?.('button,.st-val,input[type=checkbox]');
    if (b && !b.dataset.mute) audio.play(b.dataset.sfx || 'tap');
  }, { capture: true, passive: true });

  // ---------------------------------------------------------------- hojas
  function open(name) {
    if (sheet) {
      sheet.classList.remove('on');
      setTimeout(s => { if (!s.classList.contains('on')) s.hidden = true; }, 420, sheet);
    }
    if (!name || (sheet && sheet.id === 'sheet-' + name)) { sheet = null; el.scrim.classList.remove('on'); return; }
    sheet = $('#sheet-' + name);
    sheet.hidden = false;
    sheet.scrollTop = 0;
    audio.play('panel');
    requestAnimationFrame(() => sheet.classList.add('on'));
    el.scrim.classList.add('on');
  }
  el.scrim.onclick = () => open(null);
  document.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => open(b.dataset.sheet));

  document.querySelectorAll('.sheet').forEach(s => {          // cerrar arrastrando hacia abajo
    let y0 = null;
    s.addEventListener('pointerdown', e => {
      if (s.scrollTop <= 0 && !e.target.closest('input,button,.st-val')) y0 = e.clientY;
    });
    s.addEventListener('pointermove', e => {
      if (y0 === null) return;
      const dy = Math.max(0, e.clientY - y0);
      s.style.transform = window.innerWidth >= 600 ? `translate(-50%,${dy}px)` : `translateY(${dy}px)`;
    });
    const stop = e => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null; s.style.transform = '';
      if (dy > 70) open(null);
    };
    s.addEventListener('pointerup', stop);
    s.addEventListener('pointercancel', () => { y0 = null; s.style.transform = ''; });
  });

  // ------------------------------------------------- fila «− valor +» genérica
  function stepRow(parent, o) {
    const row = document.createElement('div');
    row.className = 'dim';
    row.innerHTML = `
      <div class="dim-info"><b>${o.label}</b><small>${o.hint || ''}</small></div>
      <div class="stepper">
        <button class="st-btn" aria-label="Reducir ${o.label}"><i class="ic ic-minus"></i></button>
        <div class="st-val" role="slider" tabindex="0"><b>0</b><i>${o.unit ?? 'cm'}</i></div>
        <button class="st-btn" aria-label="Aumentar ${o.label}"><i class="ic ic-plus"></i></button>
      </div>`;
    const [minus, plus] = row.querySelectorAll('.st-btn');
    const val = row.querySelector('.st-val'), num = val.querySelector('b');
    const put = v => o.set(Math.max(o.min, Math.min(o.max, +v.toFixed(2))));
    const bump2 = d => { put(o.get() + d * o.step); refresh(); audio.play('tick'); };
    hold(minus, () => bump2(-1));
    hold(plus, () => bump2(1));
    scrub(val, dx => {
      const q = Math.round(dx / 9);
      if (!q) return false;
      put(o.get() + q * o.step); refresh();
      audio.play('tick');
      return true;
    });
    function refresh() {
      const v = o.get();
      const txt = o.step < 1 ? v.toFixed(o.step < .1 ? 2 : 1) : String(Math.round(v));
      if (num.textContent !== txt) { num.textContent = txt; bump(num); }
      minus.disabled = v <= o.min + 1e-6;
      plus.disabled = v >= o.max - 1e-6;
    }
    parent.appendChild(row);
    refresh();
    return refresh;
  }

  /** Pulsación con repetición (mantener pulsado). */
  function hold(node, fn) {
    let t1 = 0, t2 = 0, on = false;
    const stop = () => { if (!on) return; on = false; clearTimeout(t1); clearInterval(t2); app.commit(); };
    node.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      on = true; fn();
      t1 = setTimeout(() => { t2 = setInterval(fn, 85); }, 420);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) node.addEventListener(ev, stop);
  }

  /** Arrastre horizontal sobre un elemento para cambiar un valor. */
  function scrub(node, fn) {
    let id = null, x0 = 0;
    node.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      id = e.pointerId; x0 = e.clientX;
      node.setPointerCapture(id); node.classList.add('hot');
    });
    node.addEventListener('pointermove', e => {
      if (id !== e.pointerId) return;
      if (fn(e.clientX - x0)) x0 = e.clientX;
    });
    const end = e => {
      if (id !== e.pointerId) return;
      id = null; node.classList.remove('hot'); app.commit();
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------- medidas
  const rows = {};
  const dimsBox = $('#dims');
  for (const [key, label, hint] of DIMS) {
    const [min, max, , stepSize] = LIMITS[key];
    rows[key] = stepRow(dimsBox, {
      label, hint, min, max, step: stepSize,
      get: () => state.dims[key],
      set: v => app.setDim(key, v),
    });
  }
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    app.setDims(PRESETS[b.dataset.preset]); app.commit(); syncDims();
  });

  function syncDims() {
    for (const [key] of DIMS) rows[key]();
    document.querySelectorAll('[data-preset]').forEach(b => {
      const p = PRESETS[b.dataset.preset];
      b.classList.toggle('on', Object.keys(p).every(k => Math.abs(p[k] - state.dims[k]) < .01));
    });
  }

  // ------------------------------------------------- diseño de la caja
  const designGrid = $('#designGrid');
  DESIGNS.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'lib-item'; b.dataset.design = d.id;
    b.style.animation = `btnIn .4s var(--spring) both ${i * .03}s`;
    b.innerHTML = `<em>${d.emoji}</em><span>${d.name}</span>`;
    b.onclick = () => { app.setDesign(d.id); syncDesign(); };
    designGrid.appendChild(b);
  });
  const divRow = $('#divRow');
  const refreshDiv = stepRow(divRow, {
    label: 'Compartimentos', hint: 'divisiones interiores', min: 2, max: 4, step: 1, unit: '',
    get: () => state.divisions, set: v => app.setDivisions(v),
  });
  function syncDesign() {
    designGrid.querySelectorAll('.lib-item').forEach(b => b.classList.toggle('on', b.dataset.design === state.design));
    divRow.hidden = state.design !== 'compartimentos';
    refreshDiv();
    document.querySelectorAll('[data-lid]').forEach(b => {
      b.disabled = state.design === 'abierta'
        || (app.lidHinged() && (b.dataset.lid === 'aside' || b.dataset.lid === 'place'));
    });
  }

  // ---------------------------------------------------------------- materiales y tapa
  const mat = $('#materials');
  MATERIALS.forEach(m => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = m.color; b.title = m.name; b.dataset.mat = m.id; b.dataset.mute = '1';
    b.onclick = () => { app.setMaterial(m.id); syncMat(); };
    mat.appendChild(b);
  });
  const syncMat = () => document.querySelectorAll('#materials .sw').forEach(b => b.classList.toggle('on', b.dataset.mat === state.material));
  document.querySelectorAll('[data-lid]').forEach(b => b.onclick = () => app.lid(b.dataset.lid));

  // ------------------------------------------------- biblioteca de objetos
  let libCat = 'amor';
  const libGrid = $('#libGrid'), libCats = $('#libCats');
  CATEGORIES.forEach(c => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.cat = c.id;
    b.innerHTML = `<span class="em">${c.emoji}</span>${c.name}`;
    b.onclick = () => { libCat = c.id; fillLib(); };
    libCats.appendChild(b);
  });

  function fillLib() {
    libCats.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.cat === libCat));
    libGrid.innerHTML = '';
    CATALOG_LIST.filter(i => i.cat === libCat).forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'lib-item';
      b.style.animation = `btnIn .4s var(--spring) both ${i * .03}s`;
      b.innerHTML = `<em>${it.emoji}</em><span>${it.name}</span>`;
      b.onclick = () => { open(null); it.tool ? app.tool(it.tool) : app.addObject(it.id); };
      libGrid.appendChild(b);
    });
  }
  fillLib();
  const repeat = $('#optRepeat');
  repeat.checked = state.repeat;
  repeat.onchange = () => { state.repeat = repeat.checked; audio.play('toggle'); };

  // ------------------------------------------------- panel del objeto
  const objColors = $('#objColors'), objParams = $('#objParams');
  const objPos = $('#objPos'), objRot = $('#objRot'), objScl = $('#objScl');
  const lightColors = $('#lightColors'), lightParams = $('#lightParams');

  PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = hex; b.dataset.col = hex; b.dataset.mute = '1';
    b.onclick = () => { app.objColor(hex); syncObj(); };
    objColors.appendChild(b);
  });
  LIGHT_PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = hex; b.dataset.hue = hex; b.dataset.mute = '1';
    b.onclick = () => { app.setLight('hue', hex); app.commit(); syncObj(); };
    lightColors.appendChild(b);
  });
  const modeChips = $('#modeChips');
  MODES.forEach(m => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.mode = m; b.textContent = MODE_NAME[m];
    b.onclick = () => { app.setSwitchMode(m); syncObj(); };
    modeChips.appendChild(b);
  });
  const rotModes = $('#rotModes');
  ROT_MODES.forEach(m => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.rmode = m.id; b.textContent = m.name;
    b.onclick = () => { app.setRotMode(m.id); syncObj(); };
    rotModes.appendChild(b);
  });

  // pestañas del panel
  const tabs = $('#objTabs');
  tabs.querySelectorAll('.chip').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  function showTab(name) {
    tabs.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('#sheet-obj [data-panel]').forEach(p => { p.hidden = p.dataset.panel !== name; });
  }

  $('#btnLink').onclick = () => app.startLink();
  $('#btnUnlink').onclick = () => app.unlinkAll();
  $('#objCenter').onclick = () => { app.centerObject(); syncObj(); };
  $('#objFloor').onclick = () => { app.floorObject(); syncObj(); };
  $('#objCopy2').onclick = () => app.duplicateObject();
  $('#objLock2').onclick = () => app.lockObject();
  document.querySelectorAll('[data-reset]').forEach(b => b.onclick = () => { app.resetObject(b.dataset.reset); syncObj(); });

  let paramRefresh = [];
  /** Todos los controles del objeto se generan a partir de su descripción. */
  function buildObjSheet(o) {
    for (const c of [objParams, objPos, objRot, objScl, lightParams]) c.innerHTML = '';
    paramRefresh = [];
    if (!o) return;
    const add = (parent, c) => paramRefresh.push(stepRow(parent, c));

    // --- posición ---
    add(objPos, { label: 'Izq. · der.', hint: 'eje X', min: -40, max: 40, step: .5,
      get: () => o.x, set: v => app.objSet('x', v) });
    add(objPos, { label: 'Altura', hint: 'eje Y · desde el fondo', min: 0, max: 70, step: .5,
      get: () => o.y, set: v => app.objSet('y', v) });
    add(objPos, { label: 'Fondo · frente', hint: 'eje Z', min: -40, max: 40, step: .5,
      get: () => o.z, set: v => app.objSet('z', v) });

    // --- giro (los tres ejes, en grados) ---
    for (const [k, label, hint] of [['x', 'Inclinar', 'eje X'], ['y', 'Girar', 'eje Y'], ['z', 'Ladear', 'eje Z']]) {
      add(objRot, { label, hint, min: -180, max: 180, step: 5, unit: '°',
        get: () => Math.round(o.rot[k] * DEG),
        set: v => app.objSet('rot.' + k, v / DEG) });
    }

    // --- tamaño (uniforme y por eje) ---
    add(objScl, { label: 'Tamaño', hint: 'los tres ejes a la vez', min: .2, max: 4, step: .1, unit: '×',
      get: () => meanScale(o), set: v => app.objScale(v) });
    for (const [k, label, hint] of [['x', 'Anchura', 'eje X'], ['y', 'Altura', 'eje Y'], ['z', 'Profundidad', 'eje Z']]) {
      add(objScl, { label, hint, min: .2, max: 4, step: .1, unit: '×',
        get: () => o.scl[k], set: v => app.objSet('scl.' + k, v) });
    }

    // --- controles propios del tipo ---
    for (const p of propsOf(o.type)) {
      add(objParams, { ...p, get: () => o[p.k] ?? p.def, set: v => app.objSet(p.k, v) });
    }

    // --- luz a medida ---
    if (isSource(o)) {
      add(lightParams, { label: 'Intensidad', hint: 'fuerza de la luz', min: .2, max: 2, step: .1, unit: '×',
        get: () => o.power ?? 1, set: v => app.setLight('power', v) });
      add(lightParams, { label: 'Parpadeo', hint: '0 = luz fija', min: 0, max: 4, step: .2, unit: 'Hz',
        get: () => o.blink ?? 1.4, set: v => app.setLight('blink', v) });
    }
  }

  /** Texto que explica de dónde viene (o no) la corriente. */
  function describe(o) {
    const w = app.wiringOf(o);
    const names = w.sources.map(nameOf).join(', ');
    if (isStrip(o)) {
      if (!w.sources.length) return 'Sin conexión. Conecta un interruptor o una caja de pilas para encenderla.';
      return w.powered
        ? `Encendida desde: ${names}.`
        : `Conectada a ${names}, pero sin corriente: enciende la caja de pilas.`;
    }
    const out = (state.links[o.id] || []).map(id => nameOf(app.getObject(id))).filter(Boolean);
    const feed = out.length ? `Alimenta ${out.length}: ${out.join(', ')}.` : 'Todavía no alimenta nada.';
    if (isPower(o)) return feed;
    return `${feed} ${w.sources.length ? `Recibe corriente de ${names}.` : 'Le faltan pilas: conéctale una caja.'}`;
  }

  function syncObj() {
    const o = app.selectedObject();
    const on = !!o;
    el.dockObject.hidden = !on;
    el.zbar.hidden = !on || isStrip(o);
    if (!on) return;
    $('#objTitle').textContent = nameOf(o);
    $('#obLock').classList.toggle('on', !!o.locked);
    $('#objLock2').classList.toggle('on', !!o.locked);
    objColors.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.col === o.color));
    lightColors.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.hue === (o.hue || '#ffb463')));
    rotModes.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.rmode === state.rotMode));
    $('#rotHint').textContent = ROT_MODES.find(m => m.id === state.rotMode)?.hint || '';

    const electric = isSource(o) || isStrip(o);
    const strip = isStrip(o);
    $('#tabLuz').hidden = !electric;
    for (const t of ['mover', 'girar', 'tam']) {              // las tiras siguen su trazado
      tabs.querySelector(`[data-tab="${t}"]`).hidden = strip;
    }
    $('#modeTitle').hidden = !isSource(o);
    modeChips.hidden = !isSource(o);
    $('#customLight').hidden = !isSource(o) || (o.mode || 'off') !== 'custom';
    $('#btnLink').hidden = !isSource(o);
    modeChips.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.mode === (o.mode || 'off')));
    if (electric) $('#linkInfo').textContent = describe(o);
    const cur = tabs.querySelector('.chip.on')?.dataset.tab;
    if ((!electric && cur === 'luz') || (strip && ['mover', 'girar', 'tam'].includes(cur))) showTab('basico');

    paramRefresh.forEach(f => f());
    syncZ();
  }

  /** El panel del objeto se reconstruye al cambiar de selección. */
  let lastObjId = null;
  function ensureObjSheet() {
    const o = app.selectedObject();
    if ((o?.id || null) === lastObjId) return;
    lastObjId = o?.id || null;
    buildObjSheet(o);
    showTab('basico');
  }

  // ------------------------------------------------- altura (eje Y)
  const zTrack = $('#zTrack'), zFill = $('#zFill'), zVal = $('#zVal');
  const zMax = () => Math.max(8, state.dims.alto * 1.4);
  function syncZ() {
    const o = app.selectedObject();
    if (!o || isStrip(o)) return;
    const f = Math.max(0, Math.min(1, o.y / zMax()));
    zFill.style.height = (f * 100) + '%';
    zVal.textContent = o.y.toFixed(1);
  }
  const zSet = v => { app.objSet('y', +v.toFixed(2)); syncZ(); };
  hold($('#zUp'), () => { const o = app.selectedObject(); if (o) { zSet(o.y + .5); audio.play('tick'); } });
  hold($('#zDown'), () => { const o = app.selectedObject(); if (o) { zSet(o.y - .5); audio.play('tick'); } });
  {
    let id = null;
    const move = e => {
      const r = zTrack.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (r.bottom - e.clientY) / r.height));
      zSet(f * zMax());
    };
    zTrack.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      id = e.pointerId; zTrack.setPointerCapture(id); move(e); audio.play('grab');
    });
    zTrack.addEventListener('pointermove', e => { if (id === e.pointerId) move(e); });
    const end = e => { if (id === e.pointerId) { id = null; app.commit(); } };
    zTrack.addEventListener('pointerup', end);
    zTrack.addEventListener('pointercancel', end);
  }

  // ------------------------------------------------- forrar cartón
  const forroColors = $('#forroColors'), forroFinish = $('#forroFinish');
  ['#ffffff', ...PALETTE.slice(1)].forEach(hex => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = hex; b.dataset.lin = hex; b.dataset.mute = '1';
    b.onclick = () => { app.setLining({ color: hex }); syncForro(); };
    forroColors.appendChild(b);
  });
  FINISHES.forEach(f => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.fin = f.id; b.textContent = f.name;
    b.onclick = () => { app.setLining({ finish: f.id }); syncForro(); };
    forroFinish.appendChild(b);
  });
  document.querySelectorAll('[data-scope]').forEach(b => {
    b.onclick = () => { app.liningScope(b.dataset.scope); syncForro(); };
  });
  $('#forroClear').onclick = () => { app.clearLining(); syncForro(); };

  function syncForro() {
    const cur = app.currentLining();
    $('#forroFace').textContent = cur.name
      ? `Forrando: ${cur.name}` : 'Toca una parte de la caja para elegirla.';
    forroColors.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.lin === cur.color));
    forroFinish.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.fin === cur.finish));
  }

  // ------------------------------------------------- barra de acción flotante
  let barOk = null, barCancel = null;
  $('#drawDone').onclick = () => barOk?.();
  $('#drawCancel').onclick = () => barCancel?.();
  function bar(info, ok, cancel) {
    barOk = ok; barCancel = cancel;
    el.drawbar.hidden = !info;
    if (!info) return;
    el.drawbar.querySelector('b').textContent = info.title;
    $('#drawHint').textContent = info.hint || '';
    $('#drawDone').lastChild.textContent = info.ok || 'Listo';
    sync();
  }

  // ------------------------------------------------- dock del objeto
  $('#obRot').onclick = () => {
    const o = app.selectedObject();
    if (o) app.objSet('rot.y', o.rot.y + Math.PI / 8);
    app.commit();
  };
  $('#obCopy').onclick = () => app.duplicateObject();
  $('#obLock').onclick = () => app.lockObject();
  $('#obDel').onclick = () => app.removeObject();
  $('#obDone').onclick = () => app.selectObject(null);

  // ---------------------------------------------------------------- acciones
  el.file.onchange = () => {
    const f = el.file.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => app.addImage(r.result);
    r.readAsDataURL(f);
    el.file.value = '';
  };
  el.undo.onclick = () => app.undo();
  el.redo.onclick = () => app.redo();
  $('#btnHome').onclick = () => app.resetView();
  $('#btnPreview').onclick = () => app.preview(true);
  el.exit.onclick = () => app.preview(false);
  $('#stCut').onclick = () => app.cutout();
  $('#stFit').onclick = () => app.fit();
  $('#stCenter').onclick = () => app.center();
  $('#stCopy').onclick = () => app.duplicate();
  $('#stDel').onclick = () => app.remove();
  $('#stDone').onclick = () => app.select(null);
  $('#btnReset').onclick = () => { app.reset(); open(null); syncDims(); syncMat(); syncDesign(); };
  el.surfaceClose = $('#surfaceClose');
  el.surfaceClose.onclick = () => { app.select(null); app.pickFace(null); };
  el.surfaceMove.onclick = () => app.toggleLidMove();
  el.lock.onclick = () => { state.lockAspect = !state.lockAspect; sync(); };

  for (const [id, key] of [['#optSpin', 'spin'], ['#optShadow', 'shadow'], ['#optHQ', 'hq'],
    ['#optXray', 'xray'], ['#optSound', 'sound'], ['#optBuzz', 'buzz']]) {
    const c = $(id); c.checked = state[key];
    c.onchange = () => { app.setOption(key, c.checked); audio.play('toggle'); };
  }

  // ---------------------------------------------------------------- colocar imagen
  let dropDrag = null;
  const follow = (x, y) => { el.drop.style.transform = `translate(${x}px,${y}px) translate(-50%,-135%)`; };

  $('#dropCancel').addEventListener('pointerdown', e => { e.stopPropagation(); });
  $('#dropCancel').onclick = () => { app.cancelPlacement(); toast('Imagen descartada'); };
  el.drop.addEventListener('pointerdown', e => {
    if (!state.placing || e.target.closest('#dropCancel')) return;
    e.preventDefault();
    el.drop.setPointerCapture(e.pointerId);
    dropDrag = { id: e.pointerId, moved: 0, x: e.clientX, y: e.clientY };
    el.drop.classList.add('dragging');
    follow(e.clientX, e.clientY);
    app.moveGhost(e.clientX, e.clientY);
  });
  el.drop.addEventListener('pointermove', e => {
    if (!dropDrag || dropDrag.id !== e.pointerId) return;
    dropDrag.moved += Math.abs(e.clientX - dropDrag.x) + Math.abs(e.clientY - dropDrag.y);
    dropDrag.x = e.clientX; dropDrag.y = e.clientY;
    follow(e.clientX, e.clientY);
    app.moveGhost(e.clientX, e.clientY);
  });
  const dropEnd = e => {
    if (!dropDrag || dropDrag.id !== e.pointerId) return;
    const tap = dropDrag.moved < 10;
    dropDrag = null;
    el.drop.classList.remove('dragging');
    el.drop.style.transform = '';
    app.dropGhost(e.clientX, e.clientY, tap);
  };
  el.drop.addEventListener('pointerup', dropEnd);
  el.drop.addEventListener('pointercancel', dropEnd);

  function placing(src) {
    el.drop.hidden = !src;
    document.body.classList.toggle('placing', !!src);
    if (src) el.dropImg.src = src;
  }

  // ---------------------------------------------------------------- sincronización
  function sync() {
    el.undo.disabled = !canUndo();
    el.redo.disabled = !canRedo();
    const sel = !!state.selected;
    const obj = !!app.selectedObject();
    ensureObjSheet();
    syncObj();
    syncForro();
    syncDesign();
    const busy = !el.drawbar.hidden;
    document.body.classList.toggle('editing', sel || obj);
    el.dockMain.hidden = sel || obj || busy;
    el.dockObject.hidden = !obj || busy;
    el.zbar.hidden = el.dockObject.hidden || isStrip(app.selectedObject());
    el.dockSt.hidden = !sel;
    el.lock.hidden = !sel;
    el.lock.classList.toggle('on', state.lockAspect);
    if (sel) open(null);

    const label = app.surfaceLabel();
    el.surface.hidden = !label;
    if (label) {
      if (el.surfaceName.textContent !== label.name) {
        el.surfaceName.textContent = label.name;
        bump(el.surface, 'pulse');
      }
      el.surfaceMove.hidden = !label.lid || app.lidHinged();
      el.surfaceMove.classList.toggle('on', state.lidPicked);
      el.surfaceClose.hidden = false;
    }
    syncDims();
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('on'), 2400);
  }

  const loading = (on, text = 'Procesando…') => { el.loaderText.textContent = text; el.loader.hidden = !on; };

  function preview(on) {
    document.body.classList.toggle('preview', on);
    el.exit.hidden = !on;
    if (on) open(null);
  }

  syncDims(); syncMat(); syncDesign(); sync();
  return { sync, syncDims, syncMat, toast, loading, preview, open, placing, bar };
}
