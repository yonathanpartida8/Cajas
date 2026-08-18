// Biblioteca de objetos 3D. Añadir uno nuevo = añadir una entrada aquí:
// el resto de la app (colocación, transformación, color, duplicar, conectar…)
// funciona sola. Los campos opcionales activan capacidades:
//
//   props   → controles numéricos propios (se generan solos en su panel)
//   light   → emite luz puntual (velas)
//   switch  → es un interruptor: enciende lo que tenga conectado
//   power   → es una fuente de energía (caja de pilas)
//   tool    → no es un objeto que se coloque, sino una herramienta del dock
import { mesh, pack, box, ball, tube, ring, extrude, paper, heartPath, starPath, CUT_NAMES } from './shapes.js';

export const CATEGORIES = [
  { id: 'amor', name: 'Amor', emoji: '💕' },
  { id: 'peluches', name: 'Peluches', emoji: '🧸' },
  { id: 'cartas', name: 'Cartas', emoji: '💌' },
  { id: 'flores', name: 'Flores', emoji: '🌹' },
  { id: 'regalos', name: 'Regalos', emoji: '🎁' },
  { id: 'papel', name: 'Papel', emoji: '📝' },
  { id: 'luces', name: 'Luces', emoji: '💡' },
  { id: 'deco', name: 'Decoración', emoji: '🎀' },
  { id: 'fotos', name: 'Fotos', emoji: '🖼️' },
  { id: 'materiales', name: 'Materiales', emoji: '🎨' },
];

const CREAM = '#f6e7cf', DARK = '#3a2a20', GREEN = '#5f8a4a', GOLD = '#d8a24a';
const TAU = Math.PI * 2;

/** Aclara u oscurece un color hex. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Aleatorio reproducible: la misma malla se reconstruye siempre igual. */
function rng(seed) {
  let a = (seed | 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tonos de papel picado: uno solo, variaciones del elegido o mezcla alegre. */
const CONFETTI = ['#ffffff', '#fbe3e8', '#f2a5b8', '#f6d186', '#bfe0c4', '#bcd3f0', '#d9c3f0'];
function confetti(base, varia, r) {
  if (varia >= 2) return r() < .7 ? CONFETTI[(r() * CONFETTI.length) | 0] : shade(base, .9 + r() * .22);
  if (varia >= 1) return shade(base, .84 + r() * .32);
  return base;
}

/** Cada objeto se construye en centímetros, a su tamaño natural. */
export const CATALOG = {
  corazon: {
    name: 'Corazón', emoji: '💖', cat: 'amor', color: '#e05a6d',
    build: o => pack(extrude(mesh(), { path: heartPath(30), depth: 1.5, color: o.color, s: 2.6, y: 2.7, ry: .25 })),
  },
  corazones: {
    name: 'Dos corazones', emoji: '💞', cat: 'amor', color: '#e05a6d',
    build: o => {
      const M = mesh();
      extrude(M, { path: heartPath(26), depth: 1.1, color: o.color, s: 2.2, x: -1.2, y: 2.3, ry: -.4 });
      extrude(M, { path: heartPath(26), depth: 1, color: shade(o.color, 1.14), s: 1.7, x: 1.4, y: 3.4, ry: .45 });
      return pack(M);
    },
  },
  estrella: {
    name: 'Estrella', emoji: '⭐', cat: 'deco', color: '#f2c14e',
    build: o => pack(extrude(mesh(), { path: starPath(5, .46), depth: 1, color: o.color, s: 2.8, y: 2.9, ry: .1 })),
  },
  osito: {
    name: 'Osito', emoji: '🧸', cat: 'peluches', color: '#c08b52',
    build: o => {
      const M = mesh(), c = o.color;
      ball(M, { y: 3.1, ax: 2.3, ay: 2.5, az: 2, color: c, seg: 14 });
      ball(M, { y: 6.6, ax: 2, ay: 1.9, az: 1.9, color: c, seg: 14 });
      for (const s of [-1, 1]) {
        ball(M, { x: s * 1.5, y: 7.9, z: -.1, r: .8, color: c, seg: 10 });
        ball(M, { x: s * 1.5, y: 7.95, z: .3, ax: .45, ay: .45, az: .28, color: CREAM, mix: 0, seg: 8 });
        ball(M, { x: s * 2.45, y: 3.5, ax: .85, ay: 1.35, az: .85, color: c, seg: 10 });
        ball(M, { x: s * 1.15, y: .95, z: .35, ax: 1.05, ay: .9, az: 1.3, color: c, seg: 10 });
        ball(M, { x: s * .72, y: 6.95, z: 1.5, r: .22, color: DARK, mix: 0, seg: 8 });
      }
      ball(M, { y: 6.2, z: 1.4, ax: 1.05, ay: .8, az: .75, color: CREAM, mix: .12, seg: 12 });
      ball(M, { y: 6.4, z: 2, ax: .3, ay: .24, az: .25, color: DARK, mix: 0, seg: 8 });
      ring(M, { R: .95, r: .28, y: 4.9, z: 1.1, rx: Math.PI / 2, color: '#e05a6d', mix: 0, seg: 12, side: 6 });
      return pack(M);
    },
  },
  carta: {
    name: 'Carta', emoji: '💌', cat: 'cartas', color: '#fbf3e4',
    build: o => {
      const M = mesh(), c = o.color;
      box(M, { w: 7.2, h: 5, d: .5, y: 2.6, rx: -.34, color: c });
      extrude(M, { path: [[-3.5, 2.4], [3.5, 2.4], [0, -.5]], depth: .4, color: shade(c, .93), y: 2.7, z: .38, rx: -.34 });
      extrude(M, { path: heartPath(20), depth: .3, color: '#d9455c', mix: 0, s: .85, y: 2.9, z: .62, rx: -.34 });
      return pack(M);
    },
  },
  nota: {
    name: 'Nota', emoji: '📜', cat: 'cartas', color: '#f7ecd6',
    build: o => {
      const M = mesh(), c = o.color;
      box(M, { w: 5.4, h: .34, d: 7, y: .18, ry: .05, color: c });
      box(M, { w: 5.2, h: .3, d: 6.6, y: .5, ry: .16, color: shade(c, .97) });
      for (let i = 0; i < 3; i++) box(M, { w: 3.4, h: .07, d: .26, y: .67, z: -1.4 + i * 1.4, ry: .16, color: '#a4917c', mix: 0 });
      return pack(M);
    },
  },
  rosa: {
    name: 'Rosa', emoji: '🌹', cat: 'flores', color: '#d24a63',
    build: o => {
      const M = mesh(), c = o.color;
      tube(M, { r: .22, h: 7, y: 3.5, color: GREEN, mix: 0, seg: 8 });
      for (const s of [-1, 1]) {
        ball(M, { x: s * .95, y: 3.6, ax: 1.15, ay: .12, az: .5, color: GREEN, mix: 0, seg: 8, rz: s * .3, ry: s * .5 });
      }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU;
        ball(M, {
          x: Math.cos(a) * .8, z: Math.sin(a) * .8, y: 7.6,
          ax: .95, ay: 1.2, az: .4, ry: -a, seg: 9,
          color: shade(c, i % 2 ? 1.07 : .93),
        });
      }
      ball(M, { y: 7.95, ax: .78, ay: .85, az: .78, color: shade(c, 1.12), seg: 10 });
      return pack(M);
    },
  },
  flor: {
    name: 'Flor', emoji: '🌸', cat: 'flores', color: '#e88bb0',
    build: o => {
      const M = mesh(), c = o.color;
      tube(M, { r: .2, h: 6, y: 3, color: GREEN, mix: 0, seg: 8 });
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * TAU;
        ball(M, { x: Math.cos(a) * 1.25, z: Math.sin(a) * 1.25, y: 6.4, ax: 1.05, ay: .3, az: .68, ry: -a, color: c, seg: 9 });
      }
      ball(M, { y: 6.62, ax: .72, ay: .5, az: .72, color: GOLD, mix: 0, seg: 10 });
      return pack(M);
    },
  },
  regalo: {
    name: 'Regalo', emoji: '🎁', cat: 'regalos', color: '#c2536b',
    build: o => {
      const M = mesh(), c = o.color;
      box(M, { w: 5.4, h: 4.4, d: 5.4, y: 2.2, color: c });
      box(M, { w: 1.15, h: 4.5, d: 5.5, y: 2.2, color: GOLD, mix: 0 });
      box(M, { w: 5.5, h: 4.5, d: 1.15, y: 2.2, color: GOLD, mix: 0 });
      for (const s of [-1, 1]) ring(M, { R: 1.05, r: .28, x: s * 1.05, y: 5.1, rx: Math.PI / 2, rz: s * .5, color: GOLD, mix: 0, seg: 12, side: 6 });
      ball(M, { y: 4.75, r: .5, color: GOLD, mix: 0, seg: 8 });
      return pack(M);
    },
  },
  mono: {
    name: 'Moño', emoji: '🎀', cat: 'deco', color: '#e0607f',
    build: o => {
      const M = mesh(), c = o.color;
      for (const s of [-1, 1]) ring(M, { R: 1.5, r: .4, x: s * 1.5, y: 2.5, rx: Math.PI / 2, rz: s * .45, color: c, seg: 14, side: 7 });
      ball(M, { y: 2.5, ax: .75, ay: .7, az: .7, color: shade(c, .9), seg: 10 });
      for (const s of [-1, 1]) box(M, { w: .9, h: 2.6, d: .3, x: s * .85, y: 1, rz: s * .5, color: shade(c, .96) });
      return pack(M);
    },
  },
  vela: {
    name: 'Vela', emoji: '🕯️', cat: 'luces', color: '#f5ead2',
    light: { y: 7.5, color: '#ffb663', power: 1 },
    build: o => {
      const M = mesh(), c = o.color;
      tube(M, { r: 1.25, h: 6, y: 3, color: c, seg: 16 });
      ball(M, { y: 6, ax: 1.25, ay: .4, az: 1.25, color: shade(c, 1.03), seg: 14 });
      tube(M, { r: .09, h: .8, y: 6.4, color: DARK, mix: 0, seg: 6 });
      ball(M, { y: 7.4, ax: .38, ay: .85, az: .38, color: '#ffb85c', mix: 0, emi: 1, seg: 10 });
      return pack(M);
    },
  },

  // ---------------------------------------------------------------- papel picado
  papel: {
    name: 'Papel picado', emoji: '🎊', cat: 'papel', color: '#ffffff',
    props: [
      { k: 'count', label: 'Cantidad', hint: 'papelitos', min: 1, max: 120, step: 1, def: 40, unit: '' },
      { k: 'forma', label: 'Recorte', hint: 'forma de los papelitos', def: 'mezcla', choices: [
        { v: 'mezcla', name: 'Mezcla' }, { v: 'tira', name: 'Tiras' }, { v: 'rect', name: 'Rectos' },
        { v: 'punta', name: 'Puntas' }, { v: 'rombo', name: 'Rombos' }, { v: 'hoja', name: 'Hojas' },
      ] },
      { k: 'variedad', label: 'Colores', hint: 'tonos a la vez', def: 1, choices: [
        { v: 0, name: 'Uno' }, { v: 1, name: 'Tonos' }, { v: 2, name: 'Varios' },
      ] },
      { k: 'pw', label: 'Ancho', hint: 'de cada papelito', min: .2, max: 3, step: .1, def: .7 },
      { k: 'ph', label: 'Largo', hint: 'de cada papelito', min: .5, max: 14, step: .5, def: 4 },
      { k: 'pt', label: 'Grosor', hint: 'papel finísimo', min: .01, max: .3, step: .01, def: .04 },
      { k: 'spread', label: 'Extensión', hint: 'cuánto se reparte', min: 0, max: 40, step: 1, def: 9 },
      { k: 'layer', label: 'Relleno', hint: 'altura del montón', min: 0, max: 14, step: .5, def: 1.5 },
    ],
    // Papelitos planos y finísimos, repartidos por igual en toda la zona
    // (raíz cuadrada del radio) para que no se amontonen en el centro.
    build: o => {
      const M = mesh();
      const n = Math.round(o.count ?? 40);
      const w = o.pw ?? .7, h = o.ph ?? 4, d = Math.max(.004, (o.pt ?? .04) / 2);
      const sp = o.spread ?? 9, lay = o.layer ?? 1.5;
      const forma = o.forma ?? 'mezcla', varia = +(o.variedad ?? 1);
      const cuts = forma === 'mezcla' ? CUT_NAMES : [forma];
      const r = rng(n * 131 + Math.round(w * 10) * 17 + Math.round(h * 10) * 7
        + Math.round(sp * 10) * 3 + Math.round(lay * 10) * 11 + cuts.length * 29 + varia * 61);
      const revuelto = lay > .8 ? 1.35 : .45;
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, rad = Math.sqrt(r()) * sp;
        paper(M, {
          w: w * (.72 + r() * .66), h: h * (.55 + r() * .95), d,
          bend: .1 + r() * .5, twist: (r() - .5) * 2.6,
          shape: cuts[(r() * cuts.length) | 0], seg: 5,
          color: confetti(o.color, varia, r),
          x: Math.cos(a) * rad, z: Math.sin(a) * rad,
          y: d + r() * r() * lay + i * .004,          // casi todos abajo, alguno encima
          rx: Math.PI / 2 + (r() - .5) * revuelto,
          ry: r() * TAU,
          rz: (r() - .5) * 1.3,
        });
      }
      return pack(M);
    },
  },

  // ---------------------------------------------------------------- eléctricos
  boton: {
    name: 'Botón', emoji: '🔘', cat: 'luces', color: '#f3e7d3', switch: true,
    build: o => {
      const M = mesh(), c = o.color;
      tube(M, { r: 1.2, h: .4, y: .2, color: shade(c, .8), seg: 22 });              // peana
      tube(M, { r: 1.05, h: .34, y: .5, color: shade(c, .92), seg: 22 });           // aro
      ring(M, { R: .95, r: .09, y: .56, rx: Math.PI / 2, color: '#ffffff', mix: 0, emi: 1, seg: 24, side: 5 });
      tube(M, { r: .82, r2: .74, h: .3, y: .76, color: c, seg: 20 });               // pulsador
      ball(M, { y: .9, ax: .74, ay: .3, az: .74, color: shade(c, 1.06), seg: 18 });
      return pack(M);
    },
  },
  pilas: {
    name: 'Caja de pilas', emoji: '🔋', cat: 'luces', color: '#e9e2d4', power: true,
    build: o => {
      const M = mesh(), c = o.color;
      const W = 4.6, D = 3.1, H = 1.4, t = .18;
      box(M, { w: W, h: t, d: D, y: t / 2, color: c });                       // fondo
      for (const s of [-1, 1]) {
        box(M, { w: W, h: H, d: t, y: H / 2, z: s * (D / 2 - t / 2), color: c });
        box(M, { w: t, h: H, d: D, x: s * (W / 2 - t / 2), y: H / 2, color: c });
      }
      for (let i = 0; i < 4; i++) {                                          // cuatro pilas
        const x = -1.32 + i * .88;
        tube(M, { r: .34, h: 2.4, x, y: .55, rx: Math.PI / 2, color: '#4a4438', mix: 0, seg: 10 });
        tube(M, { r: .36, h: .38, x, y: .55, z: -.75, rx: Math.PI / 2, color: '#c9a24a', mix: 0, seg: 10 });
        tube(M, { r: .13, h: .22, x, y: .55, z: 1.3, rx: Math.PI / 2, color: '#c9a24a', mix: 0, seg: 8 });
      }
      // botón integrado en el frente
      tube(M, { r: .44, h: .26, y: .78, z: D / 2 + .06, rx: Math.PI / 2, color: shade(c, .84), seg: 16 });
      ball(M, { y: .78, z: D / 2 + .22, ax: .3, ay: .3, az: .12, color: shade(c, 1.05), seg: 12 });
      ball(M, { x: W / 2 - .55, y: .78, z: D / 2 + .12, r: .17, color: '#ffffff', mix: 0, emi: 1, seg: 10 });
      return pack(M);
    },
  },

  // ---------------------------------------------------------------- herramientas
  tira: {
    name: 'Tira de luces', emoji: '💡', cat: 'luces', color: '#3a2a20', tool: 'tira',
    props: [
      { k: 'thick', label: 'Grosor', hint: 'del cable', min: .15, max: 1.2, step: .05, def: .3 },
      { k: 'bulb', label: 'Foquitos', hint: 'tamaño de cada luz', min: .12, max: .8, step: .04, def: .3 },
      { k: 'gap', label: 'Separación', hint: 'entre foquitos', min: .6, max: 6, step: .2, def: 1.4 },
      { k: 'bright', label: 'Brillo', hint: 'de esta tira', min: .3, max: 2, step: .1, def: 1, unit: '×' },
    ],
  },
  __foto: { name: 'Foto', emoji: '🖼️', cat: 'fotos', tool: 'foto' },
  __forro: { name: 'Forrar cartón', emoji: '🎨', cat: 'materiales', tool: 'forro' },
};

/** Controles numéricos propios de un tipo de objeto. */
export const propsOf = type => CATALOG[type]?.props || [];

/** Valores iniciales de esos controles. */
export const defaultsFor = type =>
  Object.fromEntries(propsOf(type).map(p => [p.k, p.def]));

export const CATALOG_LIST = Object.entries(CATALOG).map(([id, o]) => ({ id, ...o }));

/** Paleta romántica compartida por los selectores de color. */
export const PALETTE = ['#ffffff', '#fbe3e8', '#f2a5b8', '#e0607f', '#d24a63', '#b3324f',
  '#f6d186', '#f2c14e', '#d8a24a', '#c08b52', '#9ec7a0', '#7fb0d8', '#b8a4e0', '#3a2a20'];

/** Paleta específica de las luces (tonos que quedan bien encendidos). */
export const LIGHT_PALETTE = ['#ffb463', '#ffe7c2', '#ffffff', '#ff8fa8', '#ff5f7e',
  '#c58cff', '#7fb0ff', '#7fe6c8', '#ffe14f'];
