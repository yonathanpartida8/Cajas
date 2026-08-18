// Materiales de cartón: textura procedural + pintado de caras con imágenes.

export const MATERIALS = [
  { id: 'kraft', name: 'Kraft', color: '#c69a63', grain: 14 },
  { id: 'natural', name: 'Natural', color: '#e2caa4', grain: 10 },
  { id: 'blanco', name: 'Blanco', color: '#f0e9dd', grain: 7 },
  { id: 'cafe', name: 'Café', color: '#966839', grain: 16 },
];

export const TILE = 9.5; // cm que ocupa un mosaico de cartón

const cache = new Map();
const clamp255 = v => v < 0 ? 0 : v > 255 ? 255 : v;

/** Ruido de valor repetible (rejilla g×g interpolada suavemente) en [0,1]. */
function valueNoise(N, g) {
  const r = new Float32Array(g * g).map(Math.random);
  const out = new Float32Array(N * N);
  const s = t => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) {
    const fy = y * g / N, y0 = Math.floor(fy), ty = s(fy - y0);
    for (let x = 0; x < N; x++) {
      const fx = x * g / N, x0 = Math.floor(fx), tx = s(fx - x0);
      const a = r[(y0 % g) * g + (x0 % g)], b = r[(y0 % g) * g + ((x0 + 1) % g)];
      const c = r[((y0 + 1) % g) * g + (x0 % g)], e = r[((y0 + 1) % g) * g + ((x0 + 1) % g)];
      out[y * N + x] = (a + (b - a) * tx) * (1 - ty) + (c + (e - c) * tx) * ty;
    }
  }
  return out;
}

/** Canvas 256² con aspecto de cartón, repetible. */
export function kraftCanvas(materialId) {
  if (cache.has(materialId)) return cache.get(materialId);
  const m = MATERIALS.find(x => x.id === materialId) || MATERIALS[0];
  const N = 256;
  const c = Object.assign(document.createElement('canvas'), { width: N, height: N });
  const ctx = c.getContext('2d');
  ctx.fillStyle = m.color; ctx.fillRect(0, 0, N, N);
  const img = ctx.getImageData(0, 0, N, N), d = img.data, g = m.grain;
  const blot = valueNoise(N, 8), fib = valueNoise(N, 48);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = y * N + x, i = p * 4;
      // manchas suaves + fibra fina + grano aleatorio (todo repetible)
      const n = (blot[p] - .5) * g * .85
        + (fib[p] - .5) * g * .75
        + (Math.random() - .5) * g * 1.5;
      d[i] = clamp255(d[i] + n * 1.06);
      d[i + 1] = clamp255(d[i + 1] + n * .96);
      d[i + 2] = clamp255(d[i + 2] + n * .82);
    }
  }
  ctx.putImageData(img, 0, 0);
  cache.set(materialId, c);
  return c;
}

/** Sombra de contacto (alfa radial). */
export function shadowCanvas() {
  if (cache.has('_shadow')) return cache.get('_shadow');
  const c = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(70,44,22,.78)');
  g.addColorStop(.4, 'rgba(70,44,22,.56)');
  g.addColorStop(.72, 'rgba(70,44,22,.18)');
  g.addColorStop(1, 'rgba(70,44,22,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  cache.set('_shadow', c);
  return c;
}

/**
 * Pinta una cara: fondo de cartón + imágenes con su transformación.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{w:number,h:number,uLen:number}} face  tamaño del canvas y ancho real en cm
 */
export function paintFace(ctx, face, stickers, selectedId, materialId) {
  const { w, h, uLen } = face;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const px = w / uLen;                       // píxeles por cm
  const k = (px * TILE) / 256;
  const pat = ctx.createPattern(kraftCanvas(materialId), 'repeat');
  pat.setTransform?.(new DOMMatrix([k, 0, 0, k, 0, 0]));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);

  for (const s of stickers) {
    const img = s.img;
    if (!img || !img.width) continue;
    const dw = s.size * w;
    const dh = dw * (img.height / img.width);
    ctx.save();
    ctx.translate(s.u * w, s.v * h);
    ctx.rotate(s.rot);
    ctx.globalAlpha = s.alpha ?? 1;
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.globalAlpha = 1;
    if (s.id === selectedId) {
      const p = Math.max(4, w * .006);
      ctx.strokeStyle = '#d98232'; ctx.lineWidth = p; ctx.setLineDash([p * 3, p * 2.4]);
      ctx.strokeRect(-dw / 2 - p, -dh / 2 - p, dw + p * 2, dh + p * 2);
      ctx.setLineDash([]);
      ctx.fillStyle = '#d98232';
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.arc(cx * (dw / 2 + p), cy * (dh / 2 + p), p * 1.8, 0, 7);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
