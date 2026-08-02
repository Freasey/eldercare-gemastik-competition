/**
 * Panggilan suara darurat di sisi lansia (PLAN §2.4).
 *
 * **Tidak ada layar dan tidak ada tombol untuk ini.** Backend sudah menerbitkan
 * token LiveKit di respons `confirm`, jadi app tinggal masuk ke room itu dan
 * menyalakan mikrofon. Lansia tidak perlu dan pada keadaan darurat sering
 * tidak sanggup mengangkat panggilan. Yang terdengar olehnya cuma suara
 * keluarga keluar dari speaker.
 *
 * Sengaja memakai `Room` dari livekit-client secara imperatif, bukan komponen
 * `<LiveKitRoom>` seperti di app keluarga: di sini tidak ada yang perlu
 * digambar, dan menaruhnya di pohon React berarti membuat layar yang bertentangan
 * dengan aturan "app ini tidak punya UI" (lihat AGENTS.md).
 */
import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';
import { Room, RoomEvent } from 'livekit-client';

/**
 * Berapa lama menunggu keluarga masuk sebelum menyerah.
 *
 * Mikrofon yang menyala tanpa batas adalah masalah privasi, bukan cuma boros
 * baterai. Kalau tidak ada yang datang dalam rentang ini, lebih baik room
 * ditutup dan lansia dianjurkan mencari pertolongan lain.
 */
const BATAS_MENUNGGU_MS = 3 * 60 * 1000;

/** Jeda sebelum menutup room setelah keluarga keluar semua. */
const JEDA_TUTUP_MS = 5000;

/** @type {Room | null} */
let roomAktif = null;
let penghitungWaktu = null;

export function panggilanSedangJalan() {
  return roomAktif !== null;
}

/**
 * Masuk ke room darurat dan mulai bicara.
 *
 * @param {{url: string, token: string, room: string}} kredensial dari respons
 *   `POST .../emergencies/:id/confirm`
 * @param {{onKeluargaMasuk?: () => void, onSelesai?: (alasan: string) => void}} [kait]
 * @returns {Promise<boolean>} false kalau tidak jadi tersambung
 */
export async function mulaiPanggilanDarurat(kredensial, kait = {}) {
  if (!kredensial?.url || !kredensial?.token) return false;

  // Panggilan lama harus benar-benar tutup dulu. Dua room hidup bersamaan
  // berarti dua mikrofon aktif dan suara yang saling menimpa.
  await akhiriPanggilanDarurat('panggilan baru');

  try {
    await AudioSession.configureAudio({
      android: {
        // Speaker, bukan earpiece: HP-nya kemungkinan besar tergeletak, bukan
        // menempel di telinga itu justru keadaan yang memicu darurat.
        preferredOutputList: ['speaker'],
        audioTypeOptions: AndroidAudioTypePresets.communication,
      },
      ios: { defaultOutput: 'speaker' },
    });
    await AudioSession.startAudioSession();
  } catch (err) {
    console.warn('[darurat] audio session gagal disiapkan:', err.message);
    return false;
  }

  const room = new Room();
  roomAktif = room;

  let adaYangPernahMasuk = false;
  let jedaTutup = null;

  const selesai = (alasan) => {
    akhiriPanggilanDarurat(alasan).then(() => kait.onSelesai?.(alasan));
  };

  room.on(RoomEvent.ParticipantConnected, () => {
    adaYangPernahMasuk = true;
    clearTimeout(penghitungWaktu);
    clearTimeout(jedaTutup);
    kait.onKeluargaMasuk?.();
  });

  room.on(RoomEvent.ParticipantDisconnected, () => {
    if (room.remoteParticipants.size > 0) return;
    // Jeda sebentar: sambungan yang putus-nyambung sesaat tidak boleh langsung
    // dianggap "keluarga sudah menutup telepon".
    jedaTutup = setTimeout(() => selesai('keluarga menutup'), JEDA_TUTUP_MS);
  });

  room.on(RoomEvent.Disconnected, () => selesai('room ditutup'));

  try {
    await room.connect(kredensial.url, kredensial.token);
    await room.localParticipant.setMicrophoneEnabled(true);
  } catch (err) {
    console.warn('[darurat] gagal masuk room:', err.message);
    await akhiriPanggilanDarurat('gagal menyambung');
    return false;
  }

  penghitungWaktu = setTimeout(() => {
    if (!adaYangPernahMasuk) selesai('tidak ada yang bergabung');
  }, BATAS_MENUNGGU_MS);

  return true;
}

/** Tutup panggilan dan lepaskan mikrofon. Aman dipanggil berkali-kali. */
export async function akhiriPanggilanDarurat(alasan = 'ditutup') {
  clearTimeout(penghitungWaktu);
  penghitungWaktu = null;

  const room = roomAktif;
  roomAktif = null;
  if (!room) return;

  console.log('[darurat] panggilan ditutup:', alasan);
  try {
    room.removeAllListeners();
    await room.disconnect();
  } catch {
    // Sudah terputus duluan.
  }
  try {
    await AudioSession.stopAudioSession();
  } catch {
    // Sesi audio memang belum/sudah tidak jalan.
  }
}
