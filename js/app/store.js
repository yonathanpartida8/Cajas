// Estado central + historial (deshacer/rehacer) + registro de imágenes.
import { LIMITS } from '../box/model.js';

const listeners = new Set();
export const on = fn => (listeners.add(fn), () => listeners.delete(fn));
export const emit = (what = 'change') => listeners.forEach(f => f(what));

/** Imágenes cargadas: id → HTMLImageElement (fuera del historial). */
export const images = new Map();
let imgSeq = 0, stSeq = 0;

export function addImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const id = 'i' + (++imgSeq); images.set(id, img); res(id); };
    img.onerror = rej;
    img.src = src;
  });
}

export const state = {
  dims: { largo: LIMITS.largo[2], ancho: LIMITS.ancho[2], alto: LIMITS.alto[2], tapa: LIMITS.tapa[2] },
  material: 'kraft',
  lid: { x: 0, y: 0, z: 0 },   // desplazamiento objetivo de la tapa (cm)
  stickers: [],                // {id, face, u, v, size, rot, imgId}
  selected: null,              // id de imagen seleccionada
  lidPicked: false,            // tapa seleccionada para moverla
  spin: false, shadow: true, hq: true,
};

export const newSticker = o => ({ id: 's' + (++stSeq), u: .5, v: .5, size: .55, rot: 0, ...o });
export const getSticker = id => state.stickers.find(s => s.id === id) || null;
export const stickersOf = faceId => state.stickers.filter(s => s.face === faceId);

// ---------- historial ----------
const past = [], future = [];
const snap = () => JSON.stringify({ d: state.dims, m: state.material, l: state.lid, s: state.stickers });
let last = snap();

/** Guarda el estado actual como punto de retorno. */
export function commit() {
  const now = snap();
  if (now === last) return;
  past.push(last); if (past.length > 40) past.shift();
  future.length = 0;
  last = now;
  emit('history');
}

function apply(str) {
  const o = JSON.parse(str);
  Object.assign(state.dims, o.d);
  Object.assign(state.lid, o.l);
  state.material = o.m;
  state.stickers = o.s;
  if (!getSticker(state.selected)) state.selected = null;
  last = str;
  emit('restore');
}

export function undo() { if (!past.length) return; future.push(last); apply(past.pop()); }
export function redo() { if (!future.length) return; past.push(last); apply(future.pop()); }
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function resetAll() {
  state.dims = { largo: LIMITS.largo[2], ancho: LIMITS.ancho[2], alto: LIMITS.alto[2], tapa: LIMITS.tapa[2] };
  state.material = 'kraft';
  state.lid = { x: 0, y: 0, z: 0 };
  state.stickers = [];
  state.selected = null; state.lidPicked = false;
  commit();
  emit('restore');
}
