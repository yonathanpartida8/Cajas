// Pequeños efectos visuales en pantalla (anillos, destellos, rebotes).
// Todo con CSS: cada efecto se autodestruye al terminar su animación.

const layer = document.getElementById('fx');

/** Anillo que se expande en un punto: confirma dónde ocurrió la acción. */
export function ring(x, y, kind = 'ok') {
  if (!layer) return;
  const el = document.createElement('span');
  el.className = 'fx-ring fx-' + kind;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  layer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

/** Reinicia una animación de rebote en un elemento. */
export function bump(el, cls = 'bump') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;              // fuerza el reinicio de la animación
  el.classList.add(cls);
}

/** Destello suave sobre toda la escena (cambios grandes: reiniciar, deshacer). */
export function flash() {
  if (!layer) return;
  const el = document.createElement('span');
  el.className = 'fx-flash';
  layer.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
