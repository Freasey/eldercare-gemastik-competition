/**
 * Sinkronisasi latar: kirim yang tertunda, lalu ambil jadwal terbaru dan
 * jadwalkan ulang notifikasi lokalnya.
 *
 * Dipanggil saat app dibuka dan setiap kali sebuah sesi selesai — dua momen
 * yang pasti terjadi tanpa perlu ada yang menekan apa pun. App lansia tidak
 * punya tombol "sinkronkan", dan tidak boleh punya.
 */
import { flushOutbox } from './outbox.js';
import { jadwalkanUlangDariCache, sinkronPengingat } from '../notifications/local.js';

/**
 * @param {number} elderId
 * @returns {Promise<{online: boolean, terkirim: number, dijadwalkan: number}>}
 */
export async function sinkronkan(elderId) {
  const { sent } = await flushOutbox();

  try {
    const { dijadwalkan } = await sinkronPengingat(elderId);
    return { online: true, terkirim: sent, dijadwalkan };
  } catch {
    // Tidak ada sambungan: pakai cache terakhir. Notifikasi tetap perlu
    // dijadwalkan ulang karena yang sudah lewat hilang dari antrean sistem.
    const { dijadwalkan } = await jadwalkanUlangDariCache();
    return { online: false, terkirim: sent, dijadwalkan };
  }
}
