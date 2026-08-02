/**
 * Panggilan suara dalam aplikasi (PLAN §2.4 — darurat tidak pernah keluar app).
 *
 * Urutannya: minta izin mikrofon → `POST .../emergencies/:id/join` (menandai
 * kejadian jadi `acknowledged` dan menerbitkan token LiveKit) → sambung ke room
 * → publikasikan mikrofon.
 *
 * Yang ditampilkan ke keluarga adalah keadaan sebenarnya, bukan animasi
 * menenangkan: selama lansia belum masuk room, layar ini berkata "menunggu",
 * dan penghitung durasi baru berjalan setelah ada suara di dua sisi. Pada
 * panggilan darurat, mengira sudah tersambung padahal belum adalah kegagalan
 * yang paling mahal.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AndroidAudioTypePresets,
  AudioSession,
  LiveKitRoom,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
} from '@livekit/react-native';
import { ConnectionState } from 'livekit-client';
import { Avatar, Note } from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { joinEmergency } from '../api/caretaker.js';

export function CallScreen() {
  const c = useColors();
  const nav = useNavigation();
  const { elderId, eventId } = useRoute().params;
  const { elders } = useElders();
  const elder = elders.find((e) => e.id === elderId);

  /** @type {['menyiapkan'|'siap'|'gagal', Function]} */
  const [fase, setFase] = useState('menyiapkan');
  const [pesan, setPesan] = useState('Menyiapkan panggilan…');
  const [kredensial, setKredensial] = useState(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      // Izin mikrofon diminta SEBELUM token: kalau ditolak, tidak ada gunanya
      // menandai kejadian ini "sedang ditangani" — keluarga belum bisa bicara.
      if (Platform.OS === 'android') {
        const izin = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Izinkan mikrofon',
            message: 'Mikrofon dipakai untuk berbicara langsung dengan lansia Anda.',
            buttonPositive: 'Izinkan',
          },
        );
        if (izin !== PermissionsAndroid.RESULTS.GRANTED) {
          if (alive) {
            setFase('gagal');
            setPesan('Izin mikrofon ditolak. Panggilan butuh mikrofon untuk bisa bicara.');
          }
          return;
        }
      }

      // Speaker didahulukan, bukan earpiece: HP kemungkinan besar tidak sedang
      // ditempel di telinga saat notifikasi darurat diketuk.
      try {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['speaker'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: { defaultOutput: 'speaker' },
        });
        await AudioSession.startAudioSession();
      } catch (err) {
        if (alive) {
          setFase('gagal');
          setPesan(`Audio perangkat tidak bisa disiapkan: ${err.message}`);
        }
        return;
      }

      try {
        const { call } = await joinEmergency(elderId, eventId);
        if (!alive) return;
        if (!call?.token || !call?.url) {
          setFase('gagal');
          setPesan('Server tidak mengirim kredensial panggilan.');
          return;
        }
        setKredensial(call);
        setFase('siap');
      } catch (err) {
        if (alive) {
          setFase('gagal');
          setPesan(err.message);
        }
      }
    })();

    return () => {
      alive = false;
      AudioSession.stopAudioSession().catch(() => {});
    };
  }, [elderId, eventId]);

  const tutup = useCallback(() => nav.goBack(), [nav]);

  if (fase !== 'siap') {
    return (
      <Bingkai elder={elder} c={c}>
        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', textAlign: 'center' }}>
          {pesan}
        </Text>
        <Note style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 8 }}>
          {fase === 'gagal'
            ? 'Panggilan belum bisa dibuka. Coba hubungi lewat kontak darurat di layar Darurat.'
            : 'Sebentar…'}
        </Note>
        <BarisTombol c={c} onTutup={tutup} hanyaTutup />
      </Bingkai>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={kredensial.url}
      token={kredensial.token}
      connect
      audio
      video={false}
      onError={(err) => {
        setFase('gagal');
        setPesan(err.message);
      }}
    >
      <RuangPanggilan elder={elder} onTutup={tutup} />
    </LiveKitRoom>
  );
}

/**
 * Isi panggilan. Dipisah karena hook LiveKit hanya hidup di dalam
 * `<LiveKitRoom>` — di komponen induk semuanya masih kosong.
 */
function RuangPanggilan({ elder, onTutup }) {
  const c = useColors();
  const status = useConnectionState();
  const lawanBicara = useRemoteParticipants();
  const { localParticipant } = useLocalParticipant();

  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [detik, setDetik] = useState(0);

  const tersambungPenuh = status === ConnectionState.Connected && lawanBicara.length > 0;

  // Penghitung baru jalan setelah ada orang di seberang, dan sengaja tidak
  // di-reset kalau sambungannya sempat putus-nyambung — yang ingin diketahui
  // keluarga adalah "sudah berapa lama saya menemani", bukan uptime WebRTC.
  const mulai = useRef(null);
  useEffect(() => {
    if (!tersambungPenuh) return undefined;
    if (mulai.current === null) mulai.current = Date.now();
    const t = setInterval(() => setDetik(Math.floor((Date.now() - mulai.current) / 1000)), 500);
    return () => clearInterval(t);
  }, [tersambungPenuh]);

  async function ubahMic() {
    const baru = !muted;
    setMuted(baru);
    try {
      await localParticipant.setMicrophoneEnabled(!baru);
    } catch {
      setMuted(!baru); // gagal → kembalikan tampilan supaya tidak berbohong
    }
  }

  async function ubahSpeaker() {
    const baru = !speaker;
    try {
      const keluaran = await AudioSession.getAudioOutputs();
      const tujuan = baru ? 'speaker' : 'earpiece';
      if (!keluaran.includes(tujuan)) return; // mis. headset tercolok
      await AudioSession.selectAudioOutput(tujuan);
      setSpeaker(baru);
    } catch {
      // Biarkan rute audio apa adanya. Mengubah label tanpa rutenya benar-benar
      // pindah lebih membingungkan daripada tombol yang tidak bereaksi.
    }
  }

  const mm = String(Math.floor(detik / 60)).padStart(2, '0');
  const ss = String(detik % 60).padStart(2, '0');

  return (
    <Bingkai elder={elder} c={c}>
      <Text
        style={{
          fontSize: 15,
          color: 'rgba(255,255,255,0.72)',
          fontVariant: ['tabular-nums'],
        }}
      >
        {tersambungPenuh ? `${mm}.${ss}` : keteranganStatus(status, elder)}
      </Text>

      <Note style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 8 }}>
        {tersambungPenuh
          ? 'Suara Anda terdengar di HP lansia. Bicaralah pelan dan singkat.'
          : status === ConnectionState.Connected
            ? 'Anda sudah masuk ruang panggilan. HP lansia berdering di sisi sana.'
            : 'Menghubungkan ke ruang panggilan…'}
      </Note>

      <BarisTombol
        c={c}
        muted={muted}
        speaker={speaker}
        onMic={ubahMic}
        onSpeaker={ubahSpeaker}
        onTutup={onTutup}
      />
    </Bingkai>
  );
}

function keteranganStatus(status, elder) {
  if (status === ConnectionState.Connecting) return 'Menghubungkan…';
  if (status === ConnectionState.Reconnecting) return 'Sambungan terputus, mencoba lagi…';
  if (status === ConnectionState.Disconnected) return 'Terputus';
  return `Menunggu ${elder?.name || 'lansia'} bergabung…`;
}

function Bingkai({ elder, c, children }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.ink }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.12)',
          }}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '650', color: '#fff' }}>
            Panggilan dalam aplikasi
          </Text>
        </View>

        <Avatar name={elder?.name} size={104} bg="rgba(255,255,255,0.14)" fg="#fff" />

        <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff' }}>
          {elder?.name || 'Lansia'}
        </Text>

        {children}
      </View>
    </SafeAreaView>
  );
}

function BarisTombol({ c, muted, speaker, onMic, onSpeaker, onTutup, hanyaTutup }) {
  return (
    <View style={{ flexDirection: 'row', gap: 22, marginTop: 26 }}>
      {hanyaTutup ? null : (
        <TombolPanggilan
          icon={muted ? 'micOff' : 'mic'}
          active={muted}
          label="Bisukan mikrofon"
          onPress={onMic}
        />
      )}
      <TombolPanggilan icon="phoneOff" danger label="Akhiri panggilan" onPress={onTutup} />
      {hanyaTutup ? null : (
        <TombolPanggilan
          icon="speaker"
          active={speaker}
          label="Pengeras suara"
          onPress={onSpeaker}
        />
      )}
    </View>
  );
}

function TombolPanggilan({ icon, onPress, active, danger, label }) {
  const c = useColors();
  const size = danger ? 68 : 58;

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: danger ? c.critical : active ? '#fff' : 'rgba(255,255,255,0.16)',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Icon name={icon} size={danger ? 26 : 22} color={danger ? '#fff' : active ? c.ink : '#fff'} />
    </Pressable>
  );
}
