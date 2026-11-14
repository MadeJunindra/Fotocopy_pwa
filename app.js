'use strict';
/* ===== Storage ===== */
const KEY = 'fotokopi.transaksi.v1';
const SETTINGS_KEY = 'fotokopi.settings.v1';
let data = load();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
/** Simpan ke perangkat. `changed`/`deleted` = id yang berubah -> dikirim ke Google Sheets. */
function save(changed = [], deleted = []) {
  const now = Date.now();
  changed.forEach(id => { const t = data.find(x => x.id === id); if (t) t.updated = now; });
  persistLocal();
  if (changed.length || deleted.length) Sync.queue(changed, deleted, now);
  renderAll();
}
function persistLocal() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); }
  catch { toast('Gagal menyimpan! Penyimpanan penuh/diblokir.'); }
}
/* ----- Pengeluaran (untuk hitung pendapatan bersih) ----- */
const EXP_KEY = 'fotokopi.pengeluaran.v1';
let expenses = (() => { try { return JSON.parse(localStorage.getItem(EXP_KEY)) || []; } catch { return []; } })();
function persistExp() {
  try { localStorage.setItem(EXP_KEY, JSON.stringify(expenses)); } catch { toast('Gagal menyimpan pengeluaran!'); }
}
function saveExp(changed = [], deleted = []) {
  const now = Date.now();
  changed.forEach(id => { const t = expenses.find(x => x.id === id); if (t) t.updated = now; });
  persistExp();
  if (changed.length || deleted.length) Sync.queueExp(changed, deleted, now);
  renderAll();
}
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

/* ===== Helpers ===== */
const $ = (s) => document.querySelector(s);
const rp = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '−' : '') + 'Rp' + Math.abs(v).toLocaleString('id-ID'); };
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
  if (name === 'income' && typeof renderIncome === 'function') renderIncome();
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
  F('formula').textContent = `${num(F('qty').value)} lbr × ${rp(F('harga').value)}`;
}
function setStatus(v) {
  F('status').value = v;
  document.querySelectorAll('#statusSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
}
document.querySelectorAll('#statusSeg button').forEach(b => b.addEventListener('click', () => setStatus(b.dataset.v)));
['rangkap','isian','harga'].forEach(k => F(k).addEventListener('input', () => recalc(false)));
F('qty').addEventListener('input', () => recalc(true));

function resetForm() {
  const s = loadSettings();
  $('#txForm').reset();
  F('id').value = '';
  F('tgl').value = today();
  F('harga').value = s.lastHarga ?? 0;
  setStatus('belum');
  qtyManual = false;
  recalc(false);
  $('#formTitle').textContent = 'Transaksi Baru';
  $('#btnCancelEdit').hidden = true;
}
function editTx(id) {
  const t = data.find(x => x.id === id); if (!t) return;
  F('id').value = t.id; F('nama').value = t.nama; F('order').value = t.order;
  F('rangkap').value = t.rangkap; F('isian').value = t.isian; F('qty').value = t.qty;
  F('harga').value = t.harga; F('tgl').value = t.tgl; setStatus(t.status);
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
  if (i >= 0) { data[i] = { ...data[i], ...t }; toast('Transaksi diperbarui'); }
  else { t.created = Date.now(); data.push(t); toast('Transaksi disimpan'); }
  const s = loadSettings(); s.lastHarga = t.harga; saveSettings(s);
  const wasEdit = i >= 0;
  save([t.id]);
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
    list.innerHTML = `<div class="card empty"><div class="ico">❦</div>${data.length ? 'Tidak ada transaksi yang cocok.' : 'Belum ada transaksi.<br>Ketuk <b>Tambah</b> untuk mulai mencatat.'}</div>`;
  } else {
    const dayTotal = {};
    rows.forEach(t => dayTotal[t.tgl] = (dayTotal[t.tgl] || 0) + subtotalOf(t));
    let html = '', last = null;
    for (const t of rows) {
      if (t.tgl !== last) { html += `<div class="group-date"><span>${fmtTgl(t.tgl)}</span><span>${rp(dayTotal[t.tgl])}</span></div>`; last = t.tgl; }
      const initial = esc((t.nama.trim()[0] || '?').toUpperCase());
      html += `<div class="tx">
        <div class="avatar">${initial}</div>
        <div><div class="tx-name">${esc(t.nama)}</div><div class="tx-order">${esc(t.order)}</div>
          <div class="tx-meta">${t.rangkap} rangkap × ${t.isian} isian · ${t.qty} lbr × ${rp(t.harga)}</div></div>
        <div class="tx-sub">${rp(subtotalOf(t))}</div>
        <div class="tx-actions">
          <button class="badge ${t.status === 'sudah' ? 'paid' : 'unpaid'}" data-toggle="${t.id}" title="Ketuk untuk ubah status">${statusLabel(t.status)}</button>
          <button class="btn sm ghost" data-edit="${t.id}">Edit</button>
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
    t.status = t.status === 'sudah' ? 'belum' : 'sudah'; save([t.id]);
  } else if (b.dataset.edit) editTx(b.dataset.edit);
  else if (b.dataset.del) {
    const t = data.find(x => x.id === b.dataset.del);
    if (confirm(`Hapus transaksi "${t.order}" (${t.nama})?`)) { data = data.filter(x => x.id !== t.id); save([], [t.id]); toast('Dihapus'); }
  }
});
['#q', '#fMonth'].forEach(s => $(s).addEventListener('input', renderList));
document.querySelectorAll('#statusChips .chip').forEach(c => c.addEventListener('click', () => {
  $('#fStatus').value = c.dataset.st;
  document.querySelectorAll('#statusChips .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
  renderList();
}));
$('#btnPayAll').addEventListener('click', () => {
  const rows = filtered().filter(t => t.status !== 'sudah');
  if (!confirm(`Tandai ${rows.length} transaksi yang tampil sebagai sudah dibayar?`)) return;
  rows.forEach(t => t.status = 'sudah'); save(rows.map(t => t.id)); toast('Ditandai lunas');
});

function renderSummary() {
  let paid = 0, unpaid = 0;
  data.forEach(t => t.status === 'sudah' ? paid += subtotalOf(t) : unpaid += subtotalOf(t));
  $('#sumPaid').textContent = rp(paid); $('#sumUnpaid').textContent = rp(unpaid);
  $('#sumCount').textContent = `${data.length} transaksi`;
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
function renderAll() {
  renderSummary(); renderDatalists(); renderList();
  if ($('#view-export').classList.contains('active')) drawPreview();
  if (typeof renderIncome === 'function' && $('#view-income').classList.contains('active')) renderIncome();
}

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
  const W = 820, PAD = 44;
  const NAVY = '#0e1a2b', NAVY2 = '#1c2e48', GOLD = '#b08a4f', GOLD2 = '#d7b679', INK = '#1b2433', MUTED = '#7a8291', LINE = '#ece6dc';
  const SANS = '"Jakarta",system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif';
  const SERIF = '"Fraunces",Georgia,"Times New Roman",serif';
  const cols = [ { t: 'NO', w: 44, a: 'center' }, { t: 'TANGGAL', w: 124 },
    { t: 'ORDER', w: 0 }, { t: 'SUBTOTAL', w: 132, a: 'right' }, { t: 'STATUS', w: 136, a: 'center' } ];
  cols[2].w = W - PAD * 2 - cols.reduce((s, c) => s + c.w, 0);
  const ctx = canvas.getContext('2d');
  const LH = 20, CP = 12;

  ctx.font = `500 15px ${SANS}`;
  const layout = rows.map((t, i) => {
    const lines = wrapText(ctx, t.order, cols[2].w - CP * 2);
    return { t, i, lines, h: lines.length * LH + CP * 2 + 4 };
  });
  const title = $('#e-title').value.trim() || 'Catatan Fotokopi';
  const headerH = 200, theadH = 42, footH = 190;
  const bodyH = layout.reduce((s, r) => s + r.h, 0) || 70;
  const H = headerH + 24 + theadH + bodyH + footH;

  canvas.width = W * scale; canvas.height = H * scale;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fbf9f5'; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'top';

  // header band
  const g = ctx.createLinearGradient(0, 0, W, headerH);
  g.addColorStop(0, NAVY2); g.addColorStop(1, NAVY);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, headerH);
  ctx.strokeStyle = 'rgba(215,182,121,.22)'; ctx.lineWidth = 1;
  [110, 150, 190].forEach(r => { ctx.beginPath(); ctx.arc(W - 20, -10, r, 0, Math.PI * 2); ctx.stroke(); });
  ctx.fillStyle = GOLD; ctx.fillRect(0, headerH - 4, W, 4);

  ctx.fillStyle = GOLD2; ctx.font = `800 12px ${SANS}`;
  ctx.fillText('LAPORAN TRANSAKSI', PAD, 38);
  ctx.fillStyle = '#f4efe6'; ctx.font = `600 32px ${SERIF}`;
  ctx.fillText(title, PAD, 58);
  const f = $('#e-from').value, to = $('#e-to').value, st = $('#e-status').value;
  const periode = f || to ? `${f ? fmtTgl(f) : 'Awal'} – ${to ? fmtTgl(to) : 'Sekarang'}` : 'Semua tanggal';
  const label = $('#e-label').value.trim();
  const meta = [...(label ? [['PELANGGAN', label]] : []), ['PERIODE', periode], ['STATUS', st ? statusLabel(st) : 'Semua']];
  let mx = PAD;
  meta.forEach(([k, v], i) => {
    ctx.fillStyle = 'rgba(244,239,230,.55)'; ctx.font = `700 11px ${SANS}`; ctx.fillText(k, mx, 124);
    ctx.fillStyle = '#f4efe6'; ctx.font = `600 15px ${SANS}`; ctx.fillText(v, mx, 142);
    ctx.font = `600 15px ${SANS}`;
    mx += Math.max(160, ctx.measureText(v).width + 48);
  });
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(244,239,230,.55)'; ctx.font = `600 12px ${SANS}`;
  ctx.fillText(`Dicetak ${fmtTgl(today())}`, W - PAD, 40); ctx.textAlign = 'left';

  // table head
  let y = headerH + 24, x = PAD;
  ctx.fillStyle = '#f1ebe0'; roundRect(ctx, PAD, y, W - PAD * 2, theadH, 10); ctx.fill();
  ctx.fillStyle = MUTED; ctx.font = `800 11.5px ${SANS}`;
  const cell = (txt, c, x, y, h) => {
    const ty = y + (h - LH) / 2 + 3;
    ctx.textAlign = c.a || 'left';
    ctx.fillText(txt, c.a === 'right' ? x + c.w - CP : c.a === 'center' ? x + c.w / 2 : x + CP, ty);
    ctx.textAlign = 'left';
  };
  cols.forEach(c => { cell(c.t, c, x, y, theadH); x += c.w; });
  y += theadH;

  if (!layout.length) {
    ctx.fillStyle = MUTED; ctx.font = `italic 600 16px ${SERIF}`; ctx.textAlign = 'center';
    ctx.fillText('Tidak ada transaksi', W / 2, y + 26); ctx.textAlign = 'left'; y += 70;
  }
  for (const r of layout) {
    x = PAD; ctx.fillStyle = MUTED; ctx.font = `600 14px ${SANS}`;
    cell(String(r.i + 1), cols[0], x, y, r.h); x += cols[0].w;
    ctx.fillStyle = INK; cell(fmtTgl(r.t.tgl), cols[1], x, y, r.h); x += cols[1].w;
    const sy = y + (r.h - r.lines.length * LH) / 2 + 3;
    r.lines.forEach((ln, k) => {
      if (ln[0] === '\u0001') { ctx.fillStyle = GOLD; ctx.font = `700 12.5px ${SANS}`; ctx.fillText(ln.slice(1), x + CP, sy + k * LH + 2); }
      else { ctx.fillStyle = INK; ctx.font = `500 15px ${SANS}`; ctx.fillText(ln, x + CP, sy + k * LH); }
    });
    x += cols[2].w;
    ctx.fillStyle = NAVY; ctx.font = `600 16px ${SERIF}`;
    cell(rp(subtotalOf(r.t)), cols[3], x, y, r.h); x += cols[3].w;
    const paid = r.t.status === 'sudah';
    const bw = 120, bh = 26, bx = x + (cols[4].w - bw) / 2, by = y + (r.h - bh) / 2;
    ctx.fillStyle = paid ? '#e3f3ea' : '#fbeadb'; roundRect(ctx, bx, by, bw, bh, 13); ctx.fill();
    ctx.fillStyle = paid ? '#1f7a55' : '#a2561c';
    ctx.beginPath(); ctx.arc(bx + 15, by + bh / 2, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = `700 12.5px ${SANS}`; ctx.fillText(statusLabel(r.t.status), bx + 25, by + 6);
    y += r.h;
    ctx.strokeStyle = LINE; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD, y); ctx.lineTo(W - PAD, y); ctx.stroke();
  }

  // ringkasan
  const total = rows.reduce((s, t) => s + subtotalOf(t), 0);
  const sudah = rows.filter(t => t.status === 'sudah').reduce((s, t) => s + subtotalOf(t), 0);
  const belum = total - sudah;
  y += 24;
  const bxW = 330, bxX = W - PAD - bxW;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = LINE; roundRect(ctx, bxX, y, bxW, 136, 14); ctx.fill(); ctx.stroke();
  const ln = (label, val, color, yy, big) => {
    ctx.fillStyle = MUTED; ctx.font = `600 13.5px ${SANS}`; ctx.fillText(label, bxX + 20, yy + (big ? 8 : 0));
    ctx.fillStyle = color; ctx.font = big ? `600 24px ${SERIF}` : `700 14.5px ${SANS}`;
    ctx.textAlign = 'right'; ctx.fillText(val, bxX + bxW - 20, yy); ctx.textAlign = 'left';
  };
  ln('Total', rp(total), INK, y + 18);
  ln('Sudah dibayar', rp(sudah), '#1f7a55', y + 46);
  ctx.strokeStyle = LINE; ctx.beginPath(); ctx.moveTo(bxX + 20, y + 76); ctx.lineTo(bxX + bxW - 20, y + 76); ctx.stroke();
  ctx.fillStyle = GOLD; ctx.fillRect(bxX, y + 88, 4, 34);
  ln('Belum dibayar', rp(belum), '#a2561c', y + 90, true);

  ctx.fillStyle = MUTED; ctx.font = `italic 600 13px ${SERIF}`;
  ctx.fillText(`${rows.length} transaksi`, PAD, y + 18);
  ctx.fillText('Terima kasih atas kepercayaan Anda.', PAD, y + 40);
  return { canvas, count: rows.length };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function drawPreview() { renderReport($('#preview'), 1.5); }
const fontsReady = Promise.all(['500 15px Jakarta','700 15px Jakarta','800 12px Jakarta','600 16px Fraunces'].map(f => document.fonts.load(f))).catch(() => {});
fontsReady.then(() => { if ($('#view-export').classList.contains('active')) drawPreview(); });
// Nama di laporan: ikut terisi saat memilih pelanggan, tapi boleh diubah / dikosongkan
$('#e-nama').addEventListener('change', () => { $('#e-label').value = $('#e-nama').value; drawPreview(); });
['#e-nama', '#e-from', '#e-to', '#e-status', '#e-title', '#e-label'].forEach(s => $(s).addEventListener('input', drawPreview));
$('#e-title').value = loadSettings().title || '';
$('#e-title').addEventListener('change', () => { const s = loadSettings(); s.title = $('#e-title').value.trim(); saveSettings(s); });

function fileBase() {
  const n = $('#e-label').value.trim() || $('#e-nama').value; const slug = (n || 'semua').replace(/[^\w-]+/g, '_');
  return `fotokopi_${slug}_${today()}`;
}
function canvasBlob(c, type, q) { return new Promise(res => c.toBlob(res, type, q)); }
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function makeJpg() {
  await fontsReady;
  const { canvas } = renderReport(document.createElement('canvas'), 2);
  return new File([await canvasBlob(canvas, 'image/jpeg', 0.92)], fileBase() + '.jpg', { type: 'image/jpeg' });
}
async function makePdf() {
  await fontsReady;
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
  download(new Blob([JSON.stringify({ transaksi: data, pengeluaran: expenses }, null, 2)], { type: 'application/json' }), `backup_fotokopi_${today()}.json`);
});
$('#btnRestore').addEventListener('click', () => $('#fileRestore').click());
$('#fileRestore').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const arr = Array.isArray(raw) ? raw : raw.transaksi;
    if (!Array.isArray(arr)) throw 0;
    if (Array.isArray(raw.pengeluaran)) {
      const oldX = expenses.map(t => t.id);
      expenses = raw.pengeluaran.map(t => ({ ...t, id: t.id || uid() }));
      const xids = new Set(expenses.map(t => t.id));
      saveExp([...xids], oldX.filter(id => !xids.has(id)));
    }
    if (!confirm(`Pulihkan ${arr.length} transaksi? Data sekarang (${data.length}) akan diganti.`)) return;
    const old = data.map(t => t.id);
    data = arr.map(t => ({ ...t, id: t.id || uid() }));
    const ids = new Set(data.map(t => t.id));
    save([...ids], old.filter(id => !ids.has(id))); toast('Data dipulihkan');
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
  data.push(...added); save(added.map(t => t.id)); toast(`${added.length} transaksi diimpor`);
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
/* ===== Versi & update otomatis =====
   Saat Anda commit ke GitHub, workflow mengganti __APP_VERSION__ dengan versi baru.
   Service worker baru ikut berubah -> aplikasi mendeteksinya lalu memuat ulang sendiri. */
const APP_VERSION = '__APP_VERSION__';
$('#versionLabel').textContent = 'Versi ' + (APP_VERSION.startsWith('__') ? 'lokal' : APP_VERSION);
{ const d = new Date(); $('#todayLabel').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

function formDirty() { return !!(F('nama').value.trim() || F('order').value.trim()) && $('#view-form').classList.contains('active'); }
function applyUpdate() { location.reload(); }
$('#btnUpdate').addEventListener('click', applyUpdate);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  let hasController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hasController) { hasController = true; return; } // pemasangan pertama: tidak perlu reload
    if (reloading) return;
    if (formDirty()) { $('#updateBar').classList.add('show'); return; } // jangan ganggu saat sedang mengisi
    reloading = true; applyUpdate();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    window.addEventListener('online', check);
    setInterval(check, 30 * 60 * 1000);
  }).catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
