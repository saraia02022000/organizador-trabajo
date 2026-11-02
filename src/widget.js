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
    if (!fm.bookmarkExists(src)) throw new Error('No hay ningún marcador de archivo llamado «' + src + '» (Scriptable → Ajustes → Marcadores de archivo).');
    const p = fm.bookmarkedPath(src);
    // Si iOS solo tiene el fichero «en la nube», se pide que lo descargue (si no se puede, se intenta leer igual)
    try { await fm.downloadFileFromiCloud(p); } catch (e) { /* no es de iCloud */ }
    const txt = fm.readString(p);
    if (!txt) throw new Error('No se ha podido leer el fichero del marcador «' + src + '». Ábrelo una vez en la app Archivos para que se descargue.');
    return txt;
  }
  const req = new Request(directUrl(src));
  req.timeoutInterval = 20;
  const txt = await req.loadString();
  const code = req.response && req.response.statusCode;
  if (code === 401 || code === 403) throw new Error('OneDrive pide iniciar sesión (' + code + '): el enlace no es de acceso libre. Usa un marcador de archivo de Scriptable en lugar del enlace.');
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
