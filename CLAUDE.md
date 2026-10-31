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
build.js           Genera dist/organizador.html.
tests/core.test.js Pruebas del núcleo.
tests/cfb_writer.js Fabrica .msg sintéticos (Compound File Binary) para las pruebas.
```

## Decisiones del usuario (2026-10-31)

- **Un único HTML**, sin servidor ni Python, como el Asistente GML.
- **Datos en un fichero JSON** que el usuario elige (en su OneDrive), con la File System Access API: se guarda solo medio segundo después de cada cambio. El permiso del fichero se recuerda en IndexedDB; al volver a abrir basta un clic. Además, copia en `localStorage` (`organizador-copia`).
  - Si el fichero cambia desde otro equipo (OneDrive), al volver a la ventana se recarga solo; si el cambio llega con cambios propios sin guardar, se avisa y se elige cuál conservar.
- **Correos: arrastrar desde Outlook.** Se leen `.msg` (Outlook clásico) y `.eml`; si Outlook solo pasa texto, se usa como título. No hay conexión al buzón (en la AGE necesitaría permisos de informática). Un correo normal toma el tipo de la pestaña abierta (Esperando, Tareas o Agenda); en las demás, «por contestar».
- **Citas: arrastrar desde el calendario de Outlook** (pedido el 2026-10-31). Un `.msg` de clase `IPM.Appointment` o `IPM.Schedule.Meeting.Request`, un `.ics` o un `.eml` con una parte `text/calendar` crean una cita de la agenda (`Org.fromEvent`). En el `.msg`, inicio, fin, lugar y «todo el día» salen de las propiedades con nombre de PSETID_Appointment (`__nameid_version1.0`; LID 0x820D, 0x820E, 0x8208, 0x8215) o, si no, de PidTagStartDate/EndDate. Las citas de todo el día guardan solo fechas, con el fin inclusivo. En los `.ics`, las horas con TZID se toman como hora local. Si el asunto habla de curso, formación, jornada, seminario o taller, el tipo es «Curso».
- **Móvil: GitHub Pages** (el usuario aceptó hacer público el repositorio). Cada `push` a `main` pasa las pruebas y publica `dist/organizador.html` como `index.html` en https://saraia02022000.github.io/organizador-trabajo/ (`.github/workflows/pages.yml`). Los datos nunca van al repositorio. El navegador del móvil no puede escribir el fichero: allí se abre con el selector de ficheros (OneDrive aparece en él), los cambios quedan en el navegador y se puede descargar el fichero para sustituir el de OneDrive.

## Modelo de datos

`{ app, version, updated, items: [...] }`. Cada elemento: `id`, `kind` (`responder`, `esperar`, `tarea`, `trabajo`, `evento`), `title`, `notes`, `status` (`abierto`/`hecho`), `priority`, `due` (AAAA-MM-DD: contestar antes del, reclamar el, fecha límite), `person`, `work` (id del trabajo al que pertenece), `email` ({subject, from, fromAddr, to, date, snippet}), `since` (esperas: pedido el), eventos: `evType` (`reunion`, `curso`, `otro`), `start`/`end` (AAAA-MM-DDTHH:MM, o solo fecha si es todo el día; un curso de varios días ocupa cada día), `place`; trabajos: `log` [{date, text}] de más reciente a más antiguo.

- «Contestado, espero respuesta» marca el correo como hecho y crea una espera con el mismo trabajo y correo.
- En el día salen primero las citas con hora.
