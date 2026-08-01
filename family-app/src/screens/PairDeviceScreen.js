/**
 * Hubungkan perangkat lansia (PLAN §2.6).
 *
 * App lansia tidak punya layar login — kode di sini yang jadi kredensial
 * masuknya. Karena itu kode diminta saat layar dibuka (bukan disimpan), hanya
 * berlaku 15 menit, dan hangus begitu dipakai satu perangkat.
 *
 * Ditampilkan dua bentuk untuk satu kode yang sama: QR untuk dipindai, dan
 * teksnya untuk didiktekan lewat telepon kalau keluarga tidak sedang berada
 * di tempat lansia.
 */
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import {
  Body,
  Button,
  Card,
  CardHead,
  ErrorState,
  Loading,
  Note,
  Pill,
  Row,
  Rows,
  SectionTitle,
  Title,
} from '../components/ui.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { createPairingCode, unpairElder } from '../api/caretaker.js';
import { shortName } from '../lib/format.js';

/**
 * Isi QR. Diberi awalan skema supaya app lansia bisa membedakan QR ini dari
 * QR sembarangan yang kebetulan terpindai, dan supaya nanti bisa dipakai
 * sebagai deep link tanpa mengubah format.
 */
const qrPayload = (code) => `aicaretaker://pair?code=${code}`;

/** Selang & batas pengecekan "sudah terhubung belum". */
const POLL_EVERY_MS = 5000;
const POLL_MAX_MS = 3 * 60 * 1000;

function sisaWaktu(expiresAt) {
  if (!expiresAt) return null;
  const detik = Math.round((new Date(expiresAt) - Date.now()) / 1000);
  if (detik <= 0) return null;
  return `${Math.floor(detik / 60)}:${String(detik % 60).padStart(2, '0')}`;
}

export function PairDeviceScreen({ route, navigation }) {
  const c = useColors();
  const { elders, reload } = useElders();

  const elderId = route.params?.elderId;
  const elder = elders.find((e) => e.id === elderId) ?? null;

  const [kode, setKode] = useState(null);
  const [error, setError] = useState(null);
  const [memuat, setMemuat] = useState(true);
  const [sisa, setSisa] = useState(null);

  const mintaKode = useCallback(async () => {
    setMemuat(true);
    setError(null);
    try {
      setKode(await createPairingCode(elderId));
    } catch (err) {
      setError(err.message);
    } finally {
      setMemuat(false);
    }
  }, [elderId]);

  useEffect(() => {
    if (elder?.paired_at) {
      // Sudah terhubung — tidak perlu kode baru.
      setMemuat(false);
      return;
    }
    mintaKode();
  }, [mintaKode, elder?.paired_at]);

  // Hitung mundur supaya keluarga tahu kapan harus minta kode baru, bukan
  // menebak-nebak kenapa kodenya tiba-tiba ditolak HP lansia.
  useEffect(() => {
    if (!kode?.expiresAt) return undefined;
    const tick = () => setSisa(sisaWaktu(kode.expiresAt));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [kode?.expiresAt]);

  /**
   * Pairing terjadi di HP sebelah, jadi layar ini tidak akan tahu kalau tidak
   * bertanya. Tanpa ini keluarga terus memandangi QR yang sebenarnya sudah
   * terpakai. Dibatasi POLL_MAX_MS supaya layar yang ditinggal terbuka tidak
   * memanggil backend seharian.
   */
  useEffect(() => {
    if (elder?.paired_at || !kode) return undefined;

    const berhenti = Date.now() + POLL_MAX_MS;
    const timer = setInterval(() => {
      if (Date.now() > berhenti) return clearInterval(timer);
      reload().catch(() => {});
    }, POLL_EVERY_MS);

    return () => clearInterval(timer);
  }, [elder?.paired_at, kode, reload]);

  function putuskan() {
    Alert.alert(
      'Putuskan perangkat?',
      `HP ${shortName(elder?.name || 'lansia')} akan berhenti menerima pengingat sampai dihubungkan lagi.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Putuskan',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpairElder(elderId);
              await reload();
              mintaKode();
            } catch (err) {
              Alert.alert('Gagal memutuskan', err.message);
            }
          },
        },
      ],
    );
  }

  if (!elder) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.backdrop }}>
        <View style={{ padding: 16 }}>
          <ErrorState message="Lansia tidak ditemukan." onRetry={() => navigation.goBack()} />
        </View>
      </SafeAreaView>
    );
  }

  const kedaluwarsa = kode && !sisa;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.backdrop }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}>
        {elder.paired_at ? (
          <Card>
            <CardHead>
              <Title>Perangkat sudah terhubung</Title>
              <Pill tone="good" icon="check">
                Aktif
              </Pill>
            </CardHead>
            <Note>
              HP {shortName(elder.name)} sudah menerima pengingat dan bisa memanggil keluarga saat
              darurat. Putuskan hanya kalau HP-nya diganti atau hilang.
            </Note>
            <Button label="Putuskan perangkat" icon="close" variant="danger" onPress={putuskan} />
          </Card>
        ) : (
          <>
            <Card style={{ alignItems: 'center', gap: 14 }}>
              {memuat ? (
                <Loading label="Menyiapkan kode…" />
              ) : error ? (
                <ErrorState message={error} onRetry={mintaKode} />
              ) : (
                <>
                  <View
                    style={{
                      padding: 16,
                      backgroundColor: '#ffffff',
                      borderRadius: 16,
                      opacity: kedaluwarsa ? 0.25 : 1,
                    }}
                  >
                    {/* Latar QR selalu putih, bahkan di tema gelap — pemindai
                        butuh kontras terang/gelap yang benar. */}
                    <QRCode value={qrPayload(kode.pairingCode)} size={196} backgroundColor="#ffffff" />
                  </View>

                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Body
                      style={{
                        fontSize: 30,
                        fontWeight: '700',
                        letterSpacing: 6,
                        color: kedaluwarsa ? c.ink3 : c.ink,
                      }}
                    >
                      {kode.pairingCode}
                    </Body>
                    {kedaluwarsa ? (
                      <Pill tone="critical" icon="alert">
                        Kode kedaluwarsa
                      </Pill>
                    ) : (
                      <Note>Berlaku {sisa} lagi</Note>
                    )}
                  </View>

                  <Button
                    label={kedaluwarsa ? 'Tampilkan kode baru' : 'Ganti kode'}
                    icon="sync"
                    variant={kedaluwarsa ? 'primary' : 'ghost'}
                    onPress={mintaKode}
                    style={{ alignSelf: 'stretch' }}
                  />
                </>
              )}
            </Card>

            <Card>
              <Title>Caranya</Title>
              <Rows>
                <Row title="1. Buka aplikasi di HP beliau" sub="Aplikasi langsung meminta kode saat pertama dibuka." />
                <Row title="2. Arahkan ke kode ini" sub="Atau ketik enam hurufnya kalau kameranya bermasalah." />
                <Row
                  title="3. Selesai"
                  sub="Setelah itu tidak ada lagi yang perlu diketuk. Aplikasi langsung berbicara sendiri."
                />
              </Rows>
            </Card>

            <SectionTitle>Kenapa cepat kedaluwarsa</SectionTitle>
            <Note style={{ paddingHorizontal: 2 }}>
              Kode ini sekaligus jadi kunci masuk HP beliau, jadi sengaja hanya berlaku{' '}
              {kode?.expiresInMinutes ?? 15} menit dan hangus setelah dipakai sekali. Tekan “ganti
              kode” kalau sudah telanjur lewat.
            </Note>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
