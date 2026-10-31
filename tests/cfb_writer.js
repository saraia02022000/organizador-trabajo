// Escritor mínimo de Compound File Binary (v3, sectores de 512 bytes) para fabricar .msg de prueba.
// Todos los flujos van al mini stream (deben medir menos de 4096 bytes).
// Un nombre «almacen/flujo» crea el flujo dentro de un almacenamiento de primer nivel.
'use strict';

function writeCFB(streams) {
  const SS = 512, MSS = 64, END = 0xFFFFFFFE, FREE = 0xFFFFFFFF, FATSECT = 0xFFFFFFFD;
  // Mini stream y mini FAT
  const miniFat = [];
  const parts = [];
  let miniLen = 0;
  const files = streams.map(s => {
    if (s.data.length >= 4096) throw new Error('flujo demasiado grande para la prueba');
    const n = Math.max(1, Math.ceil(s.data.length / MSS));
    const start = miniFat.length;
    for (let i = 0; i < n; i++) miniFat.push(i === n - 1 ? END : start + i + 1);
    const padded = Buffer.alloc(n * MSS); Buffer.from(s.data).copy(padded);
    parts.push(padded); miniLen += padded.length;
    const slash = s.name.indexOf('/');
    return { parent: slash > 0 ? s.name.slice(0, slash) : '', name: slash > 0 ? s.name.slice(slash + 1) : s.name, start, size: s.data.length };
  });
  const mini = Buffer.concat(parts);

  // Directorio: raíz, almacenamientos y flujos; los hermanos de cada nivel forman una cadena por la derecha
  const all = [{ name: 'Root Entry', type: 5, start: 0, size: miniLen }];
  const levels = { '': [] };
  files.filter(f => !f.parent).forEach(f => levels[''].push(all.push({ name: f.name, type: 2, start: f.start, size: f.size }) - 1));
  [...new Set(files.filter(f => f.parent).map(f => f.parent))].forEach(p => {
    const idx = all.push({ name: p, type: 1, start: 0, size: 0 }) - 1;
    levels[''].push(idx); levels[idx] = [];
    files.filter(f => f.parent === p).forEach(f => levels[idx].push(all.push({ name: f.name, type: 2, start: f.start, size: f.size }) - 1));
  });
  Object.keys(levels).forEach(k => {
    const owner = k === '' ? 0 : +k, kids = levels[k];
    all[owner].child = kids.length ? kids[0] : FREE;
    kids.forEach((c, i) => { all[c].right = i + 1 < kids.length ? kids[i + 1] : FREE; });
  });

  const nDir = Math.ceil(all.length / 4);
  const nMiniFat = Math.max(1, Math.ceil(miniFat.length / 128));
  const nMini = Math.max(1, Math.ceil(miniLen / SS));
  const total = 1 + nDir + nMiniFat + nMini;
  if (total > 128) throw new Error('demasiados sectores para la prueba');
  const dirStart = 1, mfStart = dirStart + nDir, msStart = mfStart + nMiniFat;
  all[0].start = msStart;
  const fat = new Array(128).fill(FREE);
  fat[0] = FATSECT;
  const run = (s, n) => { for (let i = 0; i < n; i++) fat[s + i] = i === n - 1 ? END : s + i + 1; };
  run(dirStart, nDir); run(mfStart, nMiniFat); run(msStart, nMini);

  const out = Buffer.alloc(SS * (1 + total));
  // Cabecera
  out.writeUInt32LE(0xE011CFD0, 0); out.writeUInt32LE(0xE11AB1A1, 4);
  out.writeUInt16LE(0x3E, 24); out.writeUInt16LE(3, 26); out.writeUInt16LE(0xFFFE, 28);
  out.writeUInt16LE(9, 30); out.writeUInt16LE(6, 32);
  out.writeUInt32LE(1, 44); out.writeUInt32LE(dirStart, 48); out.writeUInt32LE(4096, 56);
  out.writeUInt32LE(mfStart, 60); out.writeUInt32LE(nMiniFat, 64);
  out.writeUInt32LE(END, 68); out.writeUInt32LE(0, 72);
  for (let i = 0; i < 109; i++) out.writeUInt32LE(i === 0 ? 0 : FREE, 76 + i * 4);
  const sec = n => SS * (n + 1);
  fat.forEach((v, i) => out.writeUInt32LE(v >>> 0, sec(0) + i * 4));
  const dirBuf = Buffer.alloc(nDir * SS);
  for (let i = 0; i < nDir * 4; i++) {
    const o = i * 128, e = all[i];
    dirBuf.writeUInt32LE(FREE, o + 68); dirBuf.writeUInt32LE(FREE, o + 72); dirBuf.writeUInt32LE(FREE, o + 76);
    if (!e) continue;
    dirBuf.write(e.name, o, 'utf16le'); dirBuf.writeUInt16LE((e.name.length + 1) * 2, o + 64);
    dirBuf[o + 66] = e.type; dirBuf[o + 67] = 1;
    if (e.right !== undefined) dirBuf.writeUInt32LE(e.right >>> 0, o + 72);
    if (e.child !== undefined) dirBuf.writeUInt32LE(e.child >>> 0, o + 76);
    dirBuf.writeUInt32LE(e.start >>> 0, o + 116); dirBuf.writeUInt32LE(e.size, o + 120);
  }
  dirBuf.copy(out, sec(dirStart));
  const mfBuf = Buffer.alloc(nMiniFat * SS, 0xFF);
  miniFat.forEach((v, i) => mfBuf.writeUInt32LE(v >>> 0, i * 4));
  mfBuf.copy(out, sec(mfStart));
  mini.copy(out, sec(msStart));
  return new Uint8Array(out);
}

const filetime = d => BigInt(d.getTime() + 11644473600000) * 10000n;
// GUID en el orden de bytes de los .msg
function guidBytes(g) {
  const h = g.replace(/[{}-]/g, '');
  const b = Buffer.from(h, 'hex');
  return Buffer.concat([Buffer.from(b.subarray(0, 4)).reverse(), Buffer.from(b.subarray(4, 6)).reverse(), Buffer.from(b.subarray(6, 8)).reverse(), b.subarray(8)]);
}

// .msg con las propiedades más habituales. Con `appointment` se fabrica una cita del calendario:
// { start, end, allDay, location, messageClass, std } (std: usar solo PidTagStartDate/EndDate)
function makeMsg({ subject, senderName, senderSmtp, to, body, date, appointment }) {
  const u = s => Buffer.from(s + '\0', 'utf16le');
  const streams = [];
  const fixed = []; // [id, type, Buffer de 8 bytes]
  const ft = d => { const b = Buffer.alloc(8); b.writeBigUInt64LE(filetime(d)); return b; };
  if (subject !== undefined) streams.push({ name: '__substg1.0_0037001F', data: u(subject) });
  if (senderName !== undefined) streams.push({ name: '__substg1.0_0C1A001F', data: u(senderName) });
  if (senderSmtp !== undefined) streams.push({ name: '__substg1.0_5D01001F', data: u(senderSmtp) });
  streams.push({ name: '__substg1.0_0C1F001F', data: u('/O=EXCHANGELABS/OU=EXCHANGE ADMINISTRATIVE GROUP/CN=RECIPIENTS/CN=X') });
  if (to !== undefined) streams.push({ name: '__substg1.0_0E04001F', data: u(to) });
  if (body !== undefined) streams.push({ name: '__substg1.0_1000001F', data: u(body) });
  if (date) fixed.push([0x0039, 0x0040, ft(date)]);
  const a = appointment;
  if (a) {
    streams.push({ name: '__substg1.0_001A001F', data: u(a.messageClass || 'IPM.Appointment') });
    if (a.std) {
      fixed.push([0x0060, 0x0040, ft(a.start)]);
      if (a.end) fixed.push([0x0061, 0x0040, ft(a.end)]);
    } else {
      // Tabla de propiedades con nombre: PSETID_Common primero (con un LID señuelo) y PSETID_Appointment después
      const guids = Buffer.concat([guidBytes('{00062008-0000-0000-C000-000000000046}'), guidBytes('{00062002-0000-0000-C000-000000000046}')]);
      const ent = (lid, guidIdx, propIdx) => { const b = Buffer.alloc(8); b.writeUInt32LE(lid); b.writeUInt16LE(guidIdx << 1, 4); b.writeUInt16LE(propIdx, 6); return b; };
      const entries = Buffer.concat([ent(0x820D, 3, 0), ent(0x820D, 4, 1), ent(0x820E, 4, 2), ent(0x8215, 4, 3), ent(0x8208, 4, 4)]);
      streams.push({ name: '__nameid_version1.0/__substg1.0_00020102', data: guids });
      streams.push({ name: '__nameid_version1.0/__substg1.0_00030102', data: entries });
      streams.push({ name: '__nameid_version1.0/__substg1.0_00040102', data: Buffer.alloc(0) });
      fixed.push([0x8000, 0x0040, ft(new Date('2001-01-01T00:00:00Z'))]); // el señuelo
      fixed.push([0x8001, 0x0040, ft(a.start)]);
      if (a.end) fixed.push([0x8002, 0x0040, ft(a.end)]);
      const bl = Buffer.alloc(8); bl[0] = a.allDay ? 1 : 0; fixed.push([0x8003, 0x000B, bl]);
      if (a.location) streams.push({ name: '__substg1.0_8004001F', data: u(a.location) });
    }
  }
  const props = Buffer.alloc(32 + 16 * fixed.length);
  fixed.forEach(([id, type, val], i) => {
    props.writeUInt32LE(((id << 16) | type) >>> 0, 32 + i * 16);
    props.writeUInt32LE(6, 36 + i * 16);
    val.copy(props, 40 + i * 16);
  });
  streams.push({ name: '__properties_version1.0', data: props });
  return writeCFB(streams);
}

module.exports = { writeCFB, makeMsg };
