# 📦 Cajas

Mini aplicación web para **diseñar y personalizar cajas de cartón en 3D desde el móvil**.
Sin frameworks, sin dependencias y sin build: HTML + CSS + JavaScript (módulos ES) y un
renderizador **WebGL2** propio de unas 200 líneas.

## Cómo usarla

Cualquier servidor estático sirve (los módulos ES no funcionan con `file://`):

```bash
npx http-server -p 8080 .
# o: python3 -m http.server 8080
```

Abre `http://localhost:8080` en el móvil (o en el navegador con la vista móvil activada).
La interfaz está pensada **solo para pantallas táctiles**: Android e iPhone.

## Gestos

| Gesto | Acción |
|---|---|
| Arrastrar sobre el fondo o la caja | Girar la vista (con inercia suave) |
| Pellizcar con dos dedos | Acercar / alejar |
| Mover dos dedos juntos | Desplazar la vista sin tocar la caja |
| Tocar una superficie | Seleccionarla (se resalta y se muestra su nombre) |
| Tocar una imagen | Editarla: aparecen marco y manijas |
| Arrastrar una imagen | Moverla; si el dedo pasa a otra superficie, se muda a ella |
| Arrastrar una manija de esquina | Cambiar el tamaño (proporción bloqueable) |
| Arrastrar la manija de giro | Rotarla |
| Pellizcar sobre la imagen elegida | Escalar y girar a la vez |
| Tocar la tapa → «Mover» | Habilita arrastrarla libremente |

La cámara y la edición nunca se pisan: un dedo sobre una imagen la mueve, un dedo en
cualquier otro sitio gira la vista, y la tapa solo se mueve si lo activas a propósito.

### Colocar imágenes: sin adivinar

Al elegir una foto **no se coloca sola en ninguna parte**. Aparece una tarjeta con la
miniatura y hay dos formas de situarla, ambas decididas por ti:

1. **Arrastrarla** desde la tarjeta hasta la caja. Mientras el dedo se mueve verás la
   superficie de destino resaltada en verde, una vista previa translúcida de la imagen
   sobre ella y el marco exacto que ocupará. Se coloca donde sueltas.
2. **Tocar** directamente la superficie donde la quieres.

Las imágenes se pintan **dentro de la textura de la cara**, no como planos flotantes:
por eso quedan adheridas al girar la caja, y se recortan al límite de la superficie
(nunca se salen ni saltan a otra cara por su cuenta).

## Estructura

```
index.html            estructura de la interfaz
css/app.css           estilos (paleta kraft, dock, hojas deslizables, iconos SVG)
manifest.json         instalable como app
js/
  main.js             arranque, acciones y bucle de render
  core/
    math3d.js         vectores, matrices e intersección rayo-cuadrilátero
    renderer.js       WebGL2: programa único, quads texturizados y cámara
  box/
    model.js          medidas (cm) → caras 3D de la caja y la tapa
    materials.js      textura de cartón procedural y pintado de caras
  app/
    store.js          estado, historial (deshacer/rehacer) e imágenes
    scene.js          animación, texturas por cara, resaltados y picking
    input.js          gestos táctiles (vista, imágenes, tapa)
    overlay.js        marco y manijas de la imagen seleccionada
    ui.js             dock, paneles, medidas y colocación
  features/
    removebg.js       eliminación de fondo local
    audio.js          efectos de sonido sintetizados + vibración
    fx.js             anillos, destellos y rebotes en pantalla
```

### Cómo está hecho el 3D

* La caja y la tapa se describen como una lista de **caras** (`o`, `u`, `v`, `n`): 28 quads en total.
  Cada fotograma se reconstruyen a partir de las medidas interpoladas, así que cambiar el
  tamaño se anima solo y nada se rompe.
* Cada cara sin imágenes comparte la textura de cartón (repetida). En cuanto recibe una
  imagen se le asigna un canvas propio donde se pinta el cartón + las imágenes con su
  posición, giro y escala. Por eso las imágenes siguen la superficie con exactitud.
* El *picking* (tocar para seleccionar, arrastrar imágenes, colocar) usa intersección
  rayo-cara en CPU: no hace falta un buffer de selección.
* Las manijas son elementos del DOM colocados proyectando las esquinas de la imagen a
  pantalla, pero **transforman en el plano de la superficie** (rayo → cara), así que la
  escala y el giro son exactos aunque la caja esté en perspectiva.
* Se dibuja **solo cuando algo cambia**; en reposo la app no consume GPU.

### Sonido, vibración y movimiento

* **Sin archivos de audio**: todos los efectos se sintetizan con Web Audio a partir de
  dos ingredientes (un tono con caída exponencial y una ráfaga de ruido filtrada), lo que
  da una paleta "de cartón": golpes suaves al colocar, roce de papel al abrir la tapa,
  tijeras al recortar el fondo, ticks al ajustar medidas. Pesa unos pocos kB.
* El contexto de audio se crea en el primer toque (política de iOS) y hay interruptores
  de **Sonido** y **Vibración** en Ajustes. La vibración usa `navigator.vibrate` cuando existe.
* Las medidas y la tapa se animan con un **muelle** ligeramente subamortiguado: los cambios
  asientan con un rebote pequeño en vez de frenar en seco.
* Sombra de contacto en dos capas (una marcada y otra difusa) que se abre al levantar la tapa,
  luz de estudio con relleno frío, brillo satinado y oscurecimiento en ángulos rasantes.
* Detalles de interfaz: pantalla de bienvenida, entrada escalonada de la barra, onda al pulsar,
  anillo de confirmación donde ocurre cada acción y viñeta que se refuerza en la vista previa.

### Eliminación de fondo

`features/removebg.js` es autónomo y local (sin servicios externos): crece una región
desde los bordes de la imagen, suaviza el borde de la máscara y recorta el objeto.
Solo se ejecuta al pulsar ✂️ **Fondo**. El módulo expone una única función
(`removeBackground(img) → dataURL`), así que se puede sustituir por un modelo más avanzado
sin tocar nada más.

## Cómo ampliarla

* **Más tipos de caja** → añade un constructor de caras junto a `buildFaces()` en `box/model.js`.
  El resto de la aplicación solo necesita la lista de caras.
* **Más materiales** → añade una entrada a `MATERIALS` en `box/materials.js` (aparece sola en el panel).
* **Más medidas** → añade la clave a `LIMITS` en `box/model.js` y una fila a `DIMS` en `app/ui.js`;
  el control «− valor +» con arrastre se genera solo.
* **Más herramientas** → un botón en el dock de `index.html` y su acción en el objeto `app` de `main.js`.
* **Guardar / exportar** → el diseño completo es serializable: `state.dims`, `state.material`,
  `state.lid` y `state.stickers` (más el `dataURL` de cada imagen del mapa `images`).

Para depurar, abre la página con `#dev` y tendrás `window.__cajas` con la escena, la cámara y el estado.
