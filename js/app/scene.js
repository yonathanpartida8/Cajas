// Escena: anima medidas/tapa, mantiene texturas por cara y resuelve el picking.
import { buildFaces, S } from '../box/model.js';
import { paintFace, kraftCanvas, shadowCanvas, frameCanvas, MATERIALS, TILE } from '../box/materials.js';
import { state, images, stickersOf, on } from './store.js';
import { rayQuad, damp, v3, add, scale, norm } from '../core/math3d.js';

const MAXPX = 640;
const ACCENT = '#d98232', OK = '#4f9d5d';

export function createScene(renderer) {
  const anim = { ...state.dims, lx: 0, ly: 0, lz: 0 };
  const panels = new Map();          // faceId → {canvas,ctx,tex,w,h}
  const krafts = new Map();          // material → textura repetida
  const frames = new Map();          // color → textura de marco
  const dirty = new Set();
  let faces = buildFaces(anim, { x: 0, y: 0, z: 0 });
  let shadowTex = null;

  const cached = (map, key, make, opts) => {
    if (!map.has(key)) map.set(key, renderer.texture(make(key), opts));
    return map.get(key);
  };

  const markAll = () => faces.forEach(f => dirty.add(f.id));
  on(w => { if (w === 'restore' || w === 'material') markAll(); });

  function panel(f) {
    let p = panels.get(f.id);
    const long = Math.max(f.uLen, f.vLen);
    const w = Math.max(64, Math.round(MAXPX * f.uLen / long));
    const h = Math.max(64, Math.round(MAXPX * f.vLen / long));
    if (!p) {
      const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
      p = { canvas, ctx: canvas.getContext('2d'), tex: null, w, h };
      panels.set(f.id, p);
      dirty.add(f.id);
    } else if (Math.abs(p.w - w) > 8 || Math.abs(p.h - h) > 8) {
      p.canvas.width = p.w = w; p.canvas.height = p.h = h;
      dirty.add(f.id);
    }
    return p;
  }

  function repaint(f, fast) {
    const p = panel(f);
    const list = stickersOf(f.id).map(s => ({ ...s, img: images.get(s.imgId) }));
    paintFace(p.ctx, { w: p.w, h: p.h, uLen: f.uLen }, list, state.material);
    p.tex = p.tex ? p.tex.update(p.canvas, fast) : renderer.texture(p.canvas);
    return p;
  }

  /** Interpola medidas y tapa; reconstruye la geometría. */
  function update(dt, dragging) {
    for (const key of ['largo', 'ancho', 'alto', 'tapa', 'grosor']) anim[key] = damp(anim[key], state.dims[key], 11, dt);
    const speed = dragging ? 60 : 9;
    anim.lx = damp(anim.lx, state.lid.x, speed, dt);
    anim.ly = damp(anim.ly, state.lid.y, speed, dt);
    anim.lz = damp(anim.lz, state.lid.z, speed, dt);
    faces = buildFaces(anim, { x: anim.lx, y: anim.ly, z: anim.lz });
    return faces;
  }

  /** Marco resaltado sobre una cara, ligeramente separado de la superficie. */
  function highlight(list, faceId, color) {
    const f = faces.find(x => x.id === faceId);
    if (!f) return;
    const e = .0035, o = v3(f.o.x + f.n.x * e, f.o.y + f.n.y * e, f.o.z + f.n.z * e);
    list.push({
      o, u: f.u, v: f.v, n: f.n,
      tex: cached(frames, color, frameCanvas), uvScale: [1, 1],
      unlit: true, noDepth: true, alpha: 1,
    });
  }

  function draw(cam, fast) {
    const list = [];
    for (const f of faces) {
      const has = !f.plain && stickersOf(f.id).length > 0;
      let tex, uvScale;
      if (has) {
        const p = panel(f);                       // marca dirty si cambió de tamaño
        if (dirty.has(f.id) || !p.tex) { dirty.delete(f.id); repaint(f, fast); }
        tex = p.tex; uvScale = [1, 1];
      } else {
        tex = cached(krafts, state.material, kraftCanvas, { repeat: true });
        uvScale = [f.uLen / TILE, f.vLen / TILE];
      }
      list.push({
        ...f, tex, uvScale,
        hi: (state.lidPicked && f.part === 'lid') ? .5 : 0,
      });
    }

    if (state.shadow) {
      // sin mipmaps: en planos rasantes el degradado se aplanaría a un rectángulo
      if (!shadowTex) shadowTex = renderer.texture(shadowCanvas(), { mips: false });
      const rx = (anim.ancho / 2 + 2) * S * 1.75, rz = (anim.largo / 2 + 2) * S * 1.75;
      list.push({
        o: v3(-rx, .003, -rz), u: v3(2 * rx, 0, 0), v: v3(0, 0, 2 * rz), n: v3(0, 1, 0),
        tex: shadowTex, uvScale: [1, 1], unlit: true, noDepth: true, alpha: .95,
      });
    }

    // superficie bajo el dedo (verde = se soltará aquí) o superficie elegida
    if (state.hover) highlight(list, state.hover, OK);
    else if (state.face) highlight(list, state.face, ACCENT);

    renderer.render(list, cam);
  }

  /** Rayo → cara + coordenadas normalizadas de esa cara. */
  function pick(ro, rd, opts = {}) {
    let best = null;
    for (const f of faces) {
      if (opts.skipPlain && f.plain) continue;
      const h = rayQuad(ro, rd, f);
      if (h && (!best || h.t < best.t)) best = { ...h, face: f };
    }
    return best;
  }

  /** Imagen bajo un punto (u,v) de una cara; devuelve la de más arriba. */
  function pickSticker(face, u, v, pad = .12) {
    const list = stickersOf(face.id);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const box = stickerBox(s, face);
      if (!box) continue;
      const dx = (u - s.u) * face.uLen, dy = (v - s.v) * face.vLen;
      const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
      const lx = dx * c - dy * si, ly = dx * si + dy * c;
      const m = Math.min(box.w, box.h) * pad;
      if (Math.abs(lx) <= box.w / 2 + m && Math.abs(ly) <= box.h / 2 + m) return s;
    }
    return null;
  }

  /** Tamaño de una imagen sobre su cara, en cm. */
  function stickerBox(s, face) {
    const img = images.get(s.imgId);
    if (!img || !img.width) return null;
    const w = s.size * face.uLen;
    return { w, h: w * (img.height / img.width) * (s.ratio ?? 1) };
  }

  /** Esquinas 3D de una imagen (para las manijas): [ne, se, so, no] + centro y eje de giro. */
  function stickerFrame(s) {
    const face = faces.find(f => f.id === s.face);
    const box = face && stickerBox(s, face);
    if (!box) return null;
    const eu = norm(face.u), ev = norm(face.v);
    const c = Math.cos(s.rot), si = Math.sin(s.rot);
    const ax = v3(eu.x * c + ev.x * si, eu.y * c + ev.y * si, eu.z * c + ev.z * si);
    const ay = v3(-eu.x * si + ev.x * c, -eu.y * si + ev.y * c, -eu.z * si + ev.z * c);
    const center = add(face.o, add(scale(face.u, s.u), scale(face.v, s.v)));
    const hw = box.w * S / 2, hh = box.h * S / 2;
    const at = (sx, sy) => v3(
      center.x + ax.x * sx * hw + ay.x * sy * hh,
      center.y + ax.y * sx * hw + ay.y * sy * hh,
      center.z + ax.z * sx * hw + ay.z * sy * hh,
    );
    return {
      face, center, box,
      corners: [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)],
      spin: at(0, -1 - Math.min(1.2, 5 / Math.max(box.h, 2))),   // manija de giro sobre el borde superior
      normal: face.n,
    };
  }

  return {
    get faces() { return faces; },
    get anim() { return anim; },
    update, draw, pick, pickSticker, stickerBox, stickerFrame,
    dirty: id => dirty.add(id),
    markAll,
    faceById: id => faces.find(f => f.id === id) || null,
    materials: MATERIALS,
  };
}
