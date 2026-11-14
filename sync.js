'use strict';
/* =====================================================================
   Sinkronisasi ke Google Sheets (via Google Apps Script)
   - Data selalu disimpan dulu di perangkat (tetap jalan offline).
   - Perubahan dikirim ke spreadsheet; spreadsheet = sumber data utama.
   - Perangkat lain menarik data yang sama -> semua HP/laptop sinkron.
   ===================================================================== */
const Sync = (() => {
  const KEY = 'fotokopi.sync.v1';
  let st = loadSt();
  let running = false, again = false, timer = null;

  function loadSt() {
    try { return Object.assign({ url: '', token: '', last: 0, dirty: {}, del: {}, error: '' }, JSON.parse(localStorage.getItem(KEY))); }
    catch { return { url: '', token: '', last: 0, dirty: {}, del: {}, error: '' }; }
  }
  function saveSt() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }
  const configured = () => !!(st.url && st.token);
  const pending = () => Object.keys(st.dirty).length + Object.keys(st.del).length;

  /** Catat id yang berubah / dihapus, lalu kirim sebentar lagi. */
  function queue(changed, deleted, now) {
    changed.forEach(id => { st.dirty[id] = now; delete st.del[id]; });
    deleted.forEach(id => { st.del[id] = now; delete st.dirty[id]; });
    saveSt(); render();
    if (configured()) { clearTimeout(timer); timer = setTimeout(run, 1200); }
  }

  const toWire = (t) => ({ id: t.id, nama: t.nama, order: t.order, rangkap: t.rangkap, isian: t.isian, qty: t.qty,
    harga: t.harga, tgl: t.tgl, status: t.status, updated: t.updated || t.created || 1 });

  async function run() {
    if (!configured()) return render();
    if (running) { again = true; return; }
    if (!navigator.onLine) return render('offline');
    running = true; render('syncing');
    const sentDirty = { ...st.dirty }, sentDel = { ...st.del };
    const changes = Object.keys(sentDirty).map(id => data.find(t => t.id === id)).filter(Boolean).map(toWire);
    try {
      const res = await fetch(st.url, {
        method: 'POST', redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // tanpa preflight CORS
        body: JSON.stringify({ token: st.token, changes, deletes: Object.keys(sentDel) }),
      });
      const txt = await res.text();
      let j; try { j = JSON.parse(txt); } catch { throw new Error('Alamat Web App salah atau belum diberi akses "Siapa saja".'); }
      if (!j.ok) throw new Error(j.error || 'Gagal sinkron');
      for (const [id, u] of Object.entries(sentDirty)) if (st.dirty[id] === u) delete st.dirty[id];
      for (const [id, u] of Object.entries(sentDel)) if (st.del[id] === u) delete st.del[id];
      merge(j.records || []);
      st.last = Date.now(); st.error = ''; saveSt(); render('ok');
    } catch (e) {
      st.error = navigator.onLine ? (e.message || String(e)) : ''; saveSt(); render(navigator.onLine ? 'error' : 'offline');
    } finally {
      running = false;
      if (again) { again = false; run(); }
    }
  }

  /** Gabungkan data dari spreadsheet dengan perubahan lokal yang belum terkirim. */
  function merge(records) {
    const local = new Map(data.map(t => [t.id, t]));
    const out = [];
    records.forEach((r, i) => {
      const l = local.get(r.id);
      local.delete(r.id);
      if (st.del[r.id]) return;                    // dihapus di sini, belum terkirim
      if (st.dirty[r.id] && l) { out.push(l); return; } // diubah di sini, belum terkirim
      out.push({ ...r, subtotal: num(r.qty) * num(r.harga), created: l?.created ?? i });
    });
    for (const [id, l] of local) if (st.dirty[id]) out.push(l); // transaksi baru yang belum terkirim
    data = out;
    persistLocal(); renderAll();
  }

  /* ---------- UI ---------- */
  const $s = (s) => document.querySelector(s);
  const jam = (ms) => new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function render(state) {
    const pill = $s('#syncPill'), info = $s('#syncInfo');
    if (!pill) return;
    const p = pending();
    let cls = 'off', txt = 'Belum terhubung', detail = 'Data hanya tersimpan di perangkat ini.';
    if (configured()) {
      state = state || (running ? 'syncing' : !navigator.onLine ? 'offline' : st.error ? 'error' : 'ok');
      if (state === 'syncing') { cls = 'busy'; txt = 'Menyinkron…'; detail = 'Mengirim & mengambil data…'; }
      else if (state === 'offline') { cls = 'warn'; txt = p ? `Offline · ${p} menunggu` : 'Offline'; detail = 'Data aman di perangkat, akan dikirim saat online.'; }
      else if (state === 'error') { cls = 'err'; txt = 'Gagal sinkron'; detail = st.error; }
      else { cls = p ? 'busy' : 'ok'; txt = p ? `${p} menunggu` : 'Tersinkron'; detail = st.last ? `Terakhir sinkron ${jam(st.last)}` : ''; }
    }
    pill.className = 'sync-pill ' + cls; pill.querySelector('span').textContent = txt;
    info.textContent = detail;
    $s('#syncConnected').hidden = !configured();
    $s('#syncSetup').hidden = configured();
  }

  async function connect(url, token) {
    url = url.trim(); token = token.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { alert('Alamat harus diawali https://script.google.com/…'); return; }
    if (!token) { alert('Isi kata sandi (TOKEN) yang sama dengan di Apps Script.'); return; }
    st.url = url; st.token = token; st.error = '';
    data.forEach(t => { if (!st.dirty[t.id]) st.dirty[t.id] = t.updated || t.created || 1; }); // kirim data lama
    saveSt(); await run();
    if (st.error) toast('Gagal: ' + st.error); else toast('Terhubung ke Google Sheets ✓');
  }
  function disconnect() {
    if (!confirm('Putuskan sambungan ke Google Sheets?\nData di perangkat dan di spreadsheet tidak dihapus.')) return;
    st = { url: '', token: '', last: 0, dirty: {}, del: {}, error: '' }; saveSt(); render();
  }

  function init() {
    $s('#btnConnect').addEventListener('click', () => connect($s('#s-url').value, $s('#s-token').value));
    $s('#btnSyncNow').addEventListener('click', () => run());
    $s('#btnDisconnect').addEventListener('click', disconnect);
    $s('#syncPill').addEventListener('click', () => { showView('export'); document.querySelector('#syncCard').scrollIntoView({ behavior: 'smooth' }); if (configured()) run(); });
    window.addEventListener('online', () => run());
    window.addEventListener('offline', () => render());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
    setInterval(() => { if (document.visibilityState === 'visible') run(); }, 60 * 1000);
    render();
    run();
  }
  return { queue, run, init, configured };
})();
Sync.init();
