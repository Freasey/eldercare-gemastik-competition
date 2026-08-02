/**
 * Alur darurat (PLAN §2.4):
 *   trigger → konfirmasi ke lansia dulu → eskalasi push ke keluarga →
 *   kalau perlu, room LiveKit untuk voice call + chat in-app.
 * Tidak ada SMS/telepon PSTN seluruh jalur tetap di dalam app.
 */
import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../db/pool.js';
import { ApiError, asyncHandler } from '../middleware/errors.js';
import { requireAuth, requireElderAccess } from '../middleware/auth.js';
import { createRoomToken, isLivekitConfigured, roomNameForEmergency } from '../services/livekit.js';
import { notifyCaregivers } from '../services/push.js';

export const emergencyRouter = Router({ mergeParams: true });
emergencyRouter.use(requireAuth);

/** GET /api/elders/:elderId/emergencies */
emergencyRouter.get(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const events = await many(
      `SELECT e.*, u.name AS acknowledged_by_name
         FROM emergency_events e
         LEFT JOIN users u ON u.id = e.acknowledged_by
        WHERE e.elder_id = $1
        ORDER BY e.created_at DESC LIMIT 50`,
      [req.elder.id],
    );
    res.json({ events });
  }),
);

/**
 * POST /api/elders/:elderId/emergencies
 * Dipanggil device lansia saat mendeteksi trigger. Status awal `detected`:
 * BELUM dieskalasi app harus konfirmasi ke lansia dulu untuk menekan
 * false positive.
 */
emergencyRouter.post(
  '/',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { triggerType, detail } = z
      .object({
        triggerType: z.enum(['keyword', 'fall_detection', 'missed_critical', 'manual']),
        detail: z.string().max(500).optional(),
      })
      .parse(req.body);

    const event = await one(
      `INSERT INTO emergency_events (elder_id, trigger_type, detail, status)
       VALUES ($1, $2, $3, 'detected') RETURNING *`,
      [req.elder.id, triggerType, detail ?? null],
    );

    res.status(201).json({
      event,
      // Kalimat konfirmasi yang dibacakan ke lansia sebelum eskalasi.
      confirmSpeech:
        triggerType === 'fall_detection'
          ? 'Sepertinya tadi ada benturan. Ibu baik-baik saja? Kalau butuh bantuan, bilang "tolong".'
          : 'Saya dengar sepertinya butuh bantuan. Mau saya hubungi keluarga sekarang?',
    });
  }),
);

/**
 * POST /api/elders/:elderId/emergencies/:id/confirm
 * Body: { confirmed: boolean }
 * confirmed=false → false positive, ditutup tanpa mengganggu keluarga.
 * confirmed=true  → eskalasi: push ke semua caregiver + siapkan room LiveKit.
 */
emergencyRouter.post(
  '/:id/confirm',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { confirmed } = z.object({ confirmed: z.boolean() }).parse(req.body);

    const event = await one(
      'SELECT * FROM emergency_events WHERE id = $1 AND elder_id = $2',
      [req.params.id, req.elder.id],
    );
    if (!event) throw ApiError.notFound('Kejadian darurat tidak ditemukan');
    if (event.status !== 'detected') throw ApiError.conflict(`Kejadian sudah berstatus ${event.status}`);

    if (!confirmed) {
      const cancelled = await one(
        `UPDATE emergency_events SET status = 'cancelled', confirmed_by_elder = false, resolved_at = now()
          WHERE id = $1 RETURNING *`,
        [event.id],
      );
      return res.json({ event: cancelled, escalated: false });
    }

    const room = roomNameForEmergency(event.id);
    const escalated = await one(
      `UPDATE emergency_events SET status = 'escalated', confirmed_by_elder = true, livekit_room = $2
        WHERE id = $1 RETURNING *`,
      [event.id, room],
    );

    const push = await notifyCaregivers(req.elder.id, {
      title: `Darurat: ${req.elder.name}`,
      body: event.detail || 'Butuh bantuan sekarang. Ketuk untuk menghubungi.',
      data: { type: 'emergency', emergencyId: event.id, elderId: req.elder.id, room },
      critical: true,
    });

    res.json({
      event: escalated,
      escalated: true,
      notifiedDevices: push.sent,
      // Kalau LiveKit belum dikonfigurasi, eskalasi push tetap jalan 
      // panggilan suara-nya saja yang belum tersedia.
      call: isLivekitConfigured()
        ? await createRoomToken({
            room,
            identity: `elder-${req.elder.id}`,
            name: req.elder.name,
          })
        : null,
    });
  }),
);

/**
 * POST /api/elders/:elderId/emergencies/:id/join
 * Keluarga menekan notifikasi → dapat token untuk masuk room yang sama.
 */
emergencyRouter.post(
  '/:id/join',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const event = await one(
      'SELECT * FROM emergency_events WHERE id = $1 AND elder_id = $2',
      [req.params.id, req.elder.id],
    );
    if (!event) throw ApiError.notFound('Kejadian darurat tidak ditemukan');
    if (!event.livekit_room) throw ApiError.conflict('Kejadian ini belum dieskalasi');

    const updated = await one(
      `UPDATE emergency_events
          SET status = CASE WHEN status = 'escalated' THEN 'acknowledged' ELSE status END,
              acknowledged_by = COALESCE(acknowledged_by, $2)
        WHERE id = $1 RETURNING *`,
      [event.id, req.user.id],
    );

    res.json({
      event: updated,
      call: await createRoomToken({
        room: event.livekit_room,
        identity: `user-${req.user.id}`,
        name: req.user.name,
      }),
    });
  }),
);

/** POST /api/elders/:elderId/emergencies/:id/resolve */
emergencyRouter.post(
  '/:id/resolve',
  requireElderAccess,
  asyncHandler(async (req, res) => {
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {});

    const event = await one(
      `UPDATE emergency_events
          SET status = 'resolved',
              resolved_at = now(),
              acknowledged_by = COALESCE(acknowledged_by, $3),
              detail = COALESCE(detail || ' ' || $4, detail)
        WHERE id = $1 AND elder_id = $2 RETURNING *`,
      [req.params.id, req.elder.id, req.user.id, note ?? null],
    );
    if (!event) throw ApiError.notFound('Kejadian darurat tidak ditemukan');

    res.json({ event });
  }),
);
