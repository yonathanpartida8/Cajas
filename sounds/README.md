# 🔊 Sonidos

Suelta aquí tus propios efectos: la aplicación los detecta y los usa en lugar de
los sonidos sintetizados. Formatos admitidos: **.wav**, **.mp3**, **.ogg**, **.m4a**.

## Carpetas

| Carpeta | Cuándo suena |
|---|---|
| `toque/` | tocar, seleccionar, agarrar y pasar por encima |
| `botones/` | abrir paneles, deshacer, rehacer, transiciones |
| `objetos/` | colocar y quitar objetos 3D |
| `luces/` | encender, apagar y cambiar el modo de las luces |
| `abrir/` | abrir o separar la tapa |
| `cerrar/` | cerrar la tapa |
| `borrador/` | eliminar el fondo de una imagen |
| `medidas/` | cada paso de los controles `− valor +` |
| `exito/` | acciones que salen bien |
| `error/` | avisos y acciones que no se pueden hacer |

Pon **varios archivos por carpeta**: en cada acción se elige uno al azar y no se
repite hasta haber sonado todos los demás, así nada suena mecánico.

## Cómo se detectan

1. Se lee `sounds/index.json`, donde puedes listar los archivos a mano.
2. Además se pide el listado de cada carpeta al servidor; si lo devuelve (es lo
   habitual con `python3 -m http.server` o `npx http-server`), los archivos
   nuevos aparecen sin tocar nada.

Si una carpeta está vacía, esa acción usa el sonido sintetizado de siempre.
