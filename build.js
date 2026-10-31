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
console.log('dist/organizador.html (' + Math.round(out.length / 1024) + ' KB), iconos, manifiesto y service worker');
