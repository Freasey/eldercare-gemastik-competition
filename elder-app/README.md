# AI Caretaker — App Lansia (React Native / Expo)

Sisi **lansia** dari AI Caretaker: voice-first, tanpa UI. Membuka aplikasi ini
sama dengan memulai percakapan — tidak ada beranda, menu, atau tombol "mulai
bicara". Acuan desain: [`../PLAN.md`](../PLAN.md) §2.2, §2.5, §2.6.

Backend-nya sama dengan app keluarga: [`../backend/`](../backend/).
Sisi caregiver ada di [`../family-app/`](../family-app/).

## Kenapa project terpisah dari `family-app/`

Nol komponen yang bisa dipakai bersama: app keluarga adalah lima tab + grafik +
navigasi, app ini satu layar tanpa navigasi. Menggabungkannya berarti tiap build
memuat dependency milik peran lain — kamera QR dan STT ikut masuk ke HP
keluarga, react-navigation dan chart SVG ikut masuk ke HP lansia — padahal
syarat di PLAN §4 justru "harus jalan di HP Android low/mid-range".

Konsekuensinya: package name sendiri (`com.eldercare.elder`), dan app ini
**tidak** memakai Google Sign-In maupun push notification. Masuknya lewat kode
pairing, pengingatnya lewat notifikasi lokal.

## Menjalankan

Butuh **Node ≥ 20.19.4** (React Native 0.86 menolak versi di bawahnya).

> **Tidak bisa lewat Expo Go.** App ini memakai modul native
> (`expo-speech-recognition`, `expo-camera`, `expo-notifications`), jadi harus
> dijalankan lewat development build.

```bash
cd elder-app
npm install
cp .env.example .env.local     # isi EXPO_PUBLIC_API_URL
npx expo run:android           # build + pasang ke HP/emulator (butuh Android SDK)
```

Setelah terpasang sekali, `npm start` cukup untuk sesi berikutnya — Metro akan
menyambung ke build yang sudah ada, bukan ke Expo Go.

Backend harus jalan lebih dulu:

```bash
cd ../backend && npm run dev
```

### Mengarahkan app ke backend

| Cara menjalankan | `EXPO_PUBLIC_API_URL` |
|---|---|
| Emulator Android | `http://10.0.2.2:4000` |
| HP fisik satu Wi-Fi | `http://<IP-LAN-laptop>:4000` |
| Setelah deploy | `https://<nama-app>.b4a.run` |

## Alur

```
buka app
  │
  ├─ belum ter-pair ──→ PairingScreen
  │                     app bicara sendiri meminta bantuan keluarga,
  │                     lalu memindai QR dari app keluarga
  │                     (atau enam hurufnya diketik manual)
  │                          │ POST /api/auth/pair
  │                          ↓ token + profil lansia disimpan
  └─ sudah ter-pair ──→ SessionScreen — percakapan langsung dimulai
```

Loop percakapan (`src/voice/useVoiceSession.js`):

| Tahap | Yang terjadi |
|---|---|
| buka | `POST .../assistant/sessions` → backend menentukan kalimat pembuka |
| bicara | TTS mengucapkan `speech`, caption tampil |
| mendengar | STT menangkap jawaban, caption ikut berjalan |
| berpikir | `POST .../turns` dengan `expects`, `reminderId`, `consentKey` apa adanya |
| ulang | pakai `expects` baru dari respons |
| tutup | `POST .../end` saat diam 2× berturut, kalimat penutup, atau error |

**App tidak menyimpan state percakapan sendiri.** Prioritas bicara, penafsiran
jawaban obat, skor mood, dan kapan izin privasi ditanyakan semuanya dihitung
backend — app hanya mengembalikan `expects`/`reminderId`/`consentKey` yang
barusan diterimanya. Ini konsekuensi langsung dari pembagian "rule vs AI" di
PLAN §4: kalau app ikut menebak, aturan yang sama jadi punya dua versi.

## Struktur

```
src/
  api/
    client.js         fetch + token di SecureStore + penanda offline/dicabut
    caretaker.js      satu fungsi per endpoint yang dipakai sisi lansia
  voice/
    tts.js            expo-speech — say() selesai saat suaranya benar berhenti
    stt.js            expo-speech-recognition — SATU-SATUNYA file yang tahu library STT
    interpret.js      aturan bahasa yang harus di HP (darurat, penutup, offline)
    session.js        sesi online & offline dalam satu bentuk
    useVoiceSession.js  loop percakapan + alur darurat
  notifications/
    local.js          notifikasi lokal dari cache jadwal
  lib/
    store.js          kv-store: profil, cache jadwal, antrean
    outbox.js         jawaban yang belum terkirim
    sync.js           kirim antrean + segarkan jadwal
  screens/            PairingScreen, SessionScreen
  components/         StatusOrb, Caption
  context/DeviceContext.js   dua keadaan: belum / terhubung
```

## Yang dikerjakan di HP, dan alasannya

Sebagian kecil aturan bahasa sengaja tidak diserahkan ke backend:

- **Kata darurat** (`bacaanDarurat`) diperiksa sebelum teks dikirim ke mana pun.
  Menunggu jawaban server berarti menunda keadaan darurat satu round-trip, dan
  gagal total kalau justru sedang tidak ada sinyal. Aturannya dibuat ketat:
  "tolong" adalah kata paling sopan dalam bahasa Indonesia, dan "tolong ulangi"
  tidak boleh memanggil keluarga.
- **Kalimat penutup** tidak punya endpoint penafsir — app yang memutuskan kapan
  berhenti mendengar. Hanya diperiksa saat percakapan bebas: pada giliran
  jawaban obat, "sudah" berarti sudah diminum.
- **Penafsiran offline** (`bacaJawabanReminder`, `bacaYaTidak`) adalah salinan
  aturan backend, dipakai hanya saat tidak ada sambungan. Kalau aturan di
  `backend/src/services/groq.js` atau `consentVoice.js` berubah, salinan di
  `src/voice/interpret.js` harus ikut diubah — kalau tidak, jawaban yang sama
  berarti berbeda tergantung ada sinyal atau tidak.

## Saat tidak ada internet

Pengingat obat adalah fitur yang paling tidak boleh ikut mati bersama sinyal,
jadi (PLAN §2.6):

1. Setiap kali app berhasil menghubungi backend, jadwal 2 hari ke depan
   di-cache dan seluruh notifikasi lokal dijadwalkan **ulang** — bukan ditambal,
   supaya jadwal yang dihapus keluarga ikut hilang dari HP lansia.
2. Tanpa sambungan, app tetap membuka sesi kecil dari cache itu: menagih obat
   yang jatuh tempo dan mencatat jawabannya ke antrean.
3. "Nanti ya" saat offline langsung menjadwalkan notifikasi lokal 15 menit lagi
   — penundaan sungguhannya baru terjadi saat antrean terkirim.
4. Antrean dikirim saat app dibuka dan setiap kali sesi selesai. Urutannya
   dijaga, dan isinya kedaluwarsa setelah 24 jam.

Percakapan bebas sengaja **tidak** dijanjikan saat offline: tanpa Groq tidak ada
jawaban, dan berpura-pura mendengarkan lebih buruk daripada mengaku tidak bisa.

## Yang belum jalan

- **Suara pada panggilan darurat.** Eskalasi sudah nyata — keluarga menerima
  push dan backend menyiapkan room LiveKit — tapi transport audionya belum ada
  di kedua sisi (`@livekit/react-native` butuh WebRTC native). Karena itu app
  mengatakan "sudah saya kabari keluarga lewat aplikasi mereka", bukan
  "sebentar lagi ditelepon".
- **Wake word.** Sesi masih dimulai dengan membuka app atau mengetuk
  notifikasi. Ini juga alasan `always_listening` belum ikut ditanyakan sebagai
  izin (PLAN §2.5).
- **Deteksi jatuh.** Backend sudah menerima `triggerType: 'fall_detection'`,
  sensornya yang belum dipasang.
- **Fallback Groq Whisper** saat STT device gagal (PLAN §4). Titik pasangnya
  sudah jelas: seluruh ketergantungan STT berhenti di `src/voice/stt.js`.

### Catatan versi `expo-speech-recognition`

Terpasang `^56.0.1` — versi terbaru yang ada saat ini, sementara project ini
memakai Expo SDK 57. Library-nya mengikuti penomoran Expo sejak SDK 56, jadi
naikkan ke `57.x` begitu rilis. Kalau `npx expo run:android` gagal di tahap
native, ini tersangka pertamanya.

## Verifikasi yang sudah dilakukan

- Bundle Android berhasil: 720 modul, tanpa error.
- Seluruh endpoint yang dipanggil app diuji sungguhan ke backend + NeonDB
  memakai token device lansia hasil `POST /api/auth/pair`: ambil jadwal
  (`?days=2`), buka sesi, satu giliran bicara, picu darurat lalu batalkan, dan
  tutup sesi.
- Belum diuji di perangkat: TTS, STT, notifikasi lokal, dan kamera QR —
  semuanya butuh development build di HP sungguhan.
