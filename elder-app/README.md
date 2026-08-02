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
pairing, pengingatnya lewat notifikasi lokal — jadi tidak butuh
`google-services.json` sama sekali.

## Menjalankan

Butuh **Node ≥ 20.19.4** (React Native 0.86 menolak versi di bawahnya).

> **Tidak bisa lewat Expo Go.** App ini memakai modul native
> (`expo-speech-recognition`, `expo-camera`, `expo-notifications`,
> `expo-sensors`, `@livekit/react-native-webrtc`), jadi harus dijalankan lewat
> development build.

```bash
cd elder-app
npm install
npx expo run:android           # build + pasang ke HP/emulator (butuh Android SDK)
```

`.env` sudah menunjuk ke backend production, jadi tidak ada yang perlu diisi
untuk menjalankannya. Setelah terpasang sekali, `npm start` cukup untuk sesi
berikutnya — Metro menyambung ke build yang sudah ada, bukan ke Expo Go.

### Mengarahkan app ke backend

Default `.env`: `https://gemastikproject-i48g9adu.b4a.run`. Untuk backend lokal,
buat `.env.local` (menang atas `.env`) lalu jalankan `cd ../backend && npm run dev`.

| Cara menjalankan | `EXPO_PUBLIC_API_URL` |
|---|---|
| Backend production | `https://gemastikproject-i48g9adu.b4a.run` |
| Emulator Android | `http://10.0.2.2:4000` |
| HP fisik satu Wi-Fi | `http://<IP-LAN-laptop>:4000` |

Alamat `http://` **hanya jalan di development build** (varian debug). Build
release memblokir cleartext HTTP, jadi APK yang dibagikan wajib `https://`.

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
    stt.js            SATU-SATUNYA file yang tahu library STT + fallback Whisper
    wakeWord.js       pemantau "halo teman" saat sesi menganggur
    interpret.js      aturan bahasa yang harus di HP (darurat, penutup, offline)
    session.js        sesi online & offline dalam satu bentuk
    emergencyCall.js  masuk room LiveKit tanpa layar, mikrofon otomatis
    useVoiceSession.js  loop percakapan + alur darurat + alur jatuh
  sensors/
    fallDetection.js  accelerometer tiga tahap: jatuh bebas, benturan, diam
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

## Cara sesi bisa dimulai

| Jalan masuk | Trigger yang dicatat backend |
|---|---|
| Buka app | `button` |
| Ketuk notifikasi pengingat | `scheduled` |
| Ketuk layar setelah sesi tutup | `button` |
| Ucapkan "halo teman" / "teman bicara" | `wake_word` |
| Sensor mendeteksi jatuh | `fall_detection` (langsung ke alur darurat) |

## Wake word, dan batasnya

`src/voice/wakeWord.js` memakai pengenal suara bawaan Android dalam mode
`continuous`, jadi **hanya bekerja selagi app terbuka di layar**. Wake word yang
benar-benar selalu siap butuh model kata-kunci di dalam foreground service, dan
itu pekerjaan native tersendiri.

Untuk pemakaian yang dituju, batas itu tidak sebesar kelihatannya: app ini
memang dirancang terbuka terus dengan layar dijaga menyala (`useKeepAwake`).
Yang diselesaikannya adalah "HP tergeletak di meja, app terbuka, tapi lansia
harus bangkit untuk menyentuhnya".

Karena mikrofonnya hanya hidup selama layar sesi terbuka dan langsung berhenti
saat percakapan mulai, izin `always_listening` **tetap belum ditanyakan** —
menanyakannya berarti menjanjikan sesuatu yang lebih luas dari yang benar-benar
terjadi (PLAN §2.5).

Pengenalannya sengaja dipaksa on-device (`requiresOnDeviceRecognition: true`):
mengalirkan mikrofon ke server terus-menerus hanya untuk menunggu satu kata
adalah pemborosan kuota sekaligus masalah privasi. Kalau model on-device Bahasa
Indonesia belum terpasang di HP itu, wake word mati — dan itu hasil yang benar,
bukan yang harus diakali.

## Deteksi jatuh

`src/sensors/fallDetection.js`, tiga tahap berurutan: **jatuh bebas** (< 0,45 g)
→ **benturan** (> 2,4 g dalam 1,2 detik) → **diam** (2,5 detik nyaris tanpa
gerakan). Tahap ketiga yang paling banyak membuang alarm palsu — HP yang
dilempar ke kasur juga melewati dua tahap pertama, tapi orang yang menaruhnya
akan segera memindahkannya lagi.

Yang lolos deteksi **tidak** langsung memanggil keluarga: alurnya tetap lewat
pertanyaan konfirmasi seperti jalur kata darurat, dengan kalimat khusus dari
backend ("Sepertinya tadi ada benturan. Ibu baik-baik saja?"). Karena itu
ambangnya sengaja longgar — melewatkan jatuh sungguhan jauh lebih mahal
daripada satu pertanyaan yang tidak perlu.

## Fallback Whisper

Jalur normalnya tetap pengenal bawaan Android: gratis, jalan offline, tanpa
kuota. Fallback baru dipakai saat pengenal itu **gagal**, bukan saat lansia
memang diam — dan bedanya diambil dari event `speechstart`: ada suara terdengar
tapi tidak ada teks berarti pengenalnya yang gagal.

Rekamannya bukan rekaman baru. `recordingOptions.persist` membuat pengenal
bawaan menyimpan audio yang barusan didengarnya, dan file itu yang dikirim ke
`POST /api/stt`. Alternatifnya — meminta lansia mengulang — berarti menyuruh
orang yang sudah bicara sekali untuk bicara lagi karena kesalahan yang bukan
miliknya.

Groq API key tidak pernah ada di app: audionya yang naik ke backend.

## Panggilan darurat

Setelah eskalasi dikonfirmasi, backend mengembalikan token LiveKit di respons
`confirm`, dan app **langsung masuk room itu** lalu menyalakan mikrofon —
tanpa layar panggilan dan tanpa tombol angkat. Orang yang benar-benar butuh
bantuan belum tentu sanggup mengangkat telepon.

Yang diucapkan app menyesuaikan kenyataan: kalau `notifiedDevices` bernilai 0
(tidak ada HP keluarga yang terdaftar), app **tidak** berkata "sudah saya kabari
keluarga" — ia mengatakan kabarnya belum sampai dan menganjurkan memanggil orang
di sekitar. Berbohong di titik ini akan membuat lansia berhenti mencari
pertolongan lain.

Mikrofon panggilan menutup sendiri setelah 3 menit tanpa ada yang bergabung.

## Yang masih belum jalan

- **Wake word saat app di latar belakang** — lihat batasannya di atas.
- **Notifikasi terjadwal bisa meleset di Android 12+.** Pengingat memakai
  `AlarmManager` lewat expo-notifications tanpa izin exact-alarm, jadi Doze mode
  bisa menggesernya beberapa menit. Menaikkannya ke `USE_EXACT_ALARM` adalah
  keputusan kebijakan Play Store, bukan teknis — belum diambil.
- **iOS** — di luar scope fase ini (PLAN §6, Android-only).

### Catatan versi `expo-speech-recognition`

Terpasang `^56.0.1` — versi terbaru yang ada saat ini, sementara project ini
memakai Expo SDK 57. Library-nya mengikuti penomoran Expo sejak SDK 56, jadi
naikkan ke `57.x` begitu rilis. Kalau `npx expo run:android` gagal di tahap
native, ini tersangka pertamanya.

## Verifikasi yang sudah dilakukan

- Bundle Android berhasil: 1003 modul, tanpa error.
- Seluruh endpoint yang dipanggil app diuji sungguhan ke backend + NeonDB
  memakai token device lansia hasil `POST /api/auth/pair`: ambil jadwal
  (`?days=2`), buka sesi, satu giliran bicara, picu darurat lalu batalkan, dan
  tutup sesi.
- Jalur Whisper diuji ke Groq sungguhan dari sisi server (WAV 16 kHz → teks,
  ~0,8 detik untuk audio 1 detik).
- **Belum diuji di perangkat**: TTS, STT, wake word, deteksi jatuh, notifikasi
  lokal, kamera QR, dan audio panggilan darurat — semuanya butuh development
  build di HP sungguhan. Deteksi jatuh khususnya perlu ditera ulang di HP
  target; ambang di `fallDetection.js` berasal dari pola umum, bukan dari
  pengukuran di perangkat ini.
