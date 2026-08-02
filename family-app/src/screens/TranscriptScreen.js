/**
 * Isi satu percakapan.
 *
 * Kalau lansia belum mengizinkan transkrip dibagikan, backend mengirim
 * `transcriptWithheld: true` dan daftar pesan kosong ringkasannya tetap
 * dikirim. Keadaan itu ditampilkan terang-terangan sebagai fitur privasi,
 * bukan sebagai error (PLAN §2.5).
 */
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import {
  Body,
  Card,
  CardHead,
  ErrorState,
  Loading,
  Note,
  SectionTitle,
  Title,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useApi } from '../lib/useApi.js';
import { fetchConversation } from '../api/caretaker.js';
import { jam, tanggal } from '../lib/format.js';
import { OPENING_LABELS } from '../lib/constants.js';

export function TranscriptScreen() {
  const c = useColors();
  const { elderId, conversationId } = useRoute().params;

  const run = useCallback(
    () => fetchConversation(elderId, conversationId),
    [elderId, conversationId],
  );
  const { data, error, loading, refresh } = useApi(run);

  const cv = data?.conversation;

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.backdrop }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
        {loading ? <Loading /> : null}

        {cv ? (
          <>
            <Card>
              <CardHead>
                <Title style={{ flex: 1 }}>{OPENING_LABELS[cv.opening_kind] || 'Percakapan'}</Title>
              </CardHead>
              <Note>
                {tanggal(cv.started_at)} pukul {jam(cv.started_at)} · dibuka{' '}
                {cv.trigger === 'button'
                  ? 'oleh lansia (tombol)'
                  : cv.trigger === 'scheduled'
                    ? 'otomatis oleh jadwal'
                    : cv.trigger === 'emergency'
                      ? 'oleh alur darurat'
                      : 'lewat wake word'}
              </Note>
            </Card>

            <Card>
              <CardHead>
                <Title>Ringkasan</Title>
              </CardHead>
              <Body>{cv.summary || 'Ringkasan belum dibuat untuk percakapan ini.'}</Body>
            </Card>

            <SectionTitle>Isi percakapan</SectionTitle>

            {data.transcriptWithheld ? (
              <Card>
                <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: c.surface2,
                    }}
                  >
                    <Icon name="lock" size={16} color={c.ink2} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Title>Transkrip tidak dibagikan</Title>
                    <Note>
                      {data.reason ||
                        'Lansia belum mengizinkan isi percakapan dibagikan ke keluarga.'}{' '}
                      Anda tetap menerima ringkasannya.
                    </Note>
                  </View>
                </View>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {data.messages.map((m, i) => (
                  <Bubble key={i} message={m} />
                ))}
                {data.messages.length === 0 ? (
                  <Note style={{ textAlign: 'center' }}>Belum ada pesan tersimpan.</Note>
                ) : null}
              </View>
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bubble({ message }) {
  const c = useColors();
  const dariLansia = message.role === 'elder';

  return (
    <View
      style={{
        alignSelf: dariLansia ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        backgroundColor: dariLansia ? c.accent : c.surface,
        borderRadius: 16,
        borderBottomRightRadius: dariLansia ? 4 : 16,
        borderBottomLeftRadius: dariLansia ? 16 : 4,
        paddingHorizontal: 13,
        paddingVertical: 10,
        gap: 4,
      }}
    >
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: dariLansia ? c.onAccent : c.ink }}>
        {message.content}
      </Text>
      <Text
        style={{
          fontSize: 10.5,
          color: dariLansia ? 'rgba(255,255,255,0.7)' : c.ink3,
          alignSelf: 'flex-end',
        }}
      >
        {jam(message.created_at)}
      </Text>
    </View>
  );
}
