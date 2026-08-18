// Eliminación de fondo local (sin servicios externos).
// Estrategia: crecimiento de región desde los bordes + suavizado del borde + recorte.
// Módulo aislado: puede sustituirse por un modelo más avanzado sin tocar el resto.

const MAX = 900;

const dist = (d, a, b) => Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);

/** @returns {Promise<string>} dataURL PNG con fondo transparente */
export async function removeBackground(img) {
  const sc = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * sc)), h = Math.max(1, Math.round(img.height * sc));
  const cv = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h), d = id.data;

  // color medio del borde
  const ref = [0, 0, 0]; let n = 0;
  const edge = [];
  for (let x = 0; x < w; x++) { edge.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { edge.push(y * w, y * w + w - 1); }
  for (const p of edge) { const i = p * 4; ref[0] += d[i]; ref[1] += d[i + 1]; ref[2] += d[i + 2]; n++; }
  ref[0] /= n; ref[1] /= n; ref[2] /= n;

  let mask = null, ratio = 0;
  for (const tol of [46, 74, 104, 140]) {
    const m = grow(d, w, h, edge, ref, tol);
    const r = m.count / (w * h);
    if (r > .955) break;              // se estaría comiendo el objeto
    mask = m.mask; ratio = r;
    if (r > .12) break;               // suficiente fondo detectado
  }
  if (!mask || ratio < .01) return null;  // fondo no reconocible

  feather(mask, w, h);
  for (let p = 0; p < w * h; p++) d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (1 - mask[p] / 255));
  ctx.putImageData(id, 0, 0);
  return crop(cv, ctx, w, h);
}

function grow(d, w, h, edge, ref, tol) {
  const mask = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let qs = 0, qe = 0, count = 0;
  const gl = tol * 2.2;
  const near = (i) => Math.abs(d[i] - ref[0]) + Math.abs(d[i + 1] - ref[1]) + Math.abs(d[i + 2] - ref[2]) < gl;
  for (const p of edge) if (!mask[p] && near(p * 4)) { mask[p] = 255; q[qe++] = p; count++; }
  while (qs < qe) {
    const p = q[qs++], x = p % w, y = (p / w) | 0, i = p * 4;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = ny * w + nx;
      if (mask[np]) continue;
      const ni = np * 4;
      if (dist(d, ni, i) < tol && near(ni)) { mask[np] = 255; q[qe++] = np; count++; }
    }
  }
  return { mask, count };
}

/** Difumina la máscara para que el recorte no quede dentado. */
function feather(mask, w, h) {
  const tmp = new Uint8Array(w * h), r = 2, div = r * 2 + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += mask[y * w + Math.min(w - 1, Math.max(0, x + k))];
    tmp[y * w + x] = s / div;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let s = 0;
    for (let k = -r; k <= r; k++) s += tmp[Math.min(h - 1, Math.max(0, y + k)) * w + x];
    mask[y * w + x] = s / div;
  }
}

/** Recorta el área con contenido para que el objeto llene la imagen. */
function crop(cv, ctx, w, h) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 <= x0 || y1 <= y0) return cv.toDataURL('image/png');
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = Object.assign(document.createElement('canvas'), { width: x1 - x0 + 1, height: y1 - y0 + 1 });
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
