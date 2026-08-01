/**
 * Loop percakapan — inti app lansia.
 *
 * Bentuknya sengaja satu alur `async` lurus (bicara → dengar → kirim → bicara)
 * dan bukan kumpulan callback: percakapan memang berurutan, dan versi
 * berbasis event membuat "jangan menyalakan mikrofon selagi speaker bunyi"
 * jadi sangat mudah dilanggar tanpa ketahuan.
 *
 * Yang TIDAK dikerjakan di sini, dan memang tidak boleh: memilih kalimat
 * pembuka, menafsirkan jawaban obat, menghitung skor mood, dan memutuskan
 * kapan izin privasi ditanyakan. Semua itu milik backend — app cuma
 * mengembalikan `expects`, `reminderId`, dan `consentKey` apa adanya.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmEmergency, triggerEmergency } from '../api/caretaker.js';
import { isRevoked } from '../api/client.js';
import { say, stopSpeaking } from './tts.js';
import { listenOnce, stopListening } from './stt.js';
import { adalahPenutup, bacaanDarurat, bacaYaTidak } from './interpret.js';
import { DeviceRevokedError, mulaiSesi } from './session.js';

/**
 * Fase yang ditampilkan layar. Hanya ini yang dilihat lansia — tidak ada teks
 * status teknis, hanya indikator + caption.
 * @typedef {'siap'|'membuka'|'bicara'|'mendengar'|'berpikir'|'selesai'|'darurat'|'gagal'} Fase
 */

/** Berapa kali diam berturut-turut sebelum sesi ditutup sendiri. */
const BATAS_DIAM = 2;

export function useVoiceSession({ elderId, onRevoked, onSelesai }) {
  const [fase, setFase] = useState('siap');
  const [caption, setCaption] = useState('');
  const [offline, setOffline] = useState(false);

  /**
   * Penanda generasi. Setiap sesi baru menaikkannya, dan loop lama berhenti
   * begitu melihat angkanya berubah. Tanpa ini, sesi yang ditinggalkan tetap
   * berbicara di latar saat sesi berikutnya sudah mulai.
   */
  const generasiRef = useRef(0);

  const hentikan = useCallback(() => {
    generasiRef.current += 1;
    stopSpeaking();
    stopListening();
  }, []);

  // Jangan tinggalkan mikrofon menyala saat app ditutup.
  useEffect(() => hentikan, [hentikan]);

  const mulai = useCallback(
    /** @param {'button'|'scheduled'|'wake_word'|'emergency'} trigger */
    async (trigger = 'button') => {
      const generasi = (generasiRef.current += 1);
      const hidup = () => generasiRef.current === generasi;

      /** Ucapkan + tampilkan captionnya. Mikrofon menyala hanya setelah ini. */
      const ucap = async (teks) => {
        if (!hidup()) return;
        setFase('bicara');
        setCaption(teks);
        await say(teks);
      };

      const dengar = async () => {
        if (!hidup()) return { text: null };
        setFase('mendengar');
        setCaption('');
        return listenOnce({ onPartial: (t) => hidup() && setCaption(t) });
      };

      setFase('membuka');
      setCaption('');

      let sesi;
      try {
        sesi = await mulaiSesi({ elderId, trigger });
      } catch (err) {
        if (err instanceof DeviceRevokedError) return onRevoked?.();
        setFase('gagal');
        await ucap('Maaf, ada gangguan. Coba buka aplikasinya lagi sebentar lagi ya.');
        setFase('gagal');
        return;
      }
      if (!hidup()) return;
      setOffline(sesi.offline);

      let alasanTutup = 'button';
      let daruratTerkirim = false;

      try {
        const pembuka = await sesi.open();
        let expects = pembuka.expects;
        let reminderId = pembuka.reminderId ?? null;
        let consentKey = pembuka.consentKey ?? null;

        await ucap(pembuka.speech);
        if (pembuka.selesai) {
          alasanTutup = 'closing_phrase';
          return;
        }

        let diam = 0;

        while (hidup()) {
          const { text } = await dengar();
          if (!hidup()) return;

          if (!text) {
            diam += 1;
            if (diam < BATAS_DIAM) {
              await ucap('Saya masih di sini. Ada yang ingin disampaikan?');
              continue;
            }
            alasanTutup = 'silence';
            await ucap('Baik, saya tutup dulu ya. Kalau butuh apa-apa, buka lagi aplikasinya.');
            break;
          }
          diam = 0;

          // Diperiksa paling awal, sebelum teksnya dikirim ke mana pun:
          // permintaan tolong tidak boleh menunggu satu putaran jaringan.
          if (bacaanDarurat(text)) {
            daruratTerkirim = await jalankanDarurat({ elderId, text, ucap, dengar, hidup });
            if (daruratTerkirim) {
              alasanTutup = 'emergency';
              break;
            }
            continue;
          }

          // Penutup hanya berlaku di percakapan bebas. Pada giliran jawaban
          // obat, "sudah" berarti sudah diminum — bukan tanda mau berhenti.
          if (expects === 'free' && adalahPenutup(text)) {
            alasanTutup = 'closing_phrase';
            await ucap('Baik, terima kasih. Sampai nanti ya.');
            break;
          }

          setFase('berpikir');

          let hasil;
          try {
            hasil = await sesi.turn({ text, expects, reminderId, consentKey });
          } catch (err) {
            if (err instanceof DeviceRevokedError || isRevoked(err)) return onRevoked?.();
            alasanTutup = 'error';
            await ucap('Maaf, sambungannya sedang terputus. Nanti kita lanjutkan lagi ya.');
            break;
          }
          if (!hidup()) return;

          expects = hasil.expects;
          reminderId = hasil.reminderId ?? null;
          consentKey = hasil.consentKey ?? null;

          await ucap(hasil.speech);
          if (hasil.selesai) {
            alasanTutup = 'closing_phrase';
            break;
          }
        }
      } finally {
        stopListening();
        // `end` tetap dipanggil walau sesi berakhir karena error, supaya
        // backend tidak meninggalkan percakapan menggantung tanpa ringkasan.
        await sesi.end(alasanTutup === 'emergency' ? 'button' : alasanTutup);
        if (hidup()) {
          // Caption sengaja tidak dikosongkan: kalimat terakhir tetap terbaca
          // setelah suaranya berhenti — penting bagi yang pendengarannya
          // berkurang dan baru sempat membacanya belakangan.
          setFase(daruratTerkirim ? 'darurat' : 'selesai');
          onSelesai?.();
        }
      }
    },
    [elderId, onRevoked, onSelesai],
  );

  return { fase, caption, offline, mulai, hentikan };
}

/**
 * Alur darurat (PLAN §2.4): konfirmasi ke lansia dulu, baru eskalasi.
 *
 * @returns {Promise<boolean>} true kalau keluarga jadi dihubungi.
 */
async function jalankanDarurat({ elderId, text, ucap, dengar, hidup }) {
  let event;
  let confirmSpeech;

  try {
    const hasil = await triggerEmergency(elderId, {
      triggerType: 'keyword',
      detail: text.slice(0, 500),
    });
    event = hasil.event;
    confirmSpeech = hasil.confirmSpeech;
  } catch {
    // Tanpa sambungan, tidak ada yang bisa dihubungi lewat app. Jangan
    // berpura-pura sudah mengabari keluarga — itu justru membuat lansia
    // berhenti mencari pertolongan lain.
    await ucap(
      'Maaf, sekarang saya tidak bisa menghubungi keluarga karena tidak ada sambungan internet. ' +
        'Kalau bisa, coba panggil orang di sekitar atau telepon langsung ya.',
    );
    return false;
  }

  await ucap(confirmSpeech);
  const { text: jawaban } = await dengar();
  if (!hidup()) return false;

  // Diam atau jawaban tidak jelas diperlakukan sebagai "iya". Orang yang
  // benar-benar butuh bantuan bisa saja tidak sanggup menjawab, dan salah
  // memanggil keluarga jauh lebih murah daripada terlambat memanggilnya.
  const jadi = bacaYaTidak(jawaban ?? '') !== 'tidak';

  try {
    await confirmEmergency(elderId, event.id, jadi);
  } catch {
    await ucap('Maaf, sambungannya terputus saat menghubungi keluarga. Coba panggil orang di sekitar ya.');
    return false;
  }

  if (!jadi) {
    await ucap('Baik, syukurlah. Saya tidak jadi menghubungi keluarga.');
    return false;
  }

  // Jujur soal apa yang benar-benar terjadi: keluarga menerima notifikasi di
  // app mereka. Panggilan suaranya belum hidup (lihat README), jadi jangan
  // menjanjikan "sebentar lagi ditelepon".
  await ucap(
    'Sudah saya kabari keluarga lewat aplikasi mereka sekarang. ' +
      'Tetap tenang ya, jangan matikan HP-nya.',
  );
  return true;
}
