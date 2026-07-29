/**
 * Panggilan suara dalam aplikasi.
 *
 * Yang sudah nyata di sini: layar ini meminta token room ke backend
 * (`POST .../emergencies/:id/join`), yang menandai kejadian jadi
 * `acknowledged` dan mengembalikan kredensial LiveKit asli.
 *
 * Yang BELUM: transport audionya. `@livekit/react-native` butuh WebRTC native,
 * yang tidak jalan di Expo Go — jadi baru bisa dipasang setelah ada development
 * build. Sampai itu ada, layar ini menampilkan status koneksi apa adanya dan
 * tidak berpura-pura sedang mengalirkan suara.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
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

  const [status, setStatus] = useState('connecting'); // connecting | ready | failed
  const [pesan, setPesan] = useState('Menghubungkan…');
  const [detik, setDetik] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { call } = await joinEmergency(elderId, eventId);
        if (!alive) return;
        if (call?.token) {
          setStatus('ready');
          setPesan('Ruang siap');
        } else {
          setStatus('failed');
          setPesan('LiveKit belum dikonfigurasi di server');
        }
      } catch (err) {
        if (alive) {
          setStatus('failed');
          setPesan(err.message);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [elderId, eventId]);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    const t = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [status]);

  const mm = String(Math.floor(detik / 60)).padStart(2, '0');
  const ss = String(detik % 60).padStart(2, '0');

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

        <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.72)', fontVariant: ['tabular-nums'] }}>
          {status === 'ready' ? `${mm}.${ss}` : pesan}
        </Text>

        <Note style={{ color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 8 }}>
          {status === 'ready'
            ? 'Ruang panggilan sudah dibuat di server dan kejadian ditandai sedang ditangani. Suara akan mengalir begitu modul LiveKit dipasang di development build.'
            : status === 'failed'
              ? 'Panggilan belum bisa dibuka. Coba hubungi lewat kontak darurat di layar Darurat.'
              : 'Menyiapkan ruang panggilan…'}
        </Note>

        <View style={{ flexDirection: 'row', gap: 22, marginTop: 26 }}>
          <TombolPanggilan
            icon={muted ? 'micOff' : 'mic'}
            active={muted}
            label="Bisukan mikrofon"
            onPress={() => setMuted((v) => !v)}
          />
          <TombolPanggilan
            icon="phoneOff"
            danger
            label="Akhiri panggilan"
            onPress={() => nav.goBack()}
          />
          <TombolPanggilan
            icon="speaker"
            active={speaker}
            label="Pengeras suara"
            onPress={() => setSpeaker((v) => !v)}
          />
        </View>
      </View>
    </SafeAreaView>
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
