/**
 * Detail satu kejadian darurat: kronologi + tombol masuk ke panggilan.
 */
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
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
  Title,
} from '../components/ui.js';
import { useColors } from '../theme/theme.js';
import { useApi } from '../lib/useApi.js';
import { fetchEmergencies, resolveEmergency } from '../api/caretaker.js';
import { jam, tanggal } from '../lib/format.js';
import { EMERGENCY_STATUS, EMERGENCY_TITLES } from '../lib/constants.js';

export function EmergencyDetailScreen() {
  const c = useColors();
  const nav = useNavigation();
  const { elderId, eventId } = useRoute().params;
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    const { events } = await fetchEmergencies(elderId);
    return events.find((e) => e.id === eventId) ?? null;
  }, [elderId, eventId]);

  const { data: event, error, loading, refresh } = useApi(run);

  async function tutupKejadian() {
    setBusy(true);
    try {
      await resolveEmergency(elderId, eventId, 'Ditutup dari app keluarga');
      refresh();
    } catch (err) {
      Alert.alert('Gagal menutup kejadian', err.message);
    } finally {
      setBusy(false);
    }
  }

  const st = event ? EMERGENCY_STATUS[event.status] || EMERGENCY_STATUS.detected : null;
  const belumSelesai = event && event.status !== 'resolved' && event.status !== 'cancelled';

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.backdrop }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
        {loading ? <Loading /> : null}

        {event ? (
          <>
            <Card>
              <CardHead>
                <Title style={{ flex: 1 }}>
                  {EMERGENCY_TITLES[event.trigger_type] || 'Kejadian darurat'}
                </Title>
                <Pill tone={st.tone}>{st.label}</Pill>
              </CardHead>
              <Body>{event.detail || 'Tidak ada keterangan tambahan.'}</Body>
            </Card>

            <Card>
              <CardHead>
                <Title>Kronologi</Title>
              </CardHead>
              <Rows>
                <Row
                  time={jam(event.created_at)}
                  title="Terdeteksi"
                  sub={`${tanggal(event.created_at)} · asisten menangkap tanda bahaya`}
                />
                {event.confirmed_by_elder != null ? (
                  <Row
                    title={event.confirmed_by_elder ? 'Dikonfirmasi lansia' : 'Dinyatakan alarm palsu'}
                    sub={
                      event.confirmed_by_elder
                        ? 'Membenarkan butuh bantuan — keluarga langsung diberi tahu'
                        : 'Menyatakan baik-baik saja, tidak dieskalasi'
                    }
                  />
                ) : null}
                {event.livekit_room ? (
                  <Row title="Ruang panggilan disiapkan" sub="Keluarga bisa masuk kapan saja" />
                ) : null}
                {event.acknowledged_by_name ? (
                  <Row title="Ditangani" sub={event.acknowledged_by_name} />
                ) : null}
                {event.resolved_at ? (
                  <Row time={jam(event.resolved_at)} title="Ditutup" sub={tanggal(event.resolved_at)} />
                ) : null}
              </Rows>
            </Card>

            {belumSelesai ? (
              <>
                <Button
                  label="Masuk panggilan"
                  icon="phone"
                  variant="danger"
                  onPress={() => nav.navigate('Panggilan', { elderId, eventId })}
                />
                <Button
                  label="Tandai sudah ditangani"
                  variant="ghost"
                  loading={busy}
                  onPress={tutupKejadian}
                />
              </>
            ) : (
              <Note style={{ textAlign: 'center' }}>Kejadian ini sudah selesai ditangani.</Note>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
