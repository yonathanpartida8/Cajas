// Interfaz: dock, hojas deslizables, deslizadores y controles de la imagen.
import { LIMITS } from '../box/model.js';
import { MATERIALS } from '../box/materials.js';
import { state, canUndo, canRedo } from './store.js';

const $ = s => document.querySelector(s);
const PRESETS = {
  s: { largo: 16, ancho: 12, alto: 9, tapa: 4 },
  m: { largo: 24, ancho: 18, alto: 14, tapa: 5 },
  l: { largo: 40, ancho: 30, alto: 24, tapa: 8 },
};

export function createUI(app) {
  const el = {
    scrim: $('#scrim'), dockMain: $('#dockMain'), dockSt: $('#dockSticker'),
    pad: $('#pad'), toast: $('#toast'), loader: $('#loader'), loaderText: $('#loaderText'),
    undo: $('#btnUndo'), redo: $('#btnRedo'), file: $('#filePick'), exit: $('#exitPreview'),
  };
  let sheet = null, toastT = 0;

  // ---------- hojas ----------
  function open(name) {
    if (sheet) {
      sheet.classList.remove('on');
      setTimeout(s => { if (!s.classList.contains('on')) s.hidden = true; }, 420, sheet);
    }
    if (!name || (sheet && sheet.id === 'sheet-' + name)) { sheet = null; el.scrim.classList.remove('on'); return; }
    sheet = $('#sheet-' + name);
    sheet.hidden = false;
    requestAnimationFrame(() => sheet.classList.add('on'));
    el.scrim.classList.add('on');
  }
  el.scrim.onclick = () => open(null);
  document.querySelectorAll('[data-sheet]').forEach(b => b.onclick = () => open(b.dataset.sheet));

  // cerrar arrastrando hacia abajo
  document.querySelectorAll('.sheet').forEach(s => {
    let y0 = null;
    s.addEventListener('pointerdown', e => {
      if (s.scrollTop <= 0 && !e.target.closest('input,button')) y0 = e.clientY;
    });
    s.addEventListener('pointermove', e => {
      if (y0 === null) return;
      const dy = Math.max(0, e.clientY - y0);
      s.style.transform = `translateY(${dy}px)`;
      if (window.innerWidth >= 600) s.style.transform = `translate(-50%,${dy}px)`;
    });
    s.addEventListener('pointerup', e => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null; s.style.transform = '';
      if (dy > 70) open(null);
    });
    s.addEventListener('pointercancel', () => { y0 = null; s.style.transform = ''; });
  });

  // ---------- medidas ----------
  const box = $('#sliders');
  const labels = { largo: 'Largo', ancho: 'Ancho', alto: 'Alto', tapa: 'Tapa' };
  const inputs = {};
  for (const key of Object.keys(labels)) {
    const [min, max] = LIMITS[key];
    const d = document.createElement('div');
    d.className = 'sld';
    d.innerHTML = `<div class="sld-top"><b>${labels[key]}</b><i>${state.dims[key]} cm</i></div>
      <input type="range" min="${min}" max="${max}" step="1" value="${state.dims[key]}">`;
    const input = d.querySelector('input'), out = d.querySelector('i');
    input.oninput = () => { out.textContent = input.value + ' cm'; app.setDim(key, +input.value); };
    input.onchange = () => app.commit();
    inputs[key] = { input, out };
    box.appendChild(d);
  }
  document.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    app.setDims(PRESETS[b.dataset.preset]); app.commit(); syncDims();
  });

  function syncDims() {
    for (const k in inputs) { inputs[k].input.value = state.dims[k]; inputs[k].out.textContent = state.dims[k] + ' cm'; }
    document.querySelectorAll('[data-preset]').forEach(b => {
      const p = PRESETS[b.dataset.preset];
      b.classList.toggle('on', Object.keys(p).every(k => p[k] === state.dims[k]));
    });
  }

  // ---------- materiales ----------
  const mat = $('#materials');
  MATERIALS.forEach(m => {
    const b = document.createElement('button');
    b.className = 'sw'; b.style.background = m.color; b.title = m.name; b.dataset.mat = m.id;
    b.onclick = () => { app.setMaterial(m.id); syncMat(); };
    mat.appendChild(b);
  });
  const syncMat = () => document.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.mat === state.material));

  // ---------- tapa ----------
  document.querySelectorAll('[data-lid]').forEach(b => b.onclick = () => app.lid(b.dataset.lid));

  // ---------- acciones ----------
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
  $('#btnPreview').onclick = () => app.preview(true);
  el.exit.onclick = () => app.preview(false);
  $('#stCut').onclick = () => app.cutout();
  $('#stFit').onclick = () => app.fit();
  $('#stCopy').onclick = () => app.duplicate();
  $('#stDel').onclick = () => app.remove();
  $('#stDone').onclick = () => app.select(null);
  $('#btnReset').onclick = () => { app.reset(); open(null); syncDims(); syncMat(); };

  for (const [id, key] of [['#optSpin', 'spin'], ['#optShadow', 'shadow'], ['#optHQ', 'hq']]) {
    const c = $(id); c.checked = state[key];
    c.onchange = () => app.setOption(key, c.checked);
  }

  // ---------- pad de transformación ----------
  function handle(node, apply, step) {
    let px = 0, py = 0, moved = 0, id = null;
    node.addEventListener('pointerdown', e => {
      e.preventDefault(); id = e.pointerId; px = e.clientX; py = e.clientY; moved = 0;
      node.setPointerCapture(id); node.classList.add('hot');
    });
    node.addEventListener('pointermove', e => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      apply(dx, dy);
    });
    const end = e => {
      if (id !== e.pointerId) return;
      if (moved < 6) step();
      id = null; node.classList.remove('hot'); app.commit();
    };
    node.addEventListener('pointerup', end);
    node.addEventListener('pointercancel', end);
  }
  handle($('#padRot'), (dx, dy) => app.rotate((dx + dy) * .012), () => app.rotate(Math.PI / 12));
  handle($('#padScale'), (dx, dy) => app.scale(Math.exp((dx - dy) * .004)), () => app.scale(1.12));

  // ---------- sincronización ----------
  function sync() {
    el.undo.disabled = !canUndo();
    el.redo.disabled = !canRedo();
    const sel = !!state.selected;
    el.dockMain.hidden = sel;
    el.dockSt.hidden = !sel;
    el.pad.hidden = !sel;
    if (sel) open(null);
  }

  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.toast.classList.remove('on'), 1900);
  }

  const loading = (on, text = 'Procesando…') => { el.loaderText.textContent = text; el.loader.hidden = !on; };

  function preview(on) {
    document.body.classList.toggle('preview', on);
    el.exit.hidden = !on;
    if (on) open(null);
  }

  syncDims(); syncMat(); sync();
  return { sync, syncDims, syncMat, toast, loading, preview, open };
}
