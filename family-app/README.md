# AI Caretaker — App Keluarga (React Native / Expo)

Sisi **caregiver** dari AI Caretaker: mengatur pengingat, membaca kabar harian,
dan menerima peringatan darurat. Hasil porting dari prototipe
[`../mockup-keluarga/`](../mockup-keluarga/) ke React Native, memakai backend di
[`../backend/`](../backend/). Acuan desain: [`../PLAN.md`](../PLAN.md).

App sisi lansia (voice-first, tanpa UI) ada di project terpisah:
[`../elder-app/`](../elder-app/) — alasan pemisahannya di PLAN §4.3.

## Menjalankan

Butuh **Node ≥ 20.19.4** (React Native 0.86 menolak versi di bawahnya).

> **Tidak lagi bisa lewat Expo Go.** Notifikasi push dan audio panggilan
> (`expo-notifications`, `@livekit/react-native-webrtc`) butuh modul native.

```bash
cd family-app
npm install
npx expo run:android      # build + pasang ke HP (butuh Android SDK)
```

`.env` sudah menunjuk ke backend production, jadi tidak ada yang perlu diisi
untuk menjalankannya. Setelah terpasang sekali, `npm start` cukup.

### Mengarahkan app ke backend

Default `.env`: `https://eldercare-gemastik-competition.vercel.app`. Untuk backend lokal,
buat `.env.local` (menang atas `.env`) lalu jalankan `cd ../backend && npm run dev`.

| Cara menjalankan | Alamat |
|---|---|
| Backend production | `https://eldercare-gemastik-competition.vercel.app` |
| Emulator Android | `http://10.0.2.2:4000` |
| HP fisik satu Wi-Fi | `http://<IP-LAN-laptop>:4000` |

Alamat `http://` **hanya jalan di development build** (varian debug). Build
release memblokir cleartext HTTP, jadi APK yang dibagikan wajib `https://`.

`10.0.2.2` adalah alamat khusus emulator Android untuk `localhost` mesin host —
`localhost` saja akan menunjuk ke emulator itu sendiri. Untuk HP fisik, cari IP
laptop dengan `ipconfig` dan pastikan keduanya satu Wi-Fi.

Alamat yang sedang dipakai selalu ditampilkan di layar Masuk dan di bawah layar
Profil, supaya salah alamat langsung ketahuan.

## Masuk

Untuk sekarang: tombol **"Coba sebagai tamu"** → memanggil
`POST /api/auth/guest`, yang membuat akun tamu berisi data contoh sendiri.
Jalurnya sama di backend lokal maupun production.

Tombol **Google** sengaja dinonaktifkan: butuh Android OAuth client ID, yang
butuh SHA-1 dari keystore, yang baru ada setelah build pertama. Begitu client ID
itu jadi, `loginWithGoogle(idToken)` di [`src/api/caretaker.js`](src/api/caretaker.js)
tinggal dipakai — sisa app tidak berubah karena keduanya menghasilkan JWT yang
sama, dan akun tamu yang sedang aktif ikut "naik kelas" jadi akun asli.

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
  notifications/
    push.js                izin + token FCM + dua kanal Android
    useNotificationRouting.js  ketukan notifikasi -> layar kejadian
  navigation/
    RootNavigator.js       5 tab + layar bertumpuk
  screens/                 satu file per layar
```

## Layar

| Layar | Isi | Endpoint |
|---|---|---|
| Masuk | login tamu, alamat server | `POST /api/auth/guest` |
| Tambah lansia | nama, tahun lahir, telepon, relasi, **zona waktu**, pengingat sholat | `POST /api/elders` |
| Hubungkan perangkat | QR + kode, hitung mundur, putuskan perangkat | `POST /api/elders/:id/pairing-code`, `.../unpair` |
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
   ringkasannya tetap terkirim. Izin dinyalakan lansia sendiri lewat suara:
   asisten menanyakannya sekali sehari selama masih mati (lihat
   `backend/README.md` bagian "Consent lewat suara").
3. **Darurat tetap di dalam app.** Notifikasi → panggilan suara in-app, tanpa
   SMS/telepon pulsa. Rantainya utuh sekarang: lansia bicara "tolong" → backend
   mengirim FCM ke HP keluarga → ketukan membuka kejadiannya → layar Panggilan
   menyambung ke room LiveKit dan mikrofon kedua sisi menyala. Sisi lansia masuk
   room otomatis, tanpa perlu mengangkat apa pun.

## Notifikasi darurat

Yang didaftarkan ke backend adalah **token FCM mentah**
(`getDevicePushTokenAsync`), bukan `ExponentPushToken[...]`. Bedanya penting:
token Expo baru sampai ke Android setelah service account FCM diunggah ke
project Expo lewat `eas credentials` — satu langkah interaktif lagi yang harus
diingat orang. Token FCM dilayani `firebase-admin` di backend memakai service
account yang sudah ada, jadi rantainya lebih pendek. Backend menerima kedua
bentuk (`backend/src/services/push.js`), jadi keputusan ini bisa dibalik tanpa
mengubah server.

Konsekuensinya: `google-services.json` **wajib** ada di root project ini
(ditunjuk `android.googleServicesFile`). File itu di-gitignore, jadi salin dari
root repo saat menyiapkan mesin baru — tanpanya token tidak pernah terbit dan
notifikasi diam-diam tidak akan pernah datang.

Dua kanal Android, bukan satu: `emergency` (MAX importance, menembus mode
senyap) dan `default`. Kalau kabar harian dan panggilan darurat berbagi satu
kanal, keluarga hanya punya dua pilihan — diganggu terus-menerus atau
membisukan keduanya — dan yang kedua itulah yang biasanya terjadi.

Pendaftaran terjadi otomatis setiap kali ada sesi (termasuk sesi yang dipulihkan
saat app dibuka), karena token FCM bisa dirotasi Android kapan saja. Di layar
Profil ada tombol **"Kirim notifikasi uji"** — membuktikan jalurnya sampai ke HP
tanpa perlu memicu kejadian darurat palsu.

Mengetuk notifikasi darurat membuka langsung layar kejadiannya, termasuk saat
app sedang mati sama sekali (`getLastNotificationResponseAsync`) — justru itu
kasus yang paling penting: HP di saku, app tertutup.

## Yang belum jalan

- **Google Sign-In.** Lihat bagian Masuk di atas. Sampai itu ada, masuk lewat
  login tamu.
- **iOS.** Di luar scope fase ini (PLAN §6, Android-only). `Info.plist` untuk
  mikrofon dan `@config-plugins/react-native-webrtc` belum disiapkan.

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
