// Cajas · editor 3D de cajas de cartón. Punto de entrada.
import { createRenderer } from './core/renderer.js';
import { createScene } from './app/scene.js';
import { createUI } from './app/ui.js';
import { createInput } from './app/input.js';
import { createOverlay } from './app/overlay.js';
import { removeBackground } from './features/removebg.js';
import { audio } from './features/audio.js';
import * as fx from './features/fx.js';
import { extent, faceLabel, faceShort, lidHalf, isHinged, lidAngle, S, LIMITS } from './box/model.js';
import { clamp, damp, v3, rayPlane } from './core/math3d.js';
import * as store from './app/store.js';
import { CATALOG, defaultsFor } from './objects/catalog.js';
import {
  clampObject, hasAnimation, applyRot, resetTransform, normalize,
  MODES, MODE_NAME, isSource, isStrip, isSwitch, isPower, canLink, wiring,
} from './app/objects.js';

const { state, images } = store;
const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = createRenderer(canvas);
} catch (e) {
  document.body.innerHTML = '<div class="loader"><span>Tu navegador no admite WebGL2 😕</span></div>';
  throw e;
}

const scene = createScene(renderer);
// zoom relativo al tamaño de la caja: al cambiar las medidas el encuadre se mantiene
const VIEW = { theta: -.68, phi: 1.02, zoom: 2.4 };
const cam = {
  ...VIEW,
  tTheta: VIEW.theta, tPhi: VIEW.phi, tZoom: VIEW.zoom,   // destino suavizado
  min: 1.1, max: 5, dist: 2, vTheta: 0, vPhi: 0,
  target: v3(0, .3, 0), pan: v3(0, 0, 0),
};
let redraw = true;

// entrada: la caja crece suavemente al abrir
Object.assign(scene.anim, { largo: 3, ancho: 3, alto: 2, tapa: 1 });

const camera = () => renderer.camera({
  eye: v3(
    cam.target.x + cam.dist * Math.sin(cam.phi) * Math.sin(cam.theta),
    cam.target.y + cam.dist * Math.cos(cam.phi),
    cam.target.z + cam.dist * Math.sin(cam.phi) * Math.cos(cam.theta),
  ),
  target: cam.target,
  fov: .72,
  aspect: canvas.clientWidth / Math.max(canvas.clientHeight, 1),
});

// ------------------------------------------------------------ superficies
/** Píxeles CSS → superficie tocada (cara + coordenadas dentro de ella). */
function surfaceAt(x, y) {
  const c = camera();
  const nx = x / canvas.clientWidth * 2 - 1, ny = 1 - y / canvas.clientHeight * 2;
  const hit = scene.pick(c.eye, c.ray(nx, ny), { skipPlain: true });
  return hit && !hit.face.plain ? hit : null;
}

/** Píxeles CSS → punto sobre el plano de una cara concreta (sin límites). */
function planeAt(x, y, face) {
  if (!face) return null;
  const c = camera();
  const nx = x / canvas.clientWidth * 2 - 1, ny = 1 - y / canvas.clientHeight * 2;
  return rayPlane(c.eye, c.ray(nx, ny), face);
}

/** Píxeles CSS → punto dentro de la caja (cm). Prefiere superficies horizontales. */
function spotAt(px, py, planeY = null) {
  const c = camera();
  const nx = px / canvas.clientWidth * 2 - 1, ny = 1 - py / canvas.clientHeight * 2;
  const rd = c.ray(nx, ny), ro = c.eye;
  if (planeY === null) {
    const hit = scene.pick(ro, rd, { skipPlain: true, skipXray: true });
    if (hit && hit.face.n.y > .5) {
      return { x: (ro.x + rd.x * hit.t) / S, y: (ro.y + rd.y * hit.t) / S, z: (ro.z + rd.z * hit.t) / S, face: hit.face };
    }
  }
  const y = (planeY ?? state.dims.grosor) * S;             // plano de apoyo
  const t = (y - ro.y) / (rd.y || 1e-6);
  if (t <= 0) return null;
  return { x: (ro.x + rd.x * t) / S, y: y / S, z: (ro.z + rd.z * t) / S, face: null };
}

/** Punto sobre la superficie interior que toca el dedo, separado un poco de ella. */
function surfacePoint(px, py) {
  const c = camera();
  const nx = px / canvas.clientWidth * 2 - 1, ny = 1 - py / canvas.clientHeight * 2;
  const rd = c.ray(nx, ny), ro = c.eye;
  const hit = scene.pick(ro, rd, { skipPlain: true, skipXray: true });
  const d = state.dims, t = d.grosor;
  let p = null;
  if (hit && hit.face.side[0] === 'i') {                    // paredes o fondo interiores
    const o = .9;                                           // cm de separación
    p = {
      x: (ro.x + rd.x * hit.t) / S + hit.face.n.x * o,
      y: (ro.y + rd.y * hit.t) / S + hit.face.n.y * o,
      z: (ro.z + rd.z * hit.t) / S + hit.face.n.z * o,
    };
  } else {
    const s = spotAt(px, py);                               // si no, sobre el fondo
    if (!s) return null;
    p = { x: s.x, y: Math.max(t + .9, s.y), z: s.z };
  }
  const ix = Math.max(.5, d.ancho / 2 - t - .6), iz = Math.max(.5, d.largo / 2 - t - .6);
  p.x = clamp(p.x, -ix, ix);
  p.z = clamp(p.z, -iz, iz);
  p.y = clamp(p.y, t + .5, d.alto + d.grosor);
  return p;
}

// ---------------------------------------------------------------- acciones
const sel = () => store.getSticker(state.selected);
const selObj = () => store.getObject(state.object);
const ghostObj = () => (state.placingObj ? store.getObject(state.placingObj) : null);
const ghost = () => (state.placing ? store.getSticker(state.placing) : null);
const faceOf = s => s && scene.faceById(s.face);
const touch = s => { if (s) { scene.dirty(s.face); redraw = true; } };

/** Escribe una propiedad admitiendo rutas («rot.x», «scl.z»). */
function setPath(o, path, v) {
  const p = path.split('.');
  let t = o;
  while (p.length > 1) t = t[p.shift()];
  t[p[0]] = v;
}

/** Mantiene la imagen dentro de su superficie (si cabe); si no, la centra. */
function clampSticker(s, face = faceOf(s)) {
  const box = face && scene.stickerBox(s, face);
  if (!box) return;
  const c = Math.abs(Math.cos(s.rot)), si = Math.abs(Math.sin(s.rot));
  const hu = (box.w * c + box.h * si) / 2 / face.uLen;
  const hv = (box.w * si + box.h * c) / 2 / face.vLen;
  const mu = Math.min(.5, hu), mv = Math.min(.5, hv);
  s.u = clamp(s.u, mu, 1 - mu);
  s.v = clamp(s.v, mv, 1 - mv);
}

/** Tamaño inicial: la imagen ocupa una parte de la cara sin salirse. */
function fitSticker(s, face, coverage = .55) {
  const img = images.get(s.imgId);
  if (!img || !face) return;
  const ar = (img.height / img.width) * (s.ratio ?? 1);
  s.size = Math.min(coverage, (face.vLen * coverage) / (face.uLen * ar));
}

/** ¿Qué caras alcanza el forro según el ámbito elegido? */
const SCOPES = {
  all: () => true,
  ext: f => f.part === 'box' && f.side[0] === 'o',
  int: f => f.side[0] === 'i' && f.part === 'box',
  tapa: f => f.part === 'lid',
  div: f => f.id.includes('.div'),
};

const app = {
  // ---- medidas y diseño ----
  setDim(k, v) {
    const [min, max] = LIMITS[k];
    state.dims[k] = clamp(+v.toFixed(2), min, max);
    if (k === 'alto') state.dims.tapa = Math.min(state.dims.tapa, Math.max(LIMITS.tapa[0], v - 1));
    if (k === 'tapa') state.dims.tapa = Math.min(state.dims.tapa, state.dims.alto - 1);
    redraw = true;
  },
  setDims(d) { Object.assign(state.dims, d); redraw = true; },
  setDesign(id) {
    state.design = id;
    if (id === 'abierta' || isHinged(id)) state.lid = { x: 0, y: state.lid.y > 0 ? state.lid.y : 0, z: 0 };
    state.lidPicked = false;
    scene.markAll(); store.commit(); ui.sync(); redraw = true;
    audio.play('lidOpen');
  },
  setDivisions(n) {
    state.divisions = clamp(Math.round(n), 2, 4);
    scene.markAll(); redraw = true;
  },
  setMaterial(id) { state.material = id; store.emit('material'); store.commit(); audio.play('select'); redraw = true; },
  setOption(k, v) {
    state[k] = v;
    if (k === 'sound') audio.sound = v;
    if (k === 'buzz') audio.haptics = v;
    redraw = true;
  },

  // ---- tapa ----
  lid(action) {
    const d = state.dims;
    if (isHinged(state.design)) {
      state.lid = { x: 0, y: action === 'close' ? 0 : 14, z: 0 };
    } else if (action === 'open') state.lid = { x: 0, y: d.alto * .55 + 6, z: 0 };
    else if (action === 'aside') state.lid = { x: d.ancho / 2 + lidHalf(d) + 3, y: -(d.alto - d.tapa), z: 0 };
    else state.lid = { x: 0, y: 0, z: 0 };
    audio.play(action === 'close' ? 'lidClose' : 'lidOpen');
    store.commit(); ui.sync(); redraw = true;
    ui.toast(action === 'open' ? 'Tapa abierta' : action === 'aside' ? 'Tapa separada' : 'Tapa colocada');
  },
  toggleLidMove() {
    state.lidPicked = !state.lidPicked;
    audio.play('toggle');
    ui.sync(); redraw = true;
    ui.toast(state.lidPicked ? 'Arrastra la tapa para moverla' : 'Tapa fijada');
  },
  lidHinged: () => isHinged(state.design),

  // ---- imágenes: colocación guiada ----
  async addImage(src) {
    ui.loading(true, 'Cargando imagen…');
    try {
      const imgId = await store.addImage(src);
      if (state.placing) app.cancelPlacement();
      const s = store.newSticker({ face: null, imgId, ghost: true });   // aún sin superficie: nada se decide solo
      state.stickers.push(s);
      state.placing = s.id;
      state.selected = null;
      ui.placing(src);
      ui.sync();
      audio.play('whoosh');
      ui.toast('Arrastra la imagen sobre la superficie que quieras');
    } catch {
      ui.toast('No se pudo cargar la imagen');
    } finally {
      ui.loading(false);
      redraw = true;
    }
  },

  /** Mueve la vista previa translúcida bajo el dedo. */
  moveGhost(x, y) {
    const g = ghost();
    if (!g) return false;
    const hit = surfaceAt(x, y);
    if (hit) {
      if (hit.face.id !== g.face) {
        const old = scene.faceById(g.face);
        if (old) { scene.dirty(old.id); g.size = clamp(g.size * old.uLen / hit.face.uLen, .03, 3); }
        else fitSticker(g, hit.face);              // primera superficie tocada
        g.face = hit.face.id;
        audio.play('hover');
      }
      g.u = hit.u; g.v = hit.v;
      clampSticker(g, hit.face);
      state.hover = hit.face.id;
    } else {
      state.hover = null;
    }
    touch(g); redraw = true;
    return !!hit;
  },

  /** Suelta la imagen: solo se coloca donde el usuario la dejó. */
  dropGhost(x, y, wasTap) {
    const g = ghost();
    if (!g) return;
    const hit = surfaceAt(x, y) || (wasTap && state.face ? { face: scene.faceById(state.face), u: .5, v: .5 } : null);
    if (hit && hit.face && !g.face) fitSticker(g, hit.face);
    state.hover = null;
    if (!hit || !hit.face) {
      audio.play('error');
      ui.toast('Suéltala sobre la caja para colocarla');
      redraw = true;
      return;
    }
    if (wasTap) { g.face = hit.face.id; g.u = hit.u; g.v = hit.v; fitSticker(g, hit.face); }
    delete g.ghost;
    state.placing = null;
    state.face = g.face;
    ui.placing(null);
    app.select(g.id);
    touch(g);
    store.commit();
    audio.play('place');
    const c = camera().project(scene.stickerFrame(g)?.center || { x: 0, y: 0, z: 0 });
    if (c) fx.ring(c.x, c.y, 'ok');
    ui.toast(`Colocada en ${faceLabel(hit.face)}`);
  },

  cancelPlacement() {
    const g = ghost();
    if (!g) return;
    state.stickers = state.stickers.filter(s => s.id !== g.id);
    scene.dirty(g.face);
    state.placing = null; state.hover = null;
    audio.play('remove');
    ui.placing(null); ui.sync(); redraw = true;
  },

  /** Cambio de superficie conservando el tamaño físico (cm). */
  moveToFace(s, face, u, v) {
    const old = scene.faceById(s.face);
    scene.dirty(s.face);
    if (old) s.size = clamp(s.size * old.uLen / face.uLen, .03, 3);
    s.face = face.id; s.u = u; s.v = v;
    clampSticker(s, face);
    state.face = face.id;
    audio.play('hover');
    touch(s); ui.sync();
  },

  // ---- selección ----
  select(id) {
    if (state.selected === id) return;
    state.selected = id;
    if (id) { state.face = store.getSticker(id).face; state.lidPicked = false; audio.play('select'); }
    redraw = true;
    ui.sync();
  },
  pickFace(id) {
    if (id && id !== state.face) audio.play('select');
    state.face = id;
    if (!id || !scene.faceById(id) || scene.faceById(id).part !== 'lid') state.lidPicked = false;
    redraw = true; ui.sync();
  },
  hover(id) { if (state.hover !== id) { state.hover = id; redraw = true; } },
  surfaceLabel() {
    const s = sel();
    const f = scene.faceById(state.hover || (s ? s.face : state.face));   // lo que hay bajo el dedo manda
    if (!f) return null;
    return { name: faceShort(f), lid: f.part === 'lid' && !s && !state.hover };
  },

  // ---- transformar imagen ----
  fit() {
    const s = sel(); if (!s) return;
    s.rot = 0; s.ratio = 1;
    fitSticker(s, faceOf(s), .92);
    s.u = s.v = .5;
    touch(s); store.commit(); audio.play('success'); ui.toast('Ajustada a la superficie');
  },
  center() {
    const s = sel(); if (!s) return;
    s.u = .5; s.v = .5;
    touch(s); store.commit(); audio.play('tick'); ui.toast('Centrada');
  },
  duplicate() {
    const s = sel(); if (!s) return;
    const c = store.newSticker({ ...s, id: undefined, u: clamp(s.u + .1, 0, 1), v: clamp(s.v + .1, 0, 1) });
    state.stickers.push(c);
    app.select(c.id); store.commit(); touch(c); audio.play('place');
  },
  remove() {
    const s = sel(); if (!s) return;
    const p = camera().project(scene.stickerFrame(s)?.center || { x: 0, y: 0, z: 0 });
    if (p) fx.ring(p.x, p.y, 'danger');
    audio.play('remove');
    state.stickers = state.stickers.filter(x => x.id !== s.id);
    scene.dirty(s.face);
    app.select(null); store.commit(); redraw = true;
    ui.toast('Imagen eliminada');
  },

  async cutout() {
    const s = sel(); if (!s) return;
    ui.loading(true, 'Eliminando fondo…');
    audio.play('cut');
    await new Promise(r => setTimeout(r, 30));      // deja pintar el indicador
    try {
      const out = await removeBackground(images.get(s.imgId));
      if (!out) { audio.play('error'); ui.toast('No se detectó un fondo claro'); return; }
      s.imgId = await store.addImage(out);          // conserva posición, giro y tamaño
      touch(s); store.commit();
      audio.play('success'); fx.flash();
      ui.toast('Fondo eliminado ✂️');
    } catch {
      ui.toast('No se pudo procesar');
    } finally {
      ui.loading(false); redraw = true;
    }
  },

  // ---- objetos 3D ----
  tool(kind) {
    if (kind === 'foto') { document.getElementById('filePick').click(); return; }
    if (kind === 'forro') {
      state.lineTool = 'forrar';
      ui.open('forro'); ui.sync(); redraw = true;
      ui.toast('Toca una parte de la caja para forrarla');
      return;
    }
    if (kind === 'tira') app.startStrip();
  },

  addObject(type) {
    const def = CATALOG[type];
    if (!def || def.tool) return;
    app.cancelObject();
    app.select(null);
    const o = store.newObject({
      type, color: def.color, ghost: true,
      y: state.dims.grosor, z: 0, x: 0,
      ...defaultsFor(type),
      ...(isSource({ type }) ? { mode: def.power ? 'warm' : 'off', hue: '#ffb463', power: 1, blink: 1.4 } : {}),
    });
    state.objects.push(o);
    state.placingObj = o.id;
    state.object = null;
    ui.bar({ title: `Coloca ${def.name.toLowerCase()}`, hint: 'arrástralo o toca dentro de la caja', ok: 'Colocar' },
      () => app.dropObject(), () => app.cancelObject());
    audio.play('whoosh');
    ui.sync(); redraw = true;
  },

  /** Mueve el objeto bajo el dedo; `grab` conserva la distancia al punto agarrado. */
  moveObject(o, px, py, planeY = null, grab = null) {
    if (!o) return false;
    const p = spotAt(px, py, planeY);
    if (!p) return false;
    o.x = p.x + (grab?.x || 0);
    o.z = p.z + (grab?.z || 0);
    if (planeY === null) o.y = Math.max(state.dims.grosor, p.y);
    clampObject(o, state.dims, scene.meshOf(o));
    redraw = true;
    return true;
  },

  dropObject() {
    const g = ghostObj();
    if (!g) return;
    delete g.ghost;
    state.placingObj = null;
    state.object = g.id;
    ui.bar(null);
    const c = camera().project(scene.centerOf(g));
    if (c) fx.ring(c.x, c.y, 'ok');
    audio.play('place');
    store.commit(); ui.sync(); redraw = true;
    if (state.repeat) { app.addObject(g.type); ui.toast('Otro más · toca para colocarlo'); return; }
    ui.toast(`${CATALOG[g.type].name} · arrástralo para moverlo`);
  },

  cancelObject() {
    const g = ghostObj();
    if (!g) return;
    state.objects = state.objects.filter(o => o.id !== g.id);
    state.placingObj = null;
    ui.bar(null); ui.sync(); redraw = true;
  },

  selectObject(id) {
    if (state.object === id) return;
    state.object = id;
    if (id) { app.select(null); state.face = null; audio.play('select'); }
    if (state.linking && id && id !== state.linking) app.linkTo(id);
    ui.sync(); redraw = true;
  },
  selectedObject: selObj,
  openObject() { if (selObj()) ui.open('obj'); },

  objSet(k, v) {
    const o = selObj(); if (!o) return;
    normalize(o);
    setPath(o, k, v);
    if (k.startsWith('rot')) applyRot(o, o.rot, state.rotMode);
    clampObject(o, state.dims, scene.meshOf(o));
    redraw = true;
  },
  /** Escala uniforme: mueve los tres ejes conservando su proporción. */
  objScale(v) {
    const o = selObj(); if (!o) return;
    normalize(o);
    const m = (o.scl.x + o.scl.y + o.scl.z) / 3 || 1;
    for (const k of ['x', 'y', 'z']) o.scl[k] = clamp(o.scl[k] * (v / m), .2, 4);
    clampObject(o, state.dims, scene.meshOf(o));
    redraw = true;
  },
  setObjRot(o, rot) { applyRot(o, rot, state.rotMode); redraw = true; },
  setRotMode(m) {
    state.rotMode = m;
    const o = selObj();
    if (o) applyRot(o, o.rot, m);
    audio.play('toggle'); ui.sync(); redraw = true;
    ui.toast(m === 'libre' ? 'Giro libre' : m === 'asistida' ? 'Giro asistido: se mantiene derecho' : 'Giro simétrico de 15°');
  },
  resetObject(what) {
    const o = selObj(); if (!o) return;
    resetTransform(o, what);
    clampObject(o, state.dims, scene.meshOf(o));
    audio.play('success'); store.commit(); ui.sync(); redraw = true;
    ui.toast(what === 'rot' ? 'Giro restablecido' : what === 'scl' ? 'Tamaño restablecido' : 'Objeto restablecido');
  },
  objColor(hex) {
    const o = selObj(); if (!o) return;
    o.color = hex; store.commit(); redraw = true;
  },
  centerObject() {
    const o = selObj(); if (!o) return;
    o.x = 0; o.z = 0;
    clampObject(o, state.dims, scene.meshOf(o));
    audio.play('tick'); store.commit(); redraw = true;
    ui.toast('Objeto centrado');
  },
  floorObject() {
    const o = selObj(); if (!o) return;
    o.y = state.dims.grosor;
    audio.play('tick'); store.commit(); redraw = true;
    ui.toast('Apoyado en el fondo');
  },
  duplicateObject() {
    const o = selObj(); if (!o) return;
    const c = store.newObject({ ...o, id: undefined, x: o.x + 2, z: o.z + 2 });
    if (o.path) c.path = o.path.map(p => [...p]);
    clampObject(c, state.dims, scene.meshOf(c));
    state.objects.push(c);
    state.object = c.id;
    audio.play('place'); store.commit(); ui.sync(); redraw = true;
    ui.toast('Copia creada');
  },
  lockObject() {
    const o = selObj(); if (!o) return;
    o.locked = !o.locked;
    audio.play('toggle'); store.commit(); ui.sync(); redraw = true;
    ui.toast(o.locked ? 'Objeto fijado' : 'Objeto libre');
  },
  removeObject() {
    const o = selObj(); if (!o) return;
    const p = camera().project(scene.centerOf(o));
    if (p) fx.ring(p.x, p.y, 'danger');
    audio.play('remove');
    state.objects = state.objects.filter(x => x.id !== o.id);
    delete state.links[o.id];
    for (const k in state.links) state.links[k] = state.links[k].filter(id => id !== o.id);
    state.object = null;
    store.commit(); ui.sync(); redraw = true;
    ui.toast('Objeto eliminado');
  },

  // ---- tiras de luces ----
  startStrip() {
    app.select(null); app.selectObject(null);
    state.drawing = { path: [], color: '#fff3d6', thick: .5 };
    ui.bar({ title: 'Dibuja la tira de luces', hint: 'se forma bajo tu dedo', ok: 'Listo' },
      () => app.endStrip(true), () => app.endStrip(false));
    audio.play('whoosh'); ui.sync(); redraw = true;
  },
  strokeStrip(px, py) {
    const d = state.drawing; if (!d) return;
    const p = surfacePoint(px, py);
    if (!p) return;
    const last = d.path[d.path.length - 1];
    if (last && Math.hypot(p.x - last[0], p.y - last[1], p.z - last[2]) < 1.1) return;
    d.path.push([p.x, p.y, p.z]);
    if (d.path.length % 3 === 0) audio.play('tick');
    redraw = true;
  },
  endStrip(keep) {
    const d = state.drawing;
    state.drawing = null;
    ui.bar(null);
    if (keep && d && d.path.length > 2) {
      // nace apagada: sin fuente de energía no puede encender
      const o = store.newObject({ type: 'tira', path: d.path, color: d.color, thick: d.thick });
      state.objects.push(o);
      state.object = o.id;
      audio.play('success'); fx.flash();
      store.commit();
      ui.toast('Conecta un interruptor o una caja de pilas para encenderla');
    } else if (keep) {
      audio.play('error');
      ui.toast('Traza un recorrido más largo');
    }
    ui.sync(); redraw = true;
  },

  // ---- interruptores, pilas y conexiones ----
  cycleSwitch(o) {
    o.mode = MODES[(MODES.indexOf(o.mode || 'off') + 1) % MODES.length];
    audio.play(o.mode === 'off' ? 'toggle' : 'light');
    ui.toast(`${isPower(o) ? 'Pilas' : 'Interruptor'}: ${MODE_NAME[o.mode]}`);
    store.commit(); ui.sync(); redraw = true;
  },
  setSwitchMode(m) {
    const o = selObj(); if (!o) return;
    o.mode = m;
    audio.play(m === 'off' ? 'toggle' : 'light');
    store.commit(); ui.sync(); redraw = true;
  },
  setLight(k, v) {
    const o = selObj(); if (!o) return;
    o[k] = v;
    if (k !== 'blink' && (o.mode || 'off') === 'off') o.mode = 'custom';
    redraw = true;
  },
  startLink() {
    const o = selObj(); if (!o) return;
    state.linking = o.id;
    ui.open(null);
    const what = isPower(o) ? 'un interruptor o una tira' : 'una tira de luces';
    ui.bar({ title: `Toca ${what}`, hint: 'para conectarlo · tócalo otra vez para quitarlo', ok: 'Terminar' },
      () => app.endLink(), () => app.endLink());
    ui.sync(); redraw = true;
  },
  endLink() { state.linking = null; ui.bar(null); ui.sync(); redraw = true; },
  linkTo(id) {
    const src = store.getObject(state.linking), target = store.getObject(id);
    if (!canLink(src, target)) {
      audio.play('error');
      ui.toast(isPower(src) ? 'Conéctalo a un interruptor o a una tira' : 'Un interruptor solo alimenta tiras');
      return;
    }
    const list = state.links[src.id] || (state.links[src.id] = []);
    const i = list.indexOf(id);
    if (i >= 0) { list.splice(i, 1); ui.toast('Conexión eliminada'); }
    else { list.push(id); ui.toast('Conectado · enciéndelo desde su panel'); }
    audio.play('success');
    state.linking = null;                     // una conexión por vez: sin toques accidentales
    state.object = src.id;
    ui.bar(null);
    store.commit(); ui.sync(); redraw = true;
  },
  unlinkAll() {
    const o = selObj(); if (!o) return;
    delete state.links[o.id];
    for (const k in state.links) state.links[k] = state.links[k].filter(id => id !== o.id);
    audio.play('remove'); store.commit(); ui.sync(); redraw = true;
    ui.toast('Conexiones quitadas');
  },
  wiringOf(o) { return wiring(o, state.objects, state.links); },

  // ---- forrar cartón ----
  setLining(patch) {
    const id = state.face;
    if (!id) { audio.play('error'); ui.toast('Toca antes una parte de la caja'); return; }
    const cur = state.lining[id] || { color: '#ffffff', finish: 'papel' };
    state.lining[id] = { ...cur, ...patch };
    scene.dirty(id); store.commit(); redraw = true;
  },
  liningScope(scope) {
    const cur = state.lining[state.face] || { color: '#f2a5b8', finish: 'papel' };
    const match = SCOPES[scope] || SCOPES.all;
    let n = 0;
    for (const f of scene.faces) if (match(f)) { state.lining[f.id] = { ...cur }; n++; }
    scene.markAll(); audio.play(n ? 'success' : 'error'); store.commit(); redraw = true;
    ui.toast(n ? `Forradas ${n} superficies` : 'Ese diseño no tiene esa parte');
  },
  clearLining() {
    if (state.face) delete state.lining[state.face];
    else state.lining = {};
    scene.markAll(); audio.play('remove'); store.commit(); redraw = true;
    ui.toast('Forro quitado');
  },
  currentLining() {
    const f = state.face ? scene.faceById(state.face) : null;
    const l = state.face ? state.lining[state.face] : null;
    return { name: f ? faceShort(f) : null, color: l?.color, finish: l?.finish };
  },

  // ---- vista ----
  pan(dx, dy) {
    const c = camera();
    const k = 2 * Math.tan(.36) * cam.dist / canvas.clientHeight;
    const lim = extent(scene.anim) * S * .9;
    cam.pan.x = clamp(cam.pan.x - (c.right.x * dx - c.up.x * dy) * k, -lim, lim);
    cam.pan.y = clamp(cam.pan.y - (c.right.y * dx - c.up.y * dy) * k, -lim, lim);
    cam.pan.z = clamp(cam.pan.z - (c.right.z * dx - c.up.z * dy) * k, -lim, lim);
  },
  resetView() {
    Object.assign(cam, {
      tTheta: VIEW.theta, tPhi: VIEW.phi, tZoom: VIEW.zoom, vTheta: 0, vPhi: 0,
    });
    cam.pan = v3(0, 0, 0);
    redraw = true; audio.play('whoosh'); ui.toast('Vista centrada');
  },
  preview(on) {
    if (on) { app.select(null); app.pickFace(null); }
    state.spin = on ? true : document.getElementById('optSpin').checked;
    audio.play(on ? 'whoosh' : 'panel');
    ui.preview(on); redraw = true;
  },

  // ---- historial ----
  undo() { store.undo(); after(); audio.play('undo'); },
  redo() { store.redo(); after(); audio.play('redo'); },
  reset() { store.resetAll(); after(); fx.flash(); audio.play('whoosh'); ui.toast('Diseño reiniciado'); },
  commit() { store.commit(); ui.sync(); },

  // ---- usados por gestos y manijas ----
  state, scene, cam, camera, surfaceAt, planeAt, touch, clampSticker,
  spotAt, ghostObj, getObject: store.getObject,
  clampObject: o => clampObject(o, state.dims, scene.meshOf(o)),
  isSource, isSwitch, isPower, isStrip,
  selected: sel, ghost, getSticker: store.getSticker,
  redraw: () => { redraw = true; },
  toast: m => ui.toast(m),
  spinOff: () => { if (state.spin && !document.getElementById('optSpin').checked) state.spin = false; redraw = true; },
};

function after() { ui.sync(); ui.syncDims(); ui.syncMat(); scene.markAll(); redraw = true; }

const ui = createUI(app);
const overlay = createOverlay(app);
const input = createInput(canvas, app);
store.on(w => { redraw = true; if (w === 'history' || w === 'restore') ui.sync(); });

// ---------------------------------------------------------------- bucle
addEventListener('resize', () => { redraw = true; });
let prev = performance.now(), settleT = 0;

let clock = 0, lastGlow = 0;
function frame(now) {
  const dt = Math.min(.05, (now - prev) / 1000);
  prev = now;
  clock += dt;
  if (hasAnimation(state.objects, state.links) && now - lastGlow > 48) { lastGlow = now; redraw = true; }

  if (state.spin) { cam.tTheta += dt * .28; redraw = true; }
  else if (Math.abs(cam.vTheta) > 1e-4 || Math.abs(cam.vPhi) > 1e-4) {   // inercia al soltar
    cam.tTheta += cam.vTheta * dt;
    cam.tPhi = clamp(cam.tPhi + cam.vPhi * dt, .16, Math.PI - .05);
    const k = Math.exp(-4.5 * dt);
    cam.vTheta *= k; cam.vPhi *= k;
    if (Math.abs(cam.vTheta) < 1e-3) cam.vTheta = 0;
    if (Math.abs(cam.vPhi) < 1e-3) cam.vPhi = 0;
  }

  // la cámara persigue su destino: el movimiento nunca es brusco
  const camGap = Math.abs(cam.theta - cam.tTheta) + Math.abs(cam.phi - cam.tPhi) + Math.abs(cam.zoom - cam.tZoom);
  if (camGap > 1e-4) {
    cam.theta = damp(cam.theta, cam.tTheta, 22, dt);
    cam.phi = damp(cam.phi, cam.tPhi, 22, dt);
    cam.zoom = damp(cam.zoom, cam.tZoom, 18, dt);
  } else {
    cam.theta = cam.tTheta; cam.phi = cam.tPhi; cam.zoom = cam.tZoom;
  }

  const a = scene.anim;
  const d = state.dims;
  // al abrirse, la tapa con bisagra sube en arco: el encuadre la sigue
  const lift = isHinged(state.design)
    ? Math.sin(lidAngle(a.ly)) * (a.largo * .55 + a.tapa) * S
    : Math.max(0, a.ly) * S;
  const want = v3(
    a.lx * S * .45 + cam.pan.x,
    (a.alto * .5) * S + lift * .35 + cam.pan.y,
    a.lz * S * .45 + cam.pan.z,
  );
  const moving = !scene.settled()
    || camGap > 1e-4
    || ['largo', 'ancho', 'alto', 'tapa', 'grosor'].some(k => a[k] !== d[k])
    || a.lx !== state.lid.x || a.ly !== state.lid.y || a.lz !== state.lid.z
    || ['x', 'y', 'z'].some(k => Math.abs(cam.target[k] - want[k]) > 1e-4);

  if (moving || redraw) {
    const fast = moving || input.mode === 'sticker' || input.mode === 'lid' || input.mode === 'pinch-img' || overlay.busy;
    scene.update(dt, input.mode === 'lid');
    cam.dist = (extent(a) * S + (lift + Math.hypot(a.lx, a.lz) * S) * .85) * cam.zoom;
    for (const k of ['x', 'y', 'z']) cam.target[k] = damp(cam.target[k], want[k], 12, dt);
    renderer.resize(state.hq ? 2 : 1.25);
    const c = camera();
    scene.draw(c, fast, clock);
    overlay.update(c);
    redraw = moving;
    settleT = now;
    if (!canvas.classList.contains('ready')) {
      canvas.classList.add('ready');
      setTimeout(() => {
        document.body.classList.add('booted');
        setTimeout(() => document.getElementById('splash')?.remove(), 700);
      }, 420);
    }
  } else if (now - settleT < 400) {
    const c = camera();
    scene.draw(c, false, clock);   // un último fotograma nítido al asentarse
    overlay.update(c);
    settleT = 0;
  }
  requestAnimationFrame(frame);
}

// gancho de depuración opcional: abre la página con #dev
if (location.hash.includes('dev')) window.__cajas = { scene, cam, camera, state, renderer, app, input };

const hint = document.getElementById('hint');
setTimeout(() => hint.remove(), 5200);
canvas.addEventListener('pointerdown', () => hint.remove(), { once: true });

requestAnimationFrame(frame);
