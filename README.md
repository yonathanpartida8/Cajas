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
| Arrastrar sobre el fondo | Girar la caja |
| Pellizcar | Acercar / alejar |
| Tocar una imagen | Seleccionarla (aparecen sus controles) |
| Arrastrar una imagen | Moverla sobre la superficie |
| Tocar la tapa | Seleccionarla |
| Arrastrar la tapa seleccionada | Levantarla, apartarla o volver a colocarla |

Las imágenes se pegan a la cara que estés mirando (interior o exterior, caja o tapa) y
se quedan adheridas a ella al girar la caja, porque se pintan **dentro de la textura de
esa cara**, no como planos flotantes.

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
    scene.js          animación, texturas por cara y picking
    input.js          gestos táctiles
    ui.js             dock, paneles y controles
  features/
    removebg.js       eliminación de fondo local
```

### Cómo está hecho el 3D

* La caja y la tapa se describen como una lista de **caras** (`o`, `u`, `v`, `n`): 28 quads en total.
  Cada fotograma se reconstruyen a partir de las medidas interpoladas, así que cambiar el
  tamaño se anima solo y nada se rompe.
* Cada cara sin imágenes comparte la textura de cartón (repetida). En cuanto recibe una
  imagen se le asigna un canvas propio donde se pinta el cartón + las imágenes con su
  posición, giro y escala. Por eso las imágenes siguen la superficie con exactitud.
* El *picking* (tocar para seleccionar, arrastrar imágenes) usa intersección rayo-cara en
  CPU: no hace falta un buffer de selección.
* Se dibuja **solo cuando algo cambia**; en reposo la app no consume GPU.

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
* **Más herramientas** → un botón en el dock de `index.html` y su acción en el objeto `app` de `main.js`.
* **Guardar / exportar** → el diseño completo es serializable: `state.dims`, `state.material`,
  `state.lid` y `state.stickers` (más el `dataURL` de cada imagen del mapa `images`).

Para depurar, abre la página con `#dev` y tendrás `window.__cajas` con la escena, la cámara y el estado.
