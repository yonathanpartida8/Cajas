# 📦 Cajas

Mini aplicación web para **diseñar, decorar e iluminar cajas de cartón en 3D desde el
móvil**. Sin frameworks, sin dependencias y sin build: HTML + CSS + JavaScript (módulos
ES) y un renderizador **WebGL2** propio.

## Cómo usarla

Cualquier servidor estático sirve (los módulos ES no funcionan con `file://`):

```bash
npx http-server -p 8080 .
# o: python3 -m http.server 8080
```

Abre `http://localhost:8080` en el móvil (o en el navegador con la vista móvil activada).
La interfaz está pensada **solo para pantallas táctiles**: Android e iPhone.

## Gestos

Cada gesto significa una sola cosa y ninguno pisa a los demás.

| Gesto | Acción |
|---|---|
| Tocar | Seleccionar superficie, imagen u objeto |
| Pulsación larga sobre un objeto | Abrir su panel de ajustes |
| Arrastrar sobre un objeto | Moverlo (la cámara **no** se mueve) |
| Arrastrar en cualquier otro sitio | Girar la vista, con zona muerta e inercia |
| Pellizcar con dos dedos | Acercar y alejar |
| Girar con dos dedos | Rotar la vista |
| Mover dos dedos juntos | Desplazar la vista |
| Dos dedos sobre el objeto elegido | Escalarlo y girarlo a la vez |
| Arrastrar una imagen | Moverla; si el dedo pasa a otra superficie, se muda a ella |
| Arrastrar una manija de esquina | Cambiar el tamaño (proporción bloqueable) |
| Tocar la tapa → «Mover» | Habilita arrastrarla libremente |

Detalles que se notan al usarla:

* **Zona muerta de 7 px** antes de que la cámara empiece a girar: los roces pequeños no
  descolocan la vista.
* La cámara **persigue un destino suavizado**, así que ningún movimiento sale a tirones.
* Al agarrar un objeto se guarda la distancia entre el dedo y su centro: **no salta**, y
  sigue al dedo sin retraso.
* Mientras editas algo dentro de la caja, las paredes que tapan la vista se vuelven
  translúcidas por sí solas (las dos caras de la pared a la vez).

### Colocar imágenes: sin adivinar

Al elegir una foto **no se coloca sola en ninguna parte**. Aparece una tarjeta con la
miniatura y hay dos formas de situarla, ambas decididas por ti:

1. **Arrastrarla** desde la tarjeta hasta la caja. Mientras el dedo se mueve verás la
   superficie de destino resaltada en verde, una vista previa translúcida de la imagen
   sobre ella y el marco exacto que ocupará. Se coloca donde sueltas.
2. **Tocar** directamente la superficie donde la quieres.

Las imágenes se pintan **dentro de la textura de la cara**, no como planos flotantes:
por eso quedan adheridas al girar la caja y se recortan al límite de la superficie.

## Diseños de caja

En **Caja → Diseño** se elige la forma, y todo lo demás (medidas, forro, imágenes,
objetos y luces) sigue funcionando igual:

| Diseño | Qué hace |
|---|---|
| 📦 Clásica | caja con tapa suelta que se abre, se separa y se arrastra |
| 🗃️ Sin tapa | solo la base, abierta por arriba |
| 🧰 Con bisagra | la tapa va sujeta por detrás y gira en arco al abrirse |
| 🎁 De regalo | la tapa cubre la caja entera |
| 🧊 Compartimentos | 2, 3 o 4 divisiones interiores, forrables por separado |
| 🚪 Doble apertura | dos hojas que se abren hacia los lados desde el centro |

Las medidas (largo, ancho, alto, tapa y grosor) se ajustan con controles
`− valor +` que también responden al deslizar el dedo sobre el número, y hay tres
tamaños rápidos: pequeña, mediana y grande.

## Objetos 3D: un solo sistema para todos

Todo lo que entra en la caja son **mallas 3D reales** generadas por código. Cada objeto
—venga del catálogo o lo añadas tú mañana— hereda **exactamente los mismos controles**,
organizados en pestañas dentro de su panel:

* **Aspecto** — color de la paleta, controles propios del tipo, centrar, apoyar en el
  fondo, duplicar y fijar.
* **Mover** — posición numérica en los tres ejes (X izquierda/derecha, Y altura,
  Z fondo/frente) más el carril vertical de altura y el arrastre con el dedo.
* **Girar** — inclinación, giro y ladeo **en grados**, con tres modos:
  * *Libre*: gira en cualquier dirección y combinación.
  * *Asistida*: detecta el eje dominante, limita la inclinación a ±90° y endereza el
    objeto solo cuando se acerca a un ángulo recto.
  * *Simétrica*: todos los ángulos caen en múltiplos de 15°.
* **Tamaño** — escala uniforme y escala **independiente** en anchura, altura y
  profundidad.
* **Luz** — solo en interruptores, pilas y tiras (ver más abajo).

Cada pestaña tiene su botón **Restablecer**, y también están *duplicar*, *fijar*
(bloquea el objeto para que no se mueva sin querer) y *borrar*.

### Papel picado

El relleno de virutas es un objeto 3D de verdad, no una textura: un puñado de tiras
finas, rizadas y enredadas, cada una con su giro y su sitio. Sus controles son
**cantidad** (1 a 48 piezas), **anchura**, **altura**, **grosor** y **reparto** (cuánto
se esparce el montón). Con cantidad 1 tienes una sola viruta; con 40, un relleno
completo. Se puede duplicar, girar libremente y repartir por la caja, y en la
biblioteca hay un interruptor **«Colocar varios seguidos»** para llenar rápido.

### Tiras de luces, interruptores, pilas y conexiones

* **Tira de luces**: se **dibuja con el dedo** por el interior de la caja y se va
  formando **en tiempo real** bajo el dedo, no al soltar. El trazado se convierte en un
  cable 3D con bombillas cada pocos centímetros.
* Una tira recién creada **nace apagada**: no tiene de dónde sacar corriente.
* **Caja de pilas** 🔋 — una cajita con cuatro pilas dentro, pequeña para esconderla.
  Es la única fuente de energía.
* **Interruptor** 🎚️ — pequeño, se toca para cambiar de modo.
* **Conexiones inteligentes**: `pilas → tira` o `pilas → interruptor → tira`. Sin pilas
  con corriente, nada enciende; si apagas las pilas se apaga todo lo que cuelga de
  ellas; y si quitas una conexión, lo que dependía de ella se apaga. Se hacen con
  «Conectar» y tocando el destino, se quitan tocándolo otra vez, y se ven como cables
  punteados que **brillan cuando llevan corriente**.
* **Seis modos de luz** con transición suave entre uno y otro: cálida, cálida con
  parpadeo, colores cambiantes, blanca, blanca con parpadeo y **a mi gusto** (color
  exacto, intensidad y velocidad de parpadeo, con 0 Hz = luz fija).
* Las bombillas **iluminan de verdad**: cada tira aporta luces puntuales al motor
  (hasta 8 simultáneas) que bañan el cartón y los objetos cercanos.

### Forrar el cartón

La herramienta **Forrar** aplica color y acabado (papel, cartulina, tela, brillante,
mate) a la parte que toques, y puede extenderlo a **toda la caja, solo el exterior,
solo el interior, solo la tapa o solo los compartimentos**. Así es fácil dejar el
exterior rosa, el interior blanco, la tapa roja y las divisiones en otro color.

## Sonido

La app trae efectos **sintetizados** (Web Audio, sin descargas), pero acepta **archivos
propios**: basta soltar `.wav` o `.mp3` en las subcarpetas de `sounds/`
(`toque`, `botones`, `objetos`, `luces`, `abrir`, `cerrar`, `borrador`, `medidas`,
`exito`, `error`). Se detectan solos al arrancar —por `sounds/index.json` y, si el
servidor lista carpetas, también leyendo el directorio— y en cada acción **se elige uno
al azar sin repetir** hasta agotar los demás, así nada suena mecánico. Si una carpeta
está vacía, esa acción usa el sonido sintetizado. Ver `sounds/README.md`.

## Estructura

```
index.html            estructura de la interfaz
css/app.css           estilos (paleta kraft, dock, hojas deslizables, iconos SVG)
manifest.json         instalable como app
sounds/               efectos propios por categoría (.wav / .mp3)
js/
  main.js             arranque, acciones y bucle de render
  core/
    math3d.js         vectores, matrices e intersección rayo-cuadrilátero
    renderer.js       WebGL2: quads texturizados + mallas 3D y luces puntuales
  box/
    model.js          medidas (cm) → caras 3D; diseños, bisagras y compartimentos
    materials.js      textura de cartón procedural, forros y pintado de caras
  app/
    store.js          estado, historial (deshacer/rehacer) e imágenes
    scene.js          animación, texturas por cara, resaltados y picking
    input.js          gestos táctiles (vista, objetos, imágenes, tapa)
    objects.js        sistema general de objetos: transformación, luz y conexiones
    overlay.js        marco, manijas y cables de conexión
    ui.js             dock, paneles, medidas y colocación
  objects/
    shapes.js         primitivas de malla (cajas, elipsoides, tubos, extrusiones…)
    catalog.js        biblioteca de objetos por categorías
  features/
    removebg.js       eliminación de fondo local
    audio.js          banco de sonidos + efectos sintetizados + vibración
    fx.js             anillos, destellos y rebotes en pantalla
```

### Cómo está hecho el 3D

* El motor tiene dos programas: uno para las **caras planas** de la caja (textura por
  cara) y otro para las **mallas 3D** (color por vértice + color elegido). Ambos
  comparten la misma luz de estudio y hasta 8 luces puntuales dinámicas.
* La caja se describe como una lista de **caras** (`o`, `u`, `v`, `n`) que se reconstruye
  cada fotograma a partir de las medidas interpoladas: cambiar el tamaño se anima solo y
  nada se rompe. Los diseños con bisagra giran sus caras alrededor de un eje y recalculan
  sus normales, así que la iluminación sigue siendo correcta con la tapa abierta.
* Cada objeto tiene una **matriz de modelo** con giro en los tres ejes y escala
  independiente por eje, más su matriz de normales con la escala invertida (para que el
  sombreado sea correcto aunque lo estires en una sola dirección).
* Cada cara sin imágenes comparte la textura de cartón (repetida). En cuanto recibe una
  imagen se le asigna un canvas propio donde se pinta el cartón + las imágenes.
* El *picking* usa intersección rayo-cara, rayo-esfera para objetos y **distancia
  rayo-segmento** para las tiras, para poder tocar un cable fino con el dedo.
* Las manijas son elementos del DOM colocados proyectando las esquinas de la imagen a
  pantalla, pero **transforman en el plano de la superficie**, así que la escala y el
  giro son exactos aunque la caja esté en perspectiva.
* Se dibuja **solo cuando algo cambia**: en reposo la app no consume GPU. El parpadeo de
  las luces refresca a ~20 fps en vez de 60, las transiciones de color se interpolan en
  el propio fotograma y las mallas se cachean por tipo, color y medidas. Una escena con
  9 objetos y 40 virutas de papel ronda los 6 600 triángulos.

### Sonido, vibración y movimiento

* Los efectos sintetizados se construyen con dos ingredientes (un tono con caída
  exponencial y una ráfaga de ruido filtrada), lo que da una paleta "de cartón". Pesan
  unos pocos kB.
* El contexto de audio se crea en el primer toque (política de iOS) y hay interruptores
  de **Sonido** y **Vibración** en Ajustes.
* Las medidas y la tapa se animan con un **muelle** ligeramente subamortiguado, con
  pasos de 1/60 s como máximo para que sea estable también en móviles lentos.
* Sombra de contacto en dos capas que se abre al levantar la tapa, luz de estudio con
  relleno frío, brillo satinado y oscurecimiento en ángulos rasantes.

### Eliminación de fondo

`features/removebg.js` es autónomo y local (sin servicios externos): crece una región
desde los bordes de la imagen, suaviza el borde de la máscara y recorta el objeto.
Solo se ejecuta al pulsar ✂️ **Fondo**. El módulo expone una única función
(`removeBackground(img) → dataURL`), así que se puede sustituir por un modelo más
avanzado sin tocar nada más.

## Cómo ampliarla

La idea es que añadir cosas nuevas sea **una entrada en una tabla**, nunca tocar la
lógica:

* **Más objetos 3D** → una entrada en `CATALOG` (`objects/catalog.js`) con su categoría,
  emoji, color y función `build()`. Aparece sola en la biblioteca y hereda colocación,
  posición/giro/escala en tres ejes, modos de rotación, color, duplicar, fijar, borrar,
  sonidos y conexiones.
* **Controles propios de un objeto** → añade `props: [{k, label, hint, min, max, step,
  def}]` a su entrada: las filas `− valor +` se generan solas en su panel y entran en la
  clave de caché de la malla.
* **Objetos eléctricos** → marca la entrada con `switch: true` (interruptor),
  `power: true` (fuente de energía) o `light: {...}` (emite luz propia). El grafo de
  conexiones y el panel de luz aparecen solos.
* **Más diseños de caja** → una entrada en `DESIGNS` (`box/model.js`) y su caso en
  `buildFaces()`; el resto de la aplicación solo necesita la lista de caras.
* **Más materiales o acabados** → una entrada en `MATERIALS` o `FINISHES`
  (`box/materials.js`).
* **Más medidas** → la clave en `LIMITS` (`box/model.js`) y una fila en `DIMS`
  (`app/ui.js`).
* **Más modos de luz** → una entrada en `MODES` y su caso en `modeColor()`
  (`app/objects.js`); la transición suave y el parpadeo ya están hechos.
* **Más sonidos** → archivos en `sounds/<categoría>/`, sin tocar código.
* **Guardar / exportar** → el diseño completo es serializable: `state.dims`,
  `state.design`, `state.material`, `state.lid`, `state.stickers`, `state.objects`,
  `state.links` y `state.lining` (más el `dataURL` de cada imagen del mapa `images`).

Para depurar, abre la página con `#dev` y tendrás `window.__cajas` con la escena, la
cámara, la entrada y el estado.
