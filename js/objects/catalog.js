// Biblioteca de objetos 3D. Añadir uno nuevo = añadir una entrada aquí:
// el resto de la app (colocación, controles, color, duplicar…) funciona sola.
import { mesh, pack, box, ball, tube, ring, extrude, ribbon, heartPath, starPath } from './shapes.js';

export const CATEGORIES = [
  { id: 'amor', name: 'Amor', emoji: '💕' },
  { id: 'peluches', name: 'Peluches', emoji: '🧸' },
  { id: 'cartas', name: 'Cartas', emoji: '💌' },
  { id: 'flores', name: 'Flores', emoji: '🌹' },
  { id: 'regalos', name: 'Regalos', emoji: '🎁' },
  { id: 'luces', name: 'Luces', emoji: '💡' },
  { id: 'deco', name: 'Decoración', emoji: '🎀' },
  { id: 'fotos', name: 'Fotos', emoji: '🖼️' },
  { id: 'materiales', name: 'Materiales', emoji: '📦' },
];

const CREAM = '#f6e7cf', DARK = '#3a2a20', GREEN = '#5f8a4a', GOLD = '#d8a24a';

/** Aclara u oscurece un color hex. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)]
    .map(v => v.toString(16).padStart(2, '0')).join('');
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
        const a = i / 6 * Math.PI * 2;
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
        const a = i / 7 * Math.PI * 2;
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
  papel: {
    name: 'Papel picado', emoji: '🎊', cat: 'deco', color: '#ffffff', params: true,
    build: o => pack(ribbon(mesh(), {
      w: o.pw ?? 1.6, h: o.ph ?? 6, d: (o.pt ?? .12) / 2,
      twist: 3.2, seg: 12, color: o.color, y: (o.ph ?? 6) / 2,
    })),
  },
  interruptor: {
    name: 'Interruptor', emoji: '🎚️', cat: 'luces', color: '#efe3cf', switch: true,
    build: o => {
      const M = mesh(), c = o.color;
      box(M, { w: 3.4, h: 1, d: 2.6, y: .5, color: c });
      box(M, { w: 2.5, h: .5, d: 1.8, y: 1.2, color: shade(c, .93) });
      box(M, { w: 1, h: 1.4, d: .8, y: 1.95, z: .12, rx: -.3, color: shade(c, .78) });
      ball(M, { x: 1.2, y: 1.5, z: .5, r: .26, color: '#ffffff', mix: 0, emi: 1, seg: 8 });
      return pack(M);
    },
  },
};

export const CATALOG_LIST = Object.entries(CATALOG).map(([id, o]) => ({ id, ...o }));

/** Paleta romántica compartida por los selectores de color. */
export const PALETTE = ['#ffffff', '#fbe3e8', '#f2a5b8', '#e0607f', '#d24a63', '#b3324f',
  '#f6d186', '#f2c14e', '#d8a24a', '#c08b52', '#9ec7a0', '#7fb0d8', '#b8a4e0', '#3a2a20'];
