// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-blue; icon-glyph: calendar-check;
// Organizador de trabajo · widget para Scriptable (iOS). Generado por build.js: no editar a mano.
// Se instala y actualiza con el instalador del README.

const Org = (function (root) {
  'use strict';
  var Org = {};

  // ---------- Tipos ----------
  Org.KINDS = {
    responder: 'Correo por contestar',
    esperar: 'Esperando información',
    tarea: 'Tarea',
    trabajo: 'Trabajo abierto',
    evento: 'Agenda'
  };
  Org.EV_TYPES = { reunion: 'Reunión', curso: 'Curso', otro: 'Otro' };
  Org.PRIORITIES = { alta: 'Alta', normal: 'Normal', baja: 'Baja' };
  var PRIO_ORDER = { alta: 0, normal: 1, baja: 2 };

  // ---------- Fechas (siempre en hora local, 'AAAA-MM-DD') ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  Org.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  Org.parseYmd = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  Org.addDays = function (s, n) { var d = Org.parseYmd(s); d.setDate(d.getDate() + n); return Org.ymd(d); };
  Org.diffDays = function (a, b) { // b - a en días
    return Math.round((Org.parseYmd(b) - Org.parseYmd(a)) / 86400000);
  };
  Org.today = function () { return Org.ymd(new Date()); };
  // Lunes de la semana de una fecha
  Org.weekStart = function (s) { var d = Org.parseYmd(s); var w = (d.getDay() + 6) % 7; return Org.addDays(s, -w); };

  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  Org.MESES = MESES;
  Org.DIAS = DIAS;
  Org.fmtDate = function (s, opts) {
    var d = Org.parseYmd(s); if (!d) return '';
    var t = d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
    if (opts && opts.weekday) t = DIAS[d.getDay()].slice(0, 3) + ' ' + t;
    if (opts && opts.year) t += ' ' + d.getFullYear();
    return t;
  };
  // Texto relativo: «hoy», «mañana», «hace 3 días»…
  Org.relDate = function (s, today) {
    var n = Org.diffDays(today, s);
    if (n === 0) return 'hoy';
    if (n === 1) return 'mañana';
    if (n === -1) return 'ayer';
    if (n < 0) return 'hace ' + (-n) + ' días';
    if (n < 7) return DIAS[Org.parseYmd(s).getDay()];
    return Org.fmtDate(s);
  };

  // ---------- Modelo ----------
  Org.newId = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };
  Org.emptyData = function () {
    return { app: 'organizador-trabajo', version: 1, updated: new Date().toISOString(), items: [], deleted: {} };
  };
  var DEFAULTS = {
    title: '', notes: '', status: 'abierto', priority: 'normal', due: '', person: '', work: '',
    email: null, since: '', evType: 'reunion', start: '', end: '', place: '', log: null, doneAt: '',
    repeat: null, lastDone: '', docs: null
  };
  Org.makeItem = function (kind, fields) {
    if (!Org.KINDS[kind]) throw new Error('Tipo desconocido: ' + kind);
    var now = new Date().toISOString();
    var it = { id: Org.newId(), kind: kind, created: now, updated: now };
    for (var k in DEFAULTS) it[k] = DEFAULTS[k];
    if (kind === 'trabajo') { it.log = []; it.docs = []; }
    if (fields) for (var f in fields) it[f] = fields[f];
    return it;
  };
  // Comprueba y completa un fichero de datos leído
  Org.normalize = function (data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) throw new Error('El fichero no es un fichero de datos del organizador.');
    data.items = data.items.filter(function (it) { return it && Org.KINDS[it.kind]; }).map(function (it) {
      for (var k in DEFAULTS) if (it[k] === undefined) it[k] = DEFAULTS[k];
      if (!it.id) it.id = Org.newId();
      if (it.kind === 'trabajo' && !Array.isArray(it.log)) it.log = [];
      if (it.kind === 'trabajo' && !Array.isArray(it.docs)) it.docs = [];
      return it;
    });
    data.app = 'organizador-trabajo';
    data.version = data.version || 1;
    data.deleted = data.deleted && typeof data.deleted === 'object' ? data.deleted : {};
    return data;
  };

  // Combina dos versiones de los datos (p. ej., la del iPhone y la del PC): de cada elemento se queda
  // la versión modificada más tarde, y un borrado gana si es posterior a la última modificación.
  var TOMBSTONE_DAYS = 400;
  Org.merge = function (a, b) {
    var deleted = {}, byId = {}, order = [];
    [a, b].forEach(function (d) {
      for (var id in d.deleted || {}) if (!deleted[id] || d.deleted[id] > deleted[id]) deleted[id] = d.deleted[id];
      (d.items || []).forEach(function (it) {
        var cur = byId[it.id];
        if (!cur) order.push(it.id);
        if (!cur || (it.updated || '') > (cur.updated || '')) byId[it.id] = it;
      });
    });
    var limit = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
    for (var k in deleted) if (deleted[k] < limit) delete deleted[k];
    return {
      app: 'organizador-trabajo', version: Math.max(a.version || 1, b.version || 1),
      updated: (a.updated || '') > (b.updated || '') ? a.updated : b.updated, deleted: deleted,
      items: order.map(function (id) { return byId[id]; }).filter(function (it) { return !(deleted[it.id] && deleted[it.id] >= (it.updated || '')); })
    };
  };
  // Firma del contenido, para saber si dos versiones son iguales
  Org.same = function (a, b) {
    var key = function (d) { return JSON.stringify([d.items.map(function (i) { return i.id + i.updated; }).sort(), Object.keys(d.deleted || {}).sort()]); };
    return key(a) === key(b);
  };
  Org.touch = function (it) { it.updated = new Date().toISOString(); return it; };
  // Una tarea que se repite no se cierra: pasa a su próxima fecha (si ya pasó, a la primera desde hoy)
  Org.setDone = function (it, done, today) {
    today = today || Org.today();
    if (done && it.repeat && it.kind !== 'evento' && it.due) {
      var next = Org.nextOccurrence(it, it.due);
      if (next && next < today) next = Org.nextOccurrence(it, Org.addDays(today, -1));
      if (next) { it.due = next; it.lastDone = new Date().toISOString(); it.status = 'abierto'; it.doneAt = ''; return Org.touch(it); }
    }
    it.status = done ? 'hecho' : 'abierto';
    it.doneAt = done ? new Date().toISOString() : '';
    return Org.touch(it);
  };
  Org.isOpen = function (it) { return it.status !== 'hecho'; };

  // Fecha que ordena y sitúa el elemento en la agenda
  Org.itemDate = function (it) {
    if (it.kind === 'evento') return (it.start || '').slice(0, 10);
    return it.due || '';
  };
  Org.itemTime = function (it) {
    return it.kind === 'evento' && it.start && it.start.length > 10 ? it.start.slice(11, 16) : '';
  };
  // Último día que ocupa (los cursos pueden durar varios días)
  Org.itemEndDate = function (it) {
    var s = Org.itemDate(it);
    if (it.kind === 'evento' && it.end && it.end.slice(0, 10) > s) return it.end.slice(0, 10);
    return s;
  };

  // ---------- Repetición ----------
  // repeat: { freq: 'daily'|'weekdays'|'weekly'|'monthly'|'yearly', interval, days: [0-6, 0 = domingo] (semanal),
  //           monthly: 'day'|'nth'|'last', until: 'AAAA-MM-DD'|'', skip: [fechas quitadas], anchor (tareas) }
  // El patrón se mide desde la fecha de inicio de la cita; en las tareas, desde `anchor` (la fecha con la
  // que se creó la regla), porque su `due` avanza al completarlas.
  Org.FREQS = { daily: 'Cada día', weekdays: 'Cada día laborable (lunes a viernes)', weekly: 'Cada semana', monthly: 'Cada mes', yearly: 'Cada año' };
  function daysInMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
  function anchorOf(it) { return (it.kind !== 'evento' && it.repeat && it.repeat.anchor) || Org.itemDate(it); }
  Org.nthOf = function (s) { return Math.ceil(Org.parseYmd(s).getDate() / 7); };
  Org.occursOn = function (it, s) {
    var r = it.repeat, a = anchorOf(it);
    if (!r || !a || s < a || (r.until && s > r.until) || (r.skip && r.skip.indexOf(s) >= 0)) return false;
    var A = Org.parseYmd(a), D = Org.parseYmd(s), n = Math.max(1, +r.interval || 1);
    var months = (D.getFullYear() - A.getFullYear()) * 12 + D.getMonth() - A.getMonth();
    switch (r.freq) {
      case 'daily': return Org.diffDays(a, s) % n === 0;
      case 'weekdays': return D.getDay() >= 1 && D.getDay() <= 5;
      case 'weekly':
        var days = r.days && r.days.length ? r.days : [A.getDay()];
        return days.indexOf(D.getDay()) >= 0 && (Org.diffDays(Org.weekStart(a), Org.weekStart(s)) / 7) % n === 0;
      case 'monthly':
        if (months % n) return false;
        if (r.monthly === 'nth') return D.getDay() === A.getDay() && Org.nthOf(s) === Org.nthOf(a);
        if (r.monthly === 'last') return D.getDay() === A.getDay() && D.getDate() + 7 > daysInMonth(D);
        return D.getDate() === Math.min(A.getDate(), daysInMonth(D));
      case 'yearly':
        return months % (12 * n) === 0 && D.getDate() === Math.min(A.getDate(), daysInMonth(D));
    }
    return false;
  };
  // Fechas de inicio de las repeticiones en [from, to], a partir de la fecha actual del elemento
  Org.occurrences = function (it, from, to) {
    var out = [], s = Org.itemDate(it); if (!s) return out;
    for (var d = from > s ? from : s, g = 0; d <= to && g < 3700; g++, d = Org.addDays(d, 1)) if (Org.occursOn(it, d)) out.push(d);
    return out;
  };
  Org.nextOccurrence = function (it, after) {
    for (var d = Org.addDays(after, 1), g = 0; g < 3700; g++, d = Org.addDays(d, 1)) {
      if (it.repeat.until && d > it.repeat.until) return '';
      if (Org.occursOn(it, d)) return d;
    }
    return '';
  };
  // Una repetición concreta: el mismo elemento con las fechas de ese día (`_occ`)
  Org.occurrence = function (it, d) {
    var o = Object.create(it); o._occ = d;
    if (it.kind === 'evento') {
      var s = Org.itemDate(it), span = Org.diffDays(s, Org.itemEndDate(it));
      o.start = d + it.start.slice(10);
      o.end = it.end ? Org.addDays(d, it.end.slice(0, 10) > s ? span : 0) + it.end.slice(10) : '';
    } else {
      o.due = d; o._future = d !== it.due;
    }
    return o;
  };
  var ORD = ['', 'primer', 'segundo', 'tercer', 'cuarto', 'quinto'];
  Org.describeRepeat = function (it) {
    var r = it.repeat; if (!r) return '';
    var a = anchorOf(it), A = Org.parseYmd(a) || new Date(), n = Math.max(1, +r.interval || 1), t;
    var unit = { daily: ['día', 'días'], weekly: ['semana', 'semanas'], monthly: ['mes', 'meses'], yearly: ['año', 'años'] }[r.freq];
    t = r.freq === 'weekdays' ? 'Cada día laborable' : n === 1 ? 'Cada ' + unit[0] : 'Cada ' + n + ' ' + unit[1];
    if (r.freq === 'weekly') {
      var ds = (r.days && r.days.length ? r.days : [A.getDay()]).slice().sort(function (x, y) { return ((x + 6) % 7) - ((y + 6) % 7); });
      var names = ds.map(function (x) { return DIAS[x]; });
      t += ' el ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' y el ' + names[names.length - 1] : names[0]);
    } else if (r.freq === 'monthly') {
      t += r.monthly === 'nth' ? ' el ' + ORD[Org.nthOf(a)] + ' ' + DIAS[A.getDay()] : r.monthly === 'last' ? ' el último ' + DIAS[A.getDay()] : ' el día ' + A.getDate();
    } else if (r.freq === 'yearly') t += ' el ' + A.getDate() + ' de ' + MESES[A.getMonth()];
    if (r.until) t += ', hasta el ' + Org.fmtDate(r.until, { year: true });
    return t;
  };

  Org.compare = function (a, b) {
    var da = Org.itemDate(a) || '9999', db = Org.itemDate(b) || '9999';
    if (da !== db) return da < db ? -1 : 1;
    var ta = Org.itemTime(a) || '99', tb = Org.itemTime(b) || '99'; // primero lo que tiene hora
    if (ta !== tb) return ta < tb ? -1 : 1;
    var pa = PRIO_ORDER[a.priority] || 1, pb = PRIO_ORDER[b.priority] || 1;
    if (pa !== pb) return pa - pb;
    return (a.created || '') < (b.created || '') ? -1 : 1;
  };

  // Situación de un elemento respecto a hoy
  Org.bucket = function (it, today) {
    var s = Org.itemDate(it);
    if (!s) return 'sinfecha';
    if (it.kind === 'evento') {
      if (Org.itemEndDate(it) < today) return 'pasado';
      return s <= today ? 'hoy' : (Org.diffDays(today, s) <= 7 ? 'semana' : 'futuro');
    }
    if (s < today) return 'vencido';
    if (s === today) return 'hoy';
    return Org.diffDays(today, s) <= 7 ? 'semana' : 'futuro';
  };

  Org.byKind = function (data, kind, opts) {
    opts = opts || {};
    return data.items.filter(function (it) {
      return it.kind === kind && (opts.all || Org.isOpen(it));
    }).sort(Org.compare);
  };

  // Resumen para la vista «Hoy»
  Org.summary = function (data, today) {
    var r = { vencido: [], hoy: [], semana: [], sinfecha: [], counts: {} };
    for (var k in Org.KINDS) r.counts[k] = 0;
    data.items.forEach(function (it) {
      if (it.kind !== 'evento' && !Org.isOpen(it)) return;
      // Cita que se repite: sus repeticiones de hoy y de los próximos 7 días
      if (it.kind === 'evento' && it.repeat) {
        var span = Org.diffDays(Org.itemDate(it), Org.itemEndDate(it));
        var occ = Org.occurrences(it, Org.addDays(today, -span), Org.addDays(today, 7));
        if (occ.length || Org.nextOccurrence(it, Org.addDays(today, -1))) r.counts.evento++;
        occ.forEach(function (d) { var o = Org.occurrence(it, d), ob = Org.bucket(o, today); if (r[ob]) r[ob].push(o); });
        return;
      }
      var b = Org.bucket(it, today);
      if (it.kind === 'trabajo') { r.counts.trabajo++; if (b !== 'sinfecha' && r[b]) r[b].push(it); return; }
      if (it.kind !== 'evento') r.counts[it.kind]++;
      else if (b !== 'pasado') r.counts.evento++;
      if (r[b]) r[b].push(it);
    });
    r.vencido.sort(Org.compare); r.hoy.sort(Org.compare); r.semana.sort(Org.compare);
    r.sinfecha.sort(Org.compare);
    return r;
  };

  // Agenda: día → elementos con fecha en [from, to]. Eventos siempre; el resto solo si están abiertos.
  Org.agenda = function (data, from, to) {
    var days = {};
    data.items.forEach(function (it) {
      if (it.kind === 'trabajo' && !it.due) return;
      if (it.kind !== 'evento' && !Org.isOpen(it)) return;
      var s = Org.itemDate(it); if (!s) return;
      var span = Org.diffDays(s, Org.itemEndDate(it));
      // Lo que se repite aparece cada vez; en las tareas, la actual y las próximas
      var starts = it.repeat ? Org.occurrences(it, Org.addDays(from, -span), to) : [s];
      starts.forEach(function (st) {
        var o = it.repeat ? Org.occurrence(it, st) : it, e = Org.addDays(st, span);
        for (var d = st < from ? from : st, guard = 0; d <= e && d <= to && guard < 400; guard++, d = Org.addDays(d, 1))
          (days[d] = days[d] || []).push(o);
      });
    });
    for (var k in days) days[k].sort(Org.compare);
    return days;
  };

  Org.works = function (data, opts) { return Org.byKind(data, 'trabajo', opts); };
  Org.linked = function (data, workId) {
    return data.items.filter(function (it) { return it.work === workId && it.id !== workId; }).sort(function (a, b) {
      if (Org.isOpen(a) !== Org.isOpen(b)) return Org.isOpen(a) ? -1 : 1;
      return Org.compare(a, b);
    });
  };
  Org.addLog = function (work, text, date) {
    work.log = work.log || [];
    work.log.push({ date: date || Org.today(), text: text });
    work.log.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    return Org.touch(work);
  };
  // ---------- Documentación de los trabajos ----------
  // Enlaces web (se abren) o rutas de ficheros del PC o de la red (el navegador no las abre: se copian)
  Org.cleanDocUrl = function (s) {
    s = (s || '').trim().replace(/^["'<]+|["'>]+$/g, '').trim();
    if (/^(www\.|[a-z0-9-]+\.(es|com|org|net|eu|gob\.es)\b)/i.test(s) && !/\s/.test(s)) s = 'https://' + s;
    return s;
  };
  Org.docKind = function (url) { return /^(https?|mailto):/i.test(url) ? 'web' : 'local'; };
  // Título por defecto: el nombre del fichero o, en una web, el último tramo de la dirección o el dominio
  Org.docTitle = function (url) {
    if (Org.docKind(url) === 'local') return url.replace(/^file:\/+/i, '').split(/[\\/]/).filter(Boolean).pop() || url;
    try {
      var u = new URL(url), last = u.pathname.split('/').filter(Boolean).pop();
      last = last ? decodeURIComponent(last).replace(/\.aspx$/i, '') : '';
      return last && !/^(index|default|_layouts|r|s|f|g|personal)$/i.test(last) && last.length > 2 ? last + ' (' + u.hostname + ')' : u.hostname;
    } catch (e) { return url; }
  };
  Org.addDoc = function (work, url, title) {
    url = Org.cleanDocUrl(url); if (!url) return null;
    var d = { title: (title || '').trim() || Org.docTitle(url), url: url, added: Org.today() };
    (work.docs = work.docs || []).push(d);
    Org.touch(work);
    return d;
  };
  Org.removeDoc = function (work, i) { work.docs.splice(i, 1); return Org.touch(work); };

  Org.remove = function (data, id) {
    data.items = data.items.filter(function (it) { return it.id !== id; });
    data.items.forEach(function (it) { if (it.work === id) { it.work = ''; Org.touch(it); } });
    (data.deleted = data.deleted || {})[id] = new Date().toISOString();
  };

  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  Org.matches = function (it, q) {
    if (!q) return true;
    var hay = norm([it.title, it.notes, it.person, it.place, it.email && it.email.subject, it.email && it.email.from,
      it.email && it.email.fromAddr, (it.log || []).map(function (l) { return l.text; }).join(' '),
      (it.docs || []).map(function (d) { return d.title; }).join(' ')].join(' '));
    return norm(q).split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  };

  return Org;
})(this);

// ---------- Widget de Scriptable: vista rápida del día ----------
// La primera vez, ejecútalo en Scriptable y pega el enlace de organizador.json en OneDrive (se guarda en el
// llavero). También se puede escribir en «Parámetro» al editar el widget, y entonces manda ese.
// Si en vez de un enlace se pone un nombre, se lee el «Marcador de archivo» de Scriptable con ese nombre.

const APP_URL = 'https://saraia02022000.github.io/organizador-trabajo/';
const KEY = 'organizador-url';

// Los mismos colores que la aplicación, en claro y en oscuro
const C = (l, d) => Color.dynamic(new Color(l), new Color(d));
const COL = {
  bg: C('#ffffff', '#1c2028'), ink: C('#1d2330', '#e6e9ef'), muted: C('#677085', '#98a1b3'), soft: C('#eef1f5', '#232833'),
  late: C('#c8312b', '#ff7b72'), now: C('#a96500', '#f0b24a'),
  responder: C('#2f6fdb', '#6b9bf0'), esperar: C('#8a4fd1', '#b48aec'), tarea: C('#d1336b', '#f27aa3'),
  trabajo: C('#c96a14', '#eb9a4f'), evento: C('#2e8a3e', '#6cc47b')
};
const COUNTERS = [['responder', 'Correos'], ['esperar', 'Esperas'], ['tarea', 'Tareas'], ['trabajo', 'Trabajos'], ['evento', 'Agenda']];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Enlace de compartir de OneDrive → descarga directa del fichero
function directUrl(u) {
  u = u.trim();
  if (/1drv\.ms|onedrive\.live\.com/i.test(u)) {
    const b64 = Data.fromString(u).toBase64String().replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    return 'https://api.onedrive.com/v1.0/shares/u!' + b64 + '/root/content';
  }
  if (/sharepoint\.com/i.test(u)) {
    u = u.replace(/([?&])download=[^&]*&?/i, '$1').replace(/[?&]$/, '');
    return u + (u.indexOf('?') >= 0 ? '&' : '?') + 'download=1';
  }
  return u;
}

async function readSource(src) {
  if (!/^https?:\/\//i.test(src)) {
    const fm = FileManager.local();
    if (!fm.bookmarkExists(src)) throw new Error('No hay ningún marcador de archivo llamado «' + src + '».');
    return fm.readString(fm.bookmarkedPath(src));
  }
  const req = new Request(directUrl(src));
  req.timeoutInterval = 20;
  const txt = await req.loadString();
  const code = req.response && req.response.statusCode;
  if (code >= 400) throw new Error('OneDrive ha respondido con un error (' + code + '). Revisa el enlace.');
  if (/^\s*</.test(txt)) throw new Error('El enlace abre una página y no el fichero: compártelo como «Cualquier persona con el vínculo».');
  return txt;
}

// Lee los datos; si falla, usa la última copia buena
async function loadData(src) {
  const fm = FileManager.local(), cache = fm.joinPath(fm.cacheDirectory(), 'organizador-widget.json');
  try {
    const txt = await readSource(src);
    const data = Org.normalize(JSON.parse(txt));
    fm.writeString(cache, txt);
    return { data, fresh: true };
  } catch (e) {
    if (fm.fileExists(cache)) return { data: Org.normalize(JSON.parse(fm.readString(cache))), fresh: false, error: e.message, when: fm.modificationDate(cache) };
    throw e;
  }
}

async function askUrl() {
  const a = new Alert();
  a.title = 'Organizador de trabajo';
  a.message = 'Pega el enlace de organizador.json en OneDrive (o el nombre de un marcador de archivo de Scriptable).';
  a.addTextField('https://…', Keychain.contains(KEY) ? Keychain.get(KEY) : '');
  a.addAction('Guardar');
  a.addCancelAction('Cancelar');
  if ((await a.present()) === -1) return '';
  const u = a.textFieldValue(0).trim();
  if (u) Keychain.set(KEY, u);
  return u;
}

// ---------- Dibujo ----------
function text(stack, s, font, color, lines) {
  const t = stack.addText(s);
  t.font = font; t.textColor = color;
  if (lines) t.lineLimit = lines;
  return t;
}

function header(w, today, small) {
  const h = w.addStack();
  h.centerAlignContent();
  text(h, small ? 'Hoy' : 'Organizador', Font.boldSystemFont(small ? 15 : 14), COL.ink);
  h.addSpacer();
  text(h, cap(Org.fmtDate(today, { weekday: true })), Font.mediumSystemFont(12), COL.muted);
}

function counters(w, sum) {
  const row = w.addStack();
  COUNTERS.forEach(([k, label], i) => {
    if (i) row.addSpacer(5);
    const box = row.addStack();
    box.layoutVertically();
    box.backgroundColor = COL.soft;
    box.cornerRadius = 8;
    box.setPadding(4, 7, 4, 7);
    text(box, String(sum.counts[k]), Font.boldRoundedSystemFont(17), COL[k]);
    text(box, label, Font.mediumSystemFont(9), COL.muted, 1);
  });
  row.addSpacer();
}

function itemRow(w, it, fontSize) {
  const r = w.addStack();
  r.centerAlignContent();
  const bar = r.addStack();
  bar.size = new Size(3, fontSize + 4);
  bar.cornerRadius = 1.5;
  bar.backgroundColor = COL[it.kind];
  r.addSpacer(6);
  const time = Org.itemTime(it);
  if (time) { text(r, time, Font.semiboldMonospacedSystemFont(fontSize - 1), COL.muted); r.addSpacer(5); }
  text(r, it.title || '(sin título)', Font.systemFont(fontSize), COL.ink, 1);
  r.addSpacer();
}

function build(info, family) {
  const today = Org.today(), sum = Org.summary(info.data, today);
  const small = family === 'small', large = family === 'large' || family === 'extraLarge';
  const w = new ListWidget();
  w.backgroundColor = COL.bg;
  w.url = APP_URL;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60000);

  if (family && family.indexOf('accessory') === 0) {
    // Pantalla de bloqueo: una línea con lo de hoy y lo atrasado
    const late = sum.vencido.length;
    text(w, 'Hoy: ' + sum.hoy.length + (late ? ' · ' + late + ' fuera de plazo' : ''), Font.boldSystemFont(13), Color.white(), 1);
    if (family === 'accessoryRectangular') sum.hoy.slice(0, 2).forEach((it) => text(w, (Org.itemTime(it) ? Org.itemTime(it) + ' ' : '') + it.title, Font.systemFont(12), Color.white(), 1));
    return w;
  }

  w.setPadding(12, 14, 12, 14);
  header(w, today, small);
  w.addSpacer(small ? 6 : 8);
  if (!small) { counters(w, sum); w.addSpacer(8); }
  if (sum.vencido.length) {
    text(w, '⚠︎ ' + sum.vencido.length + ' fuera de plazo', Font.semiboldSystemFont(small ? 11 : 12), COL.late);
    w.addSpacer(4);
  }
  if (!small) { text(w, 'HOY', Font.boldSystemFont(10), COL.muted); w.addSpacer(3); }
  const max = small ? (sum.vencido.length ? 3 : 4) : large ? 11 : (sum.vencido.length ? 2 : 3);
  const fs = small ? 11 : 12;
  if (!sum.hoy.length) text(w, 'Nada para hoy', Font.systemFont(fs), COL.muted);
  sum.hoy.slice(0, max).forEach((it, i) => { if (i) w.addSpacer(3); itemRow(w, it, fs); });
  if (sum.hoy.length > max) { w.addSpacer(2); text(w, 'y ' + (sum.hoy.length - max) + ' más', Font.systemFont(10), COL.muted); }
  if (large && sum.semana.length) {
    w.addSpacer(8);
    text(w, 'PRÓXIMOS DÍAS', Font.boldSystemFont(10), COL.muted);
    w.addSpacer(3);
    sum.semana.slice(0, 4).forEach((it, i) => {
      if (i) w.addSpacer(3);
      const r = w.addStack(); r.centerAlignContent();
      text(r, cap(Org.fmtDate(Org.itemDate(it), { weekday: true })).padEnd(10), Font.mediumMonospacedSystemFont(10), COL.muted);
      r.addSpacer(4);
      itemRow(r, it, 11);
    });
  }
  w.addSpacer();
  if (!info.fresh) {
    const hh = info.when ? ' de las ' + info.when.toTimeString().slice(0, 5) : '';
    text(w, 'Sin actualizar · datos' + hh, Font.systemFont(9), COL.now, 1);
  }
  return w;
}

function message(msg) {
  const w = new ListWidget();
  w.backgroundColor = COL.bg;
  w.setPadding(12, 14, 12, 14);
  w.url = APP_URL;
  text(w, 'Organizador', Font.boldSystemFont(14), COL.ink);
  w.addSpacer(6);
  text(w, msg, Font.systemFont(12), COL.muted);
  return w;
}

// ---------- Inicio ----------
async function main() {
  const family = config.widgetFamily;
  let src = (args.widgetParameter || '').trim();
  let preview = 'medium';
  if (!config.runsInWidget) {
    // En la app: elegir vista previa o cambiar el enlace
    if (!Keychain.contains(KEY) && !src) src = await askUrl();
    else {
      const a = new Alert();
      a.title = 'Organizador de trabajo';
      a.addAction('Vista previa mediana');
      a.addAction('Vista previa grande');
      a.addAction('Vista previa pequeña');
      a.addAction('Cambiar el enlace');
      a.addCancelAction('Cerrar');
      const i = await a.present();
      if (i === -1) return;
      if (i === 3) { src = await askUrl(); if (!src) return; }
      preview = ['medium', 'large', 'small', 'medium'][i];
    }
  }
  if (!src && Keychain.contains(KEY)) src = Keychain.get(KEY);
  let w;
  if (!src) w = message('Abre este script en Scriptable para poner el enlace de organizador.json.');
  else {
    try { w = build(await loadData(src), config.runsInWidget ? family : preview); }
    catch (e) { w = message(e.message); }
  }
  if (config.runsInWidget) Script.setWidget(w);
  else if (preview === 'large') await w.presentLarge();
  else if (preview === 'small') await w.presentSmall();
  else await w.presentMedium();
}

await main();
Script.complete();
