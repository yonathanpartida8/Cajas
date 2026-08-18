// Marco y manijas de la imagen seleccionada, superpuestos en pantalla.
// Las manijas trabajan en el plano de la superficie (rayo → cara), así que la
// transformación es exacta aunque la caja esté girada en perspectiva.
import { clamp } from '../core/math3d.js';
import { audio } from '../features/audio.js';

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

export function createOverlay(api) {
  const root = document.getElementById('ov');
  const poly = root.querySelector('polygon');
  const stem = root.querySelector('line');
  const handles = CORNERS.map((_, i) => {
    const b = document.createElement('button');
    b.className = 'hd hd-corner';
    b.setAttribute('aria-label', 'Cambiar tamaño');
    b.innerHTML = '<i class="ic ic-scale"></i>';
    grip(b, 'scale', i);
    root.appendChild(b);
    return b;
  });
  const spin = document.createElement('button');
  spin.className = 'hd hd-spin';
  spin.setAttribute('aria-label', 'Girar imagen');
  spin.innerHTML = '<i class="ic ic-rotate"></i>';
  grip(spin, 'rot');
  root.appendChild(spin);

  const linksSvg = document.getElementById('linksSvg');
  let drag = null;

  /** Cables punteados entre pilas, interruptores y tiras. */
  function drawLinks(cam) {
    const st = api.state;
    const pairs = [];
    for (const [srcId, list] of Object.entries(st.links || {})) {
      const src = api.getObject(srcId);
      if (!src) continue;
      const showAll = st.object === srcId || st.linking === srcId;
      const a = cam.project(api.scene.centerOf(src));
      if (!a) continue;
      for (const id of list) {
        const target = api.getObject(id);
        if (!target) continue;
        if (!showAll && st.object !== id) continue;          // solo lo relacionado con lo elegido
        const b = cam.project(api.scene.centerOf(target));
        if (b) pairs.push([a, b, api.wiringOf(target).powered]);
      }
    }
    const NS = 'http://www.w3.org/2000/svg';
    linksSvg.replaceChildren(...pairs.flatMap(([a, b, live]) => {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a.x); l.setAttribute('y1', a.y);
      l.setAttribute('x2', b.x); l.setAttribute('y2', b.y);
      if (live) l.setAttribute('class', 'live');
      const c1 = document.createElementNS(NS, 'circle');
      c1.setAttribute('cx', a.x); c1.setAttribute('cy', a.y); c1.setAttribute('r', 5);
      const c2 = document.createElementNS(NS, 'circle');
      c2.setAttribute('cx', b.x); c2.setAttribute('cy', b.y); c2.setAttribute('r', 5);
      return [l, c1, c2];
    }));
  }

  /** Coordenadas del dedo en centímetros, relativas al centro de la imagen. */
  function local(s, x, y, rotated = true) {
    const face = api.scene.faceById(s.face);
    const h = face && api.planeAt(x, y, face);
    if (!h) return null;
    const dx = (h.u - s.u) * face.uLen, dy = (h.v - s.v) * face.vLen;
    if (!rotated) return { x: dx, y: dy };
    const c = Math.cos(-s.rot), si = Math.sin(-s.rot);
    return { x: dx * c - dy * si, y: dx * si + dy * c };
  }

  function grip(el, kind, index) {
    el.addEventListener('pointerdown', e => {
      const s = api.selected();
      if (!s) return;
      e.preventDefault(); e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      el.classList.add('hot');
      const p0 = local(s, e.clientX, e.clientY, kind === 'scale');
      if (!p0) return;
      drag = { kind, index, id: e.pointerId, s, p0, size: s.size, ratio: s.ratio ?? 1, rot: s.rot };
      audio.play('grab');
      if (kind === 'rot') drag.a0 = Math.atan2(p0.y, p0.x);
    });
    el.addEventListener('pointermove', e => {
      if (!drag || drag.id !== e.pointerId) return;
      const s = drag.s;
      const p = local(s, e.clientX, e.clientY, drag.kind === 'scale');
      if (!p) return;
      if (drag.kind === 'rot') {
        s.rot = drag.rot + (Math.atan2(p.y, p.x) - drag.a0);
      } else {
        const fx = Math.abs(p.x) / Math.max(Math.abs(drag.p0.x), .01);
        const fy = Math.abs(p.y) / Math.max(Math.abs(drag.p0.y), .01);
        if (api.state.lockAspect) {
          const f = Math.hypot(p.x, p.y) / Math.max(Math.hypot(drag.p0.x, drag.p0.y), .01);
          s.size = clamp(drag.size * f, .03, 3);
        } else {
          s.size = clamp(drag.size * fx, .03, 3);
          s.ratio = clamp(drag.ratio * (fy / Math.max(fx, .01)), .15, 6);
        }
      }
      api.clampSticker(s);
      api.touch(s);
    });
    const end = e => {
      if (!drag || drag.id !== e.pointerId) return;
      el.classList.remove('hot');
      api.scene.dirty(drag.s.face);
      drag = null;
      audio.play('tick');
      api.commit(); api.redraw();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /** Recoloca marco y manijas; se llama en cada fotograma dibujado. */
  function update(cam) {
    drawLinks(cam);
    const s = api.selected() || api.ghost();
    const fr = s && api.scene.stickerFrame(s);
    if (!fr) { root.hidden = true; return; }

    const eye = cam.eye, c = fr.center;
    const facing = (c.x - eye.x) * fr.normal.x + (c.y - eye.y) * fr.normal.y + (c.z - eye.z) * fr.normal.z;
    const pts = fr.corners.map(p => cam.project(p));
    if (facing > -0.02 || pts.some(p => !p)) { root.hidden = true; return; }

    root.hidden = false;
    const editable = !s.ghost;
    root.classList.toggle('ghost', !editable);
    poly.setAttribute('points', pts.map(p => `${p.x},${p.y}`).join(' '));

    // las manijas se separan un poco hacia fuera para no tapar la imagen
    const mid = { x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4, y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 };
    const push = (p, d) => {
      const dx = p.x - mid.x, dy = p.y - mid.y, l = Math.hypot(dx, dy) || 1;
      return { x: p.x + dx / l * d, y: p.y + dy / l * d };
    };
    const small = Math.hypot(pts[0].x - pts[2].x, pts[0].y - pts[2].y) < 96;

    handles.forEach((h, i) => {
      h.hidden = !editable || (small && i % 2 === 1);       // en imágenes pequeñas, solo dos esquinas
      if (h.hidden) return;
      const q = push(pts[i], 20);
      h.style.transform = `translate(${q.x}px,${q.y}px) translate(-50%,-50%)`;
    });
    const sp = cam.project(fr.spin);
    spin.hidden = !editable || !sp;
    if (editable && sp) {
      const q = push(sp, 16);
      spin.style.transform = `translate(${q.x}px,${q.y}px) translate(-50%,-50%)`;
      const top = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      stem.setAttribute('x1', top.x); stem.setAttribute('y1', top.y);
      stem.setAttribute('x2', q.x); stem.setAttribute('y2', q.y);
      stem.style.display = '';
    } else {
      stem.style.display = 'none';
    }
  }

  return { update, get busy() { return !!drag; } };
}
