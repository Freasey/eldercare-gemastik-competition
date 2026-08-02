-- ============================================================
-- AI Caretaker skema database (Postgres / NeonDB)
-- Dijalankan oleh `npm run db:migrate`.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id           BIGSERIAL PRIMARY KEY,
  google_id    TEXT UNIQUE,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  avatar_url   TEXT,
  role         TEXT NOT NULL DEFAULT 'keluarga' CHECK (role IN ('lansia', 'keluarga')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Akun tamu: dibuat otomatis saat orang menekan "Coba sebagai tamu", punya
-- data demo sendiri, dan dihapus setelah sekian hari tidak dipakai. Kalau
-- tamunya login Google, baris yang sama dipakai ulang (is_guest -> false)
-- supaya datanya ikut terbawa. ADD COLUMN IF NOT EXISTS supaya migrate.js
-- tetap idempoten di database yang sudah ada.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Dipakai sweep penghapusan tamu kedaluwarsa.
CREATE INDEX IF NOT EXISTS idx_users_guest_last_seen ON users (last_seen_at) WHERE is_guest;

-- Profil lansia. `user_id` boleh NULL: lansia belum tentu punya akun Google
-- sendiri device-nya bisa di-pair pakai pairing_code oleh keluarga.
CREATE TABLE IF NOT EXISTS elders (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  birth_year        INT,
  phone             TEXT,
  address           TEXT,
  religion          TEXT,
  prayer_reminder   BOOLEAN NOT NULL DEFAULT false,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  pairing_code      TEXT UNIQUE,
  paired_at         TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kode pairing dipakai device lansia untuk masuk TANPA akun Google, jadi
-- statusnya naik jadi kredensial: berlaku singkat dan digenerate ulang dari
-- app keluarga tepat sebelum dipakai. NULL = sudah tidak berlaku (termasuk
-- kode lama bikinan seed), supaya tidak ada kode yang menganggur selamanya
-- sebagai kunci masuk.
ALTER TABLE elders ADD COLUMN IF NOT EXISTS pairing_code_expires_at TIMESTAMPTZ;

-- Relasi keluarga <-> lansia (satu lansia bisa dipantau beberapa keluarga).
CREATE TABLE IF NOT EXISTS caregiver_links (
  id                  BIGSERIAL PRIMARY KEY,
  caregiver_user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  elder_id            BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  relation            TEXT,
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (caregiver_user_id, elder_id)
);

CREATE TABLE IF NOT EXISTS emergency_contacts (
  id           BIGSERIAL PRIMARY KEY,
  elder_id     BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  relation     TEXT,
  phone        TEXT,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  priority     INT NOT NULL DEFAULT 1,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medications (
  id           BIGSERIAL PRIMARY KEY,
  elder_id     BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  dosage       TEXT,
  instruction  TEXT,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jadwal generik: obat, makan, tidur, sholat, aktivitas.
-- `time_of_day` disimpan sebagai jam lokal lansia (kolom TIME), lalu
-- di-materialize jadi reminder_events bertanggal oleh scheduler.
CREATE TABLE IF NOT EXISTS schedules (
  id             BIGSERIAL PRIMARY KEY,
  elder_id       BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  medication_id  BIGINT REFERENCES medications(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('medication', 'meal', 'sleep', 'prayer', 'activity', 'checkup')),
  title          TEXT NOT NULL,
  time_of_day    TIME NOT NULL,
  days_of_week   SMALLINT[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0 = Minggu
  is_critical    BOOLEAN NOT NULL DEFAULT false,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_elder_active ON schedules (elder_id, active);

-- Satu baris = satu kejadian reminder pada waktu tertentu.
CREATE TABLE IF NOT EXISTS reminder_events (
  id             BIGSERIAL PRIMARY KEY,
  elder_id       BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  schedule_id    BIGINT REFERENCES schedules(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  type           TEXT NOT NULL,
  is_critical    BOOLEAN NOT NULL DEFAULT false,
  due_at         TIMESTAMPTZ NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'spoken', 'confirmed', 'snoozed', 'skipped', 'missed')),
  spoken_at      TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  response_note  TEXT,
  attempts       INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, due_at)
);

CREATE INDEX IF NOT EXISTS idx_reminder_elder_due ON reminder_events (elder_id, due_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_status ON reminder_events (status, due_at);

-- Mood check-in, baik hasil tanya aktif maupun tangkapan pasif percakapan.
CREATE TABLE IF NOT EXISTS checkins (
  id           BIGSERIAL PRIMARY KEY,
  elder_id     BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  mood_score   SMALLINT CHECK (mood_score BETWEEN 1 AND 5),
  energy_score SMALLINT CHECK (energy_score BETWEEN 1 AND 5),
  source       TEXT NOT NULL DEFAULT 'assistant' CHECK (source IN ('assistant', 'passive', 'caregiver')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checkins_elder_time ON checkins (elder_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id           BIGSERIAL PRIMARY KEY,
  elder_id     BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  trigger      TEXT NOT NULL DEFAULT 'button' CHECK (trigger IN ('button', 'scheduled', 'wake_word', 'emergency')),
  opening_kind TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ,
  summary      TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id               BIGSERIAL PRIMARY KEY,
  conversation_id  BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('assistant', 'elder', 'system')),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

-- Sinyal kasar penurunan kognitif dari pola bicara (kecepatan, pengulangan,
-- kesulitan menemukan kata). Nilai 0..1, makin tinggi makin perlu perhatian.
CREATE TABLE IF NOT EXISTS cognitive_signals (
  id               BIGSERIAL PRIMARY KEY,
  elder_id         BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  conversation_id  BIGINT REFERENCES conversations(id) ON DELETE SET NULL,
  metric           TEXT NOT NULL,
  value            NUMERIC(4, 3) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emergency_events (
  id                 BIGSERIAL PRIMARY KEY,
  elder_id           BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  trigger_type       TEXT NOT NULL CHECK (trigger_type IN ('keyword', 'fall_detection', 'missed_critical', 'manual')),
  status             TEXT NOT NULL DEFAULT 'detected'
                     CHECK (status IN ('detected', 'cancelled', 'escalated', 'acknowledged', 'resolved')),
  detail             TEXT,
  confirmed_by_elder BOOLEAN,
  livekit_room       TEXT,
  acknowledged_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emergency_elder_time ON emergency_events (elder_id, created_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id               BIGSERIAL PRIMARY KEY,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expo_push_token  TEXT NOT NULL UNIQUE,
  platform         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consent per-lansia. Keluarga tidak boleh mengubah ini sepihak;
-- perubahan wajib lewat konfirmasi di device lansia.
CREATE TABLE IF NOT EXISTS consents (
  id          BIGSERIAL PRIMARY KEY,
  elder_id    BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  granted     BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (elder_id, key)
);

-- Kapan terakhir asisten MENANYAKAN izin ini lewat suara (bukan kapan
-- dijawab). Izin yang masih mati ditanyakan ulang sekali sehari; yang sudah
-- menyala tidak pernah ditanya lagi. Lihat services/consentVoice.js.
ALTER TABLE consents ADD COLUMN IF NOT EXISTS last_asked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS daily_summaries (
  id                    BIGSERIAL PRIMARY KEY,
  elder_id              BIGINT NOT NULL REFERENCES elders(id) ON DELETE CASCADE,
  summary_date          DATE NOT NULL,
  medication_taken      INT NOT NULL DEFAULT 0,
  medication_total      INT NOT NULL DEFAULT 0,
  mood_avg              NUMERIC(3, 2),
  conversation_count    INT NOT NULL DEFAULT 0,
  cognitive_trend       TEXT,
  highlights            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (elder_id, summary_date)
);

-- ---------------------------------------------------------------------------
-- State milik proses, bukan milik pengguna.
--
-- Ada karena backend tidak lagi berjalan sebagai satu proses panjang. Hal-hal
-- yang dulu cukup disimpan di variabel modul ("kapan terakhir sweep tamu")
-- ikut hilang tiap instance serverless dibekukan, sehingga pekerjaan yang
-- seharusnya 6 jam sekali jadi jalan hampir tiap tick. Di sini nilainya
-- bertahan dan bisa diperebutkan secara atomik antar-instance.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_state (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Rate limit terpusat (middleware/rateLimit.js).
--
-- Dulu hitungannya di memori proses, yang akurat selama cuma ada satu
-- container. Di serverless tiap instance punya Map sendiri, jadi batas
-- efektifnya terkalikan jumlah instance dan yang paling berbahaya dari itu
-- adalah `POST /api/auth/pair`, yang kode pairing-nya sendiri berperan sebagai
-- kredensial.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket        TEXT PRIMARY KEY,
  window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits          INT NOT NULL DEFAULT 0
);

-- Dipakai pembersihan berkala di scheduler; tanpa ini tabelnya tumbuh terus
-- oleh kunci IP yang tidak pernah muncul lagi.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits (window_start);
