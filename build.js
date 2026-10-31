// Genera dist/organizador.html: incrusta src/core.js en src/app.html.
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const tpl = fs.readFileSync(path.join(root, 'src', 'app.html'), 'utf8');
const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
if (!tpl.includes('/*CORE*/')) throw new Error('Falta el marcador /*CORE*/ en app.html');
const out = tpl.replace('/*CORE*/', () => core);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'organizador.html'), out);
console.log('dist/organizador.html (' + Math.round(out.length / 1024) + ' KB)');
