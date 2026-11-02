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
    // response: texto, Error, o función (url) → texto o { txt, status, finalUrl }
    async loadString() {
      let r = typeof response === 'function' ? response(this.url) : response;
      if (typeof r === 'string' || r instanceof Error) r = { txt: r, status };
      if (r.txt instanceof Error) throw r.txt;
      this.response = { statusCode: r.status || 200, url: r.finalUrl || this.url };
      return r.txt;
    }
  }
  const store = Object.assign({}, files);
  const fm = {
    cacheDirectory: () => '/cache', joinPath: (a, b) => a + '/' + b,
    writeString: (p, s) => { store[p] = s; }, readString: (p) => store[p], fileExists: (p) => p in store,
    modificationDate: () => new Date(2026, 10, 2, 8, 15), bookmarkExists: (n) => ('bm:' + n) in store, bookmarkedPath: (n) => 'bm:' + n,
    // Como en Scriptable con un fichero que no es de iCloud: falla y hay que leerlo igual
    downloadFileFromiCloud: async () => { throw new Error('not iCloud'); }
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
  const PAGE = '<!DOCTYPE html><html><body>OneDrive</body></html>';
  await test('primero se prueba el enlace tal cual (si da el fichero, no se pide nada más)', async () => {
    const env = await run({ param: SP, response: sample() });
    assert.deepStrictEqual(env.requests, [SP]);
  });
  await test('SharePoint: si el enlace da la página, se pide la descarga directa', async () => {
    const env = await run({ param: SP, response: (u) => /download=1/.test(u) ? sample() : PAGE });
    assert.deepStrictEqual(env.requests, [SP, 'https://empresa-my.sharepoint.com/:u:/g/personal/yo/EaBcD?e=xYz&download=1']);
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });
  await test('OneDrive personal: de la redirección «redir» se pasa a «download», sin la API', async () => {
    const link = 'https://1drv.ms/u/s!AbCdEf';
    const fin = 'https://onedrive.live.com/redir?resid=ABC%21123&authkey=%21XYZ';
    const env = await run({ param: link, response: (u) => /\/download\?/.test(u) ? sample() : { txt: PAGE, finalUrl: fin } });
    assert.strictEqual(env.requests[env.requests.length - 1], 'https://onedrive.live.com/download?resid=ABC%21123&authkey=%21XYZ');
    assert.ok(!env.requests.some((u) => /api\.onedrive\.com/.test(u)));
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });
  await test('si la página de OneDrive trae la dirección de descarga, se usa', async () => {
    const dl = 'https://public.sn.files.1drv.com/y4mAbC/organizador.json?download&psid=1';
    const page = '<html><script>var $Config={"@content.downloadUrl":"' + dl.replace(/&/g, '\\u0026') + '"}</script></html>';
    const env = await run({ param: 'https://1drv.ms/u/c/abc/EfGh', response: (u) => u === dl ? sample() : page });
    assert.ok(env.requests.includes(dl), env.requests.join('\n'));
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });
  await test('como último recurso, la API de compartir de OneDrive', async () => {
    const env = await run({ param: 'https://1drv.ms/u/s!AbCdEf', response: (u) => /api\.onedrive\.com/.test(u) ? sample() : PAGE });
    assert.strictEqual(env.requests[env.requests.length - 1], 'https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL3UvcyFBYkNkRWY/root/content');
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
    let t = texts((await run({ param: SP, response: 'x', status: 401 })).widget);
    assert.ok(t.some((x) => /pide iniciar sesión \(401\)/.test(x)), t.join(' | '));
    t = texts((await run({ param: SP, response: 'x', status: 404 })).widget);
    assert.ok(t.some((x) => /respuestas: 404/.test(x)), t.join(' | '));
    t = texts((await run({})).widget);
    assert.ok(t.some((x) => /Abre este script en Scriptable/.test(x)));
  });
  await test('el enlace escrito al principio del código manda sobre el parámetro y el llavero', async () => {
    assert.ok(CODE.indexOf("const ENLACE = '';") > 0 && CODE.indexOf("const ENLACE = '';") < 600, 'ENLACE debe estar arriba del todo');
    const saved = CODE;
    const withLink = CODE.replace("const ENLACE = '';", "const ENLACE = '" + SP + "';");
    const env = makeEnv({ param: 'https://otro.example/x.json', keychain: { 'organizador-url': 'https://llavero.example/y.json' }, response: sample() });
    await vm.runInNewContext('(async () => {\n' + withLink + '\n})()', env.context);
    assert.strictEqual(env.requests[0], SP);
    assert.ok(texts(env.widget).includes('Comité de dirección'));
    assert.strictEqual(CODE, saved);
  });
  await test('marcador de archivo de Scriptable en lugar de enlace', async () => {
    const env = await run({ param: 'organizador', files: { 'bm:organizador': sample() } });
    assert.strictEqual(env.requests.length, 0);
    assert.ok(texts(env.widget).includes('Comité de dirección'));
  });

  console.log('Instalador del widget');
  const INST = fs.readFileSync(path.join(__dirname, '..', 'src', 'instalador-widget.js'), 'utf8');
  async function install(filename, response) {
    const env = makeEnv({ response });
    const written = {};
    const mkfm = (dir) => ({ documentsDirectory: () => dir, joinPath: (a, b) => a + '/' + b, writeString: (p, s) => { written[p] = s; } });
    env.context.FileManager = { local: () => mkfm('/local'), iCloud: () => mkfm('/icloud') };
    env.context.module = { filename };
    await vm.runInNewContext('(async () => {\n' + INST + '\n})()', env.context);
    return { env, written };
  }
  await test('solo caracteres sencillos y líneas cortas (para que no se estropee al copiarlo)', async () => {
    assert.ok(/^[\x20-\x7e\n]*$/.test(INST), 'hay caracteres no ASCII');
    assert.ok(INST.split('\n').every((l) => l.length <= 100));
  });
  await test('descarga el widget publicado y lo guarda como Organizador.js junto al instalador', async () => {
    let r = await install('/var/mobile/Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents/Instalar.js', CODE);
    assert.strictEqual(r.env.requests[0], 'https://saraia02022000.github.io/organizador-trabajo/organizador-widget.js');
    assert.strictEqual(r.written['/icloud/Organizador.js'], CODE);
    r = await install('/var/mobile/Containers/Data/Application/X/Documents/Instalar.js', CODE);
    assert.strictEqual(r.written['/local/Organizador.js'], CODE);
  });
  await test('si no se descarga el widget, no escribe nada', async () => {
    let err = null, r;
    try { r = await install('/local/Instalar.js', '<html>404</html>'); } catch (e) { err = e; }
    assert.ok(err && /No se pudo descargar/.test(err.message));
  });
  await test('la página de instalación lleva el instalador exacto', async () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'dist', 'instalar.html'), 'utf8');
    const m = /<textarea id="inst" readonly>([\s\S]*?)<\/textarea>/.exec(page);
    const unesc = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.strictEqual(unesc, INST.trim());
  });

  console.log(`\n${ok} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
