// Cajas · editor 3D de cajas de cartón. Punto de entrada.
import { createRenderer } from './core/renderer.js';
import { createScene } from './app/scene.js';
import { createUI } from './app/ui.js';
import { createInput } from './app/input.js';
import { createOverlay } from './app/overlay.js';
import { removeBackground } from './features/removebg.js';
import { extent, faceLabel, faceShort, lidHalf, S, LIMITS } from './box/model.js';
import { clamp, damp, v3, rayPlane } from './core/math3d.js';
import * as store from './app/store.js';

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
const cam = { ...VIEW, min: 1.1, max: 5, dist: 2, vTheta: 0, vPhi: 0, target: v3(0, .3, 0), pan: v3(0, 0, 0) };
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

// ---------------------------------------------------------------- acciones
const sel = () => store.getSticker(state.selected);
const ghost = () => (state.placing ? store.getSticker(state.placing) : null);
const faceOf = s => s && scene.faceById(s.face);
const touch = s => { if (s) { scene.dirty(s.face); redraw = true; } };

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

const app = {
  // ---- medidas ----
  setDim(k, v) {
    const [min, max] = LIMITS[k];
    state.dims[k] = clamp(+v.toFixed(2), min, max);
    if (k === 'alto') state.dims.tapa = Math.min(state.dims.tapa, Math.max(LIMITS.tapa[0], v - 1));
    if (k === 'tapa') state.dims.tapa = Math.min(state.dims.tapa, state.dims.alto - 1);
    redraw = true;
  },
  setDims(d) { Object.assign(state.dims, d); redraw = true; },
  setMaterial(id) { state.material = id; store.emit('material'); store.commit(); redraw = true; },
  setOption(k, v) { state[k] = v; redraw = true; },

  // ---- tapa ----
  lid(action) {
    const d = state.dims;
    if (action === 'open') state.lid = { x: 0, y: d.alto * .55 + 6, z: 0 };
    else if (action === 'aside') state.lid = { x: d.ancho / 2 + lidHalf(d) + 3, y: -(d.alto - d.tapa), z: 0 };
    else state.lid = { x: 0, y: 0, z: 0 };
    store.commit(); ui.sync(); redraw = true;
    ui.toast(action === 'open' ? 'Tapa abierta' : action === 'aside' ? 'Tapa separada' : 'Tapa colocada');
  },
  toggleLidMove() {
    state.lidPicked = !state.lidPicked;
    ui.sync(); redraw = true;
    ui.toast(state.lidPicked ? 'Arrastra la tapa para moverla' : 'Tapa fijada');
  },

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
    ui.toast(`Colocada en ${faceLabel(hit.face)}`);
  },

  cancelPlacement() {
    const g = ghost();
    if (!g) return;
    state.stickers = state.stickers.filter(s => s.id !== g.id);
    scene.dirty(g.face);
    state.placing = null; state.hover = null;
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
    touch(s); ui.sync();
  },

  // ---- selección ----
  select(id) {
    if (state.selected === id) return;
    state.selected = id;
    if (id) { state.face = store.getSticker(id).face; state.lidPicked = false; }
    redraw = true;
    ui.sync();
  },
  pickFace(id) {
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

  // ---- transformar ----
  fit() {
    const s = sel(); if (!s) return;
    s.rot = 0; s.ratio = 1;
    fitSticker(s, faceOf(s), .92);
    s.u = s.v = .5;
    touch(s); store.commit(); ui.toast('Ajustada a la superficie');
  },
  center() {
    const s = sel(); if (!s) return;
    s.u = .5; s.v = .5;
    touch(s); store.commit(); ui.toast('Centrada');
  },
  duplicate() {
    const s = sel(); if (!s) return;
    const c = store.newSticker({ ...s, id: undefined, u: clamp(s.u + .1, 0, 1), v: clamp(s.v + .1, 0, 1) });
    state.stickers.push(c);
    app.select(c.id); store.commit(); touch(c);
  },
  remove() {
    const s = sel(); if (!s) return;
    state.stickers = state.stickers.filter(x => x.id !== s.id);
    scene.dirty(s.face);
    app.select(null); store.commit(); redraw = true;
    ui.toast('Imagen eliminada');
  },

  async cutout() {
    const s = sel(); if (!s) return;
    ui.loading(true, 'Eliminando fondo…');
    await new Promise(r => setTimeout(r, 30));      // deja pintar el indicador
    try {
      const out = await removeBackground(images.get(s.imgId));
      if (!out) { ui.toast('No se detectó un fondo claro'); return; }
      s.imgId = await store.addImage(out);          // conserva posición, giro y tamaño
      touch(s); store.commit();
      ui.toast('Fondo eliminado ✂️');
    } catch {
      ui.toast('No se pudo procesar');
    } finally {
      ui.loading(false); redraw = true;
    }
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
    Object.assign(cam, { theta: VIEW.theta, phi: VIEW.phi, zoom: VIEW.zoom, vTheta: 0, vPhi: 0 });
    cam.pan = v3(0, 0, 0);
    redraw = true; ui.toast('Vista centrada');
  },
  preview(on) {
    if (on) { app.select(null); app.pickFace(null); }
    state.spin = on ? true : document.getElementById('optSpin').checked;
    ui.preview(on); redraw = true;
  },

  // ---- historial ----
  undo() { store.undo(); after(); },
  redo() { store.redo(); after(); },
  reset() { store.resetAll(); after(); ui.toast('Diseño reiniciado'); },
  commit() { store.commit(); ui.sync(); },

  // ---- usados por gestos y manijas ----
  state, scene, cam, camera, surfaceAt, planeAt, touch, clampSticker,
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

function frame(now) {
  const dt = Math.min(.05, (now - prev) / 1000);
  prev = now;

  if (state.spin) { cam.theta += dt * .28; redraw = true; }
  else if (Math.abs(cam.vTheta) > 1e-4 || Math.abs(cam.vPhi) > 1e-4) {   // inercia al soltar
    cam.theta += cam.vTheta * dt;
    cam.phi = clamp(cam.phi + cam.vPhi * dt, .16, Math.PI - .05);
    const k = Math.exp(-4.5 * dt);
    cam.vTheta *= k; cam.vPhi *= k;
    if (Math.abs(cam.vTheta) < 1e-3) cam.vTheta = 0;
    if (Math.abs(cam.vPhi) < 1e-3) cam.vPhi = 0;
    redraw = true;
  }

  const a = scene.anim;
  const d = state.dims;
  const lift = Math.max(0, a.ly) * S;
  const want = v3(
    a.lx * S * .45 + cam.pan.x,
    (a.alto * .5) * S + lift * .35 + cam.pan.y,
    a.lz * S * .45 + cam.pan.z,
  );
  const moving = ['largo', 'ancho', 'alto', 'tapa', 'grosor'].some(k => Math.abs(a[k] - d[k]) > .005)
    || Math.abs(a.lx - state.lid.x) > .01 || Math.abs(a.ly - state.lid.y) > .01 || Math.abs(a.lz - state.lid.z) > .01
    || ['x', 'y', 'z'].some(k => Math.abs(cam.target[k] - want[k]) > 1e-4);

  if (moving || redraw) {
    const fast = moving || input.mode === 'sticker' || input.mode === 'lid' || input.mode === 'pinch-img' || overlay.busy;
    scene.update(dt, input.mode === 'lid');
    cam.dist = (extent(a) * S + (lift + Math.hypot(a.lx, a.lz) * S) * .85) * cam.zoom;
    for (const k of ['x', 'y', 'z']) cam.target[k] = damp(cam.target[k], want[k], 12, dt);
    renderer.resize(state.hq ? 2 : 1.25);
    const c = camera();
    scene.draw(c, fast);
    overlay.update(c);
    redraw = moving;
    settleT = now;
    canvas.classList.add('ready');
  } else if (now - settleT < 400) {
    const c = camera();
    scene.draw(c, false);          // un último fotograma nítido al asentarse
    overlay.update(c);
    settleT = 0;
  }
  requestAnimationFrame(frame);
}

// gancho de depuración opcional: abre la página con #dev
if (location.hash.includes('dev')) window.__cajas = { scene, cam, camera, state, renderer, app };

const hint = document.getElementById('hint');
setTimeout(() => hint.remove(), 5200);
canvas.addEventListener('pointerdown', () => hint.remove(), { once: true });

requestAnimationFrame(frame);
