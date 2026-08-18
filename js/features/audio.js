// Sonido sintetizado con Web Audio: sin archivos, sin descargas y muy ligero.
// Paleta sonora "de cartón": golpes suaves, roces de papel y tonos cálidos.

let ctx = null, master = null, noise = null;
const cfg = { sound: true, haptics: true };

/** Crea el contexto en el primer gesto del usuario (necesario en iOS). */
function ensure() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { return null; }
  master = ctx.createGain();
  master.gain.value = .3;
  master.connect(ctx.destination);

  const n = Math.floor(ctx.sampleRate * .4);          // ruido rosa reutilizable
  noise = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = noise.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = .99 * b0 + w * .05; b1 = .96 * b1 + w * .08; b2 = .8 * b2 + w * .2;
    d[i] = (b0 + b1 + b2) * .55;
  }
  return ctx;
}

const now = () => ctx.currentTime;

/** Tono con caída exponencial. */
function tone(o) {
  const { f = 440, f2 = o.f ?? 440, type = 'sine', dur = .12, vol = .3, at = 0 } = o;
  const t = now() + at;
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .006);
  g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  osc.connect(g).connect(master);
  osc.start(t); osc.stop(t + dur + .02);
}

/** Ráfaga de ruido filtrada: papel, cartón, roces. */
function hiss(o) {
  const { f = 1200, f2 = 600, q = 1.1, dur = .16, vol = .25, at = 0, type = 'bandpass' } = o;
  const t = now() + at;
  const src = ctx.createBufferSource(); src.buffer = noise;
  const flt = ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
  flt.frequency.setValueAtTime(f, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(60, f2), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .012);
  g.gain.exponentialRampToValueAtTime(.0008, t + dur);
  src.connect(flt).connect(g).connect(master);
  src.start(t, Math.random() * .2); src.stop(t + dur + .02);
}

const VOICES = {
  tap:      () => { tone({ f: 520, f2: 380, type: 'triangle', dur: .05, vol: .16 }); hiss({ f: 2400, f2: 1400, dur: .04, vol: .07 }); },
  select:   () => { tone({ f: 640, f2: 880, dur: .1, vol: .18 }); hiss({ f: 1800, f2: 2600, dur: .07, vol: .06 }); },
  grab:     () => tone({ f: 900, f2: 820, type: 'triangle', dur: .04, vol: .1 }),
  tick:     () => tone({ f: 1250, f2: 1150, type: 'square', dur: .022, vol: .05 }),
  hover:    () => tone({ f: 780, f2: 980, dur: .05, vol: .09 }),
  place:    () => { hiss({ f: 1100, f2: 320, q: .9, dur: .17, vol: .22 }); tone({ f: 180, f2: 96, dur: .16, vol: .26 }); tone({ f: 720, f2: 980, dur: .12, vol: .1, at: .04 }); },
  lidOpen:  () => { hiss({ f: 420, f2: 1900, q: .8, dur: .3, vol: .2 }); tone({ f: 300, f2: 520, dur: .26, vol: .1 }); },
  lidClose: () => { hiss({ f: 1700, f2: 300, q: .8, dur: .22, vol: .2 }); tone({ f: 150, f2: 78, dur: .2, vol: .3, at: .1 }); },
  cut:      () => { hiss({ f: 3200, f2: 1200, q: 2.2, dur: .1, vol: .16 }); hiss({ f: 2800, f2: 900, q: 2.2, dur: .1, vol: .16, at: .09 }); },
  success:  () => { tone({ f: 660, dur: .12, vol: .17 }); tone({ f: 990, dur: .18, vol: .15, at: .09 }); },
  remove:   () => { hiss({ f: 900, f2: 180, dur: .24, vol: .2 }); tone({ f: 260, f2: 80, type: 'triangle', dur: .22, vol: .2 }); },
  undo:     () => tone({ f: 700, f2: 460, dur: .09, vol: .16 }),
  redo:     () => tone({ f: 460, f2: 700, dur: .09, vol: .16 }),
  toggle:   () => tone({ f: 880, f2: 660, type: 'triangle', dur: .06, vol: .14 }),
  panel:    () => { hiss({ f: 700, f2: 1600, q: .7, dur: .16, vol: .12 }); tone({ f: 380, f2: 520, dur: .1, vol: .08 }); },
  error:    () => tone({ f: 220, f2: 165, type: 'triangle', dur: .18, vol: .2 }),
  whoosh:   () => hiss({ f: 300, f2: 2200, q: .6, dur: .26, vol: .14 }),
};

const BUZZ = {
  tap: 8, select: 10, grab: 8, tick: 4, hover: 6, place: [14, 24, 12], lidOpen: 16,
  lidClose: [10, 30, 18], cut: [8, 20, 8], success: [12, 40, 16], remove: [16, 26, 16],
  undo: 8, redo: 8, toggle: 10, panel: 8, error: [18, 40, 18], whoosh: 10,
};

/** Reproduce un efecto (y su vibración) si están activados. */
export function play(name) {
  const v = VOICES[name];
  if (!v) return;
  if (cfg.sound && ensure()) { try { v(); } catch { /* sin audio disponible */ } }
  if (cfg.haptics && navigator.vibrate) navigator.vibrate(BUZZ[name] || 8);
}

export const audio = {
  play,
  set sound(v) { cfg.sound = v; if (v) ensure(); },
  get sound() { return cfg.sound; },
  set haptics(v) { cfg.haptics = v; },
  get haptics() { return cfg.haptics; },
  unlock: () => { if (cfg.sound) ensure(); },
};
