'use strict';
// Prueba el widget de Scriptable (dist/organizador-widget.js) con un Scriptable simulado.
// Ejecutar después de build.js.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Org = require('../src/core.js');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'dist', 'organizador-widget.js'), 'utf8');

// ---------- Scriptable simulado ----------
function makeEnv({ family = 'medium', param = '', response = '', status = 200, keychain = {}, files = {} } = {}) {
  const env = { requests: [], widget: null };
  class Node {
    constructor(kind) { this.kind = kind; this.children = []; }
    addStack() { const s = new Node('stack'); this.children.push(s); return s; }
    addText(t) { const n = { kind: 'text', text: t }; this.children.push(n); return n; }
    addSpacer() { this.children.push({ kind: 'spacer' }); }
    setPadding() {} layoutVertically() {} layoutHorizontally() {} centerAlignContent() {}
    async presentMedium() { env.widget = this; } async presentLarge() { env.widget = this; } async presentSmall() { env.widget = this; }
  }
  class Color { constructor(hex) { this.hex = hex; } static dynamic(l, d) { return { light: l.hex, dark: d.hex }; } static white() { return new Color('#fff'); } }
  const Font = new Proxy({}, { get: (t, name) => (size) => ({ name, size }) });
  class Request {
    constructor(url) { this.url = url; env.requests.push(url); }
    async loadString() { this.response = { statusCode: status }; if (response instanceof Error) throw response; return response; }
  }
  const store = Object.assign({}, files);
  const fm = {
    cacheDirectory: () => '/cache', joinPath: (a, b) => a + '/' + b,
    writeString: (p, s) => { store[p] = s; }, readString: (p) => store[p], fileExists: (p) => p in store,
    modificationDate: () => new Date(2026, 10, 2, 8, 15), bookmarkExists: (n) => ('bm:' + n) in store, bookmarkedPath: (n) => 'bm:' + n
  };
  const kc = Object.assign({}, keychain);
  env.store = store;
  env.context = {
    ListWidget: class extends Node { constructor() { super('widget'); } }, Color, Font, Size: class { constructor(w, h) { this.w = w; this.h = h; } },
    Request, FileManager: { local: () => fm },
    Keychain: { contains: (k) => k in kc, get: (k) => kc[k], set: (k, v) => { kc[k] = v; } },
    Data: { fromString: (s) => ({ toBase64String: () => Buffer.from(s, 'utf8').toString('base64') }) },
    Alert: class { addTextField() {} addAction() {} addCancelAction() {} async present() { return -1; } textFieldValue() { return ''; } },
    config: { runsInWidget: true, widgetFamily: family }, args: { widgetParameter: param },
    Script: { setWidget: (w) => { env.widget = w; }, complete: () => {} },
    console, Date, JSON, Math, Object, Array, String, Number, RegExp, Error, Buffer, URL, setTimeout
  };
  return env;
}
async function run(opts) {
  const env = makeEnv(opts);
  await vm.runInNewContext('(async () => {\n' + CODE + '\n})()', env.context, { filename: 'organizador-widget.js' });
  return env;
}
function texts(n, out = []) {
  if (!n) return out;
  if (n.kind === 'text') out.push(n.text);
  (n.children || []).forEach((c) => texts(c, out));
  return out;
}

// ---------- Datos de ejemplo (relativos a hoy) ----------
const T = Org.today(), A = (n) => Org.addDays(T, n);
function sample() {
  const d = Org.emptyData();
  d.items.push(
    Org.makeItem('responder', { title: 'Contestar a Ana', due: A(-1) }),
    Org.makeItem('responder', { title: 'Consulta GML' }),
    Org.makeItem('esperar', { title: 'Plano del ayuntamiento', due: T }),
    Org.makeItem('tarea', { title: 'Informe semanal', due: T, repeat: { freq: 'weekly', interval: 1, anchor: T } }),
    Org.makeItem('trabajo', { title: 'Expediente 12' }),
    Org.makeItem('evento', { title: 'Comité de dirección', start: A(-7) + 'T10:00', repeat: { freq: 'weekly', interval: 1, days: [] } }),
    Org.makeItem('evento', { title: 'Curso QGIS', evType: 'curso', start: A(2) })
  );
  return JSON.stringify(d);
}

let ok = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); ok++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); }
}

(async () => {
  console.log('Widget de Scriptable');
  const SP = 'https://empresa-my.sharepoint.com/:u:/g/personal/yo/EaBcD?e=xYz&download=0';

  await test('mediano: contadores con los mismos números que la aplicación y lo de hoy', async () => {
    const env = await run({ param: SP, response: sample() });
    const t = texts(env.widget);
    const sum = Org.summary(Org.normalize(JSON.parse(sample())), T);
    assert.ok(t.includes('Organizador'));
    ['Correos', 'Esperas', 'Tareas', 'Trabajos', 'Agenda'].forEach((l) => assert.ok(t.includes(l), l));
    assert.deepStrictEqual([sum.counts.responder, sum.counts.esperar, sum.counts.tarea, sum.counts.trabajo, sum.counts.evento].map(String),
      t.slice(t.indexOf('Correos') - 1, t.indexOf('Agenda') + 1).filter((x, i) => i % 2 === 0));
    assert.ok(t.includes('⚠︎ 1 fuera de plazo'));
    assert.ok(t.includes('HOY'));
    // la reunión semanal de hoy, con su hora, va la primera
    assert.strictEqual(t[t.indexOf('HOY') + 1], '10:00');
    assert.strictEqual(t[t.indexOf('HOY') + 2], 'Comité de dirección');
    assert.strictEqual(env.widget.url, 'https://saraia02022000.github.io/organizador-trabajo/');
  });
  await test('enlace de OneDrive de empresa (SharePoint): se pide la descarga directa', async () => {
    const env = await run({ param: SP, response: sample() });
    assert.strictEqual(env.requests[0], 'https://empresa-my.sharepoint.com/:u:/g/personal/yo/EaBcD?e=xYz&download=1');
  });
  await test('enlace de OneDrive personal (1drv.ms): se usa la API de compartir', async () => {
    const env = await run({ param: 'https://1drv.ms/u/s!AbCdEf', response: sample() });
    assert.ok(env.requests[0].startsWith('https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL3UvcyFBYkNkRWY/root/content'), env.requests[0]);
  });
  await test('el enlace guardado en el llavero sirve si no hay parámetro', async () => {
    const env = await run({ keychain: { 'organizador-url': SP }, response: sample() });
    assert.strictEqual(env.requests.length, 1);
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });
  await test('pequeño: sin contadores, con lo de hoy', async () => {
    const t = texts((await run({ family: 'small', param: SP, response: sample() })).widget);
    assert.ok(t.includes('Hoy')); assert.ok(!t.includes('Correos'));
    assert.ok(t.includes('Comité de dirección'));
  });
  await test('grande: también los próximos días', async () => {
    const t = texts((await run({ family: 'large', param: SP, response: sample() })).widget);
    assert.ok(t.includes('PRÓXIMOS DÍAS')); assert.ok(t.includes('Curso QGIS'));
  });
  await test('pantalla de bloqueo', async () => {
    const t = texts((await run({ family: 'accessoryRectangular', param: SP, response: sample() })).widget);
    assert.strictEqual(t[0], 'Hoy: ' + Org.summary(Org.normalize(JSON.parse(sample())), T).hoy.length + ' · 1 fuera de plazo');
  });
  await test('si el enlace devuelve una página, se explica; con copia anterior, se usa y se avisa', async () => {
    let t = texts((await run({ param: SP, response: '<!DOCTYPE html><html>Iniciar sesión</html>' })).widget);
    assert.ok(t.some((x) => /Cualquier persona con el vínculo/.test(x)), t.join(' | '));
    t = texts((await run({ param: SP, response: new Error('sin red'), files: { '/cache/organizador-widget.json': sample() } })).widget);
    assert.ok(t.includes('Comité de dirección'));
    assert.ok(t.includes('Sin actualizar · datos de las 08:15'));
  });
  await test('error de OneDrive y falta de enlace', async () => {
    let t = texts((await run({ param: SP, response: 'x', status: 403 })).widget);
    assert.ok(t.some((x) => /error \(403\)/.test(x)));
    t = texts((await run({})).widget);
    assert.ok(t.some((x) => /Abre este script en Scriptable/.test(x)));
  });
  await test('marcador de archivo de Scriptable en lugar de enlace', async () => {
    const env = await run({ param: 'organizador', files: { 'bm:organizador': sample() } });
    assert.strictEqual(env.requests.length, 0);
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });

  console.log(`\n${ok} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
