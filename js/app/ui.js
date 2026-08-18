// Interfaz: dock, hojas, medidas con − / + y arrastre, y colocación de imágenes.
import { LIMITS } from '../box/model.js';
import { MATERIALS } from '../box/materials.js';
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

  // ---------------------------------------------------------------- medidas
  const rows = {};
  const box = $('#dims');
  for (const [key, label, hint] of DIMS) {
    const [min, max, , stepSize] = LIMITS[key];
    const row = document.createElement('div');
    row.className = 'dim';
    row.innerHTML = `
      <div class="dim-info"><b>${label}</b><small>${hint}</small></div>
      <div class="stepper">
        <button class="st-btn" aria-label="Reducir ${label}"><i class="ic ic-minus"></i></button>
        <div class="st-val" role="slider" tabindex="0"><b>0</b><i>cm</i></div>
        <button class="st-btn" aria-label="Aumentar ${label}"><i class="ic ic-plus"></i></button>
      </div>`;
    const [minus, plus] = row.querySelectorAll('.st-btn');
    const val = row.querySelector('.st-val');
    const num = val.querySelector('b');
    const step = d => app.setDim(key, +(state.dims[key] + d * stepSize).toFixed(2));
    hold(minus, () => { step(-1); sync(); audio.play('tick'); });
    hold(plus, () => { step(1); sync(); audio.play('tick'); });
    scrub(val, dx => {                                        // deslizar sobre el número
      const q = Math.round(dx / 9);
      if (!q) return false;
      app.setDim(key, +(state.dims[key] + q * stepSize).toFixed(2));
      sync(); audio.play('tick');
      return true;
    });
    rows[key] = { num, minus, plus, min, max };
    box.appendChild(row);
  }
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    app.setDims(PRESETS[b.dataset.preset]); app.commit(); syncDims();
  });

  function syncDims() {
    for (const [key] of DIMS) {
      const r = rows[key], v = state.dims[key];
      const txt = LIMITS[key][3] < 1 ? v.toFixed(1) : String(Math.round(v));
      if (r.num.textContent !== txt) { r.num.textContent = txt; bump(r.num); }
      r.minus.disabled = v <= r.min + 1e-6;
      r.plus.disabled = v >= r.max - 1e-6;
    }
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
  const syncMat = () => document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.mat === state.material));
  document.querySelectorAll('[data-lid]').forEach(b => b.onclick = () => app.lid(b.dataset.lid));

  // ---------------------------------------------------------------- acciones
  $('#btnAdd').onclick = () => el.file.click();
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
    ['#optSound', 'sound'], ['#optBuzz', 'buzz']]) {
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
    document.body.classList.toggle('editing', sel);
    el.dockMain.hidden = sel;
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
  return { sync, syncDims, syncMat, toast, loading, preview, open, placing };
}
