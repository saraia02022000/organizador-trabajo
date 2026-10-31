// Genera los iconos de la aplicación en src/icons/ a partir de un único dibujo SVG.
// Solo hace falta al cambiar el icono:  npm install  y  node tools/iconos.js
'use strict';
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// Calendario con una marca de hecho. `square`: fondo a sangre (iPhone y Android recortan la forma ellos mismos).
function svg({ square } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fondo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f6fe6"/>
      <stop offset="1" stop-color="#2346ad"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${square ? 0 : 112}" fill="url(#fondo)"/>
  <rect x="104" y="136" width="304" height="272" rx="36" fill="#ffffff"/>
  <path d="M140 136h232a36 36 0 0 1 36 36v48H104v-48a36 36 0 0 1 36-36z" fill="#f2994a"/>
  <rect x="170" y="100" width="28" height="72" rx="14" fill="#ffffff" stroke="#2346ad" stroke-width="10"/>
  <rect x="314" y="100" width="28" height="72" rx="14" fill="#ffffff" stroke="#2346ad" stroke-width="10"/>
  <path d="M182 312l50 50 100-104" fill="none" stroke="#2e8a3e" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

const out = path.join(__dirname, '..', 'src', 'icons');
fs.mkdirSync(out, { recursive: true });
const png = (s, size) => new Resvg(s, { fitTo: { mode: 'width', value: size } }).render().asPng();

fs.writeFileSync(path.join(out, 'icono.svg'), svg());
const files = [
  ['icono-192.png', svg(), 192],
  ['icono-512.png', svg(), 512],
  ['icono-maskable-512.png', svg({ square: true }), 512],
  ['apple-touch-icon.png', svg({ square: true }), 180],
  ['favicon-32.png', svg(), 32]
];
for (const [name, s, size] of files) {
  fs.writeFileSync(path.join(out, name), png(s, size));
  console.log(name);
}
