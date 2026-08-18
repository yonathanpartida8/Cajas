// Gestos táctiles sobre el lienzo.
//
//   1 dedo sobre una imagen  → mover la imagen (puede cambiar de superficie)
//   1 dedo sobre la tapa (si está activada para moverse) → mover la tapa
//   1 dedo en cualquier otro sitio → girar la vista (con inercia)
//   2 dedos → acercar y desplazar la vista; sobre la imagen elegida, escalarla y girarla
//   toque corto → seleccionar imagen o superficie
import { clamp } from '../core/math3d.js';
import { S } from '../box/model.js';
import { audio } from '../features/audio.js';

const TAP = 10;          // px de tolerancia para considerar "toque"
const EDGE = .02;        // margen para aceptar un cambio de superficie

export function createInput(canvas, api) {
  const pts = new Map();
  const cam = api.cam;
  let mode = null, start = null, gesture = null, moved = 0, t0 = 0;

  const pos = e => ({ x: e.clientX, y: e.clientY });
  const centroid = () => {
    const a = [...pts.values()];
    return { x: a.reduce((s, p) => s + p.x, 0) / a.length, y: a.reduce((s, p) => s + p.y, 0) / a.length };
  };
  const spread = () => {
    const [a, b] = [...pts.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const twist = () => {
    const [a, b] = [...pts.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  };

  // ---------------------------------------------------------------- inicio
  function down(e) {
    audio.unlock();
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pos(e));

    if (pts.size === 2) return twoFingers();
    if (pts.size > 2) return;

    moved = 0; t0 = performance.now();
    cam.vTheta = cam.vPhi = 0;
    const p = pos(e);

    if (api.state.drawing) { mode = 'draw'; api.strokeStrip(p.x, p.y); return; }
    if (api.state.placingObj) { mode = 'placeObj'; api.moveObject(api.ghostObj(), p.x, p.y); return; }

    const hit = api.surfaceAt(p.x, p.y);
    start = { p, hit };

    // los objetos 3D tienen prioridad si están delante de la cara tocada
    const c = api.camera();
    const nx = p.x / canvas.clientWidth * 2 - 1, ny = 1 - p.y / canvas.clientHeight * 2;
    const oHit = api.scene.objectAt(c.eye, c.ray(nx, ny));
    const solid = api.scene.pick(c.eye, c.ray(nx, ny), { skipPlain: true, skipXray: true });
    if (oHit && (!solid || oHit.t <= solid.t + .02)) {
      start.obj = oHit.obj;
      api.selectObject(oHit.obj.id);
      if (!oHit.obj.locked && oHit.obj.type !== 'tira') {
        mode = 'obj';
        audio.play('grab');
        return;
      }
      if (oHit.obj.locked) api.toast('Objeto fijado · pulsa «Fijar» para soltarlo');
      mode = 'orbit';
      return;
    }

    const s = hit && api.scene.pickSticker(hit.face, hit.u, hit.v);
    if (s && !s.ghost) {
      api.select(s.id);
      audio.play('grab');
      mode = 'sticker';
      start.grab = { id: s.id, du: hit.u - s.u, dv: hit.v - s.v };
      api.hover(hit.face.id);
      return;
    }
    if (hit && api.state.lidPicked && hit.face.part === 'lid') { audio.play('grab'); mode = 'lid'; return; }
    mode = 'orbit';
  }

  /** Al entrar el segundo dedo se decide: transformar la imagen o mover la vista. */
  function twoFingers() {
    const so = api.selectedObject?.();
    if (so && !so.locked && so.type !== 'tira') {
      gesture = { d: spread(), a: twist(), c: centroid(), size: so.scale ?? 1, rot: so.rot || 0, obj: so };
      mode = 'pinch-obj';
      audio.play('grab');
      return;
    }
    const sel = api.selected();
    const both = sel && [...pts.values()].every(p => {
      const h = api.surfaceAt(p.x, p.y);
      return h && h.face.id === sel.face && api.scene.pickSticker(h.face, h.u, h.v, .35) === sel;
    });
    gesture = { d: spread(), a: twist(), c: centroid(), size: sel?.size, rot: sel?.rot };
    mode = both ? 'pinch-img' : 'view';
    audio.play('grab');
  }

  // ---------------------------------------------------------------- arrastre
  function move(e) {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const p = pos(e);
    const dx = p.x - prev.x, dy = p.y - prev.y;
    pts.set(e.pointerId, p);
    moved += Math.abs(dx) + Math.abs(dy);

    if (mode === 'view' || mode === 'pinch-img' || mode === 'pinch-obj') return pts.size >= 2 && twoFingerMove();
    if (mode === 'draw') return api.strokeStrip(p.x, p.y);
    if (mode === 'placeObj') return void api.moveObject(api.ghostObj(), p.x, p.y);
    if (mode === 'obj') return void api.moveObject(start.obj, p.x, p.y, start.obj.y);
    if (mode === 'sticker') return dragSticker(p);
    if (mode === 'lid') return dragLid(dx, dy);

    // girar la vista
    const kx = dx * .0068, ky = dy * .0058;
    cam.theta -= kx;
    cam.phi = clamp(cam.phi - ky, .16, Math.PI - .05);
    cam.vTheta = -kx * 14; cam.vPhi = -ky * 14;      // para la inercia al soltar
    api.spinOff();
  }

  function twoFingerMove() {
    const d = spread(), a = twist(), c = centroid();
    if (mode === 'pinch-obj') {
      const o = gesture.obj;
      if (gesture.d > 8) {
        o.scale = clamp(gesture.size * (d / gesture.d), .3, 3);
        o.rot = gesture.rot + (a - gesture.a);
        api.clampObject(o);
      }
      gesture.d = d; gesture.a = a; gesture.c = c;
      return api.redraw();
    }
    if (mode === 'pinch-img') {
      const s = api.selected();
      if (s && gesture.d > 8) {
        s.size = clamp(gesture.size * (d / gesture.d), .04, 3);
        s.rot = gesture.rot + (a - gesture.a);
        api.clampSticker(s);
        api.touch(s);
      }
    } else {
      if (gesture.d > 8 && d > 8) cam.zoom = clamp(cam.zoom * (gesture.d / d), cam.min, cam.max);
      api.pan(c.x - gesture.c.x, c.y - gesture.c.y);   // desplazar la vista con dos dedos
    }
    gesture.d = d; gesture.a = a; gesture.c = c;
    api.redraw();
  }

  /** La imagen sigue al dedo y salta de superficie solo si el dedo está claramente en otra. */
  function dragSticker(p) {
    const s = api.getSticker(start.grab.id);
    if (!s) return;
    const hit = api.surfaceAt(p.x, p.y);
    if (hit && hit.face.id === s.face) {
      s.u = hit.u - start.grab.du; s.v = hit.v - start.grab.dv;
      api.clampSticker(s);
      api.touch(s);
    } else if (hit && hit.u > EDGE && hit.u < 1 - EDGE && hit.v > EDGE && hit.v < 1 - EDGE) {
      api.moveToFace(s, hit.face, hit.u, hit.v);       // cambio de superficie bajo el dedo
      start.grab.du = start.grab.dv = 0;
    } else {
      const h = api.planeAt(p.x, p.y, api.scene.faceById(s.face));   // fuera de la caja: sin saltos
      if (h) { s.u = h.u - start.grab.du; s.v = h.v - start.grab.dv; api.clampSticker(s); api.touch(s); }
    }
    api.hover(hit ? hit.face.id : s.face);
  }

  function dragLid(dx, dy) {
    const c = api.camera();
    const k = 2 * Math.tan(.36) * cam.dist / canvas.clientHeight / S;   // px → cm
    const l = api.state.lid, d = api.state.dims;
    l.x += dx * k * c.right.x;
    l.z += dx * k * c.right.z;
    l.y -= dy * k;
    const aside = Math.abs(l.x) > d.ancho * .75 || Math.abs(l.z) > d.largo * .75;
    l.y = clamp(l.y, aside ? -(d.alto - d.tapa) : 0, d.alto * 2 + 20);
    l.x = clamp(l.x, -80, 80); l.z = clamp(l.z, -80, 80);
    api.redraw();
  }

  // ---------------------------------------------------------------- fin
  function up(e) {
    pts.delete(e.pointerId);
    const wasMode = mode;
    const quick = performance.now() - t0 < 380;

    if (wasMode === 'sticker') { api.scene.dirty(api.getSticker(start.grab.id)?.face); api.hover(null); }
    if (['sticker', 'lid', 'pinch-img', 'obj', 'pinch-obj'].includes(wasMode)) api.commit();
    if (wasMode === 'placeObj' && moved > TAP) { api.dropObject(); mode = null; pts.clear(); return; }
    if (moved < TAP && quick && ['orbit', 'sticker', 'lid', 'obj', 'placeObj', 'draw'].includes(wasMode)) tap();

    if (pts.size === 0) {
      mode = null;
      if (wasMode !== 'orbit') { cam.vTheta = cam.vPhi = 0; }
      api.redraw();
    } else if (pts.size === 1) {
      mode = 'orbit'; moved = 999;                    // al levantar un dedo no se interpreta como toque
      cam.vTheta = cam.vPhi = 0;
    }
  }

  /** Toque corto: elige imagen, objeto, superficie, o deselecciona. */
  function tap() {
    if (api.state.placingObj) { api.dropObject(); return; }
    if (api.state.drawing) return;
    if (start?.obj) {                                  // interruptor: cambia de modo al tocarlo
      if (api.isSwitch(start.obj)) api.cycleSwitch(start.obj);
      return;
    }
    const hit = start?.hit;
    if (api.state.placing) {                       // colocar con un toque en la superficie
      if (!hit) { api.toast('Toca una superficie de la caja'); return; }
      api.moveGhost(start.p.x, start.p.y);
      api.dropGhost(start.p.x, start.p.y, false);
      return;
    }
    if (!hit) { api.select(null); api.selectObject(null); api.pickFace(null); return; }
    const s = api.scene.pickSticker(hit.face, hit.u, hit.v);
    if (s && !s.ghost) { api.select(s.id); return; }
    api.select(null); api.selectObject(null);
    api.pickFace(hit.face.id);
  }

  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    cam.zoom = clamp(cam.zoom * (1 + Math.sign(e.deltaY) * .12), cam.min, cam.max);
    api.redraw();
  }, { passive: false });

  return { get mode() { return mode; } };
}
