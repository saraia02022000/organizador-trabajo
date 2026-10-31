# Organizador de trabajo

Aplicación personal para llevar en un solo sitio: correos pendientes de contestar, información que se espera recibir, tareas, trabajos abiertos (con su seguimiento) y agenda (reuniones, cursos y otras citas). Todo el texto de la interfaz está en español.

## Cómo trabajar

```bash
node build.js               # genera dist/organizador.html (un único HTML)
node tests/core.test.js     # pruebas del núcleo
```

Para probar a mano: abrir `dist/organizador.html` en Edge o Chrome (doble clic). La vista previa del navegador integrado no maneja ficheros locales: servir `dist/` con `python -m http.server` y abrir `http://127.0.0.1:<puerto>/organizador.html`. `window.__org` expone el estado y `render` para depurar.

Tras cualquier cambio: pasar las pruebas, reconstruir y subir `dist/organizador.html` también.

## Estructura

```
src/core.js        Núcleo sin DOM (global `Org`): modelo, fechas, resúmenes, agenda, lectura de .eml y .msg.
src/app.html       Interfaz (HTML + CSS + JS). Marcador /*CORE*/ que build.js sustituye por core.js.
src/icons/         Iconos generados (no editar a mano): icono.svg, PNG de 192 y 512, maskable 512, apple-touch-icon (180) y favicon (32).
src/manifest.webmanifest, src/sw.js   Aplicación instalable (PWA). El service worker pide siempre la red y sin conexión sirve la última copia.
tools/iconos.js    Dibuja el icono (calendario con marca de hecho sobre fondo azul) y genera src/icons/. Solo al cambiarlo: `npm install` y `node tools/iconos.js` (usa @resvg/resvg-js, dependencia de desarrollo).
build.js           Genera dist/: organizador.html, iconos, manifiesto y service worker.
tests/core.test.js Pruebas del núcleo.
tests/cfb_writer.js Fabrica .msg sintéticos (Compound File Binary) para las pruebas.
```

## Decisiones del usuario (2026-10-31)

- **Un único HTML**, sin servidor ni Python, como el Asistente GML.
- **Datos en un fichero JSON** que el usuario elige (en su OneDrive), con la File System Access API: se guarda solo medio segundo después de cada cambio. El permiso del fichero se recuerda en IndexedDB; al volver a abrir basta un clic. Además, copia en `localStorage` (`organizador-copia`).
  - **Nunca se sustituye una versión por otra: se combinan** (`Org.merge`). De cada elemento gana la versión con `updated` más reciente; los borrados se guardan en `deleted` (id → fecha) y ganan si son posteriores a la última modificación; se olvidan a los 400 días. Por eso toda modificación debe pasar por `Org.touch` (o `setDone`, `addLog`, `remove`).
  - En el PC, si el fichero cambió desde otro dispositivo (al volver a la ventana o antes de escribir), se combina y, si al fichero le faltaba algo, se reescribe. «Combinar con otro fichero…» sirve para una copia con otro nombre (p. ej., «organizador (1).json»).
- **Correos: arrastrar desde Outlook.** Se leen `.msg` (Outlook clásico) y `.eml`; si Outlook solo pasa texto, se usa como título. No hay conexión al buzón (en la AGE necesitaría permisos de informática). Un correo normal toma el tipo de la pestaña abierta (Esperando, Tareas o Agenda); en las demás, «por contestar».
- **Citas: arrastrar desde el calendario de Outlook** (pedido el 2026-10-31). Un `.msg` de clase `IPM.Appointment` o `IPM.Schedule.Meeting.Request`, un `.ics` o un `.eml` con una parte `text/calendar` crean una cita de la agenda (`Org.fromEvent`). En el `.msg`, inicio, fin, lugar y «todo el día» salen de las propiedades con nombre de PSETID_Appointment (`__nameid_version1.0`; LID 0x820D, 0x820E, 0x8208, 0x8215) o, si no, de PidTagStartDate/EndDate. Las citas de todo el día guardan solo fechas, con el fin inclusivo. En los `.ics`, las horas con TZID se toman como hora local. Si el asunto habla de curso, formación, jornada, seminario o taller, el tipo es «Curso».
- **Móvil: GitHub Pages** (el usuario aceptó hacer público el repositorio). Cada `push` a `main` pasa las pruebas y publica `dist/organizador.html` como `index.html` en https://saraia02022000.github.io/organizador-trabajo/ (`.github/workflows/pages.yml`). Los datos nunca van al repositorio.
- **Guardar desde el iPhone** (opción elegida por el usuario frente a guardar en GitHub o conectarse a OneDrive con Microsoft Graph, que en la AGE necesitaría a informática). Safari no puede escribir el fichero: se abre con el selector de ficheros como copia (modo `local` sin File System Access API) y «Guardar en OneDrive» abre el menú de compartir (`navigator.share` con el fichero) para «Guardar en Archivos» → OneDrive → «Reemplazar». La copia recuerda si tiene cambios sin guardar y cuándo se abrió (`organizador-copia-info`); «Actualizar desde OneDrive» combina el fichero con lo pendiente del teléfono. `?movil` en la dirección fuerza este modo para probarlo en el PC. Sin probar todavía en un iPhone real (si «Guardar en Archivos» crea una copia en vez de reemplazar, se usa «Combinar con otro fichero…» en el PC).

- **Aplicación instalable con icono** (pedido el 2026-10-31, para el iPhone y el PC). El manifiesto y el service worker solo se cargan por http(s): abiertos como fichero local darían errores. El navegador integrado del entorno de desarrollo no registra service workers («unknown error when fetching the script»); no es un fallo de la aplicación. En el iPhone, la aplicación de la pantalla de inicio tiene su propio almacenamiento, distinto del de Safari: allí hay que abrir el fichero una vez.
- `dist/organizador.json` es el fichero de datos real del usuario (lo guardó ahí). Está ignorado por git: no borrarlo ni sobrescribirlo.

## Modelo de datos

`{ app, version, updated, items: [...] }`. Cada elemento: `id`, `kind` (`responder`, `esperar`, `tarea`, `trabajo`, `evento`), `title`, `notes`, `status` (`abierto`/`hecho`), `priority`, `due` (AAAA-MM-DD: contestar antes del, reclamar el, fecha límite), `person`, `work` (id del trabajo al que pertenece), `email` ({subject, from, fromAddr, to, date, snippet}), `since` (esperas: pedido el), eventos: `evType` (`reunion`, `curso`, `otro`), `start`/`end` (AAAA-MM-DDTHH:MM, o solo fecha si es todo el día; un curso de varios días ocupa cada día), `place`; trabajos: `log` [{date, text}] de más reciente a más antiguo.

- «Contestado, espero respuesta» marca el correo como hecho y crea una espera con el mismo trabajo y correo.
- En el día salen primero las citas con hora.
