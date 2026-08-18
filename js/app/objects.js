// Sistema general de objetos 3D: un mismo objeto tiene posición, giro y escala en
// los tres ejes, materiales, interacción, conexiones eléctricas, luz y sonido.
// Todo objeto nuevo del catálogo hereda estos controles sin tocar nada más.
import { CATALOG, propsOf } from '../objects/catalog.js';
import { mesh, pack, ball, polyTube } from '../objects/shapes.js';
import { S } from '../box/model.js';

// ---------------------------------------------------------------- papeles
/** Modos de luz. `off` es el estado en reposo; el resto son los seis del panel. */
export const MODES = ['off', 'warm', 'warmBlink', 'rainbow', 'white', 'whiteBlink', 'custom'];
export const MODE_NAME = {
  off: 'Apagada',
  warm: 'Cálida',
  warmBlink: 'Cálida ✨',
  rainbow: 'Colores',
  white: 'Blanca',
  whiteBlink: 'Blanca ✨',
  custom: 'A mi gusto',
};

/** Modos de rotación: cómo responde el giro al dedo y a los controles. */
export const ROT_MODES = [
  { id: 'libre', name: 'Libre', hint: 'gira en cualquier dirección' },
  { id: 'asistida', name: 'Asistida', hint: 'lo mantiene derecho' },
  { id: 'simetrica', name: 'Simétrica', hint: 'ángulos de 15°' },
];

const cache = new Map();       // clave → malla empaquetada (con su VAO dentro)

const hex2rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

// ---------------------------------------------------------------- papeles del objeto
export const isSwitch = o => !!CATALOG[o?.type]?.switch;
export const isPower = o => !!CATALOG[o?.type]?.power;
export const isStrip = o => o?.type === 'tira';
export const isSource = o => isSwitch(o) || isPower(o);

/** ¿Se puede llevar un cable de `a` a `b`? pilas → interruptor/tira, interruptor → tira. */
export const canLink = (a, b) => !!a && !!b && a.id !== b.id
  && ((isPower(a) && (isSwitch(b) || isStrip(b))) || (isSwitch(a) && isStrip(b)));

/** Clave de caché: todo lo que cambia la geometría o los colores fijos. */
const key = o => o.type === 'tira'
  ? `tira|${o.color}|${o.thick}|${o.path.map(p => p.map(v => v.toFixed(1)).join(',')).join(';')}`
  : `${o.type}|${o.color}|${propsOf(o.type).map(p => o[p.k] ?? p.def).join('|')}`;

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
  m.rad = r; m.top = h; m.bottom = lo === Infinity ? 0 : lo;
  return m;
}

/** Tira de luces: cable a lo largo del trazado + bombillas cada pocos cm. */
export function buildStrip(o) {
  const M = mesh();
  const pts = o.path.map(p => [p[0], p[1], p[2]]);
  polyTube(M, { points: pts, r: (o.thick ?? .5) / 2, sides: 6, color: '#4a463d', mix: 0 });
  let acc = 0;
  const gap = Math.max(2.2, (o.thick ?? .5) * 5);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (acc >= gap) {
      acc = 0;
      ball(M, { x: b[0], y: b[1], z: b[2], r: (o.thick ?? .5) * .95, color: '#fff6e0', mix: 0, emi: 1, seg: 8 });
    }
  }
  return measure(pack(M));
}

// ---------------------------------------------------------------- transformación
/** Normaliza un objeto al formato completo: giro y escala en los tres ejes. */
export function normalize(o) {
  if (typeof o.rot === 'number') o.rot = { x: 0, y: o.rot, z: 0 };
  if (!o.rot) o.rot = { x: 0, y: 0, z: 0 };
  if (typeof o.scale === 'number' && !o.scl) o.scl = { x: o.scale, y: o.scale, z: o.scale };
  if (!o.scl) o.scl = { x: 1, y: 1, z: 1 };
  o.x ??= 0; o.y ??= 0; o.z ??= 0;
  return o;
}

/** Escala media (el control «Tamaño» mueve los tres ejes a la vez). */
export const meanScale = o => (normalize(o), (o.scl.x + o.scl.y + o.scl.z) / 3);

/** Matriz de rotación 3×3 a partir de los tres ángulos (Y · X · Z). */
export function rotMatrix(r) {
  const cx = Math.cos(r.x), sx = Math.sin(r.x);
  const cy = Math.cos(r.y), sy = Math.sin(r.y);
  const cz = Math.cos(r.z), sz = Math.sin(r.z);
  return [
    cy * cz + sy * sx * sz, -cy * sz + sy * sx * cz, sy * cx,
    cx * sz, cx * cz, -sx,
    -sy * cz + cy * sx * sz, sy * sz + cy * sx * cz, cy * cx,
  ];
}

/** Matriz de modelo (cm → mundo) y su matriz de normales. */
export function transform(o) {
  normalize(o);
  const m = rotMatrix(o.rot);
  const sx = o.scl.x * S, sy = o.scl.y * S, sz = o.scl.z * S;
  const model = new Float32Array([
    m[0] * sx, m[3] * sx, m[6] * sx, 0,
    m[1] * sy, m[4] * sy, m[7] * sy, 0,
    m[2] * sz, m[5] * sz, m[8] * sz, 0,
    o.x * S, o.y * S, o.z * S, 1,
  ]);
  // normales: la misma rotación con la escala invertida (para escalas no uniformes)
  const ix = 1 / (o.scl.x || 1), iy = 1 / (o.scl.y || 1), iz = 1 / (o.scl.z || 1);
  const nor = new Float32Array([
    m[0] * ix, m[3] * ix, m[6] * ix,
    m[1] * iy, m[4] * iy, m[7] * iy,
    m[2] * iz, m[5] * iz, m[8] * iz,
  ]);
  return { model, nor };
}

const TAU = Math.PI * 2;
const wrap = a => { a %= TAU; return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a; };
const snap = (a, step) => Math.round(a / step) * step;
const clampN = (v, a, b) => v < a ? a : v > b ? b : v;

/**
 * Aplica el modo de rotación elegido.
 *   libre     → tal cual
 *   asistida  → detecta el eje dominante, limita la inclinación y la endereza sola
 *   simétrica → todos los ángulos en múltiplos de 15°
 */
export function applyRot(o, rot, mode = 'libre') {
  normalize(o);
  let { x, y, z } = rot;
  if (mode === 'asistida') {
    const q = Math.PI / 2, near = .22;                      // ~12° de imán hacia el eje
    x = clampN(wrap(x), -q, q); z = clampN(wrap(z), -q, q);
    if (Math.abs(x - snap(x, q)) < near) x = snap(x, q);
    if (Math.abs(z - snap(z, q)) < near) z = snap(z, q);
    if (Math.abs(x) > Math.abs(z)) z = snap(z, q); else x = snap(x, q);   // un solo eje inclinado
  } else if (mode === 'simetrica') {
    const q = Math.PI / 12;
    x = snap(wrap(x), q); y = snap(wrap(y), q); z = snap(wrap(z), q);
  }
  o.rot = { x: wrap(x), y: wrap(y), z: wrap(z) };
  return o;
}

/** Deja el objeto como recién colocado (giro y tamaño de fábrica). */
export function resetTransform(o, what = 'all') {
  normalize(o);
  if (what === 'all' || what === 'rot') o.rot = { x: 0, y: 0, z: 0 };
  if (what === 'all' || what === 'scl') o.scl = { x: 1, y: 1, z: 1 };
  if (what === 'all' || what === 'pos') { o.x = 0; o.z = 0; }
  return o;
}

/** Radio efectivo del objeto ya escalado (cm). */
export const objectRadius = (o, m) => {
  normalize(o);
  const s = Math.max(o.scl.x, o.scl.z);
  return Math.max(m?.rad ?? 3, ((m?.top ?? 4) - (m?.bottom ?? 0)) * .5 * o.scl.y * .6) * s;
};

/** Mantiene el objeto dentro de la caja (sin atravesar paredes ni suelo). */
export function clampObject(o, dims, m) {
  normalize(o);
  if (o.type === 'tira') return o;
  const t = dims.grosor;
  const r = (m?.rad ?? 3) * Math.max(o.scl.x, o.scl.z);
  const ix = Math.max(.5, dims.ancho / 2 - t - r * .75);
  const iz = Math.max(.5, dims.largo / 2 - t - r * .75);
  o.x = clampN(o.x, -ix, ix);
  o.z = clampN(o.z, -iz, iz);
  o.y = clampN(o.y, t, dims.alto * 1.6);
  return o;
}

// ---------------------------------------------------------------- picking
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
    const c = objectCenter(o, m);
    const rad = Math.max(2.6, objectRadius(o, m) * 1.15) * S;
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
    sc = clampN((uv * vw - uw) / den, 0, 1);
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
  normalize(o);
  const mid = m ? (m.top + m.bottom) / 2 * o.scl.y : 2;
  return { x: o.x * S, y: (o.y + mid) * S, z: o.z * S };
}

// ---------------------------------------------------------------- luces
const WARM = [1, .68, .36], WHITE = [1, .97, .92], DARK = [.30, .29, .26];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/** Parpadeo suave (nunca corta en seco). */
function blink(t, hz, seed) {
  if (!hz) return 1;
  const s = Math.sin(t * hz * Math.PI * 2 + seed * 5) * .5 + .5;
  return .14 + .86 * Math.pow(s, 1.5);
}
const breathe = (t, seed) => .90 + .10 * Math.sin(t * 2.3 + seed * 7) * Math.sin(t * 1.1 + seed * 3);

function hsl(h, s, l) {
  const f = n => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
  };
  return [f(0), f(8), f(4)];
}

/** Ajustes de luz de una fuente (interruptor o caja de pilas). */
export const lightConf = o => ({
  mode: o?.mode || 'off',
  color: o?.hue || '#ffb463',
  power: o?.power ?? 1,
  blink: o?.blink ?? 1.4,
});
const OFF_CONF = { mode: 'off', color: '#000000', power: 0, blink: 0 };

/** Color instantáneo de una luz según su modo. */
export function modeColor(cfg, t, seed = 0) {
  const c = typeof cfg === 'string' ? { mode: cfg } : (cfg || OFF_CONF);
  const p = c.power ?? 1;
  switch (c.mode) {
    case 'warm': return mul(WARM, breathe(t, seed) * p);
    case 'warmBlink': return mul(WARM, blink(t, c.blink ?? 1.4, seed) * p);
    case 'white': return mul(WHITE, breathe(t, seed) * p);
    case 'whiteBlink': return mul(WHITE, blink(t, c.blink ?? 1.4, seed) * p);
    case 'rainbow': return mul(hsl((t * .07 + seed) % 1, .58, .60), p);
    case 'custom': return mul(hex2rgb(c.color || '#ffb463'),
      ((c.blink ? blink(t, c.blink, seed) : breathe(t, seed)) * p));
    default: return DARK.slice();          // apagada: cristal mate, no negro
  }
}

// Transición suave entre modos: cada luz interpola hacia su color objetivo.
const trans = new Map();
let animating = false;

export function lightColor(id, cfg, t, seed = 0) {
  const target = modeColor(cfg, t, seed);
  let s = trans.get(id);
  if (!s) { s = { c: target.slice(), t }; trans.set(id, s); return s.c; }
  const dt = clampN(t - s.t, 0, .25);
  s.t = t;
  const k = 1 - Math.exp(-7 * dt);
  let d = 0;
  for (let i = 0; i < 3; i++) {
    d += Math.abs(target[i] - s.c[i]);
    s.c[i] += (target[i] - s.c[i]) * k;
  }
  if (d > .012) animating = true;
  if (trans.size > 200) trans.clear();
  return s.c;
}

const feeders = (target, objects, links) =>
  objects.filter(o => !o.ghost && (links[o.id] || []).includes(target.id));

/**
 * Energía que llega a una tira (o a un interruptor).
 * Solo las pilas dan corriente: pilas → tira, o pilas → interruptor → tira.
 * Sin fuente, la tira permanece apagada.
 */
export function lightOf(target, objects, links) {
  for (const f of feeders(target, objects, links)) {
    if (isPower(f)) return lightConf(f);
    if (isSwitch(f) && feeders(f, objects, links).some(b => isPower(b) && (b.mode || 'off') !== 'off')) {
      return lightConf(f);
    }
  }
  return OFF_CONF;
}

/** Estado de conexión de un objeto, para los avisos de la interfaz. */
export function wiring(o, objects, links) {
  if (isStrip(o)) {
    const src = feeders(o, objects, links);
    const conf = lightOf(o, objects, links);
    return { sources: src, powered: conf.mode !== 'off', conf };
  }
  if (isSwitch(o)) {
    const bat = feeders(o, objects, links).filter(isPower);
    return { sources: bat, powered: bat.some(b => (b.mode || 'off') !== 'off'), conf: lightConf(o) };
  }
  return { sources: [], powered: isPower(o) && (o.mode || 'off') !== 'off', conf: lightConf(o) };
}

/** Luces puntuales activas (posición en mundo + color ya atenuado). */
export function collectLights(objects, links, t) {
  const out = [];
  for (const o of objects) {
    if (o.hidden || out.length >= 8) continue;
    if (o.type === 'tira') {
      const conf = lightOf(o, objects, links);
      if (conf.mode === 'off') continue;
      const step = Math.max(1, Math.floor(o.path.length / 3));
      for (let i = 0; i < o.path.length && out.length < 8; i += step) {
        const p = o.path[i];
        const c = lightColor(`${o.id}#${i}`, conf, t, i * .13);
        out.push({ p: { x: p[0] * S, y: p[1] * S, z: p[2] * S }, c: mul(c, .5) });
      }
      continue;
    }
    const li = CATALOG[o.type]?.light;
    if (!li) continue;
    normalize(o);
    const f = .85 + .15 * Math.sin(t * 6 + o.x);
    out.push({
      p: { x: o.x * S, y: (o.y + li.y * o.scl.y) * S, z: o.z * S },
      c: mul(hex2rgb(li.color), li.power * .55 * f),
    });
  }
  return out;
}

/** ¿Hay algo animándose (parpadeos o transiciones) que obligue a seguir dibujando? */
export function hasAnimation(objects, links) {
  const was = animating;
  animating = false;
  return was || objects.some(o =>
    (o.type === 'tira' && lightOf(o, objects, links).mode !== 'off')
    || (isSource(o) && (o.mode || 'off') !== 'off')
    || CATALOG[o.type]?.light);
}

export { hex2rgb };
