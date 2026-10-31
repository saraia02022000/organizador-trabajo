// Escritor mínimo de Compound File Binary (v3, sectores de 512 bytes) para fabricar .msg de prueba.
// Todos los flujos van al mini stream (deben medir menos de 4096 bytes).
'use strict';

function writeCFB(streams) {
  const SS = 512, MSS = 64, END = 0xFFFFFFFE, FREE = 0xFFFFFFFF, FATSECT = 0xFFFFFFFD;
  // Mini stream y mini FAT
  const miniFat = [];
  const parts = [];
  let miniLen = 0;
  const entries = streams.map(s => {
    if (s.data.length >= 4096) throw new Error('flujo demasiado grande para la prueba');
    const n = Math.max(1, Math.ceil(s.data.length / MSS));
    const start = miniFat.length;
    for (let i = 0; i < n; i++) miniFat.push(i === n - 1 ? END : start + i + 1);
    const padded = Buffer.alloc(n * MSS); Buffer.from(s.data).copy(padded);
    parts.push(padded); miniLen += padded.length;
    return { name: s.name, start, size: s.data.length };
  });
  const mini = Buffer.concat(parts);
  const nDir = Math.ceil((entries.length + 1) / 4);
  const nMiniFat = Math.max(1, Math.ceil(miniFat.length / 128));
  const nMini = Math.max(1, Math.ceil(miniLen / SS));
  const total = 1 + nDir + nMiniFat + nMini;
  if (total > 128) throw new Error('demasiados sectores para la prueba');
  const dirStart = 1, mfStart = dirStart + nDir, msStart = mfStart + nMiniFat;
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
  // Directorio: raíz y una cadena de hermanos derechos
  const all = [{ name: 'Root Entry', type: 5, start: msStart, size: miniLen, child: 1 }]
    .concat(entries.map((e, i) => ({ name: e.name, type: 2, start: e.start, size: e.size, right: i + 1 < entries.length ? i + 2 : FREE })));
  const dirBuf = Buffer.alloc(nDir * SS);
  for (let i = 0; i < nDir * 4; i++) {
    const o = i * 128, e = all[i];
    dirBuf.writeUInt32LE(FREE, o + 68); dirBuf.writeUInt32LE(FREE, o + 72); dirBuf.writeUInt32LE(FREE, o + 76);
    if (!e) continue;
    dirBuf.write(e.name, o, 'utf16le'); dirBuf.writeUInt16LE((e.name.length + 1) * 2, o + 64);
    dirBuf[o + 66] = e.type; dirBuf[o + 67] = 1;
    if (e.right !== undefined) dirBuf.writeUInt32LE(e.right >>> 0, o + 72);
    if (e.child !== undefined) dirBuf.writeUInt32LE(e.child, o + 76);
    dirBuf.writeUInt32LE(e.start >>> 0, o + 116); dirBuf.writeUInt32LE(e.size, o + 120);
  }
  dirBuf.copy(out, sec(dirStart));
  const mfBuf = Buffer.alloc(nMiniFat * SS, 0xFF);
  miniFat.forEach((v, i) => mfBuf.writeUInt32LE(v >>> 0, i * 4));
  mfBuf.copy(out, sec(mfStart));
  mini.copy(out, sec(msStart));
  return new Uint8Array(out);
}

// .msg con las propiedades más habituales
function makeMsg({ subject, senderName, senderSmtp, to, body, date }) {
  const u = s => Buffer.from(s + '\0', 'utf16le');
  const streams = [];
  if (subject !== undefined) streams.push({ name: '__substg1.0_0037001F', data: u(subject) });
  if (senderName !== undefined) streams.push({ name: '__substg1.0_0C1A001F', data: u(senderName) });
  if (senderSmtp !== undefined) streams.push({ name: '__substg1.0_5D01001F', data: u(senderSmtp) });
  streams.push({ name: '__substg1.0_0C1F001F', data: u('/O=EXCHANGELABS/OU=EXCHANGE ADMINISTRATIVE GROUP/CN=RECIPIENTS/CN=X') });
  if (to !== undefined) streams.push({ name: '__substg1.0_0E04001F', data: u(to) });
  if (body !== undefined) streams.push({ name: '__substg1.0_1000001F', data: u(body) });
  const props = Buffer.alloc(32 + 16);
  if (date) {
    const ft = BigInt(date.getTime() + 11644473600000) * 10000n;
    props.writeUInt32LE((0x0039 << 16) | 0x0040, 32);
    props.writeUInt32LE(6, 36);
    props.writeBigUInt64LE(ft, 40);
  }
  streams.push({ name: '__properties_version1.0', data: props });
  return writeCFB(streams);
}

module.exports = { writeCFB, makeMsg };
