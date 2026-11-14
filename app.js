'use strict';
/* ===== Storage ===== */
const KEY = 'fotokopi.transaksi.v1';
const SETTINGS_KEY = 'fotokopi.settings.v1';
let data = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { toast('Gagal menyimpan! Penyimpanan penuh/diblokir.'); }
  renderAll();
}
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

/* ===== Helpers ===== */
const $ = (s) => document.querySelector(s);
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : 0; };
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const BULAN = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const fmtTgl = (s) => { if (!s) return '-'; const [y,m,d] = s.split('-'); return `${+d} ${BULAN[+m-1]} ${y}`; };
const statusLabel = (s) => s === 'sudah' ? 'Sudah dibayar' : 'Belum dibayar';
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const subtotalOf = (t) => num(t.qty) * num(t.harga);

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ===== Tabs ===== */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'export') drawPreview();
  window.scrollTo(0, 0);
}
document.querySelectorAll('nav.tabs button').forEach(b => b.addEventListener('click', () => {
  if (b.dataset.view === 'form' && $('#f-id').value) resetForm();
  showView(b.dataset.view);
}));

/* ===== Form ===== */
const F = (id) => $('#f-' + id);
let qtyManual = false;
function recalc(fromQty) {
  if (fromQty) qtyManual = true;
  if (!qtyManual) F('qty').value = num(F('rangkap').value) * num(F('isian').value);
  F('subtotal').textContent = rp(num(F('qty').value) * num(F('harga').value));
}
['rangkap','isian','harga'].forEach(k => F(k).addEventListener('input', () => recalc(false)));
F('qty').addEventListener('input', () => recalc(true));

function resetForm() {
  const s = loadSettings();
  $('#txForm').reset();
  F('id').value = '';
  F('tgl').value = today();
  F('harga').value = s.lastHarga ?? 0;
  qtyManual = false;
  recalc(false);
  $('#formTitle').textContent = 'Tambah Transaksi';
  $('#btnCancelEdit').hidden = true;
}
function editTx(id) {
  const t = data.find(x => x.id === id); if (!t) return;
  F('id').value = t.id; F('nama').value = t.nama; F('order').value = t.order;
  F('rangkap').value = t.rangkap; F('isian').value = t.isian; F('qty').value = t.qty;
  F('harga').value = t.harga; F('tgl').value = t.tgl; F('status').value = t.status;
  qtyManual = num(t.qty) !== num(t.rangkap) * num(t.isian);
  recalc(false);
  $('#formTitle').textContent = 'Edit Transaksi';
  $('#btnCancelEdit').hidden = false;
  showView('form');
}
$('#btnCancelEdit').addEventListener('click', () => { resetForm(); showView('list'); });

$('#txForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = {
    id: F('id').value || uid(),
    nama: F('nama').value.trim(),
    order: F('order').value.trim(),
    rangkap: num(F('rangkap').value),
    isian: num(F('isian').value),
    qty: num(F('qty').value),
    harga: num(F('harga').value),
    tgl: F('tgl').value || today(),
    status: F('status').value,
  };
  t.subtotal = subtotalOf(t);
  const i = data.findIndex(x => x.id === t.id);
  if (i >= 0) { data[i] = t; toast('Transaksi diperbarui'); }
  else { t.created = Date.now(); data.push(t); toast('Transaksi disimpan'); }
  const s = loadSettings(); s.lastHarga = t.harga; saveSettings(s);
  const wasEdit = i >= 0;
  save();
  if (wasEdit) { resetForm(); showView('list'); }
  else { // siap input berikutnya, nama & tgl tetap
    const nama = t.nama, tgl = t.tgl;
    resetForm(); F('nama').value = nama; F('tgl').value = tgl; F('order').focus();
  }
});

/* ===== List ===== */
function filtered() {
  const q = $('#q').value.trim().toLowerCase();
  const st = $('#fStatus').value, mo = $('#fMonth').value;
  return data.filter(t =>
    (!q || t.nama.toLowerCase().includes(q) || t.order.toLowerCase().includes(q)) &&
    (!st || t.status === st) &&
    (!mo || (t.tgl || '').startsWith(mo))
  ).sort((a, b) => (b.tgl || '').localeCompare(a.tgl || '') || (b.created || 0) - (a.created || 0));
}
function renderList() {
  const rows = filtered();
  const list = $('#list');
  if (!rows.length) {
    list.innerHTML = `<div class="empty">${data.length ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.<br>Ketuk ➕ Tambah untuk mulai mencatat.'}</div>`;
  } else {
    let html = '', last = null;
    for (const t of rows) {
      if (t.tgl !== last) { html += `<div class="group-date">${fmtTgl(t.tgl)}</div>`; last = t.tgl; }
      html += `<div class="tx">
        <div class="tx-top">
          <div><div class="tx-name">${esc(t.nama)}</div><div class="tx-order">${esc(t.order)}</div>
            <div class="tx-meta">${t.rangkap} rangkap × ${t.isian} isian = ${t.qty} lbr × ${rp(t.harga)}</div></div>
          <div class="tx-sub">${rp(subtotalOf(t))}</div>
        </div>
        <div class="tx-actions">
          <button class="badge ${t.status === 'sudah' ? 'paid' : 'unpaid'}" data-toggle="${t.id}" title="Ketuk untuk ubah status">${statusLabel(t.status)}</button>
          <button class="btn sm" data-edit="${t.id}">Edit</button>
          <button class="btn sm danger" data-del="${t.id}">Hapus</button>
        </div></div>`;
    }
    list.innerHTML = html;
  }
  const tot = rows.reduce((s, t) => s + subtotalOf(t), 0);
  const unpaid = rows.filter(t => t.status !== 'sudah');
  $('#listInfo').textContent = `${rows.length} transaksi · total ${rp(tot)}`;
  $('#btnPayAll').hidden = !unpaid.length || !($('#q').value.trim());
  $('#btnPayAll').textContent = `Tandai ${unpaid.length} lunas`;
}
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.toggle) {
    const t = data.find(x => x.id === b.dataset.toggle);
    t.status = t.status === 'sudah' ? 'belum' : 'sudah'; save();
  } else if (b.dataset.edit) editTx(b.dataset.edit);
  else if (b.dataset.del) {
    const t = data.find(x => x.id === b.dataset.del);
    if (confirm(`Hapus transaksi "${t.order}" (${t.nama})?`)) { data = data.filter(x => x.id !== t.id); save(); toast('Dihapus'); }
  }
});
['#q', '#fStatus', '#fMonth'].forEach(s => $(s).addEventListener('input', renderList));
$('#btnPayAll').addEventListener('click', () => {
  const rows = filtered().filter(t => t.status !== 'sudah');
  if (!confirm(`Tandai ${rows.length} transaksi yang tampil sebagai sudah dibayar?`)) return;
  rows.forEach(t => t.status = 'sudah'); save(); toast('Ditandai lunas');
});

function renderSummary() {
  let paid = 0, unpaid = 0;
  data.forEach(t => t.status === 'sudah' ? paid += subtotalOf(t) : unpaid += subtotalOf(t));
  $('#sumPaid').textContent = rp(paid); $('#sumUnpaid').textContent = rp(unpaid);
}
function renderDatalists() {
  const uniq = (k) => [...new Set(data.map(t => t[k]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const names = uniq('nama');
  $('#namaList').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
  $('#orderList').innerHTML = uniq('order').map(n => `<option value="${esc(n)}">`).join('');
  const sel = $('#e-nama'), cur = sel.value;
  sel.innerHTML = '<option value="">Semua pelanggan</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = names.includes(cur) ? cur : '';
}
function renderAll() { renderSummary(); renderDatalists(); renderList(); if ($('#view-export').classList.contains('active')) drawPreview(); }

/* ===== Export (canvas) ===== */
function exportRows() {
  const n = $('#e-nama').value, f = $('#e-from').value, to = $('#e-to').value, st = $('#e-status').value;
  return data.filter(t => (!n || t.nama === n) && (!f || t.tgl >= f) && (!to || t.tgl <= to) && (!st || t.status === st))
    .sort((a, b) => (a.tgl || '').localeCompare(b.tgl || '') || (a.created || 0) - (b.created || 0));
}

function wrapText(ctx, text, maxW) {
  const words = String(text).split(/\s+/); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  // pecah kata yang terlalu panjang
  return lines.flatMap(l => {
    if (ctx.measureText(l).width <= maxW) return [l];
    const out = []; let cur = '';
    for (const ch of l) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; } else cur += ch; }
    if (cur) out.push(cur); return out;
  });
}

/** Gambar laporan ke canvas. Return canvas. */
function renderReport(canvas, scale = 2) {
  const rows = exportRows();
  const W = 800, PAD = 40;
  const cols = [ { k: 'no', t: 'No', w: 44, a: 'center' }, { k: 'tgl', t: 'Tgl', w: 120 },
    { k: 'order', t: 'Order', w: 0 }, { k: 'sub', t: 'Subtotal', w: 130, a: 'right' }, { k: 'st', t: 'Status', w: 130, a: 'center' } ];
  const fixed = cols.reduce((s, c) => s + c.w, 0);
  cols[2].w = W - PAD * 2 - fixed;
  const showName = !$('#e-nama').value;
  const ctx = canvas.getContext('2d');
  const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const LH = 20, CELLPAD = 10;

  // ukur tinggi baris
  ctx.font = `15px ${FONT}`;
  const layout = rows.map((t, i) => {
    const orderTxt = showName ? `${t.order} — ${t.nama}` : t.order;
    const lines = wrapText(ctx, orderTxt, cols[2].w - CELLPAD * 2);
    return { t, i, lines, h: Math.max(1, lines.length) * LH + CELLPAD * 2 };
  });
  const title = $('#e-title').value.trim() || 'Laporan Transaksi Fotokopi';
  const headerH = 150, theadH = 40, footH = 130;
  const bodyH = layout.reduce((s, r) => s + r.h, 0) || 60;
  const H = headerH + theadH + bodyH + footH;

  canvas.width = W * scale; canvas.height = H * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // header
  ctx.fillStyle = '#1f6feb'; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = '#111'; ctx.font = `bold 24px ${FONT}`; ctx.fillText(title, PAD, 32);
  ctx.font = `15px ${FONT}`; ctx.fillStyle = '#444';
  const f = $('#e-from').value, to = $('#e-to').value;
  const periode = f || to ? `${f ? fmtTgl(f) : 'awal'} s/d ${to ? fmtTgl(to) : 'sekarang'}` : 'Semua tanggal';
  ctx.fillText(`Pelanggan : ${$('#e-nama').value || 'Semua pelanggan'}`, PAD, 72);
  ctx.fillText(`Periode   : ${periode}`, PAD, 94);
  const st = $('#e-status').value;
  ctx.fillText(`Status    : ${st ? statusLabel(st) : 'Semua'}`, PAD, 116);
  ctx.textAlign = 'right'; ctx.fillStyle = '#888'; ctx.font = `13px ${FONT}`;
  ctx.fillText(`Dicetak ${fmtTgl(today())}`, W - PAD, 38); ctx.textAlign = 'left';

  // thead
  let y = headerH;
  ctx.fillStyle = '#1f6feb'; ctx.fillRect(PAD, y, W - PAD * 2, theadH);
  ctx.fillStyle = '#fff'; ctx.font = `bold 15px ${FONT}`;
  let x = PAD;
  const cellText = (txt, c, x, y, h) => {
    const ty = y + (h - LH) / 2 + 2;
    if (c.a === 'right') { ctx.textAlign = 'right'; ctx.fillText(txt, x + c.w - CELLPAD, ty); }
    else if (c.a === 'center') { ctx.textAlign = 'center'; ctx.fillText(txt, x + c.w / 2, ty); }
    else { ctx.textAlign = 'left'; ctx.fillText(txt, x + CELLPAD, ty); }
    ctx.textAlign = 'left';
  };
  cols.forEach(c => { cellText(c.t, c, x, y, theadH); x += c.w; });
  y += theadH;

  // body
  if (!layout.length) {
    ctx.fillStyle = '#888'; ctx.font = `italic 15px ${FONT}`; ctx.textAlign = 'center';
    ctx.fillText('Tidak ada transaksi', W / 2, y + 20); ctx.textAlign = 'left'; y += 60;
  }
  for (const r of layout) {
    if (r.i % 2) { ctx.fillStyle = '#f4f7fc'; ctx.fillRect(PAD, y, W - PAD * 2, r.h); }
    x = PAD; ctx.font = `15px ${FONT}`; ctx.fillStyle = '#222';
    cellText(String(r.i + 1), cols[0], x, y, r.h); x += cols[0].w;
    cellText(fmtTgl(r.t.tgl), cols[1], x, y, r.h); x += cols[1].w;
    const startY = y + (r.h - r.lines.length * LH) / 2 + 2;
    r.lines.forEach((ln, k) => ctx.fillText(ln, x + CELLPAD, startY + k * LH)); x += cols[2].w;
    ctx.font = `bold 15px ${FONT}`;
    cellText(rp(subtotalOf(r.t)), cols[3], x, y, r.h); x += cols[3].w;
    const paid = r.t.status === 'sudah';
    const bw = 116, bh = 24, bx = x + (cols[4].w - bw) / 2, by = y + (r.h - bh) / 2;
    ctx.fillStyle = paid ? '#dcfce7' : '#fee2e2';
    roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
    ctx.fillStyle = paid ? '#15803d' : '#b91c1c'; ctx.font = `bold 13px ${FONT}`;
    ctx.textAlign = 'center'; ctx.fillText(statusLabel(r.t.status), bx + bw / 2, by + 5); ctx.textAlign = 'left';
    y += r.h;
    ctx.strokeStyle = '#e3e7ee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  }

  // footer totals
  const total = rows.reduce((s, t) => s + subtotalOf(t), 0);
  const sudah = rows.filter(t => t.status === 'sudah').reduce((s, t) => s + subtotalOf(t), 0);
  const belum = total - sudah;
  y += 16;
  const line = (label, val, color, bold) => {
    ctx.font = `${bold ? 'bold ' : ''}16px ${FONT}`; ctx.fillStyle = color;
    ctx.textAlign = 'right'; ctx.fillText(label, W - PAD - 160, y); ctx.fillText(val, W - PAD - CELLPAD, y); ctx.textAlign = 'left';
    y += 26;
  };
  line('Total', rp(total), '#111', true);
  line('Sudah dibayar', rp(sudah), '#15803d');
  line('Belum dibayar', rp(belum), '#b91c1c', true);
  return { canvas, count: rows.length };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawPreview() { renderReport($('#preview'), 1.5); }
['#e-nama', '#e-from', '#e-to', '#e-status', '#e-title'].forEach(s => $(s).addEventListener('input', drawPreview));
$('#e-title').value = loadSettings().title || '';
$('#e-title').addEventListener('change', () => { const s = loadSettings(); s.title = $('#e-title').value.trim(); saveSettings(s); });

function fileBase() {
  const n = $('#e-nama').value; const slug = (n || 'semua').replace(/[^\w-]+/g, '_');
  return `fotokopi_${slug}_${today()}`;
}
function canvasBlob(c, type, q) { return new Promise(res => c.toBlob(res, type, q)); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function makeJpg() {
  const { canvas } = renderReport(document.createElement('canvas'), 2);
  return new File([await canvasBlob(canvas, 'image/jpeg', 0.92)], fileBase() + '.jpg', { type: 'image/jpeg' });
}
async function makePdf() {
  const { jsPDF } = window.jspdf;
  const { canvas } = renderReport(document.createElement('canvas'), 2);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
  const m = 24, iw = pw - m * 2, ratio = iw / canvas.width;
  const sliceH = Math.floor((ph - m * 2) / ratio); // tinggi px canvas per halaman
  for (let sy = 0, page = 0; sy < canvas.height; sy += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - sy);
    const part = document.createElement('canvas'); part.width = canvas.width; part.height = h;
    part.getContext('2d').drawImage(canvas, 0, sy, canvas.width, h, 0, 0, canvas.width, h);
    if (page) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', m, m, iw, h * ratio);
  }
  return new File([pdf.output('blob')], fileBase() + '.pdf', { type: 'application/pdf' });
}
$('#btnJpg').addEventListener('click', async () => { const f = await makeJpg(); download(f, f.name); toast('JPG diunduh'); });
$('#btnPdf').addEventListener('click', async () => { const f = await makePdf(); download(f, f.name); toast('PDF diunduh'); });
if (navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })) {
  $('#btnShare').hidden = false;
  $('#btnShare').addEventListener('click', async () => {
    const asPdf = confirm('Bagikan sebagai PDF?\nOK = PDF, Batal = JPG');
    const f = asPdf ? await makePdf() : await makeJpg();
    try { await navigator.share({ files: [f], title: f.name }); } catch {}
  });
}

/* ===== Backup / Restore / CSV ===== */
$('#btnBackup').addEventListener('click', () => {
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `backup_fotokopi_${today()}.json`);
});
$('#btnRestore').addEventListener('click', () => $('#fileRestore').click());
$('#fileRestore').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const arr = JSON.parse(await file.text());
    if (!Array.isArray(arr)) throw 0;
    if (!confirm(`Pulihkan ${arr.length} transaksi? Data sekarang (${data.length}) akan diganti.`)) return;
    data = arr.map(t => ({ ...t, id: t.id || uid() })); save(); toast('Data dipulihkan');
  } catch { alert('File cadangan tidak valid.'); }
});
const CSV_HEAD = ['Nama','Order','Rangkap','Isian','Qty','Harga per lembar','Tgl','Subtotal','Status'];
$('#btnCsv').addEventListener('click', () => {
  const q = (v) => /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  const rows = [...data].sort((a, b) => a.tgl.localeCompare(b.tgl)).map(t =>
    [t.nama, t.order, t.rangkap, t.isian, t.qty, t.harga, t.tgl, subtotalOf(t), statusLabel(t.status)].map(q).join(','));
  download(new Blob(['﻿' + [CSV_HEAD.join(','), ...rows].join('\n')], { type: 'text/csv' }), `fotokopi_${today()}.csv`);
});
$('#btnImportCsv').addEventListener('click', () => $('#fileCsv').click());
$('#fileCsv').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  const text = (await file.text()).replace(/^﻿/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = parseCsv(text, sep);
  const head = rows.shift().map(h => h.trim().toLowerCase());
  const idx = (name) => head.findIndex(h => h.startsWith(name));
  const I = { nama: idx('nama'), order: idx('order'), rangkap: idx('rangkap'), isian: idx('isian'), qty: idx('qty'),
    harga: idx('harga'), tgl: idx('tgl'), status: idx('status') };
  if (I.nama < 0 || I.order < 0) return alert('Kolom "Nama" dan "Order" tidak ditemukan di baris pertama CSV.');
  const toNum = (v) => num(String(v ?? '').replace(/rp|\s/gi, '').replace(/\.(?=\d{3}(\D|$))/g, ''));
  const toDate = (v) => {
    v = String(v ?? '').trim(); let m;
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
    if ((m = v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
    return today();
  };
  const added = rows.filter(r => r.some(c => c.trim())).map(r => {
    const t = { id: uid(), created: Date.now(), nama: (r[I.nama] || '').trim(), order: (r[I.order] || '').trim(),
      rangkap: toNum(r[I.rangkap]), isian: toNum(r[I.isian]), qty: toNum(r[I.qty]), harga: toNum(r[I.harga]),
      tgl: toDate(r[I.tgl]), status: /sudah|lunas/i.test(r[I.status] || '') ? 'sudah' : 'belum' };
    if (!t.qty) t.qty = t.rangkap * t.isian;
    t.subtotal = subtotalOf(t); return t;
  });
  if (!confirm(`Tambahkan ${added.length} transaksi dari CSV?`)) return;
  data.push(...added); save(); toast(`${added.length} transaksi diimpor`);
});
function parseCsv(text, sep) {
  const out = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
    else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); out.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

/* ===== Init ===== */
resetForm();
renderAll();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
