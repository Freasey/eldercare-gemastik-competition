/**
 * Layar pertama, dan satu-satunya layar yang benar-benar disentuh manusia.
 *
 * Ditujukan ke KELUARGA, bukan ke lansia (PLAN §2.1 & §2.6): app membuka
 * dirinya dengan berbicara — meminta lansia memanggil anak atau cucunya —
 * lalu menampilkan pemindai QR untuk kode yang muncul di app keluarga.
 *
 * Kode ketik manual disediakan karena kamera HP lama sering gagal fokus di
 * jarak dekat, dan karena kodenya kadang didiktekan lewat telepon saat
 * keluarga tidak sedang berada di tempat lansia.
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, type } from '../theme.js';
import { pairDevice } from '../api/caretaker.js';
import { useDevice } from '../context/DeviceContext.js';
import { say } from '../voice/tts.js';

const AJAKAN =
  'Halo. Aplikasi ini belum terhubung. Minta tolong anak atau cucu Ibu atau Bapak ' +
  'untuk membuka aplikasi keluarga, lalu arahkan layarnya ke kamera ini.';

/** Isi QR yang dibuat app keluarga: `aicaretaker://pair?code=ABC123`. */
function bacaKode(isi) {
  const cocok = String(isi ?? '').match(/(?:code=)?([A-Z0-9]{6})\s*$/i);
  return cocok ? cocok[1].toUpperCase() : null;
}

export function PairingScreen() {
  const { hubungkan } = useDevice();
  const [izinKamera, mintaIzinKamera] = useCameraPermissions();
  const [kodeKetik, setKodeKetik] = useState('');
  const [pesan, setPesan] = useState(null);
  const [sibuk, setSibuk] = useState(false);

  // Sekali pindai saja. Tanpa ini kamera menembak endpoint berkali-kali dalam
  // sedetik, dan percobaan kedua pasti gagal — kode hangus sekali pakai.
  const terkunci = useRef(false);

  useEffect(() => {
    say(AJAKAN);
    if (!izinKamera?.granted) mintaIzinKamera();
    // Sengaja hanya sekali saat layar muncul.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function hubungkanDenganKode(kode) {
    if (sibuk) return;
    setSibuk(true);
    setPesan(null);

    try {
      const hasil = await pairDevice(kode);
      await say(`Terima kasih. Sekarang saya sudah terhubung dengan ${hasil.elder.name}.`);
      await hubungkan(hasil);
    } catch (err) {
      setPesan(err.message);
      // Kode yang salah harus bisa dicoba lagi — kamera dibuka kembali.
      terkunci.current = false;
      setSibuk(false);
    }
  }

  const bolehPindai = izinKamera?.granted && !sibuk;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.backdrop }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <Text
          style={{
            fontSize: type.caption,
            fontWeight: '700',
            color: colors.ink,
            textAlign: 'center',
          }}
        >
          Belum terhubung
        </Text>

        <Text style={{ fontSize: type.hint, color: colors.ink2, textAlign: 'center', lineHeight: 30 }}>
          Di aplikasi keluarga: pilih profil lansia, lalu “Hubungkan perangkat”.
        </Text>

        <View
          style={{
            width: 260,
            height: 260,
            borderRadius: 24,
            overflow: 'hidden',
            backgroundColor: colors.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {bolehPindai ? (
            <CameraView
              style={{ flex: 1, width: '100%' }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (terkunci.current) return;
                const kode = bacaKode(data);
                if (!kode) return;
                terkunci.current = true;
                hubungkanDenganKode(kode);
              }}
            />
          ) : sibuk ? (
            <ActivityIndicator size="large" color={colors.accent} />
          ) : (
            <Text style={{ fontSize: type.hint, color: colors.ink2, textAlign: 'center', padding: 16 }}>
              {izinKamera && !izinKamera.granted
                ? 'Kamera belum diizinkan. Ketik saja kodenya di bawah.'
                : 'Menyiapkan kamera…'}
            </Text>
          )}
        </View>

        {pesan ? (
          <Text style={{ fontSize: type.hint, color: colors.critical, textAlign: 'center' }}>{pesan}</Text>
        ) : null}

        <Text style={{ fontSize: type.hint, color: colors.ink2 }}>atau ketik enam hurufnya</Text>

        <TextInput
          value={kodeKetik}
          onChangeText={(t) => setKodeKetik(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          placeholder="ABC123"
          placeholderTextColor="#a9b3b7"
          style={{
            fontSize: type.code,
            letterSpacing: 8,
            textAlign: 'center',
            color: colors.ink,
            backgroundColor: '#ffffff',
            borderRadius: 16,
            borderWidth: 2,
            borderColor: colors.accentSoft,
            paddingVertical: 12,
            alignSelf: 'stretch',
          }}
        />

        <Pressable
          disabled={kodeKetik.length < 6 || sibuk}
          onPress={() => hubungkanDenganKode(kodeKetik)}
          style={{
            alignSelf: 'stretch',
            backgroundColor: kodeKetik.length < 6 || sibuk ? '#b9c6c3' : colors.accent,
            paddingVertical: 20,
            borderRadius: 18,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: type.hint, fontWeight: '700', color: colors.onAccent }}>
            {sibuk ? 'Menghubungkan…' : 'Hubungkan'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
