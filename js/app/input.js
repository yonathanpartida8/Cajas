// Gestos táctiles: girar, pellizcar para acercar, arrastrar imágenes y mover la tapa.
import { clamp } from '../core/math3d.js';
import { S } from '../box/model.js';

const TAP = 9; // px de tolerancia para considerar "toque"

export function createInput(canvas, api) {
  const pts = new Map();
  let mode = null, start = null, pinch = 0, moved = 0, t0 = 0;
  const cam = api.cam;

  const ndc = p => [(p.x / canvas.clientWidth) * 2 - 1, 1 - (p.y / canvas.clientHeight) * 2];
  const ray = p => { const c = api.camera(); return { ro: c.eye, rd: c.ray(...ndc(p)), cam: c }; };

  function down(e) {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      mode = 'zoom';
      return;
    }
    moved = 0; t0 = performance.now();
    const p = { x: e.clientX, y: e.clientY };
    const { ro, rd } = ray(p);
    const hit = api.scene.pick(ro, rd);
    start = { p, hit, lid: { ...api.state.lid } };

    if (hit && !hit.face.plain) {
      const s = api.scene.pickSticker(hit.face, hit.u, hit.v);
      if (s) {
        api.select(s.id);
        mode = 'sticker';
        start.grab = { du: hit.u - s.u, dv: hit.v - s.v, id: s.id, face: hit.face.id };
        return;
      }
    }
    if (hit && api.state.lidPicked && hit.face.part === 'lid') { mode = 'lid'; return; }
    mode = 'orbit';
  }

  function move(e) {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = { x: e.clientX, y: e.clientY };
    const dx = p.x - prev.x, dy = p.y - prev.y;
    pts.set(e.pointerId, p);
    moved += Math.abs(dx) + Math.abs(dy);

    if (mode === 'zoom' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) cam.zoom = clamp(cam.zoom * (pinch / d), cam.min, cam.max);
      pinch = d;
      api.dragging();
      return;
    }
    if (mode === 'sticker') {
      const st = api.getSticker(start.grab.id);
      const face = api.scene.faceById(start.grab.face);
      if (!st || !face) return;
      const { ro, rd } = ray(p);
      const h = api.rayFace(ro, rd, face);
      if (!h) return;
      st.u = clamp(h.u - start.grab.du, 0, 1);
      st.v = clamp(h.v - start.grab.dv, 0, 1);
      api.scene.dirty(face.id);
      api.dragging();
      return;
    }
    if (mode === 'lid') {
      const c = api.camera();
      const k = 2 * Math.tan(.36) * cam.dist / canvas.clientHeight / S; // px → cm
      const r = c.right;
      const l = api.state.lid;
      l.x += dx * k * r.x;
      l.z += dx * k * r.z;
      l.y -= dy * k;
      const d = api.state.dims;
      const aside = Math.abs(l.x) > d.ancho * .75 || Math.abs(l.z) > d.largo * .75;
      l.y = clamp(l.y, aside ? -(d.alto - d.tapa) : 0, d.alto * 2 + 20);
      l.x = clamp(l.x, -80, 80); l.z = clamp(l.z, -80, 80);
      api.dragging();
      return;
    }
    // orbitar
    cam.theta -= dx * .0072;
    cam.phi = clamp(cam.phi - dy * .0062, .18, Math.PI - .06);
    api.spinOff();
  }

  function up(e) {
    pts.delete(e.pointerId);
    const quick = performance.now() - t0 < 350;
    if (mode === 'sticker') api.scene.dirty(start.grab.face);   // repinta con mipmaps
    if (mode === 'sticker' || mode === 'lid') api.commit();
    api.dragging();
    if (moved < TAP && quick && mode !== 'zoom') tap();
    if (pts.size === 0) { mode = null; pinch = 0; }
    else if (pts.size === 1) { mode = 'orbit'; moved = 99; }
  }

  function tap() {
    const hit = start?.hit;
    if (!hit || hit.face.plain) { api.select(null); api.pickLid(false); return; }
    const s = api.scene.pickSticker(hit.face, hit.u, hit.v);
    if (s) { api.select(s.id); return; }
    if (hit.face.part === 'lid') { api.select(null); api.pickLid(!api.state.lidPicked); return; }
    api.select(null); api.pickLid(false);
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (1 + Math.sign(e.deltaY) * .1), cam.min, cam.max);
    api.dragging();
  }, { passive: false });

  return { get mode() { return mode; } };
}
