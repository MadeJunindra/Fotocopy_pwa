# Panduan: Menghubungkan Aplikasi ke Google Sheets (Database)

Cukup dilakukan **sekali**. Kira-kira 5 menit.

## 1. Pasang skrip di spreadsheet Anda
1. Buka spreadsheet Anda di laptop/PC (lebih mudah daripada di HP).
2. Pilih menu **Ekstensi → Apps Script**.
3. Hapus semua kode yang ada, lalu tempel **seluruh isi** file `apps-script/Code.gs`.
4. Di baris paling atas, ganti
   `const TOKEN = 'GANTI-DENGAN-KATA-SANDI-ANDA';`
   dengan kata sandi buatan Anda sendiri, misalnya `'fotokopi-berkah-2026'`.
5. Klik ikon **💾 Simpan**.

## 2. Jadikan Web App
1. Klik tombol biru **Terapkan (Deploy) → Deployment baru**.
2. Klik ikon ⚙ di sebelah "Pilih jenis", lalu pilih **Aplikasi web**.
3. Isi pengaturannya:
   - **Jalankan sebagai:** *Saya (email Anda)*
   - **Yang memiliki akses:** *Siapa saja* (wajib; data tetap terlindungi kata sandi TOKEN)
4. Klik **Terapkan**, lalu **Izinkan akses** dan pilih akun Google Anda.
   - Jika muncul "Google belum memverifikasi aplikasi ini": klik **Lanjutan**, lalu **Buka … (tidak aman)**, lalu **Izinkan**. Ini normal, karena skripnya buatan Anda sendiri.
5. **Salin alamat Web App** (berakhiran `/exec`).

## 3. Impor data lama dari Sheet 4
1. Muat ulang (refresh) spreadsheet. Di menu atas akan muncul **📄 Fotokopi**.
2. Pilih **📄 Fotokopi → Impor data lama (dari sheet lain)…**
3. Ketik `4` (sheet ke-4) atau nama sheet-nya, lalu klik OK, lalu **Ya**.
4. Data akan disalin ke sheet baru bernama **Transaksi App**. Sheet 4 Anda **tidak diubah**.

Skrip mencari kolom berdasarkan judulnya: Nama, Order, Rangkap, Isian, Qty, Harga per lembar, Tgl, Status.
Kalau sel Nama atau Tgl kosong, nilai dari baris di atasnya yang dipakai.

## 4. Hubungkan aplikasi
1. Buka aplikasi, lalu masuk ke tab **Ekspor**, bagian **Database Google Sheets**.
2. Tempel **alamat Web App** dan isi **kata sandi (TOKEN)**.
3. Klik **Hubungkan**. Status di pojok kanan atas akan berubah menjadi 🟢 **Tersinkron**.
4. Lakukan langkah ini di **setiap HP atau laptop** yang ingin dipakai.

## Cara kerjanya
- Setiap transaksi disimpan dulu di HP, lalu otomatis dikirim ke sheet **Transaksi App**.
- Saat offline, aplikasi tetap bisa dipakai. Status menunjukkan "Offline · N menunggu", dan data terkirim sendiri begitu internet kembali.
- Anda juga bisa mengedit, menambah, atau menghapus baris **langsung di sheet Transaksi App**. Perubahannya masuk ke aplikasi saat sinkron berikutnya (tiap 1 menit, atau saat aplikasi dibuka).
- Kolom **ID** dan **Diubah** dipakai untuk sinkronisasi. Jangan diubah manual.

## Kalau nanti `Code.gs` diperbarui
Di Apps Script: tempel kode baru, lalu **Terapkan → Kelola deployment → ✏ Edit → Versi: Versi baru → Terapkan**.
Alamat Web App tetap sama, jadi aplikasi tidak perlu dihubungkan ulang.

## Keamanan
- Alamat Web App dan TOKEN hanya disimpan di HP Anda, **tidak** ikut ke GitHub.
- Jangan commit `Code.gs` yang sudah berisi kata sandi asli ke GitHub (repo Anda publik). Biarkan file di repo tetap berisi `GANTI-DENGAN-KATA-SANDI-ANDA`.
