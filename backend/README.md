# AI Caretaker Backend (Express)

Backend untuk AI Caretaker (GEMASTIK). Semua logic ditulis manual, tanpa BaaS
auto-CRUD. Acuan desain: [`../PLAN.md`](../PLAN.md).

## Menjalankan

```bash
cd backend
npm install
npm run db:migrate     # buat tabel di NeonDB
npm run db:seed        # isi data contoh (Ibu Sumarni & Bapak Hartono)
npm run dev            # http://localhost:4000
```

Env dibaca dari `backend/.env`; kalau tidak ada, otomatis jatuh ke `.env` di
root project. Lihat [`.env.example`](./.env.example).

Cek cepat: `GET http://localhost:4000/health` menampilkan status DB, Groq,
LiveKit, Google OAuth, push, dan cron.

## Struktur

```
api/index.js             handler serverless Vercel (cuma re-export src/app.js)
src/
  app.js                 perakitan Express + health check, tanpa listen()
  server.js              entrypoint lokal: listen + scheduler + graceful shutdown
  config/env.js          pembacaan & validasi env
  db/
    schema.sql           definisi tabel
    migrate.js           terapkan skema (`--drop` untuk reset)
    seed.js              data contoh
    pool.js              koneksi pg + helper one/many/transaction
  middleware/
    auth.js              requireAuth, requireRole, requireElderAccess
    errors.js            ApiError + error handler terpusat
  services/
    googleAuth.js        verifikasi Google ID token
    tokens.js            terbitkan/verifikasi JWT session
    contextEngine.js     ATURAN PRIORITAS reminder (rule-based, tanpa LLM)
    consentVoice.js      izin privasi lewat suara + gating sehari sekali
    pairing.js           kode pairing device lansia (kredensial, umur pendek)
    reminders.js         respons reminder + aturan penundaan (dipakai 2 jalur)
    scheduler.js         schedules -> reminder_events, sweep missed, ringkasan
    groq.js              LLM untuk percakapan bebas + ringkasan
    stt.js               fallback speech-to-text (Groq Whisper)
    livekit.js           token room untuk voice call darurat
    push.js              FCM V1 langsung + Expo Push ke device keluarga
    summary.js           hitung ringkasan harian/mingguan
  routes/                *.routes.js per domain
```

## Pembagian rule vs AI

Ini keputusan inti dari PLAN §4. Jangan dibalik:

| Bagian | Ditangani |
|---|---|
| Prioritas reminder, jadwal, deteksi red flag | **Rule-based** (`contextEngine.js`) |
| Interpretasi jawaban "sudah/belum" atas obat | **Rule-based** (keyword, `groq.js: interpretReminderReply`) |
| Skor mood dari kalimat | **Rule-based** (`assistant.routes.js: scoreMood`) |
| Jawaban ya/tidak atas izin privasi | **Rule-based** (`consentVoice.js: interpretConsentReply`) |
| Percakapan bebas | **LLM (Groq)** |
| Ringkasan percakapan untuk keluarga | **LLM (Groq)**, sekali di akhir sesi |

Alasannya: kuota free tier hemat, dan behavior reminder obat harus predictable.
Khusus izin privasi ada alasan tambahan keputusan sepenting itu tidak boleh
bergantung pada kuota Groq atau pada model yang bisa salah tafsir.

## Consent lewat suara

App lansia tidak punya UI (PLAN §2.6), jadi izin diberikan lewat percakapan:

- Izin yang masih **mati** ditanyakan **sekali sehari** (hari menurut jam
  lansia). Izin yang sudah **menyala** tidak pernah diungkit lagi.
- Ditanyakan sebagai pembuka kalau harinya sepi, atau menyusul sebagai
  pertanyaan kedua setelah jawaban reminder/mood jatah proaktif per sesi
  tetap 1-2 (PLAN §2.2).
- Dicatat `last_asked_at` saat **diucapkan**, bukan saat dijawab, supaya lansia
  yang diam tidak ditanyai berulang kali dalam sehari.
- Hanya device lansia yang boleh menjawab. Sesi milik keluarga tidak pernah
  memunculkan pertanyaannya, dan kalau tetap dicoba backend menolak dengan
  `CONSENT_ELDER_ONLY`.
- Daftar izin yang boleh ditanyakan ada di `consentVoice.js: ASKABLE_CONSENTS`.
  `always_listening` belum masuk karena wake-word-nya sendiri belum ada 
  menanyakan izin untuk fitur yang belum jalan sama saja menjanjikan yang
  tidak ada.

## Zona waktu

`schedules.time_of_day` adalah **jam dinding di tempat lansia**. Semua
perhitungan tanggal/jam karenanya lewat `AT TIME ZONE elders.timezone` dan
dikerjakan Postgres, bukan JavaScript termasuk materialisasi reminder,
pengelompokan grafik kepatuhan, dan batas hari ringkasan harian. Jangan
memakai `due_at::date`, `current_date`, `setHours()`, atau `toISOString()`
untuk urusan ini: semuanya mengikuti zona server, yang di Back4app adalah UTC.

## Autentikasi

`Authorization: Bearer <jwt>` untuk semua endpoint kecuali `/health` dan
`/api/auth/*`. Alur produksi: RN kirim Google ID token → backend verifikasi →
backend terbitkan JWT sendiri (PLAN §4.1).

Tidak ada jalan pintas login berbasis email: selain Google, satu-satunya
jalur masuk adalah `POST /api/auth/guest` (keluarga) dan `POST /api/auth/pair`
(device lansia) keduanya aman dipakai di production.

## Daftar Endpoint

### Auth
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/google` | tukar Google ID token jadi JWT |
| POST | `/api/auth/guest` | akun tamu + data demo sendiri |
| POST | `/api/auth/pair` | **device lansia**: tukar kode pairing jadi sesi, tanpa Google |
| GET | `/api/auth/me` | profil user yang login |

`POST /api/auth/pair` adalah satu-satunya endpoint selain tamu yang
menerbitkan sesi tanpa Google. HP lansia belum punya akun saat memanggilnya
dan tidak boleh dihadapkan layar login (PLAN §2.6), jadi kodenya sendiri yang
jadi kredensial: berlaku 15 menit, hangus sekali pakai, dibatasi 20 percobaan
per jam per IP. Akun `users` berperan `lansia` dibuat otomatis dengan email
sintetis `@device.invalid` lansia tidak pernah melihat atau mengetiknya.
Sesinya berumur sangat panjang (`ELDER_JWT_EXPIRES_IN`, default 10 tahun)
karena tidak ada siapa pun di sisi lansia yang bisa login ulang; pencabutan
akses lewat "putuskan perangkat", bukan lewat expiry.

### Lansia
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/elders` | daftar lansia + status ringkas untuk dashboard |
| POST | `/api/elders` | buat profil lansia (tanpa kode pairing lihat di bawah) |
| GET | `/api/elders/:id` | detail + kontak, obat, jadwal, consent, red flag |
| PATCH | `/api/elders/:id` | ubah profil |
| POST | `/api/elders/:id/pairing-code` | terbitkan kode pairing baru (umur 15 menit) |
| POST | `/api/elders/:id/unpair` | lepas perangkat lansia |
| GET/POST | `/api/elders/:id/contacts` | kontak darurat |
| PATCH | `/api/elders/:id/consents` | ubah consent (**hanya dari device lansia**) |

Profil baru sengaja dibuat **tanpa** kode pairing: kode cuma berumur 15 menit,
jadi diterbitkan saat keluarga benar-benar menekan "Hubungkan perangkat".
Kode lama bikinan seed (tanpa masa berlaku) diperlakukan kedaluwarsa.

### Jadwal & reminder
| Method | Path | Keterangan |
|---|---|---|
| GET/POST | `/api/elders/:id/schedules` | jadwal berulang (obat/sholat/tidur/aktivitas) |
| PATCH/DELETE | `/api/elders/:id/schedules/:sid` | ubah / nonaktifkan |
| GET | `/api/elders/:id/reminders?date=&days=&status=` | kejadian reminder |
| POST | `/api/elders/:id/reminders/:rid/respond` | confirmed / snoozed / skipped |
| GET | `/api/elders/:id/reminders/adherence` | data grafik kepatuhan 14 hari |

### Mood, ringkasan, timeline
| Method | Path | Keterangan |
|---|---|---|
| GET/POST | `/api/elders/:id/checkins` | mood check-in |
| GET | `/api/elders/:id/summaries/today` | ringkasan hari ini (dihitung ulang) |
| GET | `/api/elders/:id/summaries/week` | agregat mingguan |
| GET | `/api/elders/:id/summaries` | riwayat ringkasan harian |
| GET | `/api/elders/:id/timeline?days=3` | feed gabungan untuk app keluarga |
| GET | `/api/elders/:id/conversations/:cid` | transkrip (tunduk pada consent) |

### Assistant (sisi lansia)
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/elders/:id/assistant/context` | intip prioritas tanpa membuka sesi |
| POST | `/api/elders/:id/assistant/sessions` | app dibuka → assistant bicara duluan |
| POST | `.../sessions/:cid/turns` | satu giliran bicara |
| POST | `.../sessions/:cid/end` | tutup sesi + buat ringkasan |

Sesi dan tiap giliran mengembalikan `expects`
(`confirmation` \| `mood` \| `consent` \| `free`) plus `reminderId`/`consentKey`
bila relevan. App lansia tinggal mengirimkannya balik di giliran berikutnya 
tidak perlu menyimpan state percakapan sendiri.

### Darurat & device
| Method | Path | Keterangan |
|---|---|---|
| GET/POST | `/api/elders/:id/emergencies` | riwayat / trigger baru (status `detected`) |
| POST | `.../emergencies/:eid/confirm` | konfirmasi lansia → batal atau eskalasi |
| POST | `.../emergencies/:eid/join` | keluarga masuk room LiveKit |
| POST | `.../emergencies/:eid/resolve` | tutup kejadian |
| POST/DELETE | `/api/devices` | daftar/hapus push token |
| POST | `/api/devices/test` | notifikasi uji ke device sendiri (maks 5/menit) |
| POST | `/api/stt` | transkripsi audio base64, fallback STT app lansia |

### Internal
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/cron/tick` | jalankan satu putaran scheduler (butuh `Authorization: Bearer $CRON_SECRET`) |

Bukan untuk dipanggil app. Ada karena serverless tidak punya proses yang hidup
terus untuk memegang `setInterval` pemicunya
[`.github/workflows/cron-tick.yml`](../.github/workflows/cron-tick.yml), tiap 15
menit. Idempoten, jadi tick dobel tidak merusak apa pun.

`POST .../confirm` dengan `confirmed: true` mengembalikan `notifiedDevices`
(berapa HP keluarga yang benar-benar dikirimi) dan `call` (kredensial LiveKit
untuk sisi lansia). App lansia memakai keduanya: yang pertama menentukan
kalimat apa yang diucapkan, yang kedua untuk langsung masuk room.

### Push notification

Dua transport, dibedakan dari **bentuk token**, bukan dari kolom database:

| Bentuk token | Dikirim lewat |
|---|---|
| `ExponentPushToken[...]` | Expo Push Service (`expo-server-sdk`) |
| selain itu | FCM V1 langsung (`firebase-admin`) |

App keluarga mendaftarkan token FCM mentah, jadi jalur utamanya yang kedua 
ini menghindari langkah `eas credentials` yang interaktif dan mudah terlupa.
Token yang ditolak permanen (`registration-token-not-registered`) dihapus dari
tabel `devices`, supaya angka `sent` tidak menyesatkan.

Kredensialnya dibaca dari `FIREBASE_SERVICE_ACCOUNT_B64` (deploy) atau
`FIREBASE_FCM_SERVICE_ACCOUNT_JSON_PATH` (lokal). Tanpa keduanya server tetap
jalan hanya notifikasinya yang tidak terkirim, dan `/health` menulis
`push: "belum dikonfigurasi"`.

### Fallback STT

`POST /api/stt` menerima `{ audioBase64, mimeType, filename, language, prompt }`
dan meneruskannya ke Groq Whisper. Batas body untuk rute ini 6 MB (rute lain
tetap 1 MB), audio maksimal 4 MB, dan lajunya dibatasi 20 permintaan/menit per
user karena tiap panggilan memakai kuota Groq.

Ini **bukan** jalur normal app lansia memakai pengenal suara bawaan Android
dan hanya jatuh ke sini saat pengenal itu gagal. API key Groq tidak pernah
sampai ke app, karena itu audionya yang naik ke server.

## Scheduler

Satu putaran (`runSchedulerTick()`) mengerjakan:

1. `materializeReminders()` buat `reminder_events` 36 jam ke depan dari
   `schedules` (idempoten lewat `UNIQUE (schedule_id, due_at)`).
2. `sweepMissedReminders()` reminder lewat 90 menit tanpa respons ditandai
   `missed`; yang kritis langsung push ke keluarga.
3. `refreshTodaySummaries()` hitung ulang ringkasan hari ini.
4. Setiap 6 jam sekali: sweep akun tamu kedaluwarsa + baris `rate_limits` lama.

Siapa yang memanggilnya tergantung runtime:

| Runtime | Pemicu |
|---|---|
| Lokal / container | `startScheduler()` `setInterval` 5 menit di dalam proses |
| Serverless (Vercel) | cron eksternal → `POST /api/cron/tick` |

Giliran pekerjaan 6-jaman disimpan di tabel `app_state`, bukan variabel modul.
Di serverless variabel itu ikut hilang tiap instance dibekukan, yang membuat
pekerjaan "6 jam sekali" jalan hampir tiap tick.

## Catatan deploy (Vercel)

Root directory project Vercel diarahkan ke `backend/`. Konfigurasinya ada di
[`vercel.json`](./vercel.json): semua trafik di-*rewrite* ke `api/index.js`,
yang cuma mengekspor app Express dari `src/app.js`.

Nilai env-nya sudah disiapkan di **`backend/.env.vercel`** (tidak masuk git),
siap ditempel ke kotak *Import .env* di dashboard Vercel. File itu sengaja
tanpa komentar dan tanpa baris kosong supaya bisa ditempel apa adanya. Isinya
persis variabel yang dibaca `config/env.js` tidak termasuk `PORT` (diabaikan
Vercel), kunci Back4app, maupun variabel `EXPO_PUBLIC_*` milik app.

- **Region wajib `sin1`.** Neon ada di `ap-southeast-1`; kalau fungsinya
  tertinggal di default `iad1` (US East), tiap query menyeberang Pasifik dan
  satu request yang melakukan beberapa query berurutan ikut menanggungnya.
- **`CRON_SECRET` wajib diisi**, lalu pasang nilai yang sama beserta `API_URL`
  sebagai GitHub Actions secret. Tanpa itu `sweepMissedReminders()` tidak pernah
  jalan dan keluarga tidak pernah tahu saat lansia melewatkan jadwal kritis.
  `GET /health` menampilkannya di `services.cron`.
- **Pakai `FIREBASE_SERVICE_ACCOUNT_B64`**, bukan path file tidak ada
  filesystem yang bisa ditunjuk.
- `PORT` diabaikan di Vercel (dipakai hanya oleh `src/server.js` saat lokal).
- `maxDuration` di-set 60 detik. Kalau deploy Hobby menolaknya, turunkan 
  batasnya berbeda-beda tergantung apakah Fluid Compute aktif. Yang paling
  dekat ke batas adalah `POST /api/stt`.

Scheduler tidak lagi ikut di dalam proses web, jadi menambah instance tidak
membuat push terkirim ganda pemicunya tunggal dari luar.

## Data contoh

`npm run db:seed` membuat:

- **Ibu Sumarni** (72) 4 jadwal obat, riwayat 7 hari, Metformin malam
  terlewat 3 hari berturut-turut → memunculkan red flag `medication_missed_streak`
  dan `mood_declining`, plus satu percakapan lengkap dengan transkrip.
- **Bapak Hartono** (78) profil kedua, kepatuhan bersih, untuk menguji
  tampilan multi-lansia.
- Caregiver demo: `keluarga.demo@caretaker.id`.
- Akun device untuk **kedua** lansia (`role = 'lansia'`), jadi `elders.user_id`
  terisi dan jalur "lansia sendiri yang bicara" (consent, check-in, ringkasan)
  ikut punya sisi lansia. Konsekuensinya keduanya berstatus sudah ter-pair:
  untuk mencoba app lansia, putuskan perangkat dulu baru minta kode baru.

Akun tamu (`POST /api/auth/guest`) mendapat perlakuan yang sama: lansia demonya
langsung punya akun device sendiri, tanpa kode pairing yang menganggur.

Data ini juga yang dipakai sebagai contoh di mockup HTML
[`../mockup-keluarga/`](../mockup-keluarga/).
