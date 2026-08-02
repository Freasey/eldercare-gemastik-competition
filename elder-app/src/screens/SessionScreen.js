/**
 * Layar sesi — satu-satunya layar setelah perangkat terhubung.
 *
 * Membuka app SAMA DENGAN memulai percakapan (PLAN §2.6): tidak ada tombol
 * "mulai bicara", tidak ada beranda, tidak ada menu. Yang tampil hanya
 * indikator status dan caption.
 *
 * Satu-satunya ketukan yang tersisa adalah ketuk-untuk-mengulang setelah sesi
 * berakhir. Itu bukan kompromi terhadap prinsip "tanpa UI", melainkan jalan
 * keluar dari jalan buntu: kalau app menutup sesi karena diam terlalu lama,
 * harus ada cara memulainya lagi tanpa menutup dan membuka aplikasi.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusOrb } from '../components/StatusOrb.js';
import { Caption } from '../components/Caption.js';
import { colors, type } from '../theme.js';
import { useDevice } from '../context/DeviceContext.js';
import { useVoiceSession } from '../voice/useVoiceSession.js';
import { requestMicPermission } from '../voice/stt.js';
import { pantauKataBangun } from '../voice/wakeWord.js';
import { pantauJatuh, sensorTersedia } from '../sensors/fallDetection.js';
import { say } from '../voice/tts.js';
import { notifikasiPembuka, saatNotifikasiDiketuk, siapkanNotifikasi } from '../notifications/local.js';
import { sinkronkan } from '../lib/sync.js';

/** Kalimat kecil di bawah lingkaran. Sengaja pendek — ini bukan bacaan. */
const LABEL = {
  membuka: 'Sebentar ya…',
  mendengar: 'Silakan bicara',
  berpikir: 'Sebentar ya…',
  bicara: '',
  selesai: 'Ketuk layar atau ucapkan "halo teman"',
  darurat: 'Keluarga sudah dikabari',
  gagal: 'Ketuk layar untuk mencoba lagi',
  siap: '',
};

/** Label panggilan darurat menimpa LABEL di atas selama panggilan hidup. */
const LABEL_PANGGILAN = {
  menunggu: 'Menunggu keluarga menjawab…',
  tersambung: 'Sedang bicara dengan keluarga',
};

/** Fase saat ketukan layar boleh memulai sesi baru. */
const BOLEH_DIULANG = ['selesai', 'gagal', 'darurat', 'siap'];

export function SessionScreen() {
  // Selama sesi, layar tidak boleh mati: lansia sedang bicara, bukan menyentuh
  // layar, jadi Android menganggapnya menganggur dan akan mengunci sendiri.
  useKeepAwake();

  const { elder, putuskan } = useDevice();
  const [izinMik, setIzinMik] = useState('memeriksa'); // memeriksa | ada | ditolak

  const { fase, caption, offline, panggilan, mulai, picuDaruratJatuh } = useVoiceSession({
    elderId: elder.id,
    onRevoked: putuskan,
    // Sinkron dikerjakan setelah sesi selesai, bukan sebelum: jangan menunda
    // kalimat pertama hanya untuk menyegarkan jadwal.
    onSelesai: useCallback(() => {
      sinkronkan(elder.id).catch(() => {});
    }, [elder.id]),
  });

  const sudahMulai = useRef(false);

  // Fase disimpan di ref juga, supaya langganan notifikasi dan AppState di
  // bawah tidak perlu dipasang ulang setiap kali indikator berubah.
  const faseRef = useRef(fase);
  faseRef.current = fase;

  // Sama alasannya: pendeteksi jatuh dipasang sekali dan tidak boleh dipasang
  // ulang setiap kali keadaan panggilan berubah — memasang ulang berarti
  // kehilangan riwayat tahap yang sedang diamatinya.
  const panggilanRef = useRef(panggilan);
  panggilanRef.current = panggilan;

  useEffect(() => {
    if (sudahMulai.current) return;
    sudahMulai.current = true;

    (async () => {
      await siapkanNotifikasi();

      const boleh = await requestMicPermission();
      setIzinMik(boleh ? 'ada' : 'ditolak');
      if (!boleh) {
        await say(
          'Aplikasi ini butuh izin mikrofon supaya bisa mendengar. ' +
            'Minta tolong keluarga untuk menyalakannya di pengaturan.',
        );
        return;
      }

      // Jadwal disegarkan di latar — sesi tidak menunggunya.
      sinkronkan(elder.id).catch(() => {});

      // App yang dibuka dari notifikasi pengingat dibedakan dari app yang
      // dibuka sendiri: backend mencatatnya di kolom `trigger`, dan keluarga
      // bisa melihat mana percakapan yang muncul karena jadwal.
      const pembuka = await notifikasiPembuka();
      mulai(pembuka?.type === 'reminder' ? 'scheduled' : 'button');
    })();
  }, [elder.id, mulai]);

  // Notifikasi yang diketuk saat app sudah terbuka. Sesi yang sedang berjalan
  // sengaja tidak dipotong — memotong lansia di tengah kalimat lebih buruk
  // daripada pengingat yang menyusul beberapa menit kemudian.
  useEffect(
    () =>
      saatNotifikasiDiketuk((data) => {
        if (data?.type === 'reminder' && BOLEH_DIULANG.includes(faseRef.current)) mulai('scheduled');
      }),
    [mulai],
  );

  // Kembali dari layar kunci setelah sesi selesai: kirim yang tertunda dan
  // segarkan jadwal, tanpa membuka percakapan baru sendiri.
  useEffect(() => {
    const langganan = AppState.addEventListener('change', (state) => {
      if (state === 'active' && BOLEH_DIULANG.includes(faseRef.current)) sinkronkan(elder.id).catch(() => {});
    });
    return () => langganan.remove();
  }, [elder.id]);

  const sesiMenganggur = BOLEH_DIULANG.includes(fase) && panggilan === 'tidak';

  // Wake word hanya hidup saat tidak ada yang memakai mikrofon. Pengenal suara
  // Android tidak bisa dipakai dua-duanya sekaligus: menyalakannya selagi sesi
  // berjalan bukan membuat wake word tetap siap, melainkan membuat sesi yang
  // sedang berlangsung berhenti mendengar.
  useEffect(() => {
    if (izinMik !== 'ada' || !sesiMenganggur) return undefined;
    return pantauKataBangun(() => mulai('wake_word'));
  }, [izinMik, sesiMenganggur, mulai]);

  // Deteksi jatuh jalan terus, termasuk di tengah percakapan — orang bisa jatuh
  // kapan saja, dan percakapan yang terpotong lebih murah daripada jatuh yang
  // terlewat. Satu-satunya yang menahannya adalah panggilan darurat yang sedang
  // berjalan: keluarganya sudah di ujung sana, tidak perlu dipanggil lagi.
  useEffect(() => {
    let lepas = null;
    let batal = false;

    (async () => {
      if (!(await sensorTersedia()) || batal) return;
      lepas = pantauJatuh((detail) => {
        if (panggilanRef.current !== 'tidak') return;
        picuDaruratJatuh(detail);
      });
    })();

    return () => {
      batal = true;
      lepas?.();
    };
  }, [picuDaruratJatuh]);

  if (izinMik === 'ditolak') return <IzinDitolak />;

  const bolehDiulang = sesiMenganggur;
  const label = LABEL_PANGGILAN[panggilan] ?? LABEL[fase];

  return (
    <Pressable
      onPress={() => bolehDiulang && mulai('button')}
      style={{
        flex: 1,
        backgroundColor:
          fase === 'darurat' || panggilan !== 'tidak' ? colors.criticalSoft : colors.backdrop,
      }}
    >
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 28 }}>
        <StatusOrb fase={fase} />

        <Caption text={caption} tone={fase === 'darurat' ? 'critical' : 'ink'} />

        {label ? (
          <Text style={{ fontSize: type.status, color: colors.ink2, textAlign: 'center' }}>
            {label}
          </Text>
        ) : null}

        {offline ? (
          <Text style={{ fontSize: type.status, color: colors.ink2, textAlign: 'center', paddingHorizontal: 32 }}>
            Sedang tidak ada internet — pengingat tetap jalan.
          </Text>
        ) : null}
      </SafeAreaView>
    </Pressable>
  );
}

/**
 * Tanpa mikrofon, app ini tidak bisa apa-apa. Layarnya ditujukan ke keluarga,
 * bukan ke lansia — karena merekalah yang akan membuka pengaturan.
 */
function IzinDitolak() {
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.backdrop,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 24,
      }}
    >
      <Text style={{ fontSize: type.caption, fontWeight: '700', color: colors.ink, textAlign: 'center' }}>
        Izin mikrofon belum menyala
      </Text>
      <Text style={{ fontSize: type.hint, color: colors.ink2, textAlign: 'center', lineHeight: 30 }}>
        Aplikasi ini bekerja lewat suara, jadi tanpa mikrofon tidak ada yang bisa dilakukan. Buka
        pengaturan, lalu nyalakan izin Mikrofon.
      </Text>
      <Pressable
        onPress={() => Linking.openSettings()}
        style={{
          backgroundColor: colors.accent,
          paddingVertical: 20,
          paddingHorizontal: 36,
          borderRadius: 18,
        }}
      >
        <Text style={{ fontSize: type.hint, fontWeight: '700', color: colors.onAccent }}>
          Buka pengaturan
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}
