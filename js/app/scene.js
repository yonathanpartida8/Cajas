// Escena: anima medidas/tapa, mantiene texturas por cara y resuelve el picking.
import { buildFaces, extent, S } from '../box/model.js';
import { paintFace, kraftCanvas, shadowCanvas, MATERIALS, TILE } from '../box/materials.js';
import { state, images, stickersOf, on } from './store.js';
import { rayQuad, damp, v3, add, scale } from '../core/math3d.js';

const MAXPX = 640;

export function createScene(renderer) {
  const anim = { ...state.dims, lx: 0, ly: 0, lz: 0 };
  const panels = new Map();          // faceId → {canvas,ctx,tex,w,h}
  const krafts = new Map();          // material → textura repetida
  const dirty = new Set();
  let faces = buildFaces(anim, { x: 0, y: 0, z: 0 });
  let shadowTex = null;

  const kraftTex = id => {
    if (!krafts.has(id)) krafts.set(id, renderer.texture(kraftCanvas(id), { repeat: true }));
    return krafts.get(id);
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
    paintFace(p.ctx, { w: p.w, h: p.h, uLen: f.uLen }, list, state.selected, state.material);
    p.tex = p.tex ? p.tex.update(p.canvas, fast) : renderer.texture(p.canvas);
    return p;
  }

  /** Interpola medidas y tapa; reconstruye la geometría. */
  function update(dt, dragging) {
    const k = 11;
    for (const key of ['largo', 'ancho', 'alto', 'tapa']) anim[key] = damp(anim[key], state.dims[key], k, dt);
    const speed = dragging ? 60 : 9;
    anim.lx = damp(anim.lx, state.lid.x, speed, dt);
    anim.ly = damp(anim.ly, state.lid.y, speed, dt);
    anim.lz = damp(anim.lz, state.lid.z, speed, dt);
    faces = buildFaces(anim, { x: anim.lx, y: anim.ly, z: anim.lz });
    return faces;
  }

  function draw(cam, fast) {
    const list = [];
    const tint = [1, 1, 1];
    for (const f of faces) {
      const has = !f.plain && stickersOf(f.id).length > 0;
      let tex, uvScale;
      if (has) {
        const p = panel(f);                       // marca dirty si cambió de tamaño
        if (dirty.has(f.id) || !p.tex) { dirty.delete(f.id); repaint(f, fast); }
        tex = p.tex; uvScale = [1, 1];
      } else {
        tex = kraftTex(state.material);
        uvScale = [f.uLen / TILE, f.vLen / TILE];
      }
      list.push({
        ...f, tex, uvScale, tint,
        hi: (state.lidPicked && f.part === 'lid') ? .55 : 0,
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
  function pickSticker(face, u, v) {
    const list = stickersOf(face.id);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i], img = images.get(s.imgId);
      if (!img) continue;
      const dx = (u - s.u) * face.uLen, dy = (v - s.v) * face.vLen;
      const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
      const lx = dx * c - dy * si, ly = dx * si + dy * c;
      const w = s.size * face.uLen, h = w * (img.height / img.width);
      const m = Math.min(w, h) * .12;
      if (Math.abs(lx) <= w / 2 + m && Math.abs(ly) <= h / 2 + m) return s;
    }
    return null;
  }

  /** Cara más orientada hacia la cámara (para colocar imágenes nuevas). */
  function frontFace(cam) {
    let best = null, bd = 0;
    for (const f of faces) {
      if (f.plain) continue;
      const c = add(f.o, add(scale(f.u, .5), scale(f.v, .5)));
      const dir = v3(c.x - cam.eye.x, c.y - cam.eye.y, c.z - cam.eye.z);
      const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const d = -(dir.x * f.n.x + dir.y * f.n.y + dir.z * f.n.z) / l;
      const area = f.uLen * f.vLen;
      const score = d * Math.sqrt(area);
      if (d > .15 && score > bd) { bd = score; best = f; }
    }
    return best;
  }

  return {
    get faces() { return faces; },
    get anim() { return anim; },
    update, draw, pick, pickSticker, frontFace,
    dirty: id => dirty.add(id),
    markAll,
    faceById: id => faces.find(f => f.id === id) || null,
    materials: MATERIALS,
  };
}
