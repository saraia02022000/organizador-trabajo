# Organizador de trabajo

Correos pendientes de contestar, información que esperas recibir, tareas, trabajos abiertos con su seguimiento y agenda (reuniones, cursos…), todo en una sola página.

**Abrir:** https://saraia02022000.github.io/organizador-trabajo/ (o `dist/organizador.html` en local).

## Uso

1. Abre la página en Edge o Chrome.
2. La primera vez, pulsa **Crear fichero de datos** y guárdalo en tu carpeta de OneDrive (por ejemplo, `organizador.json`). Cada cambio se guarda solo.
3. Arrastra correos desde Outlook a la página para apuntarlos como pendientes de contestar o de recibir información, y citas desde el calendario de Outlook para añadirlas a la agenda.
4. En el móvil, abre la misma dirección y elige `organizador.json` desde OneDrive para consultarlo.

Tus datos están solo en ese fichero (y en una copia de tu navegador); nunca se suben a este repositorio.

## Desarrollo

```bash
node build.js
node tests/core.test.js
```
