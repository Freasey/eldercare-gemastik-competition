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
    scheduler.js         schedules -> reminder_events, sweep missed, ringkasan
    groq.js              LLM untuk percakapan bebas + ringkasan
    livekit.js           token room untuk voice call darurat
    push.js              Expo Push ke device keluarga
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
| Percakapan bebas | **LLM (Groq)** |
| Ringkasan percakapan untuk keluarga | **LLM (Groq)**, sekali di akhir sesi |

Alasannya: kuota free tier hemat, dan behavior reminder obat harus predictable.

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
| POST | `/api/auth/dev-login` | jalan pintas dev (email saja) |
| GET | `/api/auth/me` | profil user yang login |

### Lansia
| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/elders` | daftar lansia + status ringkas untuk dashboard |
| POST | `/api/elders` | buat profil lansia, mengembalikan `pairing_code` |
| GET | `/api/elders/:id` | detail + kontak, obat, jadwal, consent, red flag |
| PATCH | `/api/elders/:id` | ubah profil |
| POST | `/api/elders/pair` | device lansia menukar pairing code |
| GET/POST | `/api/elders/:id/contacts` | kontak darurat |
| PATCH | `/api/elders/:id/consents` | ubah consent (**hanya dari device lansia**) |

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
| POST | `/api/elders/:id/assistant/sessions` | tombol ditekan → assistant bicara duluan |
| POST | `.../sessions/:cid/turns` | satu giliran bicara |
| POST | `.../sessions/:cid/end` | tutup sesi + buat ringkasan |

### Darurat & device
| Method | Path | Keterangan |
|---|---|---|
| GET/POST | `/api/elders/:id/emergencies` | riwayat / trigger baru (status `detected`) |
| POST | `.../emergencies/:eid/confirm` | konfirmasi lansia → batal atau eskalasi |
| POST | `.../emergencies/:eid/join` | keluarga masuk room LiveKit |
| POST | `.../emergencies/:eid/resolve` | tutup kejadian |
| POST/DELETE | `/api/devices` | daftar/hapus Expo push token |

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
