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

/* ====================== API untuk aplikasi ====================== */
function doGet(e) {
  return handle_((e && e.parameter && e.parameter.token) || '', [], []);
}
function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
  return handle_(body.token, body.changes || [], body.deletes || []);
}

function handle_(token, changes, deletes) {
  if (TOKEN.indexOf('GANTI-') === 0) return json_({ ok: false, error: 'TOKEN di Apps Script belum diganti.' });
  if (token !== TOKEN) return json_({ ok: false, error: 'Kata sandi (token) salah.' });
  const lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    const sh = sheet_();
    if (changes.length || deletes.length) apply_(sh, changes, deletes);
    return json_({ ok: true, records: readAll_(sh), time: Date.now() });
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

/* ====================== Edit langsung di spreadsheet ====================== */
// Kalau Anda mengubah/menambah baris langsung di sheet "Transaksi App",
// ID, Qty, Subtotal & waktu "Diubah" diisi otomatis agar ikut tersinkron ke aplikasi.
function onEdit(e) {
  const sh = e.range.getSheet();
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
  sheet_();
  SpreadsheetApp.getUi().alert('Sheet "' + SHEET + '" siap dipakai sebagai database.');
}

/** Salin data lama (default: sheet ke-4) ke sheet database. Sheet asal TIDAK diubah. */
function imporDataLama() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActive();
  const res = ui.prompt('Impor data lama', 'Nama sheet atau nomor urut sheet yang berisi data lama:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const ans = res.getResponseText().trim() || '4';
  const src = /^\d+$/.test(ans) ? ss.getSheets()[Number(ans) - 1] : ss.getSheetByName(ans);
  if (!src) return ui.alert('Sheet "' + ans + '" tidak ditemukan.');
  if (src.getName() === SHEET) return ui.alert('Pilih sheet data lama, bukan sheet database.');

  const vals = src.getDataRange().getValues();
  // cari baris judul kolom (yang mengandung "Nama" dan "Order")
  let h = -1;
  for (let i = 0; i < Math.min(vals.length, 15); i++) {
    const row = vals[i].map(v => String(v).toLowerCase().trim());
    if (row.some(v => v === 'nama' || v.indexOf('nama') === 0) && row.some(v => v.indexOf('order') === 0)) { h = i; break; }
  }
  if (h < 0) return ui.alert('Baris judul kolom (Nama, Order, …) tidak ditemukan di sheet "' + src.getName() + '".');
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
