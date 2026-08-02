/**
 * Darurat status terkini, penjelasan alur eskalasi, riwayat kejadian,
 * dan kontak darurat.
 *
 * Alur yang ditampilkan mengikuti PLAN §2.4: terdeteksi → dikonfirmasi ke
 * lansia dulu → notifikasi ke keluarga → panggilan suara di dalam aplikasi.
 * Tidak ada SMS/telepon pulsa di mana pun.
 */
import { useCallback } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Avatar,
  Button,
  Card,
  CardHead,
  Empty,
  ErrorState,
  Loading,
  Note,
  Pill,
  Row,
  Rows,
  Title,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import { fetchContacts, fetchEmergencies } from '../api/caretaker.js';
import { jam, relatif, shortName, tanggal } from '../lib/format.js';
import { EMERGENCY_STATUS, EMERGENCY_TITLES } from '../lib/constants.js';

const LANGKAH = [
  ['siren', 'Terdeteksi', 'Kata "tolong", deteksi jatuh, atau pengingat penting diabaikan berulang.'],
  ['chat', 'Dikonfirmasi dulu', 'Asisten bertanya ke lansia sebelum membangunkan keluarga supaya tidak salah alarm.'],
  ['bell', 'Notifikasi ke keluarga', 'Semua anggota keluarga yang terhubung menerima notifikasi prioritas tinggi.'],
  ['phone', 'Panggilan dalam aplikasi', 'Kalau tidak direspons, panggilan suara langsung terbuka di dalam aplikasi.'],
];

export function EmergencyScreen() {
  const c = useColors();
  const nav = useNavigation();
  const { elder } = useElders();
  const elderId = elder?.id;

  const run = useCallback(async () => {
    const [emergencies, contacts] = await Promise.all([
      fetchEmergencies(elderId),
      fetchContacts(elderId),
    ]);
    return { events: emergencies.events, contacts: contacts.contacts };
  }, [elderId]);

  const { data, error, loading, refreshing, refresh } = useApi(run, { enabled: !!elderId });

  if (!elder) return null;

  const aktif = (data?.events || []).filter(
    (e) => e.status === 'detected' || e.status === 'escalated' || e.status === 'acknowledged',
  );

  return (
    <ScreenShell
      title="Darurat"
      subtitle="Status dan kontak penting"
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <Card style={{ alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: aktif.length ? c.criticalSoft : c.goodSoft,
              }}
            >
              <Icon name={aktif.length ? 'siren' : 'shield'} size={22} color={aktif.length ? c.critical : c.good} />
            </View>

            <Title style={{ fontSize: 16, textAlign: 'center' }}>
              {aktif.length ? 'Ada kejadian yang perlu ditangani' : 'Tidak ada kejadian darurat'}
            </Title>

            <Note style={{ textAlign: 'center' }}>
              {aktif.length
                ? 'Buka detail kejadian untuk menghubungi langsung.'
                : `${
                    data.events.length
                      ? `Kejadian terakhir ${relatif(data.events[0].created_at)} dan sudah ditangani.`
                      : 'Belum pernah ada kejadian.'
                  } Asisten akan mengirim notifikasi ke HP Anda begitu ada tanda bahaya.`}
            </Note>

            {aktif.length ? (
              <Button
                label="Buka kejadian"
                icon="siren"
                variant="danger"
                style={{ alignSelf: 'stretch' }}
                onPress={() => nav.navigate('KejadianDarurat', { elderId: elder.id, eventId: aktif[0].id })}
              />
            ) : null}
          </Card>

          <Card>
            <CardHead>
              <Title>Bagaimana alurnya</Title>
            </CardHead>
            <Rows>
              {LANGKAH.map(([ic, judul, isi], i) => (
                <Row
                  key={judul}
                  icon={ic}
                  iconBg={c.accentSoft}
                  iconColor={c.accentInk}
                  title={`${i + 1}. ${judul}`}
                  sub={isi}
                />
              ))}
            </Rows>
          </Card>

          <Card>
            <CardHead>
              <Title>Riwayat kejadian</Title>
            </CardHead>
            {data.events.length ? (
              <Rows>
                {data.events.map((e) => {
                  const st = EMERGENCY_STATUS[e.status] || EMERGENCY_STATUS.detected;
                  return (
                    <Row
                      key={e.id}
                      icon="siren"
                      iconBg={c.criticalSoft}
                      iconColor={c.critical}
                      title={EMERGENCY_TITLES[e.trigger_type] || 'Kejadian darurat'}
                      sub={`${tanggal(e.created_at)} ${jam(e.created_at)}`}
                      end={<Pill tone={st.tone}>{st.label}</Pill>}
                      onPress={() =>
                        nav.navigate('KejadianDarurat', { elderId: elder.id, eventId: e.id })
                      }
                    />
                  );
                })}
              </Rows>
            ) : (
              <Empty>Belum pernah ada kejadian darurat. Semoga tetap begitu.</Empty>
            )}
          </Card>

          <Card>
            <CardHead>
              <Title>Kontak darurat</Title>
            </CardHead>
            {data.contacts.length ? (
              <Rows>
                {data.contacts.map((k) => (
                  <Row
                    key={k.id}
                    icon={<Avatar name={k.name} size={32} />}
                    title={k.name}
                    sub={[k.relation, k.phone].filter(Boolean).join(' · ')}
                    end={k.user_id ? <Pill tone="good">Dalam app</Pill> : null}
                  />
                ))}
              </Rows>
            ) : (
              <Empty>Belum ada kontak darurat.</Empty>
            )}
          </Card>

          <Note style={{ textAlign: 'center' }}>
            Panggilan berjalan lewat internet di dalam aplikasi, jadi tidak memakai pulsa dan{' '}
            {shortName(elder.name)} cukup menekan satu tombol untuk menjawab.
          </Note>
        </>
      ) : null}
    </ScreenShell>
  );
}
