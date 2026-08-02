/**
 * Sisi "bicara" TTS bawaan OS lewat expo-speech (PLAN §4).
 *
 * Dipakai native, bukan layanan cloud: gratis, jalan offline, dan suaranya
 * sudah terpasang di hampir semua HP Android Indonesia.
 */
import * as Speech from 'expo-speech';

const OPSI = {
  language: 'id-ID',
  // Sedikit lebih lambat dari normal. Bukan supaya terdengar "ramah lansia",
  // tapi karena kalimat pengingat obat harus tertangkap sekali dengar.
  rate: 0.92,
  pitch: 1.0,
};

/**
 * Ucapkan satu kalimat, selesai saat suaranya benar-benar berhenti.
 *
 * Loop percakapan bergantung penuh pada janji ini: kalau resolve kepagian,
 * mikrofon menyala saat speaker masih bunyi dan app mendengar suaranya
 * sendiri. Karena itu ada pengaman waktu di sebagian HP callback `onDone`
 * tidak pernah datang, dan tanpa pengaman app akan diam selamanya.
 *
 * @param {string} text
 * @returns {Promise<void>}
 */
export function say(text) {
  return new Promise((resolve) => {
    if (!text) return resolve();

    let selesai = false;
    let pengaman;
    const beres = () => {
      if (selesai) return;
      selesai = true;
      clearTimeout(pengaman);
      resolve();
    };

    // Perkiraan kasar durasi bicara + margin, hanya sebagai jaring pengaman.
    const kata = text.trim().split(/\s+/).length;
    pengaman = setTimeout(beres, kata * 700 + 4000);

    Speech.speak(text, { ...OPSI, onDone: beres, onStopped: beres, onError: beres });
  });
}

/** Hentikan paksa, mis. saat app ditutup atau sesi dibatalkan. */
export function stopSpeaking() {
  Speech.stop();
}
