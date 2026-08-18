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

## Objetos 3D dentro de la caja

Todo lo que entra en la caja son **mallas 3D reales** generadas por código (nada de
modelos descargados): osito, corazones, cartas, rosas y flores, regalos, moños,
estrellas, velas, papel picado e interruptores. Se construyen combinando primitivas
—cajas, elipsoides, cilindros, anillos, extrusiones de contornos y cintas rizadas— con
un color propio por pieza y un color principal que el usuario elige.

* **Colocación**: eliges el objeto en la biblioteca y se coloca **donde tocas**, sobre la
  superficie horizontal bajo el dedo o sobre el fondo de la caja. Mientras lo colocas se
  ve una vista previa translúcida que atraviesa las paredes.
* **Controles**: arrastrar mueve sobre el plano; el carril vertical de la derecha cambia
  la altura (eje Y); pellizcar escala y gira; y en su hoja hay tamaño, giro, altura,
  color, centrar, apoyar en el fondo, duplicar, fijar y borrar.
* **Papel picado**: además de color, tiene **ancho, largo y grosor** independientes, así
  que puedes llenar la caja con virutas de distintos tamaños y colores.
* Ningún objeto atraviesa las paredes: la posición se limita al interior según su tamaño.

### Tiras de luces, interruptores y conexiones

* **Tira de luces**: se **dibuja con el dedo** por el interior de la caja. El trazado se
  convierte en un cable 3D con bombillas cada pocos centímetros, pegado a las paredes.
* Las bombillas **iluminan de verdad**: cada tira aporta luces puntuales al motor (hasta
  8 simultáneas) que bañan el cartón y los objetos cercanos.
* **Interruptor**: al tocarlo cicla entre *apagado → luz cálida → romántico (colores que
  cambian) → luz blanca*, con parpadeo suave en cada modo.
* **Conexiones**: con el interruptor seleccionado, «Conectar» y luego tocas la tira. La
  relación se dibuja como una línea punteada entre ambos. Un interruptor puede controlar
  varias tiras y la conexión se quita tocándola otra vez.

### Forrar el cartón

La herramienta **Forrar** aplica color y acabado (papel, cartulina, tela, brillante,
mate) a la parte de la caja que toques; cada cara puede llevar el suyo, o puedes aplicar
el mismo a toda la caja. El acabado cambia la trama de la textura y el brillo especular
del material.

### Ver el interior

Al colocar objetos o dibujar luces, las paredes que tapan la vista se vuelven
translúcidas automáticamente. En Ajustes hay un interruptor **Ver el interior** para
dejarlas así de forma permanente mientras decoras.

## Estructura

```
index.html            estructura de la interfaz
css/app.css           estilos (paleta kraft, dock, hojas deslizables, iconos SVG)
manifest.json         instalable como app
js/
  main.js             arranque, acciones y bucle de render
  core/
    math3d.js         vectores, matrices e intersección rayo-cuadrilátero
    renderer.js       WebGL2: quads texturizados + mallas 3D y luces puntuales
  box/
    model.js          medidas (cm) → caras 3D de la caja y la tapa
    materials.js      textura de cartón procedural y pintado de caras
  app/
    store.js          estado, historial (deshacer/rehacer) e imágenes
    scene.js          animación, texturas por cara, resaltados y picking
    input.js          gestos táctiles (vista, imágenes, tapa)
    objects.js        objetos 3D: mallas, transformaciones, luces y conexiones
    overlay.js        marco, manijas y líneas de conexión
    ui.js             dock, paneles, medidas y colocación
  objects/
    shapes.js         primitivas de malla (cajas, elipsoides, tubos, extrusiones…)
    catalog.js        biblioteca de objetos por categorías
  features/
    removebg.js       eliminación de fondo local
    audio.js          efectos de sonido sintetizados + vibración
    fx.js             anillos, destellos y rebotes en pantalla
```

### Cómo está hecho el 3D

* El motor tiene dos programas: uno para las **caras planas** de la caja (textura por cara) y
  otro para las **mallas 3D** (color por vértice + color elegido). Ambos comparten la misma
  luz de estudio y hasta 8 luces puntuales dinámicas de velas y tiras.
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
* Los objetos se seleccionan con rayo-esfera y las tiras con distancia rayo-segmento,
  para poder tocar un cable fino con el dedo.
* Se dibuja **solo cuando algo cambia**; en reposo la app no consume GPU. El parpadeo de las
  luces refresca a ~20 fps en vez de 60, y las mallas se cachean por tipo, color y medidas.

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
* **Más objetos 3D** → una entrada nueva en `CATALOG` (`objects/catalog.js`) con su
  categoría, emoji, color y función `build()`. Aparece sola en la biblioteca y hereda
  colocación, color, escala, giro, altura, duplicar, fijar y borrar.
* **Más materiales** → añade una entrada a `MATERIALS` en `box/materials.js` (aparece sola en el panel).
* **Más acabados de forro** → una entrada en `FINISHES` (`box/materials.js`).
* **Más medidas** → añade la clave a `LIMITS` en `box/model.js` y una fila a `DIMS` en `app/ui.js`;
  el control «− valor +» con arrastre se genera solo.
* **Más herramientas** → un botón en el dock de `index.html` y su acción en el objeto `app` de `main.js`.
* **Guardar / exportar** → el diseño completo es serializable: `state.dims`, `state.material`,
  `state.lid` y `state.stickers` (más el `dataURL` de cada imagen del mapa `images`).

Para depurar, abre la página con `#dev` y tendrás `window.__cajas` con la escena, la cámara y el estado.
