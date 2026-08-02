import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import { buildContext } from '../services/contextEngine.js';
import { countElders, GUEST_MAX_ELDERS } from '../services/guest.js';
import { issuePairingCode, PAIRING_CODE_TTL_MINUTES, unpairElder } from '../services/pairing.js';
import { weeklySummary } from '../services/summary.js';

export const eldersRouter = Router();
eldersRouter.use(requireAuth);

/**
 * GET /api/elders
 * Daftar lansia yang dipantau user ini + ringkasan singkat untuk dashboard.
 */
eldersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const elders = await many(
      `SELECT e.*, cl.relation, cl.is_primary
         FROM elders e
         JOIN caregiver_links cl ON cl.elder_id = e.id
        WHERE cl.caregiver_user_id = $1
        ORDER BY cl.is_primary DESC, e.name ASC`,
      [req.user.id],
    );

    const withStatus = await Promise.all(
      elders.map(async (e) => {
        const ctx = await buildContext(e.id);
        const week = await weeklySummary(e.id);
        const lastActive = await one(
          `SELECT MAX(started_at) AS at FROM conversations WHERE elder_id = $1`,
          [e.id],
        );
        return {
          ...e,
          status: {
            overdueCount: ctx?.reminders.overdue.length ?? 0,
            dueNowCount: ctx?.reminders.dueNow.length ?? 0,
            redFlags: ctx?.redFlags ?? [],
            lastMood: ctx?.lastCheckin?.mood_score ?? null,
            lastActiveAt: lastActive?.at ?? null,
            adherencePercent: week.adherencePercent,
          },
        };
      }),
    );

    res.json({ elders: withStatus });
  }),
);

/**
 * POST /api/elders
 * Keluarga membuat profil lansia. Mengembalikan pairing_code yang dimasukkan
 * di device lansia saat setup (PLAN §2.1).
 *
 * Akun tamu dibatasi GUEST_MAX_ELDERS: endpoint tamu terbuka di production,
 * jadi tanpa batas ini database gampang digelembungkan.
 */
eldersRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.isGuest && (await countElders(req.user.id)) >= GUEST_MAX_ELDERS) {
      throw ApiError.forbidden(
        `Akun tamu hanya bisa memantau ${GUEST_MAX_ELDERS} lansia. Masuk dengan Google untuk menambah lagi data yang sudah ada ikut terbawa.`,
        'GUEST_ELDER_LIMIT',
      );
    }

    const body = z
      .object({
        name: z.string().min(2),
        birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        religion: z.string().optional(),
        prayerReminder: z.boolean().optional(),
        relation: z.string().optional(),
        timezone: z.string().optional(),
      })
      .parse(req.body);

    const elder = await transaction(async (c) => {
      // Sengaja tanpa pairing_code: kode dibuat saat keluarga benar-benar
      // menekan "Hubungkan perangkat", karena umurnya cuma 15 menit
      // (services/pairing.js).
      const { rows: [created] } = await c.query(
        `INSERT INTO elders (name, birth_year, phone, address, religion, prayer_reminder, timezone)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'Asia/Jakarta'))
         RETURNING *`,
        [
          body.name,
          body.birthYear ?? null,
          body.phone ?? null,
          body.address ?? null,
          body.religion ?? null,
          body.prayerReminder ?? false,
          body.timezone ?? null,
        ],
      );

      await c.query(
        `INSERT INTO caregiver_links (caregiver_user_id, elder_id, relation, is_primary)
         VALUES ($1, $2, $3, true)`,
        [req.user.id, created.id, body.relation ?? null],
      );

      // Default consent: hanya ringkasan & sinyal mood yang dibagikan.
      // Transkrip percakapan dan always-listening default MATI 
      // lansia yang harus menyalakannya sendiri (PLAN §2.5).
      for (const [key, granted] of [
        ['share_daily_summary', true],
        ['share_mood_signal', true],
        ['share_conversation_transcript', false],
        ['always_listening', false],
        ['fall_detection', true],
      ]) {
        await c.query(
          `INSERT INTO consents (elder_id, key, granted) VALUES ($1, $2, $3)`,
          [created.id, key, granted],
        );
      }

      return created;
    });

    res.status(201).json({ elder });
  }),
);

/** GET /api/elders/:elderId */
eldersRouter.get(
  '/:elderId',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const [contacts, medications, schedules, consents, week] = await Promise.all([
      many('SELECT * FROM emergency_contacts WHERE elder_id = $1 ORDER BY priority ASC', [req.elder.id]),
      many('SELECT * FROM medications WHERE elder_id = $1 AND active = true ORDER BY name', [req.elder.id]),
      many('SELECT * FROM schedules WHERE elder_id = $1 AND active = true ORDER BY time_of_day', [req.elder.id]),
      many('SELECT key, granted, updated_at FROM consents WHERE elder_id = $1', [req.elder.id]),
      weeklySummary(req.elder.id),
    ]);

    const ctx = await buildContext(req.elder.id);

    res.json({
      elder: req.elder,
      contacts,
      medications,
      schedules,
      consents,
      week,
      redFlags: ctx?.redFlags ?? [],
      reminders: ctx?.reminders ?? { overdue: [], dueNow: [], upcoming: [] },
    });
  }),
);

/** PATCH /api/elders/:elderId */
eldersRouter.patch(
  '/:elderId',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        religion: z.string().optional(),
        prayerReminder: z.boolean().optional(),
      })
      .parse(req.body);

    const elder = await one(
      `UPDATE elders SET
         name = COALESCE($2, name),
         phone = COALESCE($3, phone),
         address = COALESCE($4, address),
         religion = COALESCE($5, religion),
         prayer_reminder = COALESCE($6, prayer_reminder)
       WHERE id = $1 RETURNING *`,
      [
        req.elder.id,
        body.name ?? null,
        body.phone ?? null,
        body.address ?? null,
        body.religion ?? null,
        body.prayerReminder ?? null,
      ],
    );

    res.json({ elder });
  }),
);

/**
 * POST /api/elders/:elderId/pairing-code
 * Keluarga menekan "Hubungkan perangkat" → kode baru berumur pendek, untuk
 * ditampilkan sebagai QR + teks dan dipindai HP lansia (PLAN §2.6).
 *
 * Penukarannya sendiri ada di `POST /api/auth/pair` tanpa auth, karena HP
 * lansia belum punya akun saat itu.
 */
eldersRouter.post(
  '/:elderId/pairing-code',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    if (req.elder.user_id) {
      throw ApiError.conflict(
        'Perangkat lansia sudah terhubung. Putuskan dulu sebelum menghubungkan yang baru.',
        'ALREADY_PAIRED',
      );
    }

    const elder = await issuePairingCode(req.elder.id);

    res.status(201).json({
      pairingCode: elder.pairing_code,
      expiresAt: elder.pairing_code_expires_at,
      expiresInMinutes: PAIRING_CODE_TTL_MINUTES,
    });
  }),
);

/**
 * POST /api/elders/:elderId/unpair
 * Melepas perangkat lansia dipakai saat HP-nya diganti atau hilang.
 */
eldersRouter.post(
  '/:elderId/unpair',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    res.json({ elder: await unpairElder(req.elder.id) });
  }),
);

/** GET /api/elders/:elderId/contacts kontak darurat */
eldersRouter.get(
  '/:elderId/contacts',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    res.json({
      contacts: await many(
        'SELECT * FROM emergency_contacts WHERE elder_id = $1 ORDER BY priority ASC',
        [req.elder.id],
      ),
    });
  }),
);

/** POST /api/elders/:elderId/contacts */
eldersRouter.post(
  '/:elderId/contacts',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        relation: z.string().optional(),
        phone: z.string().optional(),
        priority: z.number().int().min(1).max(9).optional(),
      })
      .parse(req.body);

    const contact = await one(
      `INSERT INTO emergency_contacts (elder_id, name, relation, phone, priority)
       VALUES ($1, $2, $3, $4, COALESCE($5, 1)) RETURNING *`,
      [req.elder.id, body.name, body.relation ?? null, body.phone ?? null, body.priority ?? null],
    );

    res.status(201).json({ contact });
  }),
);

/**
 * PATCH /api/elders/:elderId/consents
 * Consent hanya boleh diubah dari device lansia sendiri keluarga bisa
 * melihat, tidak bisa menyalakan (PLAN §2.5).
 */
eldersRouter.patch(
  '/:elderId/consents',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    if (req.elder.user_id !== req.user.id) {
      throw ApiError.forbidden(
        'Pengaturan privasi hanya bisa diubah dari perangkat lansia sendiri',
        'CONSENT_ELDER_ONLY',
      );
    }

    const body = z.object({ key: z.string().min(2), granted: z.boolean() }).parse(req.body);

    const consent = await one(
      `INSERT INTO consents (elder_id, key, granted) VALUES ($1, $2, $3)
       ON CONFLICT (elder_id, key) DO UPDATE SET granted = EXCLUDED.granted, updated_at = now()
       RETURNING *`,
      [req.elder.id, body.key, body.granted],
    );

    res.json({ consent });
  }),
);
