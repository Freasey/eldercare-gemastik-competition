# Mockup App Keluarga (HTML)

Prototipe UI untuk sisi **keluarga/caregiver**. Ini versi HTML dulu supaya
bisa dinilai dan direvisi cepat — belum React Native.

## Cara membuka

Buka `index.html` langsung di browser (klik dua kali juga bisa, tidak perlu
server). Tanpa build step, tanpa dependency.

Bisa juga langsung ke satu layar lewat alamat:
`index.html#beranda`, `#jadwal`, `#riwayat`, `#darurat`, `#profil`.

## Soal tampilan mobile

UI utama dirancang untuk HP. Di layar lebar (desktop), tampilan **dipaksa
tetap seukuran HP** (390×844) dan diletakkan di tengah dengan bingkai
perangkat — sisi kiri dan kanan sengaja dibiarkan kosong, bukan diregangkan.
Di layar sempit (HP asli), bingkai hilang dan app memenuhi layar.

Mendukung mode terang dan gelap mengikuti setelan sistem.

## Yang bisa dicoba

| Layar | Isi |
|---|---|
| Login | Google Sign-In (mock) + tombol demo |
| Beranda | status lansia, **kalimat yang akan diucapkan asisten berikutnya**, red flag, sisa jadwal hari ini, aktivitas terbaru |
| Jadwal | daftar jadwal berulang, filter jenis, sheet tambah jadwal |
| Riwayat | grafik kepatuhan obat, grafik suasana hati, tren pola bicara, daftar percakapan, ringkasan harian |
| Darurat | status, alur eskalasi, riwayat kejadian, kontak darurat |
| Profil | data lansia, **panel privasi yang terkunci**, akun |

Interaksi yang jalan:

- Ganti lansia lewat chip di atas (Ibu Sumarni ↔ Bapak Hartono).
- Grafik: arahkan kursor / sentuh untuk tooltip, dan ada tautan
  "Lihat sebagai tabel" untuk versi non-visual.
- Riwayat → tap percakapan: satu punya transkrip, satu lagi **dikunci**
  karena lansia belum mengizinkan berbagi transkrip.
- Darurat → "Simulasi alarm": notifikasi push muncul dari atas, tap untuk
  masuk ke layar panggilan suara dalam aplikasi.
- Profil → tap salah satu tombol izin: muncul penjelasan kenapa keluarga
  tidak bisa mengubahnya.

## Yang sengaja ditonjolkan

Tiga hal ini pembeda utama produk, jadi dibuat kelihatan di UI:

1. **Context engine terlihat.** Kartu di Beranda menampilkan kalimat persis
   yang akan diucapkan asisten ke lansia berikutnya, beserta alasan
   prioritasnya. Logikanya menyalin aturan di
   `backend/src/services/contextEngine.js` (fungsi `hitungPrioritas` di
   `app.js`) — jadi mockup ini ikut berubah sesuai jam saat dibuka.
2. **Privasi sebagai fitur, bukan checkbox.** Keluarga bisa melihat izin,
   tapi tidak bisa menyalakannya; transkrip percakapan bisa disembunyikan
   sementara ringkasannya tetap terkirim.
3. **Darurat tetap di dalam app.** Notifikasi → panggilan suara in-app
   (LiveKit), tidak ada SMS/telepon PSTN.

## Data contoh

Semua dari `data.js`, tidak ada network call. Tanggal dihitung relatif
terhadap hari ini, jadi tampilan selalu terlihat "hidup":

- **Ibu Sumarni** (73) — 7 jadwal, Metformin terlewat 3 hari berturut-turut,
  tren suasana hati menurun, 2 kejadian darurat yang sudah ditangani.
  Metformin pagi hari ini sengaja dibiarkan belum dikonfirmasi supaya
  context engine punya sesuatu yang berprioritas tinggi.
- **Bapak Hartono** (78) — profil bersih, untuk membandingkan tampilan saat
  tidak ada masalah.

Bentuk datanya dibuat mirip response backend Express, jadi saat dipindah ke
React Native tinggal mengganti `data.js` dengan `fetch()`.

## Catatan

Ini prototipe tampilan: tidak ada penyimpanan, tidak ada validasi form, dan
tombol simpan hanya menampilkan konfirmasi. Struktur layar & state di
`app.js` yang dipakai sebagai acuan saat porting ke React Native.
