// Interfaz: dock, hojas, medidas con − / + y arrastre, y colocación de imágenes.
import { LIMITS } from '../box/model.js';
import { MATERIALS, FINISHES } from '../box/materials.js';
import { CATEGORIES, CATALOG_LIST, CATALOG, PALETTE } from '../objects/catalog.js';
import { MODES, MODE_NAME } from './objects.js';
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
    const bump2 = d => { o.set(+(o.get() + d * o.step).toFixed(2)); refresh(); audio.play('tick'); };
    hold(minus, () => bump2(-1));
    hold(plus, () => bump2(1));
    scrub(val, dx => {
      const q = Math.round(dx / 9);
      if (!q) return false;
      o.set(+(o.get() + q * o.step).toFixed(2)); refresh();
      audio.play('tick');
      return true;
    });
    function refresh() {
      const v = o.get();
      const txt = o.step < 1 ? v.toFixed(1) : String(Math.round(v));
      if (num.textContent !== txt) { num.textContent = txt; bump(num); }
      minus.disabled = v <= o.min + 1e-6;
      plus.disabled = v >= o.max - 1e-6;
    }
    parent.appendChild(row);
    refresh();
    return refresh;
  }

  // ---------------------------------------------------------------- medidas
  const rows = {};
  const box = $('#dims');
  for (const [key, label, hint] of DIMS) {
    const [min, max, , stepSize] = LIMITS[key];
    rows[key] = stepRow(box, {
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
  const TOOLS = [
    { id: '__tira', name: 'Tira de luces', emoji: '💡', cat: 'luces', tool: 'tira' },
    { id: '__foto', name: 'Foto', emoji: '🖼️', cat: 'fotos', tool: 'foto' },
    { id: '__forro', name: 'Forrar cartón', emoji: '🎨', cat: 'materiales', tool: 'forro' },
  ];
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
    const items = [...CATALOG_LIST.filter(i => i.cat === libCat), ...TOOLS.filter(t => t.cat === libCat)];
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'lib-item';
      b.style.animation = `btnIn .4s var(--spring) both ${i * .03}s`;
      b.innerHTML = `<em>${it.emoji}</em><span>${it.name}</span>`;
      b.onclick = () => { open(null); it.tool ? app.tool(it.tool) : app.addObject(it.id); };
      libGrid.appendChild(b);
    });
  }
  fillLib();

  // ------------------------------------------------- ajustes del objeto
  const objColors = $('#objColors'), objParams = $('#objParams');
  PALETTE.forEach(hex => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = hex; b.dataset.col = hex; b.dataset.mute = '1';
    b.onclick = () => { app.objColor(hex); syncObj(); };
    objColors.appendChild(b);
  });
  const modeChips = $('#modeChips');
  MODES.forEach(m => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.mode = m; b.textContent = MODE_NAME[m];
    b.onclick = () => { app.setSwitchMode(m); syncObj(); };
    modeChips.appendChild(b);
  });
  $('#btnLink').onclick = () => app.startLink();
  $('#objCenter').onclick = () => { app.centerObject(); syncObj(); };
  $('#objFloor').onclick = () => { app.floorObject(); syncObj(); };

  let paramRefresh = [];
  function buildParams(o) {
    objParams.innerHTML = '';
    paramRefresh = [];
    if (!o) return;
    const def = CATALOG[o.type] || {};
    const add = c => paramRefresh.push(stepRow(objParams, c));
    if (o.type !== 'tira') {
      add({ label: 'Tamaño', hint: 'escala del objeto', min: .3, max: 3, step: .1, unit: '×',
        get: () => o.scale ?? 1, set: v => app.objSet('scale', v) });
      add({ label: 'Giro', hint: 'grados', min: -180, max: 180, step: 15, unit: '°',
        get: () => Math.round((o.rot || 0) * 180 / Math.PI), set: v => app.objSet('rot', v * Math.PI / 180) });
      add({ label: 'Altura', hint: 'desde el fondo', min: 0, max: 60, step: .5,
        get: () => o.y, set: v => app.objSet('y', v) });
    }
    if (def.params) {
      add({ label: 'Ancho', hint: 'del papel', min: .4, max: 6, step: .2, get: () => o.pw ?? 1.6, set: v => app.objSet('pw', v) });
      add({ label: 'Largo', hint: 'de la tira', min: 2, max: 18, step: .5, get: () => o.ph ?? 6, set: v => app.objSet('ph', v) });
      add({ label: 'Grosor', hint: 'del papel', min: .04, max: 1, step: .04, get: () => o.pt ?? .12, set: v => app.objSet('pt', v) });
    }
    if (o.type === 'tira') {
      add({ label: 'Grosor', hint: 'del cable y las luces', min: .2, max: 1.6, step: .1,
        get: () => o.thick ?? .5, set: v => app.objSet('thick', v) });
    }
  }

  function syncObj() {
    const o = app.selectedObject();
    const on = !!o;
    el.dockObject.hidden = !on;
    el.zbar.hidden = !on || o.type === 'tira';
    $('#objSwitch').hidden = !on || !CATALOG[o?.type]?.switch;
    $('#obLock').classList.toggle('on', !!o?.locked);
    if (!on) return;
    $('#objTitle').textContent = (CATALOG[o.type]?.name) || 'Tira de luces';
    objColors.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.col === o.color));
    modeChips.querySelectorAll('.chip').forEach(b => b.classList.toggle('on', b.dataset.mode === (o.mode || 'off')));
    const links = (state.links[o.id] || []).length;
    $('#linkInfo').textContent = links ? `Controla ${links} tira${links > 1 ? 's' : ''} de luces.` : 'Sin tiras conectadas todavía.';
    paramRefresh.forEach(f => f());
    syncZ();
  }

  /** El objeto de la hoja se reconstruye al cambiar de selección. */
  let lastObjId = null;
  function ensureObjSheet() {
    const o = app.selectedObject();
    if ((o?.id || null) === lastObjId) return;
    lastObjId = o?.id || null;
    buildParams(o);
  }

  // ------------------------------------------------- altura (eje Y)
  const zTrack = $('#zTrack'), zFill = $('#zFill'), zVal = $('#zVal');
  const zMax = () => Math.max(8, state.dims.alto * 1.4);
  function syncZ() {
    const o = app.selectedObject();
    if (!o || o.type === 'tira') return;
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
  $('#forroAll').onclick = () => { app.liningAll(); syncForro(); };
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
  $('#obRot').onclick = () => app.objSet('rot', (app.selectedObject()?.rot || 0) + Math.PI / 8);
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
  $('#btnReset').onclick = () => { app.reset(); open(null); syncDims(); syncMat(); };
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
    const busy = !el.drawbar.hidden;
    document.body.classList.toggle('editing', sel || obj);
    el.dockMain.hidden = sel || obj || busy;
    el.dockObject.hidden = !obj || busy;
    el.zbar.hidden = el.dockObject.hidden || app.selectedObject()?.type === 'tira';
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
      el.surfaceMove.hidden = !label.lid;
      el.surfaceMove.classList.toggle('on', state.lidPicked);
      el.surfaceClose.hidden = false;
    }
    syncDims();
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('on'), 2100);
  }

  const loading = (on, text = 'Procesando…') => { el.loaderText.textContent = text; el.loader.hidden = !on; };

  function preview(on) {
    document.body.classList.toggle('preview', on);
    el.exit.hidden = !on;
    if (on) open(null);
  }

  syncDims(); syncMat(); sync();
  return { sync, syncDims, syncMat, toast, loading, preview, open, placing, bar };
}
