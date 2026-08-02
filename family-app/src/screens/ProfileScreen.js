/**
 * Profil — data lansia, panel privasi, dan akun keluarga.
 *
 * Panel privasi sengaja hanya bisa dilihat, tidak bisa diubah dari sini:
 * backend menolak PATCH consent yang tidak datang dari device lansia sendiri
 * (`elders.routes.js`, kode error CONSENT_ELDER_ONLY). Sakelarnya tetap
 * ditampilkan supaya keluarga paham apa yang sedang dibagikan dan apa yang
 * tidak — privasi sebagai fitur yang terlihat, bukan checkbox tersembunyi.
 */
import { useCallback, useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Avatar,
  Button,
  Card,
  CardHead,
  ErrorState,
  Loading,
  Note,
  Pill,
  Row,
  Rows,
  Switch,
  Title,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useAuth } from '../context/AuthContext.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import { fetchElder, testPush } from '../api/caretaker.js';
import { shortName, tanggal, umur } from '../lib/format.js';
import { CONSENT_LABELS } from '../lib/constants.js';
import { API_URL } from '../api/client.js';

export function ProfileScreen({ navigation }) {
  const c = useColors();
  const { user, signOut, push, refreshPush } = useAuth();
  const { elder } = useElders();
  const elderId = elder?.id;
  const [ujiSedangJalan, setUjiSedangJalan] = useState(false);

  const run = useCallback(() => fetchElder(elderId), [elderId]);
  const { data, error, loading, refreshing, refresh } = useApi(run, { enabled: !!elderId });

  if (!elder) return null;

  function keluar() {
    Alert.alert('Keluar dari akun?', 'Anda perlu masuk lagi untuk melihat kabar lansia.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: signOut },
    ]);
  }

  /**
   * Sakelar notifikasi tidak bisa "dimatikan" dari dalam app: izin notifikasi
   * milik sistem Android, dan mematikannya dari sini hanya akan membuat
   * keadaan di app berbeda dari keadaan sebenarnya. Jadi menyalakan = minta
   * izin + daftarkan token, mematikan = antar ke Pengaturan.
   */
  async function ubahNotifikasi() {
    if (push?.ok) {
      Alert.alert(
        'Matikan notifikasi darurat?',
        'Izin notifikasi diatur Android, bukan di dalam app ini. Buka Pengaturan untuk mematikannya — tapi ingat, kabar darurat dari ' +
          `${shortName(elder.name)} tidak akan sampai selama izinnya mati.`,
        [
          { text: 'Batal', style: 'cancel' },
          { text: 'Buka Pengaturan', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const hasil = await refreshPush();
    if (!hasil.ok) Alert.alert('Notifikasi belum aktif', hasil.alasan);
  }

  async function kirimUji() {
    setUjiSedangJalan(true);
    try {
      const hasil = await testPush();
      Alert.alert(
        hasil.sent > 0 ? 'Terkirim' : 'Tidak terkirim',
        hasil.sent > 0
          ? `Notifikasi uji dikirim ke ${hasil.sent} perangkat. Kalau tidak muncul dalam beberapa detik, periksa pengaturan notifikasi Android.`
          : hasil.pushConfigured
            ? `Server tidak menemukan perangkat aktif (terdaftar: ${hasil.devices}).`
            : 'Server belum punya kredensial Firebase, jadi tidak ada yang bisa dikirim.',
      );
    } catch (err) {
      Alert.alert('Gagal', err.message);
    } finally {
      setUjiSedangJalan(false);
    }
  }

  return (
    <ScreenShell
      title="Profil"
      subtitle="Data lansia dan akun Anda"
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={data.elder.name} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Title style={{ fontSize: 16 }}>{data.elder.name}</Title>
                {data.elder.address ? <Note>{data.elder.address}</Note> : null}
                {data.elder.phone ? <Note>{data.elder.phone}</Note> : null}
              </View>
            </View>

            <Rows>
              <Row
                title={
                  data.elder.birth_year
                    ? `${data.elder.birth_year} (${umur(data.elder.birth_year)} tahun)`
                    : 'Belum diisi'
                }
                sub="Tahun lahir"
              />
              <Row
                title={data.elder.prayer_reminder ? 'Aktif — jadwal sholat' : 'Tidak aktif'}
                sub="Pengingat ibadah"
              />
              {/* Kodenya tidak ditampilkan di sini: umurnya cuma 15 menit,
                  jadi yang tampil pasti sudah kedaluwarsa. Kode baru diambil
                  saat layar Hubungkan perangkat dibuka. */}
              <Row
                title={
                  data.elder.paired_at
                    ? `Terhubung sejak ${tanggal(data.elder.paired_at)}`
                    : 'Belum terhubung'
                }
                sub="Perangkat lansia"
                onPress={() => navigation.navigate('HubungkanPerangkat', { elderId })}
                end={
                  <>
                    {data.elder.paired_at ? null : <Pill tone="warning">Perlu dihubungkan</Pill>}
                    <Icon name="chevron" size={16} color={c.ink3} />
                  </>
                }
              />
            </Rows>
          </Card>

          <Card>
            <CardHead>
              <Title>Privasi &amp; izin</Title>
              <Pill icon="lock">Dikunci</Pill>
            </CardHead>
            <Note>
              Hanya {shortName(data.elder.name)} yang bisa mengubah izin ini, dari perangkatnya
              sendiri. Anda bisa melihat, tapi tidak bisa menyalakan.
            </Note>

            <Rows>
              {data.consents.map((k) => (
                <Row
                  key={k.key}
                  title={CONSENT_LABELS[k.key] || k.key}
                  sub={k.granted ? 'Diizinkan' : 'Tidak diizinkan'}
                  end={
                    <Switch
                      on={k.granted}
                      disabled
                      onPress={() =>
                        Alert.alert(
                          'Terkunci',
                          `Izin ini hanya bisa diubah ${shortName(data.elder.name)} sendiri, lewat HP beliau.`,
                        )
                      }
                    />
                  }
                />
              ))}
            </Rows>
          </Card>

          <Card>
            <CardHead>
              <Title>Akun Anda</Title>
            </CardHead>
            <Rows>
              <Row
                icon={<Avatar name={user?.name} size={32} />}
                title={user?.name}
                sub={`${user?.email} · ${user?.role}`}
              />
              <Row
                icon="bell"
                title="Notifikasi darurat"
                sub={
                  push === null
                    ? 'Mendaftarkan perangkat…'
                    : push.ok
                      ? 'Aktif — HP ini akan berbunyi saat ada kejadian darurat'
                      : push.alasan
                }
                onPress={ubahNotifikasi}
                end={<Switch on={push?.ok === true} onPress={ubahNotifikasi} />}
              />
              {push?.ok ? (
                <Row
                  icon="bell"
                  title="Kirim notifikasi uji"
                  sub={
                    ujiSedangJalan
                      ? 'Mengirim…'
                      : 'Membuktikan jalurnya sampai ke HP ini, tanpa memicu darurat palsu'
                  }
                  onPress={ujiSedangJalan ? undefined : kirimUji}
                  end={<Icon name="chevron" size={16} color={c.ink3} />}
                />
              ) : null}
            </Rows>
          </Card>

          <Button label="Keluar" variant="ghost" onPress={keluar} />
          <Note style={{ textAlign: 'center', color: c.ink3 }}>
            AI Caretaker · app keluarga v0.1{'\n'}
            {API_URL}
          </Note>
        </>
      ) : null}
    </ScreenShell>
  );
}
