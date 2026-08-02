# AI Caretaker — Backend (Express)

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

Cek cepat: `GET http://localhost:4000/health` — menampilkan status DB, Groq,
LiveKit, dan Google OAuth.

## Struktur

```
src/
  server.js              entrypoint + health check + graceful shutdown
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
Khusus izin privasi ada alasan tambahan — keputusan sepenting itu tidak boleh
bergantung pada kuota Groq atau pada model yang bisa salah tafsir.

## Consent lewat suara

App lansia tidak punya UI (PLAN §2.6), jadi izin diberikan lewat percakapan:

- Izin yang masih **mati** ditanyakan **sekali sehari** (hari menurut jam
  lansia). Izin yang sudah **menyala** tidak pernah diungkit lagi.
- Ditanyakan sebagai pembuka kalau harinya sepi, atau menyusul sebagai
  pertanyaan kedua setelah jawaban reminder/mood — jatah proaktif per sesi
  tetap 1-2 (PLAN §2.2).
- Dicatat `last_asked_at` saat **diucapkan**, bukan saat dijawab, supaya lansia
  yang diam tidak ditanyai berulang kali dalam sehari.
- Hanya device lansia yang boleh menjawab. Sesi milik keluarga tidak pernah
  memunculkan pertanyaannya, dan kalau tetap dicoba backend menolak dengan
  `CONSENT_ELDER_ONLY`.
- Daftar izin yang boleh ditanyakan ada di `consentVoice.js: ASKABLE_CONSENTS`.
  `always_listening` belum masuk karena wake-word-nya sendiri belum ada —
  menanyakan izin untuk fitur yang belum jalan sama saja menjanjikan yang
  tidak ada.

## Zona waktu

`schedules.time_of_day` adalah **jam dinding di tempat lansia**. Semua
perhitungan tanggal/jam karenanya lewat `AT TIME ZONE elders.timezone` dan
dikerjakan Postgres, bukan JavaScript — termasuk materialisasi reminder,
pengelompokan grafik kepatuhan, dan batas hari ringkasan harian. Jangan
memakai `due_at::date`, `current_date`, `setHours()`, atau `toISOString()`
untuk urusan ini: semuanya mengikuti zona server, yang di Back4app adalah UTC.

## Autentikasi

`Authorization: Bearer <jwt>` untuk semua endpoint kecuali `/health` dan
`/api/auth/*`. Alur produksi: RN kirim Google ID token → backend verifikasi →
backend terbitkan JWT sendiri (PLAN §4.1).

Untuk development & mockup HTML tersedia `POST /api/auth/dev-login` yang
hanya butuh email. Endpoint ini mati otomatis kalau `NODE_ENV=production`
atau `ALLOW_DEV_LOGIN` bukan `true`. **Matikan sebelum deploy ke Back4app.**

## Daftar Endpoint

### Auth
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/google` | tukar Google ID token jadi JWT |
| POST | `/api/auth/guest` | akun tamu + data demo sendiri |
| POST | `/api/auth/pair` | **device lansia**: tukar kode pairing jadi sesi, tanpa Google |
| POST | `/api/auth/dev-login` | jalan pintas dev (email saja) |
| GET | `/api/auth/me` | profil user yang login |

`POST /api/auth/pair` adalah satu-satunya endpoint selain tamu yang
menerbitkan sesi tanpa Google. HP lansia belum punya akun saat memanggilnya
dan tidak boleh dihadapkan layar login (PLAN §2.6), jadi kodenya sendiri yang
jadi kredensial: berlaku 15 menit, hangus sekali pakai, dibatasi 20 percobaan
per jam per IP. Akun `users` berperan `lansia` dibuat otomatis dengan email
sintetis `@device.invalid` — lansia tidak pernah melihat atau mengetiknya.
Sesinya berumur sangat panjang (`ELDER_JWT_EXPIRES_IN`, default 10 tahun)
karena tidak ada siapa pun di sisi lansia yang bisa login ulang; pencabutan
akses lewat "putuskan perangkat", bukan lewat expiry.

### Lansia
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/elders` | daftar lansia + status ringkas untuk dashboard |
| POST | `/api/elders` | buat profil lansia (tanpa kode pairing — lihat di bawah) |
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
bila relevan. App lansia tinggal mengirimkannya balik di giliran berikutnya —
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

App keluarga mendaftarkan token FCM mentah, jadi jalur utamanya yang kedua —
ini menghindari langkah `eas credentials` yang interaktif dan mudah terlupa.
Token yang ditolak permanen (`registration-token-not-registered`) dihapus dari
tabel `devices`, supaya angka `sent` tidak menyesatkan.

Kredensialnya dibaca dari `FIREBASE_SERVICE_ACCOUNT_B64` (deploy) atau
`FIREBASE_FCM_SERVICE_ACCOUNT_JSON_PATH` (lokal). Tanpa keduanya server tetap
jalan — hanya notifikasinya yang tidak terkirim, dan `/health` menulis
`push: "belum dikonfigurasi"`.

### Fallback STT

`POST /api/stt` menerima `{ audioBase64, mimeType, filename, language, prompt }`
dan meneruskannya ke Groq Whisper. Batas body untuk rute ini 6 MB (rute lain
tetap 1 MB), audio maksimal 4 MB, dan lajunya dibatasi 20 permintaan/menit per
user karena tiap panggilan memakai kuota Groq.

Ini **bukan** jalur normal — app lansia memakai pengenal suara bawaan Android
dan hanya jatuh ke sini saat pengenal itu gagal. API key Groq tidak pernah
sampai ke app, karena itu audionya yang naik ke server.

## Scheduler

`startScheduler()` jalan tiap 5 menit di dalam proses server:

1. `materializeReminders()` — buat `reminder_events` 36 jam ke depan dari
   `schedules` (idempoten lewat `UNIQUE (schedule_id, due_at)`).
2. `sweepMissedReminders()` — reminder lewat 90 menit tanpa respons ditandai
   `missed`; yang kritis langsung push ke keluarga.
3. `refreshTodaySummaries()` — hitung ulang ringkasan hari ini.

## Catatan deploy (Back4app)

- Set semua env di dashboard Back4app, dan pastikan `ALLOW_DEV_LOGIN` tidak
  di-set.
- `PORT` diambil dari env — jangan di-hardcode.
- Scheduler ikut jalan di dalam container yang sama; kalau nanti di-scale
  lebih dari satu instance, pindahkan ke worker terpisah supaya push tidak
  terkirim ganda.

## Data contoh

`npm run db:seed` membuat:

- **Ibu Sumarni** (72) — 4 jadwal obat, riwayat 7 hari, Metformin malam
  terlewat 3 hari berturut-turut → memunculkan red flag `medication_missed_streak`
  dan `mood_declining`, plus satu percakapan lengkap dengan transkrip.
- **Bapak Hartono** (78) — profil kedua, kepatuhan bersih, untuk menguji
  tampilan multi-lansia.
- Caregiver demo: `keluarga.demo@caretaker.id` (login lewat `dev-login`).

Data ini juga yang dipakai sebagai contoh di mockup HTML
[`../mockup-keluarga/`](../mockup-keluarga/).
