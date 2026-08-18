// Gestos táctiles sobre el lienzo. Cada gesto tiene un significado único y no
// se pisa con los demás:
//
//   toque corto              → seleccionar (superficie, imagen u objeto)
//   pulsación larga          → abrir los ajustes del objeto tocado
//   arrastrar sobre un objeto→ moverlo (la cámara no se mueve)
//   arrastrar en otro sitio  → girar la vista (con zona muerta e inercia)
//   dos dedos                → acercar, desplazar y girar la vista
//   dos dedos sobre el objeto→ escalarlo y girarlo
import { clamp } from '../core/math3d.js';
import { S } from '../box/model.js';
import { audio } from '../features/audio.js';

const TAP = 12;      // px de tolerancia para considerar "toque"
const DEAD = 7;      // px muertos: roces pequeños no mueven la cámara
const LONG = 460;    // ms de pulsación larga
const EDGE = .02;    // margen para aceptar un cambio de superficie
const ORBIT = .0052; // sensibilidad de giro (más baja = más control)

export function createInput(canvas, api) {
  const pts = new Map();
  const cam = api.cam;
  let mode = null, start = null, gesture = null, moved = 0, drift = 0, t0 = 0;
  let longT = 0, longFired = false, armed = false;

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
  const cancelLong = () => { clearTimeout(longT); longT = 0; };

  // ---------------------------------------------------------------- inicio
  function down(e) {
    audio.unlock();
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pos(e));

    if (pts.size === 2) { cancelLong(); return twoFingers(); }
    if (pts.size > 2) return;

    moved = 0; drift = 0; armed = false; longFired = false; t0 = performance.now();
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
      const o = oHit.obj;
      start.obj = o;
      api.selectObject(o.id);
      longT = setTimeout(() => {
        longT = 0; longFired = true;
        api.openObject(); audio.play('panel'); audio.buzz(12);
      }, LONG);
      if (!o.locked && o.type !== 'tira') {
        mode = 'obj';
        // el objeto no salta bajo el dedo: se guarda la diferencia y se conserva
        const g = api.spotAt(p.x, p.y, o.y);
        start.grab = g ? { x: o.x - g.x, z: o.z - g.z } : { x: 0, z: 0 };
        audio.play('grab');
        return;
      }
      if (o.locked) api.toast('Objeto fijado · pulsa «Fijar» para soltarlo');
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

  /** Al entrar el segundo dedo se decide: transformar el objeto/imagen o mover la vista. */
  function twoFingers() {
    const so = api.selectedObject?.();
    if (so && !so.locked && so.type !== 'tira') {
      gesture = { d: spread(), a: twist(), c: centroid(), obj: so, scl: { ...so.scl }, rot: { ...so.rot } };
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
    if (start) drift = Math.hypot(p.x - start.p.x, p.y - start.p.y);
    if (longT && moved > 6) cancelLong();

    if (mode === 'view' || mode === 'pinch-img' || mode === 'pinch-obj') return pts.size >= 2 && twoFingerMove();
    if (mode === 'draw') return api.strokeStrip(p.x, p.y);
    if (mode === 'placeObj') return void api.moveObject(api.ghostObj(), p.x, p.y);
    if (mode === 'obj') return void api.moveObject(start.obj, p.x, p.y, start.obj.y, start.grab);
    if (mode === 'sticker') return dragSticker(p);
    if (mode === 'lid') return dragLid(dx, dy);

    // girar la vista: nada se mueve hasta salir de la zona muerta
    if (!armed) {
      if (drift < DEAD) return;
      armed = true;
    }
    const kx = dx * ORBIT, ky = dy * ORBIT * .86;
    cam.tTheta -= kx;
    cam.tPhi = clamp(cam.tPhi - ky, .16, Math.PI - .05);
    cam.vTheta = -kx * 12; cam.vPhi = -ky * 12;      // para la inercia al soltar
    api.spinOff();
  }

  function twoFingerMove() {
    const d = spread(), a = twist(), c = centroid();
    if (mode === 'pinch-obj') {
      const o = gesture.obj;
      if (gesture.d > 8) {                       // pellizcar → escalar
        const f = clamp(d / gesture.d, .2, 6);
        for (const k of ['x', 'y', 'z']) o.scl[k] = clamp(gesture.scl[k] * f, .2, 4);
      }
      // girar con dos dedos → eje vertical · subirlos o bajarlos → inclinar
      api.setObjRot(o, {
        x: gesture.rot.x + (c.y - gesture.c.y) * .0075,
        y: gesture.rot.y + (a - gesture.a),
        z: gesture.rot.z,
      });
      api.clampObject(o);
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
      if (gesture.d > 8 && d > 8) cam.tZoom = clamp(cam.tZoom * (gesture.d / d), cam.min, cam.max);
      cam.tTheta -= (a - gesture.a) * .8;                // girar con dos dedos
      api.pan(c.x - gesture.c.x, c.y - gesture.c.y);     // desplazar la vista
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
    if (api.lidHinged()) {                              // con bisagra solo se abre y se cierra
      l.y = clamp(l.y - dy * k, 0, 16);
      return api.redraw();
    }
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
    const wasLong = longFired;
    const quick = performance.now() - t0 < 380;
    cancelLong();

    if (wasMode === 'sticker') { api.scene.dirty(api.getSticker(start.grab.id)?.face); api.hover(null); }
    if (['sticker', 'lid', 'pinch-img', 'obj', 'pinch-obj'].includes(wasMode)) api.commit();
    if (wasMode === 'placeObj' && moved > TAP) { api.dropObject(); mode = null; pts.clear(); return; }
    if (moved < TAP && quick && !wasLong && ['orbit', 'sticker', 'lid', 'obj', 'placeObj', 'draw'].includes(wasMode)) tap();

    if (pts.size === 0) {
      mode = null;
      if (wasMode !== 'orbit' || !armed) { cam.vTheta = cam.vPhi = 0; }
      api.redraw();
    } else if (pts.size === 1) {
      mode = 'orbit'; moved = 999; armed = false;      // al levantar un dedo no se interpreta como toque
      cam.vTheta = cam.vPhi = 0;
    }
  }

  /** Toque corto: elige imagen, objeto, superficie, o deselecciona. */
  function tap() {
    if (api.state.placingObj) { api.dropObject(); return; }
    if (api.state.drawing) return;
    if (start?.obj) {                                  // interruptor y pilas: cambian de modo al tocarlos
      if (api.isSource(start.obj)) api.cycleSwitch(start.obj);
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
    cam.tZoom = clamp(cam.tZoom * (1 + Math.sign(e.deltaY) * .12), cam.min, cam.max);
    api.redraw();
  }, { passive: false });

  return { get mode() { return mode; } };
}
