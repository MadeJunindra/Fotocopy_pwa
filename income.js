'use strict';
/* =====================================================================
   Halaman PENDAPATAN: kotor, pengeluaran, bersih + grafik & rincian
   ===================================================================== */
const KATEGORI = ['Kertas', 'Toner / Tinta', 'Listrik', 'Internet', 'Sewa tempat', 'Perawatan mesin', 'Gaji', 'Lainnya'];
let period = 'bulan';            // hari | bulan | bulanlalu | tahun | semua | custom
const I = (id) => document.getElementById(id);

const ymd = (d) => { const z = new Date(d); z.setMinutes(z.getMinutes() - z.getTimezoneOffset()); return z.toISOString().slice(0, 10); };
const lastDay = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12
const rpShort = (n) => {
  const a = Math.abs(n), sgn = n < 0 ? '-' : '';
  if (a >= 1e9) return sgn + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
  if (a >= 1e6) return sgn + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (a >= 1e3) return sgn + Math.round(a / 1e3) + ' rb';
  return sgn + Math.round(a);
};

function currentRange() {
  const t = today(), [y, m] = t.split('-').map(Number);
  const pad = (x) => String(x).padStart(2, '0');
  switch (period) {
    case 'hari': return { from: t, to: t, label: fmtTgl(t), unit: 'none' };
    case 'bulan': return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}`, label: `${BULAN_PANJANG[m - 1]} ${y}`, unit: 'day' };
    case 'bulanlalu': { const yy = m === 1 ? y - 1 : y, mm = m === 1 ? 12 : m - 1;
      return { from: `${yy}-${pad(mm)}-01`, to: `${yy}-${pad(mm)}-${lastDay(yy, mm)}`, label: `${BULAN_PANJANG[mm - 1]} ${yy}`, unit: 'day' }; }
    case 'tahun': return { from: `${y}-01-01`, to: `${y}-12-31`, label: `Tahun ${y}`, unit: 'month' };
    case 'custom': { const v = I('i-month').value; if (!v) { period = 'bulan'; return currentRange(); }
      const [cy, cm] = v.split('-').map(Number);
      return { from: `${v}-01`, to: `${v}-${lastDay(cy, cm)}`, label: `${BULAN_PANJANG[cm - 1]} ${cy}`, unit: 'day' }; }
    default: { // semua
      const all = [...data.map(x => x.tgl), ...expenses.map(x => x.tgl)].filter(Boolean).sort();
      return { from: all[0] || t, to: all[all.length - 1] || t, label: 'Semua waktu', unit: 'month', all: true };
    }
  }
}
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const inRange = (tgl, r) => r.all || (tgl >= r.from && tgl <= r.to);

function renderIncome() {
  const r = currentRange();
  const tx = data.filter(t => inRange(t.tgl, r));
  const ex = expenses.filter(t => inRange(t.tgl, r));
  const kotor = tx.reduce((s, t) => s + subtotalOf(t), 0);
  const diterima = tx.filter(t => t.status === 'sudah').reduce((s, t) => s + subtotalOf(t), 0);
  const piutang = kotor - diterima;
  const keluar = ex.reduce((s, t) => s + num(t.jumlah), 0);
  const bersih = kotor - keluar;
  const lembar = tx.reduce((s, t) => s + num(t.qty), 0);

  I('i-range').textContent = r.label;
  I('k-kotor').textContent = rp(kotor);
  I('k-kotor-sub').textContent = `${tx.length} transaksi · ${lembar.toLocaleString('id-ID')} lembar`;
  I('k-exp').textContent = rp(keluar);
  I('k-exp-sub').textContent = `${ex.length} catatan pengeluaran`;
  I('k-bersih').textContent = rp(bersih);
  I('k-bersih').classList.toggle('neg', bersih < 0);
  I('k-bersih-sub').textContent = kotor > 0 ? `Margin ${Math.round(bersih / kotor * 100)}% dari kotor` : 'Belum ada pendapatan';
  I('c-diterima').textContent = rp(diterima);
  I('c-piutang').textContent = rp(piutang);
  I('c-kas').textContent = rp(diterima - keluar);
  I('c-kas').classList.toggle('neg', diterima - keluar < 0);

  renderChart(r, tx, ex);
  renderCustomers(tx);
  renderExpenses(ex);
}

/* ---------- Grafik: pendapatan kotor per hari / per bulan ---------- */
function buckets(r) {
  const out = [];
  if (r.unit === 'day') {
    const d = new Date(r.from + 'T00:00:00'), end = new Date(r.to + 'T00:00:00');
    for (; d <= end; d.setDate(d.getDate() + 1)) { const k = ymd(d); out.push({ key: k, label: String(d.getDate()), long: fmtTgl(k) }); }
  } else if (r.unit === 'month') {
    let [y, m] = r.from.split('-').map(Number); const [ty, tm] = r.to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      out.push({ key: k, label: BULAN[m - 1], long: `${BULAN_PANJANG[m - 1]} ${y}` });
      if (++m > 12) { m = 1; y++; }
    }
    if (out.length > 24) out.splice(0, out.length - 24);
  }
  return out;
}
function renderChart(r, tx, ex) {
  const box = I('chart'), tip = I('chartTip');
  const bs = buckets(r);
  I('chartCard').hidden = !bs.length;
  if (!bs.length) return;
  I('chartTitle').textContent = r.unit === 'day' ? 'Pendapatan kotor per hari' : 'Pendapatan kotor per bulan';
  const keyOf = (tgl) => r.unit === 'day' ? tgl : tgl.slice(0, 7);
  const sum = {}, out = {};
  tx.forEach(t => { const k = keyOf(t.tgl); sum[k] = (sum[k] || 0) + subtotalOf(t); });
  ex.forEach(t => { const k = keyOf(t.tgl); out[k] = (out[k] || 0) + num(t.jumlah); });
  const vals = bs.map(b => sum[b.key] || 0);
  const max = Math.max(...vals, 1);
  // skala "rapi"
  const step = niceStep(max / 3), top = Math.ceil(max / step) * step;

  const W = Math.max(280, Math.round(box.clientWidth || 640)), H = 210, L = 46, R = 6, T = 10, B = 24;
  const pw = W - L - R, ph = H - T - B, n = bs.length, slot = pw / n;
  const bw = Math.max(2, Math.min(28, slot - 2)); // celah 2px antar batang
  const y = (v) => T + ph - (v / top) * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${I('chartTitle').textContent}">`;
  for (let v = 0; v <= top + 1e-9; v += step) {
    svg += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid${v === 0 ? ' base' : ''}"/>`;
    svg += `<text x="${L - 8}" y="${y(v) + 4}" class="ylab">${rpShort(v)}</text>`;
  }
  const every = Math.max(1, Math.ceil(n / Math.floor(pw / 34)));
  bs.forEach((b, i) => {
    const v = vals[i], x = L + i * slot + (slot - bw) / 2, yy = y(v), h = T + ph - yy;
    if (v > 0) {
      const rr = Math.min(4, bw / 2, h);
      svg += `<path class="bar" d="M${x},${T + ph} V${yy + rr} Q${x},${yy} ${x + rr},${yy} H${x + bw - rr} Q${x + bw},${yy} ${x + bw},${yy + rr} V${T + ph} Z"/>`;
    }
    if (i % every === 0) svg += `<text x="${L + i * slot + slot / 2}" y="${H - 6}" class="xlab">${b.label}</text>`;
    svg += `<rect class="hit" data-i="${i}" x="${L + i * slot}" y="${T}" width="${slot}" height="${ph}"/>`;
  });
  svg += '</svg>';
  box.innerHTML = svg;

  const show = (i, evt) => {
    const b = bs[i], k = vals[i], o = out[b.key] || 0;
    box.querySelectorAll('.hit').forEach(h => h.classList.toggle('on', +h.dataset.i === i));
    tip.innerHTML = `<b>${b.long}</b><div><span>Kotor</span><span>${rp(k)}</span></div>` +
      `<div><span>Pengeluaran</span><span>${rp(o)}</span></div><div class="t-net"><span>Bersih</span><span>${rp(k - o)}</span></div>`;
    tip.hidden = false;
    const br = box.getBoundingClientRect(), x = (L + i * slot + slot / 2) / W * br.width;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(br.width - tw, x - tw / 2)) + 'px';
  };
  box.querySelectorAll('.hit').forEach(h => {
    h.addEventListener('mouseenter', e => show(+h.dataset.i, e));
    h.addEventListener('click', e => show(+h.dataset.i, e));
  });
  box.onmouseleave = () => { tip.hidden = true; box.querySelectorAll('.hit.on').forEach(h => h.classList.remove('on')); };
  tip.hidden = true;
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/* ---------- Rincian per pelanggan ---------- */
function renderCustomers(tx) {
  const g = {};
  tx.forEach(t => { const k = t.nama || '-'; g[k] = g[k] || { kotor: 0, belum: 0, n: 0 }; g[k].kotor += subtotalOf(t); g[k].n++; if (t.status !== 'sudah') g[k].belum += subtotalOf(t); });
  const rows = Object.entries(g).sort((a, b) => b[1].kotor - a[1].kotor);
  const max = rows.length ? rows[0][1].kotor : 1;
  I('custList').innerHTML = rows.length ? rows.slice(0, 10).map(([nama, v]) => `
    <div class="cust">
      <div class="cust-top"><span class="cust-name">${esc(nama)}</span><span class="cust-val">${rp(v.kotor)}</span></div>
      <div class="meter"><i style="width:${Math.max(2, v.kotor / max * 100)}%"></i></div>
      <div class="cust-meta">${v.n} transaksi${v.belum ? ` · <span class="owe">belum dibayar ${rp(v.belum)}</span>` : ' · lunas'}</div>
    </div>`).join('') + (rows.length > 10 ? `<p class="hint">+${rows.length - 10} pelanggan lainnya</p>` : '')
    : '<p class="hint">Belum ada transaksi di periode ini.</p>';
}

/* ---------- Pengeluaran ---------- */
function renderExpenses(ex) {
  const byCat = {};
  ex.forEach(t => byCat[t.kategori || 'Lainnya'] = (byCat[t.kategori || 'Lainnya'] || 0) + num(t.jumlah));
  I('catSum').innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="cat"><span>${esc(k)}</span><b>${rp(v)}</b></span>`).join('');
  const rows = [...ex].sort((a, b) => b.tgl.localeCompare(a.tgl) || (b.created || 0) - (a.created || 0));
  I('expList').innerHTML = rows.length ? rows.map(t => `
    <div class="exp">
      <div><div class="exp-ket">${esc(t.ket || t.kategori)}</div><div class="exp-meta">${fmtTgl(t.tgl)} · ${esc(t.kategori || 'Lainnya')}</div></div>
      <div class="exp-right"><div class="exp-val">−${rp(t.jumlah)}</div>
        <div><button class="btn sm ghost" data-xedit="${t.id}">Edit</button> <button class="btn sm danger" data-xdel="${t.id}">Hapus</button></div></div>
    </div>`).join('') : '<p class="hint">Belum ada pengeluaran di periode ini.</p>';
}
function resetExpForm() {
  I('x-id').value = ''; I('x-tgl').value = today(); I('x-ket').value = ''; I('x-jumlah').value = '';
  I('x-kat').value = KATEGORI[0]; I('x-save').textContent = 'Tambah Pengeluaran'; I('x-cancel').hidden = true;
}

/* ---------- Event ---------- */
I('x-kat').innerHTML = KATEGORI.map(k => `<option>${k}</option>`).join('');
resetExpForm();
I('expForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const jumlah = num(I('x-jumlah').value);
  if (!jumlah) { toast('Isi jumlah pengeluaran'); return; }
  const id = I('x-id').value || uid();
  const t = { id, tgl: I('x-tgl').value || today(), ket: I('x-ket').value.trim(), kategori: I('x-kat').value, jumlah };
  const i = expenses.findIndex(x => x.id === id);
  if (i >= 0) expenses[i] = { ...expenses[i], ...t }; else expenses.push({ ...t, created: Date.now() });
  saveExp([id]); toast(i >= 0 ? 'Pengeluaran diperbarui' : 'Pengeluaran dicatat'); resetExpForm();
});
I('x-cancel').addEventListener('click', resetExpForm);
I('expList').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.xedit) {
    const t = expenses.find(x => x.id === b.dataset.xedit); if (!t) return;
    I('x-id').value = t.id; I('x-tgl').value = t.tgl; I('x-ket').value = t.ket || ''; I('x-kat').value = t.kategori || 'Lainnya';
    I('x-jumlah').value = t.jumlah; I('x-save').textContent = 'Simpan Perubahan'; I('x-cancel').hidden = false;
    I('expForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (b.dataset.xdel) {
    const t = expenses.find(x => x.id === b.dataset.xdel);
    if (t && confirm(`Hapus pengeluaran "${t.ket || t.kategori}" ${rp(t.jumlah)}?`)) {
      expenses = expenses.filter(x => x.id !== t.id); saveExp([], [t.id]); toast('Dihapus');
    }
  }
});
document.querySelectorAll('#periodChips .chip').forEach(c => c.addEventListener('click', () => {
  period = c.dataset.p; I('i-month').value = '';
  document.querySelectorAll('#periodChips .chip').forEach(x => x.setAttribute('aria-pressed', String(x === c)));
  renderIncome();
}));
I('i-month').addEventListener('input', () => {
  if (!I('i-month').value) return;
  period = 'custom';
  document.querySelectorAll('#periodChips .chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
  renderIncome();
});

let _rz; window.addEventListener('resize', () => { clearTimeout(_rz); _rz = setTimeout(() => { if (I('view-income').classList.contains('active')) renderIncome(); }, 200); });
