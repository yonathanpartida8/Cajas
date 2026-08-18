// Constructor de mallas: primitivas simples que se combinan para formar objetos.
// Cada vértice lleva color propio y un factor "mix": 1 = usa el color elegido por
// el usuario, 0 = conserva su color (ojos, cintas, hojas…).

export const mesh = () => ({ pos: [], nor: [], col: [], mix: [], emi: [] });

const C = hex => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/** Matriz local: escala + rotaciones XYZ + traslación (aplicada al construir). */
function xform(o = {}) {
  const { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = o;
  const kx = (o.sx ?? 1) * s, ky = (o.sy ?? 1) * s, kz = (o.sz ?? 1) * s;
  const cX = Math.cos(rx), sX = Math.sin(rx);
  const cY = Math.cos(ry), sY = Math.sin(ry);
  const cZ = Math.cos(rz), sZ = Math.sin(rz);
  // R = Ry * Rx * Rz
  const m = [
    cY * cZ + sY * sX * sZ, -cY * sZ + sY * sX * cZ, sY * cX,
    cX * sZ, cX * cZ, -sX,
    -sY * cZ + cY * sX * sZ, sY * sZ + cY * sX * cZ, cY * cX,
  ];
  const rot = (a, b, c) => [m[0] * a + m[1] * b + m[2] * c, m[3] * a + m[4] * b + m[5] * c, m[6] * a + m[7] * b + m[8] * c];
  return {
    p: (a, b, c) => {
      const r = rot(a * kx, b * ky, c * kz);
      return [r[0] + x, r[1] + y, r[2] + z];
    },
    n: (a, b, c) => {
      const r = rot(a / kx, b / ky, c / kz);
      const l = Math.hypot(r[0], r[1], r[2]) || 1;
      return [r[0] / l, r[1] / l, r[2] / l];
    },
  };
}

function tri(M, t, p1, n1, p2, n2, p3, n3, col, mix, emi) {
  for (const [p, n] of [[p1, n1], [p2, n2], [p3, n3]]) {
    const P = t.p(p[0], p[1], p[2]), N = t.n(n[0], n[1], n[2]);
    M.pos.push(P[0], P[1], P[2]);
    M.nor.push(N[0], N[1], N[2]);
    M.col.push(col[0], col[1], col[2]);
    M.mix.push(mix);
    M.emi.push(emi);
  }
}

const quad = (M, t, a, b, c, d, n, col, mix, emi) => {
  tri(M, t, a, n, b, n, c, n, col, mix, emi);
  tri(M, t, a, n, c, n, d, n, col, mix, emi);
};

/** Caja con esquinas rectas. */
export function box(M, o) {
  const { w = 1, h = 1, d = 1, color = '#ffffff', mix = 1, emi = 0 } = o;
  const t = xform(o), c = C(color);
  const X = w / 2, Y = h / 2, Z = d / 2;
  const v = [[-X, -Y, Z], [X, -Y, Z], [X, Y, Z], [-X, Y, Z], [-X, -Y, -Z], [X, -Y, -Z], [X, Y, -Z], [-X, Y, -Z]];
  quad(M, t, v[0], v[1], v[2], v[3], [0, 0, 1], c, mix, emi);
  quad(M, t, v[5], v[4], v[7], v[6], [0, 0, -1], c, mix, emi);
  quad(M, t, v[1], v[5], v[6], v[2], [1, 0, 0], c, mix, emi);
  quad(M, t, v[4], v[0], v[3], v[7], [-1, 0, 0], c, mix, emi);
  quad(M, t, v[3], v[2], v[6], v[7], [0, 1, 0], c, mix, emi);
  quad(M, t, v[4], v[5], v[1], v[0], [0, -1, 0], c, mix, emi);
  return M;
}

/** Elipsoide (esfera achatable). */
export function ball(M, o) {
  // ax/ay/az = semiejes (rx/ry/rz quedan reservados para la rotación)
  const { r = .5, ax = r, ay = r, az = r, seg = 12, color = '#ffffff', mix = 1, emi = 0 } = o;
  const t = xform(o), c = C(color);
  const rings = Math.max(4, Math.round(seg * .6));
  const at = (i, j) => {
    const u = i / seg * Math.PI * 2, v = j / rings * Math.PI;
    const sn = [Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u)];
    return [[sn[0] * ax, sn[1] * ay, sn[2] * az], [sn[0] / ax, sn[1] / ay, sn[2] / az]];
  };
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const [a, na] = at(i, j), [b, nb] = at(i + 1, j), [d, nd] = at(i + 1, j + 1), [e, ne] = at(i, j + 1);
      tri(M, t, a, na, b, nb, d, nd, c, mix, emi);
      tri(M, t, a, na, d, nd, e, ne, c, mix, emi);
    }
  }
  return M;
}

/** Cilindro o cono (r2 = radio superior). */
export function tube(M, o) {
  const { r = .5, r2 = r, h = 1, seg = 14, color = '#ffffff', mix = 1, emi = 0, caps = true } = o;
  const t = xform(o), c = C(color);
  const Y = h / 2;
  for (let i = 0; i < seg; i++) {
    const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
    const p1 = [ca * r, -Y, sa * r], p2 = [cb * r, -Y, sb * r];
    const p3 = [cb * r2, Y, sb * r2], p4 = [ca * r2, Y, sa * r2];
    const n1 = [ca, (r - r2) / h, sa], n2 = [cb, (r - r2) / h, sb];
    tri(M, t, p1, n1, p2, n2, p3, n2, c, mix, emi);
    tri(M, t, p1, n1, p3, n2, p4, n1, c, mix, emi);
    if (caps) {
      if (r2 > .001) tri(M, t, [0, Y, 0], [0, 1, 0], p4, [0, 1, 0], p3, [0, 1, 0], c, mix, emi);
      if (r > .001) tri(M, t, [0, -Y, 0], [0, -1, 0], p2, [0, -1, 0], p1, [0, -1, 0], c, mix, emi);
    }
  }
  return M;
}

/** Anillo (rosquilla): lazos, moños y aros. */
export function ring(M, o) {
  const { R = .5, r = .12, seg = 18, side = 8, color = '#ffffff', mix = 1, emi = 0, arc = Math.PI * 2 } = o;
  const t = xform(o), c = C(color);
  const at = (i, j) => {
    const u = i / seg * arc, v = j / side * Math.PI * 2;
    const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
    return [[(R + r * cv) * cu, (R + r * cv) * su, r * sv], [cv * cu, cv * su, sv]];
  };
  for (let i = 0; i < seg; i++) for (let j = 0; j < side; j++) {
    const [a, na] = at(i, j), [b, nb] = at(i + 1, j), [d, nd] = at(i + 1, j + 1), [e, ne] = at(i, j + 1);
    tri(M, t, a, na, b, nb, d, nd, c, mix, emi);
    tri(M, t, a, na, d, nd, e, ne, c, mix, emi);
  }
  return M;
}

/** Extrusión de un contorno 2D (corazones, estrellas, pétalos). */
export function extrude(M, o) {
  const { path, depth = .2, color = '#ffffff', mix = 1, emi = 0 } = o;
  const t = xform(o), c = C(color);
  const z = depth / 2, n = path.length;
  // tapas (abanico desde el centro)
  let cx = 0, cy = 0;
  for (const p of path) { cx += p[0]; cy += p[1]; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) {
    const a = path[i], b = path[(i + 1) % n];
    tri(M, t, [cx, cy, z], [0, 0, 1], [a[0], a[1], z], [0, 0, 1], [b[0], b[1], z], [0, 0, 1], c, mix, emi);
    tri(M, t, [cx, cy, -z], [0, 0, -1], [b[0], b[1], -z], [0, 0, -1], [a[0], a[1], -z], [0, 0, -1], c, mix, emi);
    const e = [b[0] - a[0], b[1] - a[1]];
    const l = Math.hypot(e[0], e[1]) || 1;
    const nn = [e[1] / l, -e[0] / l, 0];
    quad(M, t, [a[0], a[1], -z], [b[0], b[1], -z], [b[0], b[1], z], [a[0], a[1], z], nn, c, mix, emi);
  }
  return M;
}

/** Cinta curvada con un ligero rizo: el papel picado de relleno. */
export function ribbon(M, o) {
  const { w = 1, h = 3, d = .06, twist = 2.4, seg = 10, color = '#ffffff', mix = 1, emi = 0 } = o;
  const t = xform(o), c = C(color);
  const pt = (i, s, front) => {
    const f = i / seg, a = f * twist, y = (f - .5) * h;
    const bend = Math.sin(f * Math.PI) * w * .35;
    const ca = Math.cos(a), sa = Math.sin(a);
    const off = (s * w / 2);
    return [off * ca + bend, y, off * sa + (front ? d : -d)];
  };
  for (let i = 0; i < seg; i++) {
    for (const front of [true, false]) {
      const nz = front ? 1 : -1;
      const a = pt(i, -1, front), b = pt(i, 1, front), e = pt(i + 1, 1, front), f = pt(i + 1, -1, front);
      const ang = i / seg * twist;
      const nn = [-Math.sin(ang) * nz, 0, Math.cos(ang) * nz];
      if (front) quad(M, t, a, b, e, f, nn, c, mix, emi);
      else quad(M, t, f, e, b, a, nn, c, mix, emi);
    }
    for (const s of [-1, 1]) {                     // cantos
      const a = pt(i, s, true), b = pt(i, s, false), e = pt(i + 1, s, false), f = pt(i + 1, s, true);
      const ang = i / seg * twist;
      const nn = [Math.cos(ang) * s, 0, Math.sin(ang) * s];
      quad(M, t, a, b, e, f, nn, c, mix, emi);
    }
  }
  return M;
}

/**
 * Papelito picado: una lámina finísima, ligeramente curvada y retorcida.
 * `shape` cambia el recorte modulando el ancho a lo largo de la tira.
 */
const CUTS = {
  tira: () => 1,                                             // tira larga y recta
  punta: f => 1 - f * .88,                                   // acaba en punta
  rombo: f => 1 - Math.abs(2 * f - 1) * .8,                  // ancho por el centro
  hoja: f => Math.pow(Math.sin(Math.min(.999, Math.max(.001, f)) * Math.PI), .55),
  rect: f => (f < .06 || f > .94 ? .96 : 1),                 // recorte recto
};
export const CUT_NAMES = Object.keys(CUTS);

export function paper(M, o) {
  const { w = .7, h = 4, d = .02, bend = .28, twist = .8, shape = 'tira', seg = 5,
    color = '#ffffff', mix = 1, emi = 0 } = o;
  const t = xform(o), c = C(color);
  const cut = CUTS[shape] || CUTS.tira;
  const pt = (i, s, front) => {
    const f = i / seg;
    const a = twist * (f - .5);
    const half = w * .5 * cut(f);
    const sag = Math.sin(f * Math.PI) * bend * h * .5;
    return [half * s * Math.cos(a), (f - .5) * h, half * s * Math.sin(a) + sag + (front ? d : -d)];
  };
  for (let i = 0; i < seg; i++) {
    const ang = twist * (i / seg - .5);
    for (const front of [true, false]) {
      const nz = front ? 1 : -1;
      const a = pt(i, -1, front), b = pt(i, 1, front), e = pt(i + 1, 1, front), g = pt(i + 1, -1, front);
      const nn = [-Math.sin(ang) * nz, .18 * nz, Math.cos(ang) * nz];
      if (front) quad(M, t, a, b, e, g, nn, c, mix, emi);
      else quad(M, t, g, e, b, a, nn, c, mix, emi);
    }
  }
  return M;
}

/**
 * Suaviza una polilínea con un spline de Catmull-Rom y la remuestrea a pasos
 * regulares: el trazo del dedo se convierte en una curva limpia.
 */
export function smoothPath(pts, step = .8) {
  if (pts.length < 3) return pts.map(p => [...p]);
  const P = i => pts[Math.max(0, Math.min(pts.length - 1, i))];
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const q = [];
      for (let a = 0; a < 3; a++) {
        q.push(.5 * ((2 * p1[a])
          + (-p0[a] + p2[a]) * t
          + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2
          + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3));
      }
      out.push(q);
    }
  }
  out.push([...pts[pts.length - 1]]);
  return out;
}

/** Tubo que sigue una polilínea: el cable de las tiras de luces. */
export function polyTube(M, o) {
  const { points, r = .12, sides = 6, color = '#3d3a34', mix = 0, emi = 0 } = o;
  if (points.length < 2) return M;
  const t = xform({});
  const c = C(color);
  const up = [0, 1, 0];
  const rings = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    let d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let l = Math.hypot(d[0], d[1], d[2]) || 1;
    d = [d[0] / l, d[1] / l, d[2] / l];
    let sx = [d[1] * up[2] - d[2] * up[1], d[2] * up[0] - d[0] * up[2], d[0] * up[1] - d[1] * up[0]];
    let sl = Math.hypot(sx[0], sx[1], sx[2]);
    if (sl < 1e-4) { sx = [1, 0, 0]; sl = 1; }
    sx = [sx[0] / sl, sx[1] / sl, sx[2] / sl];
    const sy = [d[1] * sx[2] - d[2] * sx[1], d[2] * sx[0] - d[0] * sx[2], d[0] * sx[1] - d[1] * sx[0]];
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a2 = k / sides * Math.PI * 2, ca = Math.cos(a2), sa = Math.sin(a2);
      const n = [sx[0] * ca + sy[0] * sa, sx[1] * ca + sy[1] * sa, sx[2] * ca + sy[2] * sa];
      ring.push([[points[i][0] + n[0] * r, points[i][1] + n[1] * r, points[i][2] + n[2] * r], n]);
    }
    rings.push(ring);
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      const [a, na] = rings[i][k], [b, nb] = rings[i][k2];
      const [d, nd] = rings[i + 1][k2], [e, ne] = rings[i + 1][k];
      tri(M, t, a, na, b, nb, d, nd, c, mix, emi);
      tri(M, t, a, na, d, nd, e, ne, c, mix, emi);
    }
  }
  return M;
}

// ---------------------------------------------------------------- contornos
export const heartPath = (n = 28) => Array.from({ length: n }, (_, i) => {
  const t = i / n * Math.PI * 2;
  const s = Math.sin(t);
  return [16 * s * s * s / 17, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17];
});

export const starPath = (points = 5, inner = .45) => Array.from({ length: points * 2 }, (_, i) => {
  const a = i / (points * 2) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? inner : 1;
  return [Math.cos(a) * r, Math.sin(a) * r];
});

/** Empaqueta la malla en arrays tipados listos para la GPU. */
export function pack(M) {
  return {
    pos: new Float32Array(M.pos),
    nor: new Float32Array(M.nor),
    col: new Float32Array(M.col),
    mix: new Float32Array(M.mix),
    emi: new Float32Array(M.emi),
    count: M.pos.length / 3,
  };
}
