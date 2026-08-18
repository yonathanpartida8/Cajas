// Utilidades 3D mínimas (sin dependencias).

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
/** Interpolación suave e independiente del framerate. */
export const damp = (a, b, speed, dt) => lerp(a, b, 1 - Math.exp(-speed * dt));

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const len = a => Math.hypot(a.x, a.y, a.z);
export const norm = a => { const l = len(a) || 1; return scale(a, 1 / l); };

/** matriz 4x4 column-major (Float32Array) */
export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(eye, target, up = v3(0, 1, 0)) {
  const z = norm(sub(eye, target));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x.x, y.x, z.x, 0,
    x.y, y.y, z.y, 0,
    x.z, y.z, z.z, 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ]);
}

export function mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

/**
 * Intersección rayo ↔ cuadrilátero definido por origen + ejes u/v.
 * Devuelve {t,u,v} normalizados (0..1) o null.
 */
export function rayPlane(ro, rd, face) {
  const d = dot(rd, face.n);
  if (Math.abs(d) < 1e-6) return null;
  const t = dot(sub(face.o, ro), face.n) / d;
  if (t <= 0) return null;
  const p = sub(add(ro, scale(rd, t)), face.o);
  return { t, u: dot(p, face.u) / dot(face.u, face.u), v: dot(p, face.v) / dot(face.v, face.v) };
}

export function rayQuad(ro, rd, face) {
  const h = rayPlane(ro, rd, face);
  if (!h || h.u < 0 || h.u > 1 || h.v < 0 || h.v > 1) return null;
  return h;
}
