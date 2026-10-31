/* Núcleo del organizador (sin DOM): modelo de datos, fechas, resúmenes y lectura de correos.
   Global `Org` en el navegador; módulo CommonJS en Node (pruebas). */
(function (root) {
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
    return { app: 'organizador-trabajo', version: 1, updated: new Date().toISOString(), items: [] };
  };
  var DEFAULTS = {
    title: '', notes: '', status: 'abierto', priority: 'normal', due: '', person: '', work: '',
    email: null, since: '', evType: 'reunion', start: '', end: '', place: '', log: null, doneAt: ''
  };
  Org.makeItem = function (kind, fields) {
    if (!Org.KINDS[kind]) throw new Error('Tipo desconocido: ' + kind);
    var now = new Date().toISOString();
    var it = { id: Org.newId(), kind: kind, created: now, updated: now };
    for (var k in DEFAULTS) it[k] = DEFAULTS[k];
    if (kind === 'trabajo') it.log = [];
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
      return it;
    });
    data.app = 'organizador-trabajo';
    data.version = data.version || 1;
    return data;
  };
  Org.touch = function (it) { it.updated = new Date().toISOString(); return it; };
  Org.setDone = function (it, done) {
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
      var e = Org.itemEndDate(it);
      var d = s < from ? from : s;
      for (var guard = 0; d <= e && d <= to && guard < 400; guard++) {
        (days[d] = days[d] || []).push(it);
        d = Org.addDays(d, 1);
      }
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
  Org.remove = function (data, id) {
    data.items = data.items.filter(function (it) { return it.id !== id; });
    data.items.forEach(function (it) { if (it.work === id) it.work = ''; });
  };

  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  Org.matches = function (it, q) {
    if (!q) return true;
    var hay = norm([it.title, it.notes, it.person, it.place, it.email && it.email.subject, it.email && it.email.from,
      it.email && it.email.fromAddr, (it.log || []).map(function (l) { return l.text; }).join(' ')].join(' '));
    return norm(q).split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  };

  // ---------- Correos ----------
  function latin1(bytes, from, to) {
    var s = '', CH = 8192;
    for (var i = from || 0, end = to === undefined ? bytes.length : to; i < end; i += CH)
      s += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CH, end)));
    return s;
  }
  function strToBytes(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255; return b; }
  function decodeBytes(bytes, charset) {
    charset = (charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
    if (charset === 'us-ascii' || charset === 'ascii') charset = 'utf-8';
    try { return new TextDecoder(charset).decode(bytes); }
    catch (e) { try { return new TextDecoder('windows-1252').decode(bytes); } catch (e2) { return latin1(bytes); } }
  }
  function qpDecode(s, header) {
    if (header) s = s.replace(/_/g, ' ');
    s = s.replace(/=\r?\n/g, '');
    return s.replace(/=([0-9A-Fa-f]{2})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
  }
  function b64Decode(s) {
    s = s.replace(/[^A-Za-z0-9+/]/g, '');
    if (s.length % 4 === 1) s = s.slice(0, -1);
    while (s.length % 4) s += '=';
    if (typeof atob === 'function') return atob(s);
    return Buffer.from(s, 'base64').toString('latin1');
  }
  // Palabras codificadas de las cabeceras (=?utf-8?B?…?=)
  Org.decodeWords = function (s) {
    s = (s || '').replace(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)\s+(?==\?)/g, '$1');
    var out = s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, function (m, cs, enc, txt) {
      var bin = enc.toUpperCase() === 'B' ? b64Decode(txt) : qpDecode(txt, true);
      return decodeBytes(strToBytes(bin), cs.split('*')[0]);
    });
    // Cabeceras con 8 bits sin codificar: suelen venir en UTF-8
    if (/[\x80-\xff]/.test(out) && !/[^\x00-\xff]/.test(out)) {
      var u = decodeBytes(strToBytes(out), 'utf-8');
      if (u.indexOf('�') < 0) out = u;
    }
    return out;
  };
  function parseHeaders(text) {
    var h = {};
    text.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':'); if (i <= 0) return;
      var k = line.slice(0, i).trim().toLowerCase();
      if (h[k] === undefined) h[k] = line.slice(i + 1).trim();
    });
    return h;
  }
  function param(value, name) {
    var m = new RegExp(name + '\\s*=\\s*("([^"]*)"|[^;\\s]+)', 'i').exec(value || '');
    return m ? (m[2] !== undefined ? m[2] : m[1]) : '';
  }
  Org.parseAddress = function (s) {
    s = Org.decodeWords(s || '').trim();
    var m = /^(.*?)\s*<([^>]+)>/.exec(s);
    if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), addr: m[2].trim() };
    if (s.indexOf('@') >= 0) return { name: '', addr: s.replace(/^<|>$/g, '') };
    return { name: s, addr: '' };
  };
  function htmlToText(h) {
    return h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); });
  }
  // Reúne las partes de texto de un mensaje MIME (texto plano, HTML y calendario), ya decodificadas
  function mimeParts(headers, body, depth, out) {
    var ct = headers['content-type'] || 'text/plain';
    if (/^multipart\//i.test(ct) && depth < 6) {
      var b = param(ct, 'boundary'); if (!b) return out;
      var parts = body.split(new RegExp('\\r?\\n?--' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:--)?[ \\t]*\\r?\\n?'));
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i]; var sep = /\r?\n\r?\n/.exec(p); if (!sep) continue;
        var ph = parseHeaders(p.slice(0, sep.index));
        if (!ph['content-type'] && !ph['content-transfer-encoding']) continue;
        ph.attachment = /attachment/i.test(ph['content-disposition'] || '');
        mimeParts(ph, p.slice(sep.index + sep[0].length), depth + 1, out);
      }
      return out;
    }
    var type = /^text\/plain/i.test(ct) ? 'plain' : /^text\/html/i.test(ct) ? 'html' : /^(text\/calendar|application\/ics)/i.test(ct) ? 'calendar' : '';
    if (!type || (headers.attachment && type !== 'calendar')) return out;
    var enc = (headers['content-transfer-encoding'] || '').toLowerCase();
    var bin = enc === 'base64' ? b64Decode(body) : enc === 'quoted-printable' ? qpDecode(body) : body;
    var txt = decodeBytes(strToBytes(bin), param(ct, 'charset') || 'utf-8');
    if (!out[type]) out[type] = type === 'html' ? htmlToText(txt) : txt;
    return out;
  }
  function snippet(t) { return (t || '').replace(/\s+/g, ' ').trim().slice(0, 400); }

  // Correo en formato .eml (RFC 822). Acepta texto o bytes.
  Org.parseEml = function (input) {
    var raw = typeof input === 'string' ? input : latin1(input);
    var sep = /\r?\n\r?\n/.exec(raw);
    var hText = sep ? raw.slice(0, sep.index) : raw, body = sep ? raw.slice(sep.index + sep[0].length) : '';
    var h = parseHeaders(hText);
    if (!h.from && !h.subject && !h.date) throw new Error('No parece un correo electrónico.');
    var from = Org.parseAddress(h.from);
    var d = h.date ? new Date(h.date.replace(/\s*\([^)]*\)\s*$/, '')) : null;
    var parts = mimeParts(h, body, 0, {});
    var r = {
      subject: Org.decodeWords(h.subject || '').trim(), from: from.name, fromAddr: from.addr,
      to: Org.decodeWords(h.to || '').trim(), date: d && !isNaN(d) ? d.toISOString() : '',
      snippet: snippet(parts.plain || parts.html)
    };
    // Convocatoria: lleva la cita en una parte text/calendar
    if (parts.calendar) { try { var ics = Org.parseIcs(parts.calendar); r.event = ics.event; if (!r.subject) r.subject = ics.subject; } catch (e) {} }
    return r;
  };

  // ---------- Citas ----------
  function stamp(d) { return Org.ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // Cita en el formato de la agenda: inicio y fin locales; si es de todo el día, solo fechas y fin inclusivo
  function eventTimes(start, end, allDay) {
    if (allDay) {
      var s = Org.ymd(start), e = end ? Org.ymd(new Date(end.getTime() - 1)) : '';
      return { start: s, end: e > s ? e : '', allDay: true };
    }
    var st = stamp(start), en = end ? stamp(end) : '';
    return { start: st, end: en > st ? en : '', allDay: false };
  }
  // Fecha iCalendar: 20261105, 20261105T100000 (hora local) o 20261105T100000Z (UTC)
  function icsDate(v) {
    var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec((v || '').trim());
    if (!m) return null;
    if (!m[4]) return { date: new Date(+m[1], +m[2] - 1, +m[3]), allDay: true };
    if (m[7]) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0))), allDay: false };
    return { date: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), allDay: false };
  }
  // Fichero .ics (o parte text/calendar): se toma el primer VEVENT.
  // Las horas con TZID se toman como hora local (lo normal es que sea la misma zona).
  Org.parseIcs = function (input) {
    var text = typeof input === 'string' ? input : decodeBytes(input, 'utf-8');
    text = text.replace(/\r?\n[ \t]/g, '');
    var m = /BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/.exec(text);
    if (!m) throw new Error('No contiene ninguna cita.');
    var p = {};
    m[1].split(/\r?\n/).forEach(function (line) {
      var mm = /^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/.exec(line); if (!mm) return;
      var k = mm[1].toUpperCase(); if (p[k]) return;
      p[k] = { params: mm[2], value: mm[3] };
    });
    function txt(k) { return p[k] ? p[k].value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim() : ''; }
    var s = p.DTSTART && icsDate(p.DTSTART.value);
    if (!s) throw new Error('La cita no tiene fecha de inicio.');
    var e = p.DTEND && icsDate(p.DTEND.value);
    if (!e && p.DURATION) {
      var dm = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(p.DURATION.value);
      if (dm) e = { date: new Date(s.date.getTime() + ((+dm[1] || 0) * 7 * 86400 + (+dm[2] || 0) * 86400 + (+dm[3] || 0) * 3600 + (+dm[4] || 0) * 60) * 1000) };
    }
    if (!e && s.allDay) e = { date: new Date(s.date.getTime() + 86400000) };
    var cn = p.ORGANIZER && (/CN="?([^";:]*)"?/i.exec(p.ORGANIZER.params) || [])[1];
    return {
      subject: txt('SUMMARY'), from: (cn || '').trim(), fromAddr: p.ORGANIZER ? p.ORGANIZER.value.replace(/^mailto:/i, '').trim() : '', to: '', date: '',
      snippet: snippet(txt('DESCRIPTION')), event: Object.assign(eventTimes(s.date, e && e.date, s.allDay), { place: txt('LOCATION') })
    };
  };

  // ---------- Ficheros .msg de Outlook (Compound File Binary) ----------
  var ENDCHAIN = 0xFFFFFFFE, FREESECT = 0xFFFFFFFF;
  Org.readCFB = function (bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 512 || dv.getUint32(0, true) !== 0xE011CFD0 || dv.getUint32(4, true) !== 0xE11AB1A1)
      throw new Error('No es un fichero .msg de Outlook.');
    var ss = 1 << dv.getUint16(30, true), mss = 1 << dv.getUint16(32, true);
    var nFat = dv.getUint32(44, true), dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
    var miniFatStart = dv.getUint32(60, true), difStart = dv.getUint32(68, true);
    function off(sec) { return (sec + 1) * ss; }
    // Sectores de la FAT: 109 en la cabecera y el resto en la cadena DIFAT
    var fatSecs = [];
    for (var i = 0; i < 109 && fatSecs.length < nFat; i++) {
      var s = dv.getUint32(76 + i * 4, true); if (s !== FREESECT) fatSecs.push(s);
    }
    for (var dsec = difStart, g = 0; dsec < ENDCHAIN && fatSecs.length < nFat && g < 100000; g++) {
      for (var j = 0; j < ss / 4 - 1 && fatSecs.length < nFat; j++) {
        var v = dv.getUint32(off(dsec) + j * 4, true); if (v !== FREESECT) fatSecs.push(v);
      }
      dsec = dv.getUint32(off(dsec) + ss - 4, true);
    }
    var fat = [];
    fatSecs.forEach(function (fs) { for (var k = 0; k < ss / 4; k++) fat.push(dv.getUint32(off(fs) + k * 4, true)); });
    function chain(start, table) {
      var out = [], seen = {};
      for (var c = start; c < ENDCHAIN && c < table.length && !seen[c]; c = table[c]) { seen[c] = 1; out.push(c); }
      return out;
    }
    function readChain(start, size) {
      var secs = chain(start, fat), out = new Uint8Array(secs.length * ss);
      secs.forEach(function (sc, n) { out.set(bytes.subarray(off(sc), off(sc) + ss), n * ss); });
      return size === undefined ? out : out.subarray(0, size);
    }
    var dirBytes = readChain(dirStart), entries = [];
    var ddv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    for (var e = 0; e + 128 <= dirBytes.length; e += 128) {
      var nl = ddv.getUint16(e + 64, true), name = '';
      for (var c = 0; c + 2 < nl && c < 64; c += 2) name += String.fromCharCode(ddv.getUint16(e + c, true));
      entries.push({
        name: name, type: dirBytes[e + 66], left: ddv.getUint32(e + 68, true), right: ddv.getUint32(e + 72, true),
        child: ddv.getUint32(e + 76, true), start: ddv.getUint32(e + 116, true), size: ddv.getUint32(e + 120, true)
      });
    }
    var rootE = entries[0];
    var miniFat = [];
    if (miniFatStart < ENDCHAIN) {
      var mf = readChain(miniFatStart), mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
      for (var q = 0; q + 4 <= mf.length; q += 4) miniFat.push(mdv.getUint32(q, true));
    }
    var miniStream = rootE && rootE.start < ENDCHAIN ? readChain(rootE.start, rootE.size) : new Uint8Array(0);
    function streamData(en) {
      if (en.size < cutoff) {
        var secs = chain(en.start, miniFat), out = new Uint8Array(secs.length * mss);
        secs.forEach(function (sc, n) { out.set(miniStream.subarray(sc * mss, sc * mss + mss), n * mss); });
        return out.subarray(0, en.size);
      }
      return readChain(en.start, en.size);
    }
    function children(idx) {
      var out = [], stack = [entries[idx].child], seen = {};
      while (stack.length) {
        var n = stack.pop();
        if (n === FREESECT || n >= entries.length || seen[n]) continue;
        seen[n] = 1; out.push(entries[n]); stack.push(entries[n].left, entries[n].right);
      }
      return out;
    }
    // Flujos del primer nivel (las propiedades del mensaje) y los de la tabla de propiedades con nombre
    var streams = {};
    children(0).forEach(function (en) {
      if (en.type === 2) streams[en.name] = function () { return streamData(en); };
      else if (en.type === 1 && en.name === '__nameid_version1.0') {
        children(entries.indexOf(en)).forEach(function (sub) {
          if (sub.type === 2) streams['nameid/' + sub.name] = function () { return streamData(sub); };
        });
      }
    });
    return streams;
  };

  function hex4(n) { return ('000' + n.toString(16).toUpperCase()).slice(-4); }
  var PSETID_APPOINTMENT = '0220060000000000c000000000000046';

  Org.parseMsg = function (bytes) {
    var st = Org.readCFB(bytes);
    function str(id) {
      if (id === null) return '';
      if (typeof id === 'number') id = hex4(id);
      var u = st['__substg1.0_' + id + '001F'];
      if (u) { var b = u(); return decodeBytes(b, 'utf-16le').replace(/\0+$/, ''); }
      var a = st['__substg1.0_' + id + '001E'];
      if (a) return decodeBytes(a(), 'windows-1252').replace(/\0+$/, '');
      return '';
    }
    // Valor de una propiedad de longitud fija (flujo de propiedades: cabecera de 32 bytes y entradas de 16)
    var props = st['__properties_version1.0'] ? st['__properties_version1.0']() : new Uint8Array(0);
    var pdv = new DataView(props.buffer, props.byteOffset, props.byteLength);
    function fixed(id, type) {
      if (id === null) return -1;
      for (var o = 32; o + 16 <= props.length; o += 16) {
        var tag = pdv.getUint32(o, true);
        if ((tag >>> 16) === id && (tag & 0xFFFF) === type) return o + 8;
      }
      return -1;
    }
    function time(id) {
      var o = fixed(id, 0x0040); if (o < 0) return '';
      var ms = (pdv.getUint32(o + 4, true) * 4294967296 + pdv.getUint32(o, true)) / 10000 - 11644473600000;
      return ms > 0 ? new Date(ms).toISOString() : '';
    }
    function bool(id) { var o = fixed(id, 0x000B); return o >= 0 && props[o] !== 0; }
    // Identificador real (0x8000 + n) de una propiedad con nombre del conjunto de citas
    function named(lid) {
      var ents = st['nameid/__substg1.0_00030102'], gs = st['nameid/__substg1.0_00020102'];
      if (!ents) return null;
      var e = ents(), g = gs ? gs() : new Uint8Array(0), edv = new DataView(e.buffer, e.byteOffset, e.byteLength);
      for (var o = 0; o + 8 <= e.length; o += 8) {
        var kindIdx = edv.getUint16(o + 4, true), gi = kindIdx >> 1;
        if ((kindIdx & 1) || edv.getUint32(o, true) !== lid || gi < 3) continue;
        var guid = Array.prototype.map.call(g.subarray((gi - 3) * 16, (gi - 2) * 16), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        if (guid === PSETID_APPOINTMENT) return 0x8000 + edv.getUint16(o + 6, true);
      }
      return null;
    }
    var addr = [str('5D01'), str('0C1F'), str('0065')].filter(function (a) { return a.indexOf('@') > 0; })[0] || '';
    var subject = str('0037');
    var name = str('0C1A') || str('0042');
    var body = str('1000');
    if (!subject && !name && !body) throw new Error('No se ha podido leer el correo.');
    var r = {
      subject: subject.trim(), from: name.trim(), fromAddr: addr.trim(), to: str('0E04').trim(),
      date: time(0x0039) || time(0x0E06), snippet: snippet(body)
    };
    // Cita del calendario o convocatoria de reunión
    if (/^IPM\.(Appointment|Schedule\.Meeting\.Request)/i.test(str('001A'))) {
      var s = time(named(0x820D)) || time(0x0060), e = time(named(0x820E)) || time(0x0061);
      if (s) r.event = Object.assign(eventTimes(new Date(s), e ? new Date(e) : null, bool(named(0x8215))), { place: str(named(0x8208)).trim() });
    }
    return r;
  };

  // Elige el lector por el contenido
  Org.parseEmailFile = function (name, bytes) {
    if (bytes.length >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) return Org.parseMsg(bytes);
    if (/\.msg$/i.test(name || '')) throw new Error('El fichero .msg está dañado o no es de Outlook.');
    if (/\.ics$/i.test(name || '') || /^(\xEF\xBB\xBF)?\s*BEGIN:VCALENDAR/.test(latin1(bytes, 0, Math.min(bytes.length, 200)))) return Org.parseIcs(bytes);
    return Org.parseEml(bytes);
  };

  // Campos de un nuevo elemento a partir de un correo
  Org.fromEmail = function (email, kind) {
    var f = { title: email.subject || '(sin asunto)', person: email.from || email.fromAddr, email: email };
    if (kind === 'esperar') f.since = email.date ? Org.ymd(new Date(email.date)) : Org.today();
    return f;
  };
  // Campos de una cita de la agenda a partir de una cita de Outlook o de un .ics
  Org.fromEvent = function (msg) {
    var ev = msg.event;
    return {
      kind: 'evento', title: msg.subject || '(sin título)', start: ev.start, end: ev.end, place: ev.place || '',
      evType: /curso|formaci[oó]n|jornada|seminario|taller/i.test(msg.subject || '') ? 'curso' : 'reunion',
      email: msg.from || msg.fromAddr || msg.snippet ? msg : null
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Org;
  else root.Org = Org;
})(this);
