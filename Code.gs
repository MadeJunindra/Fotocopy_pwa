/**
 * DATABASE CATATAN FOTOKOPI — Google Apps Script
 * ------------------------------------------------
 * Tempel seluruh isi file ini di: Spreadsheet > Ekstensi > Apps Script
 * Lalu ganti TOKEN di bawah dengan kata sandi buatan Anda sendiri.
 */
const TOKEN = 'GANTI-DENGAN-KATA-SANDI-ANDA';

const SHEET = 'Transaksi App';
const HEAD = ['ID', 'Nama', 'Order', 'Rangkap', 'Isian', 'Qty', 'Harga per lembar', 'Tgl', 'Subtotal', 'Status', 'Diubah'];
const C = { id: 0, nama: 1, order: 2, rangkap: 3, isian: 4, qty: 5, harga: 6, tgl: 7, subtotal: 8, status: 9, diubah: 10 };

const XSHEET = 'Pengeluaran App';
const XHEAD = ['ID', 'Tgl', 'Keterangan', 'Kategori', 'Jumlah', 'Diubah'];
const X = { id: 0, tgl: 1, ket: 2, kategori: 3, jumlah: 4, diubah: 5 };
const API_VERSION = 2;

/* ====================== API untuk aplikasi ====================== */
function doGet(e) {
  return handle_((e && e.parameter && e.parameter.token) || '', [], []);
}
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return handle_(body.token, body.changes || [], body.deletes || [], body.expChanges || [], body.expDeletes || []);
}

function handle_(token, changes, deletes, expChanges, expDeletes) {
  expChanges = expChanges || []; expDeletes = expDeletes || [];
  if (TOKEN.indexOf('GANTI-') === 0) return json_({ ok: false, error: 'TOKEN di Apps Script belum diganti.' });
  if (token !== TOKEN) return json_({ ok: false, error: 'Kata sandi (token) salah.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_();
    if (changes.length || deletes.length) apply_(sh, changes, deletes);
    const xs = xsheet_();
    if (expChanges.length || expDeletes.length) applyExp_(xs, expChanges, expDeletes);
    return json_({ ok: true, v: API_VERSION, records: readAll_(sh), expenses: readExp_(xs), time: Date.now() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function apply_(sh, changes, deletes) {
  const n = sh.getLastRow() - 1;
  let rows = n > 0 ? sh.getRange(2, 1, n, HEAD.length).getValues() : [];
  const index = {};
  rows.forEach((r, i) => { if (r[C.id]) index[String(r[C.id])] = i; });

  changes.forEach(t => {
    if (!t || !t.id) return;
    const i = index[t.id];
    if (i !== undefined) {
      const cur = toMs_(rows[i][C.diubah]);
      if (cur > Number(t.updated || 0)) return; // versi di spreadsheet lebih baru
      rows[i] = toRow_(t);
    } else {
      index[t.id] = rows.length;
      rows.push(toRow_(t));
    }
  });
  const del = {};
  deletes.forEach(id => { del[id] = true; });
  rows = rows.filter(r => !del[String(r[C.id])]);

  // tulis ulang isi tabel (header tetap)
  if (n > 0) sh.getRange(2, 1, n, HEAD.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, HEAD.length).setValues(rows);
}

function readAll_(sh) {
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  const tz = Session.getScriptTimeZone();
  const vals = sh.getRange(2, 1, n, HEAD.length).getValues();
  const out = [];
  let fixed = false;
  vals.forEach((r, i) => {
    if (!r[C.nama] && !r[C.order]) return;
    if (!r[C.id]) { r[C.id] = newId_(); sh.getRange(i + 2, C.id + 1).setValue(r[C.id]); fixed = true; }
    const rangkap = num_(r[C.rangkap]), isian = num_(r[C.isian]);
    out.push({
      id: String(r[C.id]),
      nama: String(r[C.nama]).trim(),
      order: String(r[C.order]).trim(),
      rangkap: rangkap, isian: isian,
      qty: r[C.qty] === '' ? rangkap * isian : num_(r[C.qty]),
      harga: num_(r[C.harga]),
      tgl: dateStr_(r[C.tgl], tz),
      status: /sudah|lunas/i.test(String(r[C.status])) ? 'sudah' : 'belum',
      updated: toMs_(r[C.diubah]) || 1,
    });
  });
  if (fixed) SpreadsheetApp.flush();
  return out;
}

/* ====================== Pengeluaran ====================== */
function applyExp_(sh, changes, deletes) {
  const n = sh.getLastRow() - 1;
  let rows = n > 0 ? sh.getRange(2, 1, n, XHEAD.length).getValues() : [];
  const index = {};
  rows.forEach((r, i) => { if (r[X.id]) index[String(r[X.id])] = i; });
  changes.forEach(t => {
    if (!t || !t.id) return;
    const row = [t.id, toDate_(t.tgl), t.ket || '', t.kategori || 'Lainnya', num_(t.jumlah), new Date(Number(t.updated) || Date.now())];
    const i = index[t.id];
    if (i !== undefined) { if (toMs_(rows[i][X.diubah]) > Number(t.updated || 0)) return; rows[i] = row; }
    else { index[t.id] = rows.length; rows.push(row); }
  });
  const del = {};
  deletes.forEach(id => { del[id] = true; });
  rows = rows.filter(r => !del[String(r[X.id])]);
  if (n > 0) sh.getRange(2, 1, n, XHEAD.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, XHEAD.length).setValues(rows);
}
function readExp_(sh) {
  const n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  const tz = Session.getScriptTimeZone();
  const vals = sh.getRange(2, 1, n, XHEAD.length).getValues();
  const out = [];
  vals.forEach((r, i) => {
    if (!r[X.ket] && !r[X.jumlah]) return;
    if (!r[X.id]) { r[X.id] = newId_(); sh.getRange(i + 2, X.id + 1).setValue(r[X.id]); }
    out.push({ id: String(r[X.id]), tgl: dateStr_(r[X.tgl], tz) || dateStr_(new Date(), tz), ket: String(r[X.ket]).trim(),
      kategori: String(r[X.kategori] || 'Lainnya').trim(), jumlah: num_(r[X.jumlah]), updated: toMs_(r[X.diubah]) || 1 });
  });
  return out;
}
function xsheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(XSHEET);
  if (!sh) {
    sh = ss.insertSheet(XSHEET);
    sh.getRange(1, 1, 1, XHEAD.length).setValues([XHEAD]).setFontWeight('bold').setBackground('#0e1a2b').setFontColor('#f4efe6');
    sh.setFrozenRows(1);
    sh.getRange('B:B').setNumberFormat('dd/mm/yyyy');
    sh.getRange('E:E').setNumberFormat('"Rp"#,##0');
    sh.getRange('F:F').setNumberFormat('dd/mm/yyyy hh:mm');
    sh.setColumnWidth(3, 260);
  }
  return sh;
}

/* ====================== Edit langsung di spreadsheet ====================== */
// Kalau Anda mengubah/menambah baris langsung di sheet "Transaksi App",
// ID, Qty, Subtotal & waktu "Diubah" diisi otomatis agar ikut tersinkron ke aplikasi.
function onEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() === XSHEET) {
    const a = Math.max(2, e.range.getRow()), b = e.range.getLastRow();
    if (b < a) return;
    const rg = sh.getRange(a, 1, b - a + 1, XHEAD.length), v = rg.getValues(), now = new Date();
    v.forEach(r => { if (!r[X.ket] && !r[X.jumlah]) return; if (!r[X.id]) r[X.id] = newId_(); if (!r[X.kategori]) r[X.kategori] = 'Lainnya'; r[X.diubah] = now; });
    rg.setValues(v);
    return;
  }
  if (sh.getName() !== SHEET) return;
  const r0 = Math.max(2, e.range.getRow()), r1 = e.range.getLastRow();
  if (r1 < r0) return;
  const rng = sh.getRange(r0, 1, r1 - r0 + 1, HEAD.length);
  const vals = rng.getValues();
  const now = new Date();
  vals.forEach(r => {
    if (!r[C.nama] && !r[C.order]) return;
    if (!r[C.id]) r[C.id] = newId_();
    if (r[C.qty] === '' || r[C.qty] === null) r[C.qty] = num_(r[C.rangkap]) * num_(r[C.isian]);
    r[C.subtotal] = num_(r[C.qty]) * num_(r[C.harga]);
    if (!r[C.status]) r[C.status] = 'Belum dibayar';
    r[C.diubah] = now;
  });
  rng.setValues(vals);
}

/* ====================== Menu & impor data lama ====================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📄 Fotokopi')
    .addItem('Siapkan sheet database', 'setup')
    .addItem('Impor data lama (dari sheet lain)…', 'imporDataLama')
    .addToUi();
}

function setup() {
  sheet_(); xsheet_();
  SpreadsheetApp.getUi().alert('Sheet "' + SHEET + '" siap dipakai sebagai database.');
}

/** Salin data lama (default: sheet ke-4) ke sheet database. Sheet asal TIDAK diubah. */
function imporDataLama() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const res = ui.prompt('Impor data lama',
    'Ketik NAMA TAB data lama persis seperti di bawah layar (mis. Sheet4).\nKosongkan saja untuk mencari otomatis.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const ans = res.getResponseText().trim();

  // cari baris judul kolom (yang mengandung "Nama" dan "Order")
  const findHead = vals => {
    for (let i = 0; i < Math.min(vals.length, 15); i++) {
      const row = vals[i].map(v => String(v).toLowerCase().trim());
      if (row.some(v => v.indexOf('nama') === 0) && row.some(v => v.indexOf('order') === 0)) return i;
    }
    return -1;
  };
  let src = null;
  if (ans) {
    src = ss.getSheetByName(ans) ||
      (/^\d+$/.test(ans) ? (ss.getSheetByName('Sheet' + ans) || ss.getSheetByName('Sheet ' + ans)) : null) ||
      ss.getSheets().find(sh => sh.getName().toLowerCase().replace(/\s/g, '') === ans.toLowerCase().replace(/\s/g, '')) || null;
    if (!src) return ui.alert('Tab "' + ans + '" tidak ditemukan. Periksa nama tab di bagian bawah layar.');
  }
  // tidak diisi / tidak cocok -> cari semua tab yang punya kolom Nama & Order
  const cocok = ss.getSheets().filter(sh => sh.getName() !== SHEET && findHead(sh.getRange(1, 1, Math.min(15, Math.max(1, sh.getLastRow())), Math.max(1, sh.getLastColumn())).getValues()) >= 0);
  if (!src) {
    if (!cocok.length) return ui.alert('Tidak ada tab yang punya judul kolom "Nama" dan "Order".');
    if (cocok.length > 1) return ui.alert('Ditemukan beberapa tab berisi data: ' + cocok.map(x => '"' + x.getName() + '"').join(', ') +
      '.\nJalankan lagi dan ketik nama tab yang dimaksud.');
    src = cocok[0];
  }
  if (src.getName() === SHEET) return ui.alert('Pilih tab data lama, bukan tab database.');

  const vals = src.getDataRange().getValues();
  const h = findHead(vals);
  if (h < 0) return ui.alert('Judul kolom (Nama, Order, …) tidak ditemukan di tab "' + src.getName() + '".' +
    (cocok.length ? '\nTab yang cocok: ' + cocok.map(x => '"' + x.getName() + '"').join(', ') : ''));
  const head = vals[h].map(v => String(v).toLowerCase().trim());
  const col = (...names) => head.findIndex(x => names.some(n => x.indexOf(n) === 0));
  const I = { nama: col('nama'), order: col('order'), rangkap: col('rangkap'), isian: col('isian'), qty: col('qty', 'jumlah'),
    harga: col('harga'), tgl: col('tgl', 'tanggal'), status: col('status', 'ket') };

  const tz = Session.getScriptTimeZone();
  const now = Date.now();
  const changes = [];
  let lastTgl = '', lastNama = '';
  for (let i = h + 1; i < vals.length; i++) {
    const r = vals[i];
    const get = k => (I[k] >= 0 ? r[I[k]] : '');
    const order = String(get('order')).trim();
    if (!order) continue;
    const nama = String(get('nama')).trim() || lastNama;      // sel nama digabung/kosong -> pakai nama di atasnya
    const tgl = dateStr_(get('tgl'), tz) || lastTgl;           // sel tgl kosong -> pakai tgl di atasnya
    lastNama = nama; lastTgl = tgl;
    const rangkap = num_(get('rangkap')), isian = num_(get('isian'));
    const qtyRaw = get('qty');
    changes.push({
      id: newId_(), nama: nama, order: order, rangkap: rangkap, isian: isian,
      qty: qtyRaw === '' ? rangkap * isian : num_(qtyRaw),
      harga: num_(get('harga')),
      tgl: tgl || dateStr_(new Date(), tz),
      status: /sudah|lunas/i.test(String(get('status'))) ? 'sudah' : 'belum',
      updated: now,
    });
  }
  if (!changes.length) return ui.alert('Tidak ada baris data yang bisa diimpor.');
  const ok = ui.alert('Impor data lama', 'Ditemukan ' + changes.length + ' transaksi di sheet "' + src.getName() +
    '".\nSalin ke sheet "' + SHEET + '"? (Sheet asal tidak diubah)', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  const lock = LockService.getScriptLock(); lock.waitLock(25000);
  try { apply_(sheet_(), changes, []); } finally { lock.releaseLock(); }
  ui.alert(changes.length + ' transaksi berhasil diimpor. Buka aplikasi untuk melihatnya.');
}

/* ====================== Helper ====================== */
function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold').setBackground('#0e1a2b').setFontColor('#f4efe6');
    sh.setFrozenRows(1);
    sh.getRange('G:G').setNumberFormat('#,##0');
    sh.getRange('I:I').setNumberFormat('"Rp"#,##0');
    sh.getRange('H:H').setNumberFormat('dd/mm/yyyy');
    sh.getRange('K:K').setNumberFormat('dd/mm/yyyy hh:mm');
    sh.setColumnWidth(1, 90); sh.setColumnWidth(3, 260);
  }
  return sh;
}
function toRow_(t) {
  const qty = num_(t.qty), harga = num_(t.harga);
  return [t.id, t.nama || '', t.order || '', num_(t.rangkap), num_(t.isian), qty, harga,
    toDate_(t.tgl), qty * harga, t.status === 'sudah' ? 'Sudah dibayar' : 'Belum dibayar', new Date(Number(t.updated) || Date.now())];
}
function num_(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').replace(/rp|\s/gi, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); // 1.500,5
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function toDate_(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}
function dateStr_(v, tz) {
  if (isDate_(v)) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  const s = String(v || '').trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad_(m[2]) + '-' + pad_(m[3]);
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + pad_(m[2]) + '-' + pad_(m[1]);
  return '';
}
function pad_(x) { return ('0' + x).slice(-2); }
function toMs_(v) { return isDate_(v) ? v.getTime() : Number(v) || 0; }
function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
