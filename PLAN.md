# AI Caretaker — Development Plan

> Dokumen acuan development. Update file ini setiap ada keputusan besar baru
> (arsitektur, flow, stack) supaya tetap jadi single source of truth.
> Kredensial environment ada terpisah di [`.env`](./.env) — **jangan taruh
> secret di file ini**.

Status (per 2026-07-29): desain selesai, kredensial dasar terkumpul.
Implementasi dimulai — lihat §7.

---

## 1. Konsep Proyek

AI Caretaker — aplikasi mobile untuk lansia di Indonesia, dibedakan lewat
desain **voice-first**: lansia bisa memakai app sepenuhnya lewat suara
(dengar, ngerti, jawab) tanpa perlu baca/ketik/navigasi UI sentuh. Kemungkinan
besar untuk submission kompetisi **GEMASTIK**.

Ekosistem dua sisi:
- **App Lansia** — voice-first, UI minimal, reminder proaktif, deteksi
  darurat, sinyal penurunan kognitif dari pola bicara.
- **App/Portal Caregiver** — UI konvensional, buat setup awal, terima
  ringkasan, dan alert darurat.

**Kenapa voice-first**: lansia sering kesulitan dengan UI sentuh kecil dan
app padat teks — ini diferensiator utama dibanding app kesehatan lansia lain.

---

## 2. Flow Inti

### 2.1 Onboarding & Setup
Dilakukan oleh **caregiver/keluarga**, bukan lansia:
1. Registrasi (Google Sign-In)
2. Setup jadwal obat, kontak darurat, preferensi agama (pengingat sholat)
3. Pairing device lansia

### 2.2 One-Button Assistant (interaksi inti sisi lansia)
Home screen lansia = **satu tombol besar**. Ditekan → buka full-screen page
ala Siri (indikator animasi listening/thinking/speaking, live caption
sebagai fallback aksesibilitas, tanpa menu/teks berat).

**Flow:**
1. Tombol ditekan (nanti: bisa juga wake-word) → assistant page terbuka.
2. Sebelum bicara, **context-check engine** cek diam-diam: waktu vs jadwal
   (obat/tidur/sholat/aktivitas), reminder overdue/belum dikonfirmasi, waktu
   sejak mood check-in terakhir, red flag terbaru (streak lupa obat, tren
   mood menurun).
3. App bicara duluan berdasar **prioritas** (bukan "ada yang bisa dibantu?"
   generik):
   `reminder overdue/urgent > reminder due sekarang > mood check-in overdue > sapaan umum`
4. Percakapan lanjut turn-by-turn; pertanyaan proaktif dibatasi ~1-2 per sesi
   biar nggak berasa interogasi — kalau lansia mau lanjut ngobrol, biarkan
   bebas.
5. Sesi berakhir: silence timeout, closing phrase, atau tombol ditekan lagi.
6. Hasil (konfirmasi obat, sinyal mood/kognitif) → masuk ke ringkasan
   caregiver (2.3).

**Prinsip desain**: context-check engine yang sama dipakai baik untuk trigger
manual (tombol) maupun reminder otomatis (app-initiated tanpa tekan tombol)
— dianggap satu sistem, bukan dua. Aturan prioritas di atas adalah spec untuk
scheduler/reminder logic.

### 2.3 Daily Loop & Data ke Caregiver
- App proaktif *speak* reminder terjadwal, tidak menunggu lansia buka app.
- Percakapan bebas kapan saja ditangkap pasif sebagai sinyal mood/cognitive
  decline.
- **Ringkasan otomatis** (harian/mingguan) ke caregiver: kepatuhan obat,
  mood, aktivitas, tren kognitif.
- Caregiver bisa edit jadwal → sync balik ke app lansia tanpa lansia perlu
  ngapa-ngapain.

#### 2.3.1 Penundaan reminder (keputusan 2026-08-01)
"Nanti ya" menggeser `due_at` **baris yang sama** (+15 menit, maksimal 3 kali),
bukan membuat baris baru. Kalau baris baru yang dibuat, baris lamanya
tertinggal berstatus `snoozed` dengan waktu lewat, lalu ditandai `missed` oleh
sweep — menunda obat kritis malah langsung memicu notifikasi "terlewat" ke
keluarga sekaligus merusak angka kepatuhan. Satu kewajiban = satu baris;
berapa kali ditunda terbaca dari `attempts`. Logikanya dipakai bersama jalur
suara dan jalur app keluarga ([`backend/src/services/reminders.js`](./backend/src/services/reminders.js)).

### 2.4 Emergency Flow
- **Trigger**: kata kunci ("tolong"), deteksi jatuh, atau reminder kritis
  berulang diabaikan.
- App **konfirmasi dulu ke lansia** (hindari false positive) sebelum eskalasi.
- **Eskalasi ke caregiver**: push notification (Expo) dulu. Kalau caregiver
  offline/tidak merespons → **in-app messaging + in-app voice call**
  (gaya WhatsApp, bukan telepon PSTN sungguhan) via **LiveKit**.
  *(Ini menggantikan rencana awal SMS/telepon lewat Twilio — diputuskan
  2026-07-29 supaya seluruh jalur darurat tetap in-app.)*

### 2.5 Privacy & Consent
First-class design concern, bukan sekadar checkbox compliance — potensi
diferensiator penilaian lomba. Always-listening + share data kesehatan/
percakapan ke keluarga perlu explicit consent control dari lansia.

Backend menolak keluarga mengubah consent (`CONSENT_ELDER_ONLY`), dan default
`share_conversation_transcript` + `always_listening` = **mati**. Karena app
lansia tidak punya UI (§2.6), izin diberikan lewat **suara** — sudah
diimplementasi 2026-08-01:

- Izin yang masih mati ditanyakan **sekali sehari** (hari menurut jam lansia);
  yang sudah menyala tidak pernah diungkit lagi.
- Muncul sebagai pembuka di hari yang sepi, atau menyusul sebagai pertanyaan
  kedua setelah jawaban reminder/mood — jatah proaktif per sesi tetap 1-2.
- Dicatat saat diucapkan, bukan saat dijawab, supaya lansia yang diam tidak
  ditanyai berulang kali dalam sehari.
- Hanya device lansia yang boleh menjawab; percobaan dari sesi keluarga
  ditolak `CONSENT_ELDER_ONLY`.
- Jawabannya ditafsirkan rule-based, bukan LLM — urutan pengecekannya penting
  karena "tidak boleh" mengandung kata "boleh" dan "tidak apa-apa" justru
  berarti setuju.

`always_listening` sengaja **tetap** belum ikut ditanyakan, walau wake word
sudah ada sejak 2026-08-02. Alasannya bergeser tapi kesimpulannya sama:
wake word yang ada hanya hidup selagi app terbuka di layar dan berhenti seketika
saat percakapan mulai, jadi menanyakan izin bernama "selalu mendengarkan"
berarti menjanjikan sesuatu yang lebih luas dari yang benar-benar terjadi.
Izin itu baru relevan kalau wake word pindah ke foreground service.

### 2.6 App Lansia — Tanpa UI (keputusan 2026-08-01)

Perombakan dari "satu tombol besar" (§2.2) jadi **nol tombol**:

- **Buka app = langsung sesi suara.** Tidak ada menu, tidak ada beranda, tidak
  ada yang perlu diketuk lansia. Layar hanya indikator status
  (listening/thinking/speaking) + live caption.
- **Belum ter-pair** → app langsung bicara sendiri, meminta bantuan keluarga
  ("Minta tolong anak atau cucu Ibu untuk membuka aplikasi keluarga…") dan
  menampilkan pemindai QR. Setup dikerjakan keluarga, sesuai §2.1.
- **Pairing lewat QR atau kode**: di app keluarga, pilih profil lansia →
  "Hubungkan perangkat" → tampil QR + kode 6 huruf. Device lansia memindai QR
  itu, atau kodenya diketik manual kalau kamera bermasalah.
- **Login device lansia tanpa Google** (selesai 2026-08-01): `POST /api/auth/pair`
  tanpa `requireAuth` menukar kode jadi akun role `lansia` + JWT panjang umur.
  Menggantikan `POST /api/elders/pair` yang lama, yang mensyaratkan user sudah
  login dan karena itu tidak pernah bisa dipakai HP lansia. Kode pairing naik
  status jadi kredensial: berlaku 15 menit, hangus sekali pakai, 20 percobaan
  per jam per IP, dan diterbitkan saat keluarga menekan tombolnya — bukan saat
  profil dibuat. Pencabutan akses lewat "putuskan perangkat" (mengosongkan
  `elders.user_id`), bukan lewat expiry token.
- **Pengecualian yang jujur**: izin mikrofon dan kamera Android tetap lewat
  dialog sistem yang harus diketuk. "Tanpa UI" berlaku setelah setup selesai.

**Reminder saat offline (keputusan 2026-08-01)**: dibunyikan **notifikasi lokal
di device** (`expo-notifications`), bukan push dari server — jadi tetap jalan
tanpa internet. Konsekuensinya app lansia menyimpan cache jadwal
(`GET /reminders?days=2`), menjadwalkan ulang notifikasi tiap sinkron, dan
mengantre jawaban lansia untuk dikirim belakangan saat online.

---

## 3. Smart Glasses (Deferred)

Ide awal: pairing dengan smart glasses (kamera+mic+speaker). **Ditunda ke
fase lanjut** — MVP fokus phone-only dulu (no-glasses-first).

Ringkasan riset (re-verify sebelum dipakai, landscape bergerak cepat):
- **Meta Ray-Ban/Ray-Ban Display** — form factor paling natural, tapi publish
  masih partner-gated per pertengahan 2026, risiko deadline kompetisi.
- **Rokid** — Android-based, terjangkau, paling realistis buat demo fisik
  dengan budget mahasiswa.
- **Vuzix** — SDK paling matang/terbuka, tapi form factor enterprise, kurang
  cocok secara sosial untuk lansia.
- [xg-glass-sdk](https://github.com/hkust-spark/xg-glass-sdk) — unified API
  lintas vendor + simulator, kandidat abstraction layer kalau nanti
  diimplementasi.

**Prinsip arsitektur**: glasses harus jadi enhancement layer opsional, bukan
dependency keras — pengalaman inti harus tetap 100% jalan lewat mic/speaker
HP saja.

---

## 4. Tech Stack (keputusan berlaku, 2026-07-29)

| Layer | Pilihan | Catatan |
|---|---|---|
| Mobile app | **React Native (Expo)** | **Dua project terpisah** — [`family-app/`](./family-app) dan [`elder-app/`](./elder-app), lihat §4.3. Menggantikan rencana Flutter awal. |
| Backend | **Express.js** (manual, no BaaS) | Semua logic ditulis manual — tanpa auto-CRUD/rules ala Firestore. |
| Hosting backend | **Back4app** (free container hosting) | Deploy dari GitHub repo, tanpa kartu kredit. Menggantikan rencana Vercel. |
| Database | **NeonDB** (serverless Postgres, free tier) | Menggantikan rencana Firestore. |
| Auth | **Manual JWT + Google Sign-In** | Lihat detail alur di §4.1. Tanpa Firebase Auth. |
| LLM | **Groq free tier** | `llama-3.3-70b-versatile` untuk percakapan sehari-hari; `compound` dipakai terbatas (query real-time seperti cuaca, capped 250 req/hari). |
| Voice I/O | **Native OS STT/TTS** | Default, gratis, offline-capable, dukung Bahasa Indonesia. Groq Whisper sbg fallback kalau device STT gagal. Groq TTS (Orpheus) di-ruled-out — no Indonesian support. |
| Push notification | **Expo Push Notifications** | Perlu Firebase project terpisah untuk FCM V1 (lihat §4.2 — wajib sejak Google deprecate legacy FCM API pertengahan 2024). |
| Emergency call/chat | **LiveKit** | In-app voice call + messaging, menggantikan rencana Twilio SMS/PSTN. |

**Rule vs AI split**: logic prioritas jadwal/reminder = plain rule-based code,
BUKAN LLM call. LLM cuma dipanggil untuk pemahaman percakapan bebas — hemat
quota free-tier dan bikin behavior reminder obat predictable.

**Filter tiap keputusan stack**: (1) harus jalan di free tier asli (budget
mahasiswa GEMASTIK), (2) harus jalan di HP Android low/mid-range, bukan cuma
flagship.

### 4.1 Alur Auth (Google Sign-In → JWT)
1. RN app pakai Google Sign-In SDK (`@react-native-google-signin/google-signin`)
   → dapat Google **ID token**.
2. RN kirim ID token ke backend Express.
3. Backend verifikasi server-side pakai `google-auth-library` (cek `aud`
   cocok web client ID, `iss`, expiry).
4. Backend lookup/create user di NeonDB, keyed di `google_id` (klaim `sub`),
   simpan email/name/avatar/role.
5. Backend terbitkan **JWT session token sendiri**; RN simpan (secure
   storage), kirim di request selanjutnya. Google ID token tidak dipakai
   sebagai session (expire ~1 jam).

Butuh 3 OAuth client ID terpisah di Google Cloud Console:
- **Web** → dipakai sebagai `webClientId` di SDK RN (dipakai juga di
  Android/iOS) DAN sebagai audience yang dicek backend.
- **Android** → perlu package name + SHA-1 fingerprint (ambil dari
  `eas credentials` kalau build via EAS).
- **iOS** → perlu bundle ID.

`GOOGLE_CLIENT_SECRET` tidak dipakai (ID-token verification, bukan
authorization-code flow).

Minimal `users` table: `id, google_id, email, name, avatar_url, role (lansia/keluarga), created_at`.

### 4.2 Push Notification — yang masih kurang
Expo Push butuh **Firebase project terpisah** (Cloud Messaging saja, tanpa
fitur Firebase lain) karena migrasi wajib ke FCM V1:
1. Buat Firebase project, daftarkan Android app (package name harus sama
   dengan Google OAuth Android client).
2. Download `google-services.json` → taruh di `android/app/` (perlu ada
   walau build native lokal).
3. Generate Service Account key (JSON) dari Firebase project settings →
   upload ke Expo via `eas credentials` (Android → Push Notifications →
   FCM V1 service account key) — tetap perlu walau build lokal, karena
   kredensial ini disimpan di sisi Expo push service.

Build Android dilakukan lokal (laptop/PC user sendiri), bukan lewat Claude.

### 4.3 Dua project RN terpisah (keputusan 2026-08-01)

Rencana awal "satu codebase untuk dua mode" **dibatalkan**. App keluarga dan app
lansia tidak berbagi satu komponen pun: yang satu lima tab + grafik + navigasi,
yang satu lagi satu layar tanpa navigasi sama sekali (§2.6). Menyatukannya
berarti tiap build memuat dependency milik peran lain — kamera QR + STT ikut ke
HP keluarga, react-navigation + chart SVG ikut ke HP lansia — padahal filter di
§4 justru "harus jalan di HP Android low/mid-range".

Akibatnya:
- Package name berbeda: `com.eldercare.app` (keluarga) vs `com.eldercare.elder`
  (lansia).
- App lansia **tidak** memakai Google Sign-In dan **tidak** menerima push, jadi
  tidak butuh `google-services.json` maupun OAuth client Android sendiri.
  Masuknya lewat kode pairing (§2.6), pengingatnya lewat notifikasi lokal.
- Yang dipakai bersama hanya kontrak backend, bukan kode. Pola yang sengaja
  ditiru (bukan di-share): pembungkus `api()` dan pola `.env` dua file.
- App lansia **tidak bisa dijalankan di Expo Go** — modul native STT, kamera,
  dan notifikasi mengharuskan development build (`npx expo run:android`).

Stack tambahan khusus app lansia: `expo-speech` (TTS), `expo-speech-recognition`
(STT, seluruh ketergantungannya dikurung di satu file), `expo-notifications`
(pengingat lokal), `expo-camera` (QR pairing), `expo-sqlite/kv-store` (cache
jadwal + antrean offline).

---

## 5. Status Kredensial (update 2026-08-02)

Lihat [`.env`](./.env) untuk nilai aktual — **jangan commit file itu ke git**.

| Item | Status |
|---|---|
| NeonDB `DATABASE_URL` | ✅ Diterima |
| Google OAuth — Web client ID + secret | ✅ Diterima |
| Google OAuth — Android client ID | ⏳ Belum (butuh SHA-1 — baru bisa diambil setelah project RN/keystore ada) |
| Google OAuth — iOS client ID | ⏳ Belum — **tidak diperlukan untuk fase ini**, scope Android-only (lihat §6) |
| Groq API key | ✅ Diterima |
| JWT secret | ✅ Digenerate otomatis |
| Expo project ID | ✅ Diterima |
| Firebase `google-services.json` | ✅ Ada di root (`project_id: competition-project-f87e2`, package `com.eldercare.app`) — dikonfirmasi user ini memang project untuk AI Caretaker |
| Firebase FCM V1 service account JSON | ✅ Ada di root (path di `.env`). Untuk deploy, isinya dikirim sebagai `FIREBASE_SERVICE_ACCOUNT_B64` — container Back4app tidak punya file yang bisa ditunjuk |
| LiveKit (URL, API key, secret) | ✅ Diterima |
| Back4app | ✅ **Backend sudah di-deploy**: `https://gemastikproject-i48g9adu.b4a.run` (`/health` → database, groq, livekit, google semuanya ok). Kedua app sudah menunjuk ke sana secara default |

---

## 6. Open Items / Next Steps

- [x] Port mockup HTML keluarga ke React Native (Expo) → [`family-app/`](./family-app).
- [x] **Bug context engine**: judul "Waktunya…" bikin kalimat dobel. Diperbaiki
      2026-08-01 lewat helper `subject()` di `contextEngine.js` yang membuang
      awalan "waktunya/saatnya/jadwal" dari judul — penamaan jadwal tetap bebas.
- [x] **Bug snooze**: "nanti ya" lewat suara tidak pernah kembali menagih.
      Diperbaiki 2026-08-01, lihat §2.3.1.
- [x] **Zona waktu diabaikan scheduler** — diperbaiki 2026-08-01: semua
      perhitungan tanggal/jam pindah ke Postgres lewat
      `AT TIME ZONE elders.timezone` (materialisasi reminder, filter harian,
      grafik kepatuhan, ringkasan harian/mingguan, sapaan pagi/siang/sore).
      Diuji: jadwal 07:00 WIB vs 07:00 WIT tersimpan terpaut tepat 2 jam dan
      dua-duanya jatuh di jam 07:00 lokal masing-masing.
- [ ] Pasang LiveKit, push notification, dan Google Sign-In di app keluarga —
      ketiganya butuh development build dulu.
- [x] Layar "tambah lansia" + "hubungkan perangkat" (QR & kode) di app keluarga
      (2026-08-01).
- [x] Endpoint `POST /api/auth/pair` — login device lansia tanpa Google (§2.6),
      selesai 2026-08-01.
- [x] Consent lewat suara (§2.5) — selesai 2026-08-01.
- [x] Bangun app sisi lansia (voice-first, tanpa UI — §2.6) →
      [`elder-app/`](./elder-app), selesai 2026-08-01. Project RN terpisah,
      lihat §4.3.
- [x] Batalkan sesi percakapan kosong saat `/end` — selesai 2026-08-01. Sesi
      tanpa satu pun jawaban lansia dihapus, bukan disembunyikan; reminder yang
      sempat dibacakan tetap `spoken` sehingga sweep tetap menandainya terlewat.
- [x] Deploy backend ke Back4app — selesai 2026-08-02:
      `https://gemastikproject-i48g9adu.b4a.run`. `NODE_ENV=production` membuat
      `allowDevLogin` mati sendiri di `config/env.js`, jadi jalur masuk app
      keluarga sekarang login tamu.
- [x] Push notification darurat sampai ke HP keluarga — selesai 2026-08-02.
      FCM V1 langsung lewat `firebase-admin`, bukan Expo Push Service; app
      mendaftarkan token FCM mentah. Alasannya di `backend/README.md`.
- [x] Audio panggilan darurat di kedua sisi — selesai 2026-08-02
      (`@livekit/react-native`). Sisi lansia masuk room otomatis tanpa layar
      panggilan, sesuai §2.6.
- [x] Deteksi jatuh (`triggerType: 'fall_detection'`) — selesai 2026-08-02,
      accelerometer tiga tahap di `elder-app/src/sensors/fallDetection.js`.
      Ambangnya masih perlu ditera di HP target.
- [x] Wake word — selesai 2026-08-02, **terbatas pada app yang sedang terbuka**.
      Lihat `elder-app/README.md`; ini juga yang menahan izin `always_listening`
      (§2.5).
- [x] Fallback Groq Whisper saat STT device gagal — selesai 2026-08-02 lewat
      `POST /api/stt`. Memakai rekaman yang sama dengan pengenal bawaan
      (`recordingOptions.persist`), jadi lansia tidak perlu mengulang.
- [ ] Buat Google OAuth client ID Android (butuh SHA-1, ambil dari
      `eas credentials` atau debug keystore setelah project RN dibuat).
      **Tidak lagi memblokir apa pun** — login tamu jadi jalur resmi sementara.
- [ ] Tera ulang ambang deteksi jatuh di HP target, dan uji seluruh fitur
      perangkat (TTS, STT, wake word, jatuh, audio panggilan) di HP sungguhan.
- [ ] Putuskan: LiveKit Cloud (free tier) vs self-host — saat ini asumsi
      LiveKit Cloud (URL yang diberikan mengarah ke `*.livekit.cloud`).

**Keputusan dev-environment (2026-07-29, diperbarui 2026-08-02):**
- Platform scope fase ini: **Android-only** (sesuai filter budget/HP
  low-mid-range di §4). iOS ditunda, client ID iOS tidak dikejar dulu.
- ~~Backend tetap lokal selama development~~ → **sudah di-deploy** (2026-08-02).
  Kedua app menunjuk ke URL Back4app lewat `.env`; untuk kerja lokal, buat
  `.env.local` yang menang atas `.env`.
- Auth di RN app: `dev-login` mati di production, jadi jalur masuknya
  **login tamu** (`POST /api/auth/guest`) sampai Google Sign-In siap.
- **Kedua app tidak lagi bisa lewat Expo Go.** Semuanya memakai modul native
  (WebRTC, notifikasi, sensor, pengenal suara) — `npx expo run:android`.
- Alamat `http://` cuma jalan di build debug; build release memblokir cleartext
  HTTP. APK yang dibagikan wajib menunjuk ke `https://`.

---

## 7. Progres Implementasi (update 2026-08-02)

| Bagian | Status |
|---|---|
| [`backend/`](./backend) — Express API | ✅ **Di-deploy** ke `https://gemastikproject-i48g9adu.b4a.run` |
| [`mockup-keluarga/`](./mockup-keluarga) — prototipe HTML app keluarga | ✅ Selesai, jadi acuan porting |
| [`family-app/`](./family-app) — React Native (Expo) app keluarga | ✅ Layar inti + push notif + audio panggilan; belum diuji di perangkat |
| [`elder-app/`](./elder-app) — React Native (Expo) app lansia | ✅ Pairing, loop suara, pengingat offline, wake word, deteksi jatuh, fallback Whisper, audio darurat; belum diuji di perangkat |

### Update 2026-08-02 — menutup semua yang tersisa kecuali Google Sign-In

Backend di-deploy, lalu enam hal yang selama ini "sudah disiapkan jalurnya tapi
belum jalan" dikerjakan sampai tuntas:

| Yang dikerjakan | Di mana |
|---|---|
| Push notif darurat lewat FCM V1 langsung | `backend/src/services/push.js`, `family-app/src/notifications/` |
| Audio panggilan darurat, kedua sisi | `family-app/src/screens/CallScreen.js`, `elder-app/src/voice/emergencyCall.js` |
| Deteksi jatuh (accelerometer 3 tahap) | `elder-app/src/sensors/fallDetection.js` |
| Wake word (terbatas: app harus terbuka) | `elder-app/src/voice/wakeWord.js` |
| Fallback STT Groq Whisper | `backend/src/routes/stt.routes.js`, `elder-app/src/voice/stt.js` |
| Kedua app menunjuk backend production | `.env` masing-masing app |

Dua keputusan yang layak dicatat karena bisa dipertanyakan lagi nanti:

1. **Push lewat FCM V1 langsung, bukan Expo Push Service.** Jalur Expo butuh
   service account diunggah ke project Expo lewat `eas credentials` — langkah
   interaktif yang mudah terlupa dan gagalnya senyap. Backend menerima kedua
   bentuk token, jadi keputusan ini bisa dibalik tanpa mengubah server.
2. **Fallback Whisper memakai rekaman yang sama**, bukan merekam ulang
   (`recordingOptions.persist`). Meminta lansia mengulang berarti menghukumnya
   atas kesalahan yang bukan miliknya. Gerbangnya event `speechstart`: ada suara
   tapi tidak ada teks = pengenal gagal; tidak ada suara sama sekali = lansia
   memang diam, dan itu tidak dikirim ke mana pun.

Verifikasi: bundle Android kedua app berhasil (family 1486 modul, elder 1003
modul, tanpa error); jalur Whisper diuji ke Groq sungguhan; kredensial FCM
diuji sampai Google menjawab. **Belum ada yang diuji di HP sungguhan** —
semua fitur perangkat butuh development build.

**Update 2026-08-01** — backend & app keluarga disiapkan untuk app lansia
tanpa UI (§2.6): endpoint pairing device lansia, consent lewat suara, dan
perbaikan zona waktu di sisi backend; layar Tambah lansia + Hubungkan
perangkat (QR) di app keluarga. Verifikasi: alur pairing, consent, dan zona
waktu diuji end-to-end ke backend yang jalan dengan NeonDB sungguhan, dan
bundle Android app keluarga berhasil (1176 modul).

**`elder-app/`** (dibuat 2026-08-01, Expo SDK 57, tanpa router): dua keadaan —
layar pairing (QR + kode ketik) dan layar sesi suara. Loop percakapannya satu
alur `async` lurus (bicara → dengar → kirim → bicara) supaya "jangan menyalakan
mikrofon selagi speaker bunyi" tidak bisa dilanggar diam-diam. State percakapan
sepenuhnya dipegang backend: app hanya mengembalikan `expects`, `reminderId`,
dan `consentKey` yang barusan diterimanya. Detail ada di
[`elder-app/README.md`](./elder-app/README.md).

Yang sengaja dikerjakan di HP, bukan di backend: deteksi kata darurat (tidak
boleh menunggu round-trip, dan harus tetap jalan tanpa sinyal), kalimat penutup
(tidak ada endpoint penafsirnya), serta salinan aturan jawaban obat yang hanya
dipakai saat offline — salinan ini wajib ikut diubah kalau aturan di backend
berubah.

Verifikasi: bundle Android berhasil (720 modul), dan seluruh endpoint yang
dipanggil app diuji sungguhan ke backend + NeonDB memakai token device lansia
hasil `POST /api/auth/pair` (ambil jadwal `?days=2` → buka sesi → satu giliran
bicara → picu darurat lalu batalkan → tutup sesi). Belum diuji di perangkat:
TTS, STT, notifikasi lokal, dan kamera QR — semuanya butuh development build.

**`family-app/`** (dibuat 2026-07-29, Expo SDK 57 + React Navigation): lima tab
(Beranda, Jadwal, Riwayat, Darurat, Profil) plus layar percakapan, detail
darurat, dan panggilan. Semua data dari backend — tidak ada data contoh yang
ditanam di app. Detail ada di [`family-app/README.md`](./family-app/README.md).

Verifikasi yang sudah dilakukan: bundle Android berhasil (975 modul, tanpa
error), dan seluruh field yang dibaca tiap layar dicek ada di response backend
lewat pemanggilan endpoint sungguhan dengan akun demo.

~~Belum jalan karena butuh development build: suara panggilan LiveKit, push
notification, dan Google Sign-In.~~ Dua yang pertama selesai 2026-08-02 (lihat
update di atas). Yang tersisa hanya **Google Sign-In**, dan itu tidak lagi
memblokir apa pun — jalur masuknya login tamu.

**Backend** sudah mengimplementasi: auth (Google ID token → JWT + dev-login),
CRUD lansia/jadwal/kontak, materialisasi reminder + sweep missed, context
engine rule-based, endpoint assistant (terhubung ke Groq), alur darurat
lengkap dengan token room LiveKit, Expo push, dan ringkasan harian/mingguan.
Detail endpoint ada di [`backend/README.md`](./backend/README.md).

Verifikasi end-to-end yang sudah dilakukan: `/health` hijau untuk DB, Groq,
LiveKit, dan Google; satu sesi percakapan penuh (buka → turn via Groq →
tutup + ringkasan otomatis); satu siklus darurat (deteksi → konfirmasi →
eskalasi + token LiveKit → tutup).

Catatan: `.env` root sekarang juga memuat variabel runtime backend
(`NODE_ENV`, `PORT`, `ALLOW_DEV_LOGIN`, `GROQ_MODEL`).

---

## Referensi

Detail lengkap tiap topik ada di memory system (untuk sesi Claude
selanjutnya): `project-overview`, `flow-lansia-caregiver`,
`flow-one-button-assistant`, `smart-glasses-hardware`, `tech-stack`.
