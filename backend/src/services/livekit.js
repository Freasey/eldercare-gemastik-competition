/**
 * LiveKit — voice call + messaging in-app untuk jalur darurat (PLAN §2.4).
 * API key/secret hanya hidup di server; app cuma menerima access token
 * berumur pendek.
 */
import { AccessToken } from 'livekit-server-sdk';
import { env } from '../config/env.js';
import { ApiError } from '../middleware/errors.js';

const TOKEN_TTL = '15m';

export function isLivekitConfigured() {
  return Boolean(env.livekitApiKey && env.livekitApiSecret && env.livekitUrl);
}

export function roomNameForEmergency(emergencyId) {
  return `emergency-${emergencyId}`;
}

export async function createRoomToken({ room, identity, name, canPublish = true }) {
  if (!isLivekitConfigured()) {
    throw ApiError.badRequest('LiveKit belum dikonfigurasi di server', 'LIVEKIT_NOT_CONFIGURED');
  }

  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: String(identity),
    name,
    ttl: TOKEN_TTL,
  });

  token.addGrant({
    room,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true, // dipakai untuk chat teks di room yang sama
  });

  return { url: env.livekitUrl, token: await token.toJwt(), room };
}
