'use strict';
const assert = require('assert');
const Org = require('../src/core.js');
const { makeMsg } = require('./cfb_writer.js');

let ok = 0, fail = 0;
function test(name, fn) {
  try { fn(); ok++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n    ')); }
}

console.log('Fechas');
test('ymd, sumar días y diferencia', () => {
  assert.strictEqual(Org.addDays('2026-10-31', 1), '2026-11-01');
  assert.strictEqual(Org.addDays('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(Org.diffDays('2026-10-31', '2026-11-07'), 7);
  assert.strictEqual(Org.diffDays('2026-03-28', '2026-03-30'), 2); // cambio de hora
});
test('lunes de la semana', () => {
  assert.strictEqual(Org.weekStart('2026-10-31'), '2026-10-26'); // sábado
  assert.strictEqual(Org.weekStart('2026-11-01'), '2026-10-26'); // domingo
  assert.strictEqual(Org.weekStart('2026-10-26'), '2026-10-26');
});
test('texto relativo', () => {
  assert.strictEqual(Org.relDate('2026-10-31', '2026-10-31'), 'hoy');
  assert.strictEqual(Org.relDate('2026-11-01', '2026-10-31'), 'mañana');
  assert.strictEqual(Org.relDate('2026-10-28', '2026-10-31'), 'hace 3 días');
  assert.strictEqual(Org.relDate('2026-11-03', '2026-10-31'), 'martes');
});

console.log('Modelo');
const T = '2026-10-31';
function sample() {
  const d = Org.emptyData();
  const w = Org.makeItem('trabajo', { title: 'Expediente 12/2026' });
  d.items.push(
    w,
    Org.makeItem('responder', { title: 'Contestar a Ana', due: '2026-10-29', work: w.id }),
    Org.makeItem('responder', { title: 'Sin fecha' }),
    Org.makeItem('esperar', { title: 'Informe de Juan', due: T, priority: 'alta' }),
    Org.makeItem('tarea', { title: 'Revisar borrador', due: '2026-11-04', work: w.id }),
    Org.makeItem('tarea', { title: 'Hecha', due: '2026-10-20', status: 'hecho' }),
    Org.makeItem('tarea', { title: 'Lejana', due: '2026-12-20' }),
    Org.makeItem('evento', { title: 'Reunión de equipo', evType: 'reunion', start: T + 'T10:00', end: T + 'T11:00' }),
    Org.makeItem('evento', { title: 'Curso QGIS', evType: 'curso', start: '2026-11-02T09:00', end: '2026-11-04T14:00' }),
    Org.makeItem('evento', { title: 'Pasada', start: '2026-10-01T09:00' })
  );
  return d;
}
test('resumen de hoy', () => {
  const s = Org.summary(sample(), T);
  assert.deepStrictEqual(s.vencido.map(i => i.title), ['Contestar a Ana']);
  assert.deepStrictEqual(s.hoy.map(i => i.title), ['Reunión de equipo', 'Informe de Juan']);
  assert.deepStrictEqual(s.semana.map(i => i.title), ['Curso QGIS', 'Revisar borrador']);
  assert.deepStrictEqual(s.sinfecha.map(i => i.title), ['Sin fecha']);
  assert.strictEqual(s.counts.responder, 2);
  assert.strictEqual(s.counts.tarea, 2);
  assert.strictEqual(s.counts.trabajo, 1);
  assert.strictEqual(s.counts.evento, 2);
});
test('un curso de varios días ocupa cada día en la agenda', () => {
  const a = Org.agenda(sample(), '2026-11-01', '2026-11-07');
  assert.deepStrictEqual(Object.keys(a).sort(), ['2026-11-02', '2026-11-03', '2026-11-04']);
  assert.deepStrictEqual(a['2026-11-04'].map(i => i.title), ['Curso QGIS', 'Revisar borrador']);
});
test('la agenda no muestra lo terminado salvo los eventos', () => {
  const a = Org.agenda(sample(), '2026-10-01', '2026-10-31');
  assert.ok(!a['2026-10-20']);
  assert.deepStrictEqual(a['2026-10-01'].map(i => i.title), ['Pasada']);
});
test('elementos vinculados a un trabajo y borrado', () => {
  const d = sample(); const w = d.items[0];
  assert.deepStrictEqual(Org.linked(d, w.id).map(i => i.title), ['Contestar a Ana', 'Revisar borrador']);
  Org.remove(d, w.id);
  assert.ok(d.items.every(i => i.work === ''));
});
test('seguimiento de un trabajo ordenado de más reciente a más antiguo', () => {
  const w = Org.makeItem('trabajo', { title: 'X' });
  Org.addLog(w, 'Primero', '2026-10-01'); Org.addLog(w, 'Tercero', '2026-10-20'); Org.addLog(w, 'Segundo', '2026-10-10');
  assert.deepStrictEqual(w.log.map(l => l.text), ['Tercero', 'Segundo', 'Primero']);
});
test('normalizar un fichero completa los campos', () => {
  const d = Org.normalize({ items: [{ kind: 'tarea', title: 'a' }, { kind: 'raro' }, { kind: 'trabajo', title: 'b' }] });
  assert.strictEqual(d.items.length, 2);
  assert.strictEqual(d.items[0].status, 'abierto');
  assert.ok(d.items[0].id);
  assert.deepStrictEqual(d.items[1].log, []);
  assert.throws(() => Org.normalize({ foo: 1 }));
});
test('búsqueda sin acentos ni mayúsculas', () => {
  const it = Org.makeItem('tarea', { title: 'Reunión con Catastro', notes: 'llevar planos' });
  assert.ok(Org.matches(it, 'reunion catastro'));
  assert.ok(Org.matches(it, 'PLANOS'));
  assert.ok(!Org.matches(it, 'urbanismo'));
});

console.log('Correos .eml');
test('cabeceras codificadas y cuerpo en quoted-printable', () => {
  const eml = [
    'From: =?UTF-8?Q?Mar=C3=ADa_P=C3=A9rez?= <maria.perez@example.es>',
    'To: yo@example.es',
    'Subject: =?UTF-8?B?U29saWNpdHVkIGRlIGluZm9ybWFjacOzbg==?=',
    ' =?UTF-8?Q?_urgente?=',
    'Date: Thu, 29 Oct 2026 09:15:00 +0100',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    'Buenos d=C3=ADas,',
    'necesito el informe de la parcela 12.=',
    '',
  ].join('\r\n');
  const e = Org.parseEml(eml);
  assert.strictEqual(e.subject, 'Solicitud de información urgente');
  assert.strictEqual(e.from, 'María Pérez');
  assert.strictEqual(e.fromAddr, 'maria.perez@example.es');
  assert.strictEqual(e.date, '2026-10-29T08:15:00.000Z');
  assert.strictEqual(e.snippet, 'Buenos días, necesito el informe de la parcela 12.');
});
test('multipart: prefiere el texto plano y descarta adjuntos', () => {
  const b64 = Buffer.from('Texto plano con ñ', 'latin1').toString('base64');
  const eml = [
    'From: "Pérez, Juan" <juan@example.es>', 'Subject: Hola', 'Date: Mon, 26 Oct 2026 12:00:00 +0000',
    'Content-Type: multipart/mixed; boundary="AAA"', '',
    '--AAA', 'Content-Type: multipart/alternative; boundary=BBB', '',
    '--BBB', 'Content-Type: text/html; charset=utf-8', '', '<p>HTML</p>',
    '--BBB', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: base64', '', b64,
    '--BBB--',
    '--AAA', 'Content-Type: text/plain', 'Content-Disposition: attachment; filename=a.txt', '', 'ADJUNTO',
    '--AAA--', ''
  ].join('\n');
  const e = Org.parseEml(Buffer.from(eml, 'latin1'));
  assert.strictEqual(e.from, 'Pérez, Juan');
  assert.strictEqual(e.snippet, 'Texto plano con ñ');
});
test('solo HTML', () => {
  const e = Org.parseEml('From: a@b.es\nSubject: x\nContent-Type: text/html\n\n<div>Hola&nbsp;<b>mundo</b></div>');
  assert.strictEqual(e.fromAddr, 'a@b.es');
  assert.strictEqual(e.snippet, 'Hola mundo');
});
test('un fichero que no es correo se rechaza', () => {
  assert.throws(() => Org.parseEml('esto no es un correo'), /No parece/);
});

console.log('Correos .msg (Outlook)');
test('lee asunto, remitente SMTP, destinatarios, fecha y cuerpo', () => {
  const date = new Date('2026-10-30T07:45:12Z');
  const msg = makeMsg({
    subject: 'Convocatoria: reunión de coordinación', senderName: 'Gómez Ruiz, Lucía', senderSmtp: 'lucia.gomez@example.es',
    to: 'Yo; Otro', body: 'Os convoco el martes.\r\nUn saludo.', date
  });
  const e = Org.parseEmailFile('correo.msg', msg);
  assert.strictEqual(e.subject, 'Convocatoria: reunión de coordinación');
  assert.strictEqual(e.from, 'Gómez Ruiz, Lucía');
  assert.strictEqual(e.fromAddr, 'lucia.gomez@example.es');
  assert.strictEqual(e.to, 'Yo; Otro');
  assert.strictEqual(e.date, date.toISOString());
  assert.strictEqual(e.snippet, 'Os convoco el martes. Un saludo.');
});
test('cuerpo largo que ocupa varios minisectores', () => {
  const body = 'Línea de texto. '.repeat(120);
  const e = Org.parseMsg(makeMsg({ subject: 'Largo', senderName: 'A', body }));
  assert.strictEqual(e.snippet, body.trim().slice(0, 400));
  assert.strictEqual(e.fromAddr, ''); // la dirección de Exchange no es SMTP
});
test('un .msg dañado se rechaza con un mensaje claro', () => {
  assert.throws(() => Org.parseEmailFile('x.msg', new Uint8Array(600)), /dañado/);
});
test('campos de un elemento creado desde un correo', () => {
  const e = { subject: 'Datos', from: 'Ana', fromAddr: 'ana@x.es', date: '2026-10-28T10:00:00.000Z' };
  const f = Org.fromEmail(e, 'esperar');
  assert.strictEqual(f.title, 'Datos'); assert.strictEqual(f.person, 'Ana'); assert.strictEqual(f.since, '2026-10-28');
  assert.strictEqual(Org.fromEmail({ fromAddr: 'z@x.es' }, 'responder').title, '(sin asunto)');
});

console.log(`\n${ok} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
