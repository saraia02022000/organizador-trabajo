// Genera dist/: organizador.html (src/app.html con src/core.js incrustado), los iconos,
// el manifiesto y el service worker de la aplicación instalable.
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = path.join(root, 'src'), dist = path.join(root, 'dist');
const tpl = fs.readFileSync(path.join(src, 'app.html'), 'utf8');
const core = fs.readFileSync(path.join(src, 'core.js'), 'utf8');
if (!tpl.includes('/*CORE*/')) throw new Error('Falta el marcador /*CORE*/ en app.html');
const out = tpl.replace('/*CORE*/', () => core);
fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
fs.writeFileSync(path.join(dist, 'organizador.html'), out);
for (const f of ['manifest.webmanifest', 'sw.js']) fs.copyFileSync(path.join(src, f), path.join(dist, f));
for (const f of fs.readdirSync(path.join(src, 'icons'))) fs.copyFileSync(path.join(src, 'icons', f), path.join(dist, 'icons', f));

// Widget de Scriptable: la parte del núcleo sin la lectura de correos (hasta «Correos») + src/widget.js
const cut = core.indexOf('  // ---------- Correos ----------');
const start = core.indexOf('(function (root) {');
if (cut < 0 || start < 0) throw new Error('No se encuentra el principio o la sección «Correos» en core.js');
const widget = '// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: deep-blue; icon-glyph: calendar-check;\n' +
  '// Organizador de trabajo · widget para Scriptable (iOS). Generado por build.js: no editar a mano.\n' +
  '// Se instala y actualiza con el instalador del README.\n\n' +
  'const Org = ' + core.slice(start, cut) + '  return Org;\n})(this);\n\n' +
  fs.readFileSync(path.join(src, 'widget.js'), 'utf8');
fs.writeFileSync(path.join(dist, 'organizador-widget.js'), widget);
console.log('dist/organizador.html (' + Math.round(out.length / 1024) + ' KB), iconos, manifiesto, service worker y organizador-widget.js (' + Math.round(widget.length / 1024) + ' KB)');
