// Cajas · editor 3D de cajas de cartón. Punto de entrada.
import { createRenderer } from './core/renderer.js';
import { createScene } from './app/scene.js';
import { createUI } from './app/ui.js';
import { createInput } from './app/input.js';
import { removeBackground } from './features/removebg.js';
import { extent, faceLabel, S, GAP, THICK, LIMITS } from './box/model.js';
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
const cam = { theta: -.68, phi: 1.02, zoom: 2.4, min: 1.15, max: 5, dist: 2, target: v3(0, .3, 0) };
let redraw = true;

// entrada "la caja aparece": arranca pequeña y crece
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

// ---------------------------------------------------------------- acciones
const sel = () => store.getSticker(state.selected);
const faceOf = s => s && scene.faceById(s.face);
const touch = s => { if (s) { scene.dirty(s.face); redraw = true; } };

function fitSticker(s, face, coverage = .62) {
  const img = images.get(s.imgId);
  if (!img || !face) return;
  const ar = img.height / img.width;
  s.size = Math.min(coverage, (face.vLen * coverage) / (face.uLen * ar));
  s.u = .5; s.v = .5; s.rot = 0;
}

const app = {
  setDim(k, v) {
    state.dims[k] = clamp(v, LIMITS[k][0], LIMITS[k][1]);
    if (k === 'alto') state.dims.tapa = Math.min(state.dims.tapa, Math.max(2, v - 1));
    redraw = true;
  },
  setDims(d) { Object.assign(state.dims, d); redraw = true; },
  setMaterial(id) { state.material = id; store.emit('material'); store.commit(); redraw = true; },
  setOption(k, v) { state[k] = v; redraw = true; },

  lid(action) {
    const d = state.dims;
    const A = d.ancho / 2 + GAP + THICK;
    if (action === 'open') state.lid = { x: 0, y: d.alto * .55 + 6, z: 0 };
    else if (action === 'aside') state.lid = { x: d.ancho / 2 + A + 3, y: -(d.alto - d.tapa), z: 0 };
    else state.lid = { x: 0, y: 0, z: 0 };
    state.lidPicked = action === 'open' || action === 'aside';
    store.commit(); ui.sync(); redraw = true;
    ui.toast(action === 'open' ? 'Tapa abierta' : action === 'aside' ? 'Tapa separada' : 'Tapa colocada');
  },

  async addImage(src) {
    ui.loading(true, 'Cargando imagen…');
    try {
      const imgId = await store.addImage(src);
      const c = camera();
      const hit = scene.pick(c.eye, c.ray(0, 0), { skipPlain: true });
      const face = (hit && !hit.face.plain ? hit.face : null) || scene.frontFace(c) || scene.faceById('b.o.front');
      const s = store.newSticker({ face: face.id, imgId });
      fitSticker(s, face);
      state.stickers.push(s);
      app.select(s.id);
      store.commit();
      ui.toast(`Imagen en ${faceLabel(face)} · arrástrala`);
    } catch {
      ui.toast('No se pudo cargar la imagen');
    } finally {
      ui.loading(false);
      redraw = true;
    }
  },

  select(id) {
    if (state.selected === id) return;
    touch(sel());
    state.selected = id;
    if (id) state.lidPicked = false;
    touch(sel());
    redraw = true;
    ui.sync();
  },
  pickLid(v) { state.lidPicked = v; redraw = true; },
  getSticker: store.getSticker,

  rotate(d) { const s = sel(); if (s) { s.rot += d; touch(s); } },
  scale(f) { const s = sel(); if (s) { s.size = clamp(s.size * f, .04, 3); touch(s); } },
  fit() {
    const s = sel(); if (!s) return;
    fitSticker(s, faceOf(s), .92);
    touch(s); store.commit(); ui.toast('Ajustada a la superficie');
  },
  duplicate() {
    const s = sel(); if (!s) return;
    const c = store.newSticker({ ...s, id: undefined, u: clamp(s.u + .12, 0, 1), v: clamp(s.v + .12, 0, 1) });
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
    await new Promise(r => setTimeout(r, 30));      // deja pintar el spinner
    try {
      const out = await removeBackground(images.get(s.imgId));
      if (!out) { ui.toast('No se detectó un fondo claro'); return; }
      s.imgId = await store.addImage(out);   // conserva posición, giro y tamaño
      touch(s); store.commit();
      ui.toast('Fondo eliminado ✂️');
    } catch {
      ui.toast('No se pudo procesar');
    } finally {
      ui.loading(false); redraw = true;
    }
  },

  undo() { store.undo(); after(); },
  redo() { store.redo(); after(); },
  reset() { store.resetAll(); after(); ui.toast('Diseño reiniciado'); },
  commit() { store.commit(); ui.sync(); },
  preview(on) {
    if (on) app.select(null);
    state.spin = on ? true : document.getElementById('optSpin').checked;
    ui.preview(on); redraw = true;
  },

  // usados por los gestos
  state, scene,
  camera,
  cam,
  rayFace: (ro, rd, face) => rayPlane(ro, rd, face),
  dragging: () => { redraw = true; },
  spinOff: () => { if (state.spin && !document.getElementById('optSpin').checked) state.spin = false; redraw = true; },
};

function after() { ui.sync(); ui.syncDims(); ui.syncMat(); scene.markAll(); redraw = true; }

const ui = createUI(app);
const input = createInput(canvas, app);
store.on(w => { redraw = true; if (w === 'history' || w === 'restore') ui.sync(); });

// ---------------------------------------------------------------- bucle
addEventListener('resize', () => { redraw = true; });
let prev = performance.now(), settleT = 0;

function frame(now) {
  const dt = Math.min(.05, (now - prev) / 1000);
  prev = now;

  if (state.spin) { cam.theta += dt * .28; redraw = true; }

  const a = scene.anim;
  const d = state.dims;
  // el encuadre sigue a la tapa cuando se levanta o se aparta
  const lift = Math.max(0, a.ly) * S;
  const want = v3(a.lx * S * .45, (a.alto * .5) * S + lift * .35, a.lz * S * .45);
  const moving = ['largo', 'ancho', 'alto', 'tapa'].some(k => Math.abs(a[k] - d[k]) > .01)
    || Math.abs(a.lx - state.lid.x) > .01 || Math.abs(a.ly - state.lid.y) > .01 || Math.abs(a.lz - state.lid.z) > .01
    || ['x', 'y', 'z'].some(k => Math.abs(cam.target[k] - want[k]) > 1e-4);

  if (moving || redraw) {
    const fast = moving || input.mode === 'sticker' || input.mode === 'lid';
    scene.update(dt, input.mode === 'lid');
    cam.dist = (extent(a) * S + (lift + Math.hypot(a.lx, a.lz) * S) * .85) * cam.zoom;
    for (const k of ['x', 'y', 'z']) cam.target[k] = damp(cam.target[k], want[k], 8, dt);
    renderer.resize(state.hq ? 2 : 1.25);
    scene.draw(camera(), fast);
    redraw = moving;
    settleT = now;
    canvas.classList.add('ready');
  } else if (now - settleT < 400) {
    // un último fotograma nítido tras asentarse
    scene.draw(camera(), false);
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
