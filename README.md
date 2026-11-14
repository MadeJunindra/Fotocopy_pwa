# Catatan Fotokopi (PWA)

Aplikasi pencatat transaksi fotokopi: Nama, Order, Rangkap, Isian, Qty, Harga per lembar, Tgl, Subtotal, Status.
Ekspor laporan ke JPG/PDF (Tgl, Order, Subtotal, Status). Bisa dipasang di HP dan jalan offline.

## Publikasi & update otomatis
1. Settings → Pages → **Source: GitHub Actions**.
2. Setiap commit ke branch `main`, workflow `.github/workflows/deploy.yml` otomatis:
   - memberi nomor versi baru,
   - men-deploy ke GitHub Pages.
3. Aplikasi di HP memeriksa versi baru setiap dibuka, lalu memuat ulang sendiri.
   Data transaksi tidak hilang saat update (tersimpan di perangkat).
