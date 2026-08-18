// Objetos 3D dentro de la caja: mallas, transformaciones, luces y conexiones.
import { CATALOG } from '../objects/catalog.js';
import { mesh, pack, ball, polyTube } from '../objects/shapes.js';
import { S } from '../box/model.js';

export const MODES = ['off', 'warm', 'romantic', 'white'];
export const MODE_NAME = { off: 'Apagadas', warm: 'Luz cálida', romantic: 'Romántico', white: 'Luz blanca' };

const cache = new Map();       // clave → malla empaquetada (con su VAO dentro)

const hex2rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

/** Clave de caché: todo lo que cambia la geometría o los colores fijos. */
const key = o => o.type === 'tira'
  ? `tira|${o.color}|${o.thick}|${o.path.map(p => p.map(v => v.toFixed(1)).join(',')).join(';')}`
  : `${o.type}|${o.color}|${o.pw ?? ''}|${o.ph ?? ''}|${o.pt ?? ''}`;

/** Malla del objeto (se construye una vez por combinación). */
export function objectMesh(o, renderer) {
  const k = key(o);
  let m = cache.get(k);
  if (m) return m;
  m = o.type === 'tira' ? buildStrip(o) : CATALOG[o.type].build(o);
  measure(m);
  cache.set(k, m);
  if (cache.size > 48) {                       // libera las mallas más antiguas
    const [oldK, oldM] = cache.entries().next().value;
    cache.delete(oldK);
    renderer?.dispose(oldM);
  }
  return m;
}

/** Radio en planta y altura de la malla, en cm. */
function measure(m) {
  let r = 0, h = 0, lo = Infinity;
  for (let i = 0; i < m.pos.length; i += 3) {
    r = Math.max(r, Math.hypot(m.pos[i], m.pos[i + 2]));
    h = Math.max(h, m.pos[i + 1]);
    lo = Math.min(lo, m.pos[i + 1]);
  }
  m.rad = r; m.top = h; m.bottom = lo;
}

/** Tira de luces: cable a lo largo del trazado + bombillas cada pocos cm. */
function buildStrip(o) {
  const M = mesh();
  const pts = o.path.map(p => [p[0], p[1], p[2]]);
  polyTube(M, { points: pts, r: (o.thick ?? .5) / 2, sides: 6, color: '#4a463d', mix: 0 });
  let acc = 0, gap = Math.max(2.2, (o.thick ?? .5) * 5);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    acc += d;
    if (acc >= gap) {
      acc = 0;
      ball(M, { x: b[0], y: b[1], z: b[2], r: (o.thick ?? .5) * .95, color: '#fff6e0', mix: 0, emi: 1, seg: 8 });
    }
  }
  return pack(M);
}

/** Matriz de modelo (cm → mundo) y su matriz de normales. */
export function transform(o) {
  const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
  const k = (o.scale ?? 1) * S;
  const model = new Float32Array([
    c * k, 0, -s * k, 0,
    0, k, 0, 0,
    s * k, 0, c * k, 0,
    (o.x || 0) * S, (o.y || 0) * S, (o.z || 0) * S, 1,
  ]);
  const nor = new Float32Array([c, 0, -s, 0, 1, 0, s, 0, c]);
  return { model, nor };
}

/** Mantiene el objeto dentro de la caja (sin atravesar paredes ni suelo). */
export function clampObject(o, dims, m) {
  if (o.type === 'tira') return;
  const t = dims.grosor;
  const r = (m?.rad ?? 3) * (o.scale ?? 1);
  const ix = Math.max(.5, dims.ancho / 2 - t - r * .75);
  const iz = Math.max(.5, dims.largo / 2 - t - r * .75);
  o.x = Math.max(-ix, Math.min(ix, o.x));
  o.z = Math.max(-iz, Math.min(iz, o.z));
  o.y = Math.max(t, Math.min(dims.alto * 1.6, o.y));
}

/** Rayo → objeto más cercano: esfera envolvente, o el propio trazado en las tiras. */
export function pickObject(ro, rd, objects, meshOf) {
  let best = null;
  const keep = (t, o) => { if (t > 0 && (!best || t < best.t)) best = { t, obj: o }; };
  for (const o of objects) {
    if (o.hidden) continue;
    if (o.type === 'tira') {
      const r = Math.max(2.2, (o.thick ?? .5) * 3) * S;     // grosor táctil del cable
      for (let i = 1; i < o.path.length; i++) {
        const h = raySegment(ro, rd, o.path[i - 1], o.path[i]);
        if (h && h.d < r) keep(h.t, o);
      }
      continue;
    }
    const m = meshOf(o);
    const sc = o.scale ?? 1;
    const c = objectCenter(o, m);
    const rad = Math.max(2.6, Math.max(m.rad, (m.top - m.bottom) / 2) * sc * 1.15) * S;
    const dx = c.x - ro.x, dy = c.y - ro.y, dz = c.z - ro.z;
    const tca = dx * rd.x + dy * rd.y + dz * rd.z;
    if (tca < 0) continue;
    const d2 = dx * dx + dy * dy + dz * dz - tca * tca;
    if (d2 > rad * rad) continue;
    keep(tca - Math.sqrt(rad * rad - d2), o);
  }
  return best;
}

/** Distancia mínima entre un rayo y un segmento (en unidades de mundo). */
function raySegment(ro, rd, A, B) {
  const a = [A[0] * S, A[1] * S, A[2] * S];
  const u = [B[0] * S - a[0], B[1] * S - a[1], B[2] * S - a[2]];
  const w = [a[0] - ro.x, a[1] - ro.y, a[2] - ro.z];
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2];
  const uv = u[0] * rd.x + u[1] * rd.y + u[2] * rd.z;
  const uw = u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const vw = rd.x * w[0] + rd.y * w[1] + rd.z * w[2];
  const den = uu - uv * uv;
  let sc = 0, tc = vw;
  if (Math.abs(den) > 1e-9) {
    sc = Math.max(0, Math.min(1, (uv * vw - uw) / den));
    tc = vw + uv * sc;
  }
  if (tc < 0) return null;
  const px = a[0] + u[0] * sc, py = a[1] + u[1] * sc, pz = a[2] + u[2] * sc;
  const qx = ro.x + rd.x * tc, qy = ro.y + rd.y * tc, qz = ro.z + rd.z * tc;
  return { t: tc, d: Math.hypot(px - qx, py - qy, pz - qz) };
}

export function stripCenter(o) {
  const c = [0, 0, 0];
  for (const p of o.path) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return c.map(v => v / Math.max(1, o.path.length));
}

/** Centro aproximado de un objeto en el mundo (para marcadores y conexiones). */
export function objectCenter(o, m) {
  if (o.type === 'tira') {
    const c = stripCenter(o);
    return { x: c[0] * S, y: c[1] * S, z: c[2] * S };
  }
  const sc = o.scale ?? 1;
  return { x: o.x * S, y: (o.y + (m ? (m.top + m.bottom) / 2 * sc : 2)) * S, z: o.z * S };
}

// ------------------------------------------------------------ luces
const MODE_COLOR = {
  off: [0, 0, 0],
  warm: [1, .68, .36],
  white: [1, .97, .92],
};

/** Color de una tira/vela según su modo y el tiempo (parpadeo suave). */
export function modeColor(mode, t, seed = 0) {
  if (mode === 'off') return [0, 0, 0];
  if (mode === 'romantic') {
    const h = (t * .07 + seed) % 1;
    return hsl(h, .55, .62);
  }
  const base = MODE_COLOR[mode] || MODE_COLOR.warm;
  const f = .88 + .12 * Math.sin(t * 2.3 + seed * 7) * Math.sin(t * 1.1 + seed * 3);
  return base.map(v => v * f);
}

function hsl(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

/** Modo efectivo de una tira: manda el interruptor conectado. */
export function stripMode(strip, objects, links) {
  for (const sw of objects) {
    if (!CATALOG[sw.type]?.switch) continue;
    if ((links[sw.id] || []).includes(strip.id)) return sw.mode || 'off';
  }
  return strip.mode || 'warm';
}

/** Luces puntuales activas (posición en mundo + color ya atenuado). */
export function collectLights(objects, links, t) {
  const out = [];
  for (const o of objects) {
    if (o.hidden) continue;
    if (o.type === 'tira') {
      const mode = stripMode(o, objects, links);
      if (mode === 'off') continue;
      const step = Math.max(1, Math.floor(o.path.length / 3));
      for (let i = 0; i < o.path.length && out.length < 8; i += step) {
        const p = o.path[i];
        const c = modeColor(mode, t, i * .13);
        out.push({ p: { x: p[0] * S, y: p[1] * S, z: p[2] * S }, c: c.map(v => v * .5) });
      }
    } else {
      const li = CATALOG[o.type]?.light;
      if (!li || out.length >= 8) continue;
      const f = .85 + .15 * Math.sin(t * 6 + o.x);
      out.push({
        p: { x: o.x * S, y: (o.y + li.y * (o.scale ?? 1)) * S, z: o.z * S },
        c: hex2rgb(li.color).map(v => v * li.power * .55 * f),
      });
    }
  }
  return out;
}

/** ¿Hay algo animándose (parpadeos) que obligue a seguir dibujando? */
export const hasAnimation = (objects, links) => objects.some(o =>
  (o.type === 'tira' && stripMode(o, objects, links) !== 'off') || CATALOG[o.type]?.light);

export { hex2rgb };
