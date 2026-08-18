// Geometría de la caja: dimensiones (cm) → caras con ejes u/v en unidades de mundo.
import { v3, norm, cross } from '../core/math3d.js';

export const S = 0.045;      // cm → unidades de mundo
export const GAP = 0.15;     // holgura entre caja y tapa (cm)

/** medida: [mínimo, máximo, valor inicial, paso] en cm */
export const LIMITS = {
  largo: [8, 60, 24, 1],
  ancho: [8, 60, 18, 1],
  alto: [4, 45, 14, 1],
  tapa: [2, 20, 5, 1],
  grosor: [.2, 1.5, .4, .1],
};

/** Crea una cara. Entradas en cm; salida en unidades de mundo. */
function face(id, part, side, o, u, v, opts = {}) {
  const U = v3(u[0] * S, u[1] * S, u[2] * S);
  const V = v3(v[0] * S, v[1] * S, v[2] * S);
  return {
    id, part, side,
    o: v3(o[0] * S, o[1] * S, o[2] * S), u: U, v: V,
    n: norm(cross(V, U)),
    uLen: Math.hypot(u[0], u[1], u[2]),
    vLen: Math.hypot(v[0], v[1], v[2]),
    shade: opts.shade ?? (side === 'in' ? .84 : 1),
    plain: !!opts.plain,
  };
}

/** Anillo de 4 paredes (exterior o interior) entre yTop y yBot. */
function ring(prefix, part, side, ax, az, yTop, yBot, inner, out, opts) {
  const h = yTop - yBot;
  const defs = inner ? [
    ['front', [ax, yTop, az], [-2 * ax, 0, 0]],
    ['back', [-ax, yTop, -az], [2 * ax, 0, 0]],
    ['right', [ax, yTop, -az], [0, 0, 2 * az]],
    ['left', [-ax, yTop, az], [0, 0, -2 * az]],
  ] : [
    ['front', [-ax, yTop, az], [2 * ax, 0, 0]],
    ['back', [ax, yTop, -az], [-2 * ax, 0, 0]],
    ['right', [ax, yTop, az], [0, 0, -2 * az]],
    ['left', [-ax, yTop, -az], [0, 0, 2 * az]],
  ];
  for (const [name, o, u] of defs) out.push(face(`${prefix}.${name}`, part, side, o, u, [0, -h, 0], opts));
}

/** Anillo plano (borde de cartón) mirando arriba (dir=1) o abajo (dir=-1). */
function rim(prefix, part, y, ax, az, ix, iz, dir, out) {
  const vz = dir > 0 ? 1 : -1;
  const q = [
    [`${prefix}.rf`, [-ax, y, dir > 0 ? iz : az], [2 * ax, 0, 0], [0, 0, vz * (az - iz)]],
    [`${prefix}.rb`, [-ax, y, dir > 0 ? -az : -iz], [2 * ax, 0, 0], [0, 0, vz * (az - iz)]],
    [`${prefix}.rr`, [ix, y, dir > 0 ? -iz : iz], [ax - ix, 0, 0], [0, 0, vz * 2 * iz]],
    [`${prefix}.rl`, [-ax, y, dir > 0 ? -iz : iz], [ax - ix, 0, 0], [0, 0, vz * 2 * iz]],
  ];
  for (const [id, o, u, v] of q) out.push(face(id, part, 'out', o, u, v, { plain: true, shade: .92 }));
}

/**
 * Construye todas las caras a partir de las medidas y el desplazamiento de la tapa.
 * @param {{largo:number,ancho:number,alto:number,tapa:number}} d  cm
 * @param {{x:number,y:number,z:number}} lid  desplazamiento de la tapa (cm)
 */
export function buildFaces(d, lid = { x: 0, y: 0, z: 0 }) {
  const W = d.ancho, D = d.largo, H = d.alto, T = d.grosor;
  const ax = W / 2, az = D / 2, ix = ax - T, iz = az - T;
  const f = [];

  // --- caja ---
  ring('b.o', 'box', 'out', ax, az, H, 0, false, f);
  ring('b.i', 'box', 'in', ix, iz, H, T, true, f);
  f.push(face('b.o.bottom', 'box', 'out', [-ax, 0, az], [2 * ax, 0, 0], [0, 0, -2 * az], { shade: .8 }));
  f.push(face('b.i.bottom', 'box', 'in', [-ix, T, -iz], [2 * ix, 0, 0], [0, 0, 2 * iz], { shade: .9 }));
  rim('b', 'box', H, ax, az, ix, iz, 1, f);

  // --- tapa ---
  const A = ax + GAP + T, B = az + GAP + T, Ai = A - T, Bi = B - T;
  const y0 = H, y1 = H + T, yb = H - Math.min(d.tapa, H - T);
  const L = [];
  ring('l.o', 'lid', 'out', A, B, y1, yb, false, L);
  ring('l.i', 'lid', 'in', Ai, Bi, y0, yb, true, L);
  L.push(face('l.o.top', 'lid', 'out', [-A, y1, -B], [2 * A, 0, 0], [0, 0, 2 * B]));
  L.push(face('l.i.top', 'lid', 'in', [-Ai, y0, Bi], [2 * Ai, 0, 0], [0, 0, -2 * Bi], { shade: .8 }));
  rim('l', 'lid', yb, A, B, Ai, Bi, -1, L);

  const off = v3(lid.x * S, lid.y * S, lid.z * S);
  for (const c of L) { c.o = v3(c.o.x + off.x, c.o.y + off.y, c.o.z + off.z); f.push(c); }

  return f;
}

const NAMES = { front: 'el frente', back: 'la parte trasera', right: 'el lado derecho', left: 'el lado izquierdo', bottom: 'la base', top: 'la tapa' };

/** Nombre legible de una cara, para los avisos de la interfaz. */
export function faceLabel(face) {
  const [part, side, name] = face.id.split('.');
  if (part === 'l') return side === 'i' ? 'el interior de la tapa' : name === 'top' ? 'la tapa' : 'el lateral de la tapa';
  if (side === 'i') return name === 'bottom' ? 'el fondo interior' : 'el interior';
  return NAMES[name] || 'la caja';
}

const SHORT = { front: 'Frente', back: 'Trasera', right: 'Lado der.', left: 'Lado izq.', bottom: 'Base', top: 'Tapa' };

/** Etiqueta corta para el indicador de superficie. */
export function faceShort(face) {
  const [part, side, name] = face.id.split('.');
  const zone = part === 'l' ? (side === 'i' ? 'Interior tapa' : name === 'top' ? 'Tapa' : 'Tapa · ' + SHORT[name]) : null;
  if (zone) return zone;
  if (side === 'i') return name === 'bottom' ? 'Fondo interior' : 'Interior · ' + SHORT[name];
  return SHORT[name] || 'Caja';
}

/** Altura total del conjunto y diagonal aproximada (cm) — para encuadrar la cámara. */
export function extent(d) {
  const A = d.ancho / 2 + GAP + d.grosor, B = d.largo / 2 + GAP + d.grosor;
  return Math.hypot(A * 2, d.alto + d.grosor, B * 2);
}

/** Semiancho exterior de la tapa (cm) — usado para apartarla. */
export const lidHalf = d => d.ancho / 2 + GAP + d.grosor;
