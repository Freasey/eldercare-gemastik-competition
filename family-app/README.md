# AI Caretaker — App Keluarga (React Native / Expo)

Sisi **caregiver** dari AI Caretaker: mengatur pengingat, membaca kabar harian,
dan menerima peringatan darurat. Hasil porting dari prototipe
[`../mockup-keluarga/`](../mockup-keluarga/) ke React Native, memakai backend di
[`../backend/`](../backend/). Acuan desain: [`../PLAN.md`](../PLAN.md).

App sisi lansia (voice-first) belum ada di sini — nanti folder terpisah.

## Menjalankan

Butuh **Node ≥ 20.19.4** (React Native 0.86 menolak versi di bawahnya).

```bash
cd family-app
npm install
cp .env.example .env      # lalu sesuaikan EXPO_PUBLIC_API_URL
npm start                 # tekan `a` untuk Android
```

Backend harus jalan lebih dulu:

```bash
cd ../backend && npm run dev
```

### Mengarahkan app ke backend

Isi `EXPO_PUBLIC_API_URL` di `family-app/.env`:

| Cara menjalankan | Alamat |
|---|---|
| Emulator Android | `http://10.0.2.2:4000` |
| HP fisik + Expo Go | `http://<IP-LAN-laptop>:4000` |
| Setelah deploy | `https://<nama-app>.back4app.io` |

`10.0.2.2` adalah alamat khusus emulator Android untuk `localhost` mesin host —
`localhost` saja akan menunjuk ke emulator itu sendiri. Untuk HP fisik, cari IP
laptop dengan `ipconfig` dan pastikan keduanya satu Wi-Fi.

Alamat yang sedang dipakai selalu ditampilkan di layar Masuk dan di bawah layar
Profil, supaya salah alamat langsung ketahuan.

## Masuk

Untuk sekarang: tombol **"Masuk sebagai demo keluarga"** → memanggil
`POST /api/auth/dev-login` dengan email dari `EXPO_PUBLIC_DEV_LOGIN_EMAIL`
(default `keluarga.demo@caretaker.id`, akun yang dibuat `npm run db:seed`).

Tombol **Google** sengaja dinonaktifkan: butuh Android OAuth client ID, yang
butuh SHA-1 dari keystore, yang baru ada setelah build pertama. Begitu client ID
itu jadi, `loginWithGoogle(idToken)` di [`src/api/caretaker.js`](src/api/caretaker.js)
tinggal dipakai — sisa app tidak berubah karena keduanya menghasilkan JWT yang
sama. **`ALLOW_DEV_LOGIN` wajib dimatikan sebelum backend dideploy.**

## Struktur

```
App.js                     provider: tema -> auth -> navigasi
src/
  api/
    client.js              fetch + JWT di SecureStore + pesan error jaringan
    caretaker.js           satu fungsi per endpoint backend
  context/
    AuthContext.js         sesi login, pulih otomatis saat app dibuka
    ElderContext.js        daftar lansia + siapa yang sedang dipilih
  theme/
    tokens.js              warna terang/gelap, salinan dari styles.css mockup
    theme.js               provider + useColors()
  lib/
    format.js              tanggal/jam bahasa Indonesia, hari, nama panggilan
    constants.js           label jenis jadwal, pembuka percakapan, consent
    useApi.js              pemanggil endpoint + muat ulang + anti hasil basi
  components/
    Icon.js                set ikon SVG, dipindahkan dari mockup
    ui.js                  Card, Row, Pill, StatusIcon, Chip, Button, dll
    Charts.js              grafik kepatuhan & suasana hati (react-native-svg)
    Sheet.js               panel dari bawah + isian form
    ScreenShell.js         app bar + chip ganti lansia + tarik untuk muat ulang
  navigation/
    RootNavigator.js       5 tab + layar bertumpuk
  screens/                 satu file per layar
```

## Layar

| Layar | Isi | Endpoint |
|---|---|---|
| Masuk | dev-login, alamat server | `POST /api/auth/dev-login` |
| Beranda | status lansia, **kalimat berikutnya dari asisten**, red flag, sisa jadwal, aktivitas terbaru | `assistant/context`, `reminders`, `timeline`, `summaries/week` |
| Jadwal | daftar jadwal berulang, filter, tambah/ubah/hapus | `schedules` (GET/POST/PATCH/DELETE) |
| Riwayat | grafik kepatuhan & suasana hati, pola bicara, percakapan, ringkasan harian | `reminders/adherence`, `checkins`, `summaries`, `timeline` |
| Darurat | status, alur eskalasi, riwayat, kontak darurat | `emergencies`, `contacts` |
| Profil | data lansia, **panel privasi terkunci**, akun | `GET /api/elders/:id` |
| Percakapan | ringkasan + transkrip, atau alasan transkrip ditahan | `conversations/:id` |
| Panggilan | ruang panggilan darurat | `emergencies/:id/join` |

## Tiga hal yang sengaja ditonjolkan

Sama seperti di mockup — ini pembeda produk, jadi dibuat kelihatan:

1. **Context engine terlihat.** Kartu di Beranda menampilkan kalimat persis yang
   akan diucapkan asisten ke lansia berikutnya beserta alasan prioritasnya.
   Berbeda dengan mockup yang menyalin aturannya di sisi klien, app ini membaca
   `GET /api/elders/:id/assistant/context` — jadi yang tampil benar-benar
   keputusan context engine di backend, bukan tiruan yang bisa ikut basi.
2. **Privasi sebagai fitur.** Panel izin di Profil bisa dilihat tapi tidak bisa
   diubah keluarga; backend menolaknya lewat `CONSENT_ELDER_ONLY`. Transkrip
   percakapan yang belum diizinkan tampil sebagai penjelasan, bukan error —
   ringkasannya tetap terkirim.
3. **Darurat tetap di dalam app.** Notifikasi → panggilan suara in-app, tanpa
   SMS/telepon pulsa.

## Yang belum jalan

Semua butuh **development build** (tidak bisa lewat Expo Go), jadi ditunda
sampai build pertama dibuat:

- **Suara pada panggilan darurat.** Layar Panggilan sudah meminta token room
  LiveKit asli ke backend dan menandai kejadian jadi `acknowledged`, tapi
  transport audionya belum ada — `@livekit/react-native` butuh WebRTC native.
  Layar itu menyatakan keadaannya apa adanya, tidak berpura-pura.
- **Notifikasi push.** `expo-notifications` + FCM V1 belum dipasang; sakelar di
  Profil masih mati. Endpoint `POST /api/devices` di backend sudah siap.
- **Google Sign-In.** Lihat bagian Masuk di atas.
- **Tambah lansia baru** dari app (backend `POST /api/elders` sudah ada, layarnya
  belum dibuat — sekarang profil lansia dibuat lewat seed/backend).

## Catatan porting dari mockup

- Warna, radius, dan bobot huruf disalin dari `mockup-keluarga/styles.css`;
  ikon SVG disalin dari `app.js`. Tampilannya sengaja dibuat sama.
- Mockup memakai data statis dari `data.js` dengan penamaan `camelCase`. App ini
  membaca response backend yang `snake_case` (`time_of_day`, `is_critical`,
  `due_at`) — perhatikan bedanya saat membandingkan dua kode itu.
- Kolom `DATE` dari Postgres datang sebagai ISO timestamp yang sudah digeser ke
  zona lokal, bukan `"YYYY-MM-DD"`. `toDate()` di `lib/format.js` menangani
  keduanya.
- Bingkai HP palsu di mockup (390×844 di layar lebar) tidak ikut dipindahkan —
  di HP asli tidak diperlukan.
