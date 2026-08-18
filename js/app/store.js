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

const defaults = () => Object.fromEntries(Object.keys(LIMITS).map(k => [k, LIMITS[k][2]]));

let objSeq = 0;
/** Todo objeto nace con la transformación completa: posición, giro y escala en 3 ejes. */
export function newObject(o = {}) {
  const r = typeof o.rot === 'number' ? { x: 0, y: o.rot, z: 0 } : o.rot;
  const s = typeof o.scale === 'number' ? { x: o.scale, y: o.scale, z: o.scale } : o.scl;
  return {
    id: 'o' + (++objSeq), x: 0, y: 0, z: 0, ...o,
    type: o.type === 'interruptor' ? 'boton' : o.type,   // diseños guardados antes del botón
    rot: { x: 0, y: 0, z: 0, ...r },
    scl: { x: 1, y: 1, z: 1, ...s },
  };
}

export const state = {
  dims: defaults(),            // largo, ancho, alto, tapa, grosor (cm)
  design: 'clasica',           // diseño de caja elegido
  divisions: 2,                // compartimentos (solo en ese diseño)
  rotMode: 'libre',            // libre | asistida | simetrica
  material: 'kraft',
  lid: { x: 0, y: 0, z: 0 },   // desplazamiento objetivo de la tapa (cm)
  stickers: [],                // {id, face, u, v, size, ratio, rot, imgId, ghost?}
  selected: null,              // imagen seleccionada
  face: null,                  // superficie seleccionada (id de cara)
  hover: null,                 // superficie bajo el dedo mientras se coloca/arrastra
  placing: null,               // {id} imagen pendiente de colocar
  lidPicked: false,            // tapa lista para moverse con el dedo
  lockAspect: true,

  objects: [],                 // objetos 3D dentro de la caja
  links: {},                   // interruptor → [tiras que controla]
  lining: {},                  // cara → {color, finish} del forro
  object: null,                // objeto 3D seleccionado
  placingObj: null,            // objeto pendiente de colocar
  drawing: null,               // tira de luces que se está dibujando
  linking: null,               // interruptor en modo "conectar"
  lineTool: null,              // herramienta activa (forrar, tira…)
  repeat: false,               // seguir colocando el mismo objeto
  spin: false, shadow: true, hq: true, sound: true, buzz: true, xray: false,
};

export const newSticker = o => ({ id: 's' + (++stSeq), u: .5, v: .5, size: .5, ratio: 1, rot: 0, ...o });
export const getSticker = id => state.stickers.find(s => s.id === id) || null;
export const getObject = id => state.objects.find(o => o.id === id) || null;
export const realObjects = () => state.objects.filter(o => !o.ghost);
export const stickersOf = faceId => state.stickers.filter(s => s.face === faceId);
export const realStickers = () => state.stickers.filter(s => !s.ghost);

// ---------- historial ----------
const past = [], future = [];
const snap = () => JSON.stringify({
  d: state.dims, m: state.material, l: state.lid, s: realStickers(),
  o: realObjects(), k: state.links, f: state.lining,
  g: state.design, v: state.divisions,
});
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
  state.objects = (o.o || []).map(newObject);
  state.links = o.k || {};
  state.lining = o.f || {};
  state.design = o.g || 'clasica';
  state.divisions = o.v ?? 2;
  state.placing = null; state.hover = null; state.placingObj = null; state.drawing = null;
  if (!getSticker(state.selected)) state.selected = null;
  if (!getObject(state.object)) state.object = null;
  last = str;
  emit('restore');
}

export function undo() { if (!past.length) return; future.push(last); apply(past.pop()); }
export function redo() { if (!future.length) return; past.push(last); apply(future.pop()); }
export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

export function resetAll() {
  state.dims = defaults();
  state.design = 'clasica'; state.divisions = 2;
  state.material = 'kraft';
  state.lid = { x: 0, y: 0, z: 0 };
  state.stickers = [];
  state.objects = []; state.links = {}; state.lining = {};
  state.selected = state.face = state.hover = state.placing = null;
  state.object = state.placingObj = state.drawing = state.linking = state.lineTool = null;
  state.lidPicked = false;
  commit();
  emit('restore');
}
