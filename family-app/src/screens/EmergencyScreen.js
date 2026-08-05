/**
 * Darurat status terkini, penjelasan alur eskalasi, riwayat kejadian,
 * dan kontak darurat.
 *
 * Alur yang ditampilkan mengikuti PLAN §2.4: terdeteksi → dikonfirmasi ke
 * lansia dulu → notifikasi ke keluarga → panggilan suara di dalam aplikasi.
 * Tidak ada SMS/telepon pulsa di mana pun.
 */
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Avatar,
  Body,
  Button,
  Card,
  Empty,
  ErrorState,
  Loading,
  Note,
  Pill,
  RowCard,
  SectionTitle,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { type, useColors } from '../theme/theme.js';
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
          <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 26 }}>
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: aktif.length ? c.criticalSoft : c.goodSoft,
              }}
            >
              <Icon
                name={aktif.length ? 'siren' : 'shield'}
                size={34}
                color={aktif.length ? c.critical : c.good}
              />
            </View>

            <View style={{ alignItems: 'center', gap: 5 }}>
              {/* Satu kata keadaan, lalu kalimat penjelasnya. Warnanya bukan
                  satu-satunya penanda kata "Aman"/"Perlu ditangani" dan ikon
                  perisai/sirene di atas sudah membedakan keduanya. */}
              <Text
                style={[
                  type.screenTitle,
                  { fontSize: 22, color: aktif.length ? c.critical : c.good },
                ]}
              >
                {aktif.length ? 'Perlu ditangani' : 'Aman'}
              </Text>
              <Body style={{ color: aktif.length ? c.critical : c.good, textAlign: 'center' }}>
                {aktif.length ? 'Ada kejadian yang belum selesai' : 'Tidak ada kejadian darurat'}
              </Body>
            </View>

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

          <View style={{ gap: 10 }}>
            <SectionTitle>Alur penanganan darurat</SectionTitle>
            {LANGKAH.map(([ic, judul, isi], i) => (
              <RowCard
                key={judul}
                icon={ic}
                iconTint="accent"
                title={
                  <>
                    <Text style={{ color: c.accent }}>{i + 1}.</Text> {judul}
                  </>
                }
                sub={isi}
              />
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle>Riwayat kejadian</SectionTitle>
            {data.events.length ? (
              data.events.map((e) => {
                const st = EMERGENCY_STATUS[e.status] || EMERGENCY_STATUS.detected;
                return (
                  <RowCard
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
              })
            ) : (
              <Card><Empty>Belum pernah ada kejadian darurat. Semoga tetap begitu.</Empty></Card>
            )}
          </View>

          <View style={{ gap: 10 }}>
            <SectionTitle>Kontak darurat</SectionTitle>
            {data.contacts.length ? (
              data.contacts.map((k) => (
                <RowCard
                  key={k.id}
                  icon={<Avatar name={k.name} size={44} />}
                  // Avatar sudah bulat dan punya latarnya sendiri; tanpa ini
                  // sudut ubin persegi-membulat mengintip di belakangnya.
                  iconBg="transparent"
                  title={k.name}
                  sub={[k.relation, k.phone].filter(Boolean).join(' · ')}
                  end={k.user_id ? <Pill tone="good">Dalam app</Pill> : null}
                />
              ))
            ) : (
              <Card><Empty>Belum ada kontak darurat.</Empty></Card>
            )}
          </View>

          <Note style={{ textAlign: 'center' }}>
            Panggilan berjalan lewat internet di dalam aplikasi, jadi tidak memakai pulsa dan{' '}
            {shortName(elder.name)} cukup menekan satu tombol untuk menjawab.
          </Note>
        </>
      ) : null}
    </ScreenShell>
  );
}
