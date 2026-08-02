/**
 * Riwayat pola beberapa hari terakhir: kepatuhan obat, suasana hati,
 * tren pola bicara, daftar percakapan, dan ringkasan harian.
 */
import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Card,
  CardHead,
  Chip,
  Empty,
  ErrorState,
  Loading,
  Note,
  Pill,
  Row,
  Rows,
  Title,
} from '../components/ui.js';
import { AdherenceChart, ChartHero, MoodChart } from '../components/Charts.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import {
  fetchAdherence,
  fetchCheckins,
  fetchSummaries,
  fetchTimeline,
  fetchWeekSummary,
} from '../api/caretaker.js';
import { dateKey, jam, tanggal } from '../lib/format.js';
import { OPENING_LABELS } from '../lib/constants.js';

export function HistoryScreen() {
  const { elder } = useElders();
  const elderId = elder?.id;
  const [range, setRange] = useState(7);

  const run = useCallback(async () => {
    const [adherence, checkins, summaries, timeline, week] = await Promise.all([
      fetchAdherence(elderId),
      fetchCheckins(elderId, 14),
      fetchSummaries(elderId, 14),
      fetchTimeline(elderId, 14),
      fetchWeekSummary(elderId),
    ]);
    return {
      adherence: adherence.days,
      checkins: checkins.checkins,
      summaries: summaries.summaries,
      conversations: timeline.items.filter((i) => i.kind === 'conversation'),
      week: week.week,
    };
  }, [elderId]);

  const { data, error, loading, refreshing, refresh } = useApi(run, { enabled: !!elderId });

  const mood = useMemo(() => (data ? rataMoodPerHari(data.checkins) : []), [data]);

  if (!elder) return null;

  const adh = (data?.adherence || []).slice(-range);
  const moodRange = mood.slice(-range);

  const totalTaken = adh.reduce((s, d) => s + d.taken, 0);
  const totalDose = adh.reduce((s, d) => s + d.total, 0);
  const persen = totalDose ? Math.round((totalTaken / totalDose) * 100) : 0;
  const moodAvg = moodRange.length
    ? (moodRange.reduce((s, d) => s + d.score, 0) / moodRange.length).toFixed(1)
    : '–';

  return (
    <ScreenShell
      title="Riwayat"
      subtitle={`Pola ${range} hari terakhir`}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[7, 14].map((v) => (
          <Chip key={v} label={`${v} hari terakhir`} active={range === v} onPress={() => setRange(v)} />
        ))}
      </View>

      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <Card>
            <CardHead>
              <Title>Kepatuhan minum obat</Title>
            </CardHead>
            <ChartHero value={`${persen}%`} note={`${totalTaken} dari ${totalDose} dosis`} />
            {adh.length ? (
              <AdherenceChart data={adh} />
            ) : (
              <Empty>Belum ada jadwal obat yang tercatat.</Empty>
            )}
          </Card>

          <Card>
            <CardHead>
              <Title>Suasana hati</Title>
            </CardHead>
            <ChartHero value={moodAvg} note="rata-rata dari skala 5" />
            {moodRange.length ? (
              <MoodChart data={moodRange} />
            ) : (
              <Empty>Belum ada catatan suasana hati.</Empty>
            )}
          </Card>

          <PolaBicara week={data.week} />
          <DaftarPercakapan conversations={data.conversations} elderId={elder.id} />
          <RingkasanHarian summaries={data.summaries.slice(0, range)} />
        </>
      ) : null}
    </ScreenShell>
  );
}

/**
 * Backend menyimpan tiap check-in satu baris; grafik butuh satu titik per hari,
 * jadi skor dirata-ratakan per tanggal lokal.
 */
function rataMoodPerHari(checkins) {
  const perHari = new Map();
  for (const c of checkins) {
    if (c.mood_score == null) continue;
    const key = dateKey(new Date(c.created_at));
    const cur = perHari.get(key) || { sum: 0, n: 0 };
    perHari.set(key, { sum: cur.sum + c.mood_score, n: cur.n + 1 });
  }
  return [...perHari.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, { sum, n }]) => ({ date, score: Number((sum / n).toFixed(2)) }));
}

function PolaBicara({ week }) {
  const trend = week?.cognitiveTrend || 'data belum cukup';
  const tone = trend === 'stabil' || trend === 'membaik' ? 'good' : trend === 'perlu diperhatikan' ? 'warning' : 'neutral';

  return (
    <Card>
      <CardHead>
        <Title>Pola bicara</Title>
        <Pill tone={tone}>{trend}</Pill>
      </CardHead>
      <Note>
        Dihitung dari kecepatan bicara, jeda mencari kata, dan pengulangan saat mengobrol dengan
        asisten. Ini bukan diagnosis hanya pola yang tercatat, untuk bahan cerita ke dokter.
      </Note>
    </Card>
  );
}

function DaftarPercakapan({ conversations, elderId }) {
  const c = useColors();
  const nav = useNavigation();

  return (
    <Card>
      <CardHead>
        <Title>Percakapan</Title>
        <Note>{conversations.length} percakapan</Note>
      </CardHead>

      {conversations.length ? (
        <Rows>
          {conversations.map((cv) => (
            <Row
              key={cv.id}
              icon="chat"
              title={OPENING_LABELS[cv.opening_kind] || 'Percakapan'}
              sub={`${tanggal(cv.at)} ${jam(cv.at)}${cv.summary ? ` · ${cv.summary}` : ''}`}
              end={<Icon name="chevron" size={16} color={c.ink3} />}
              onPress={() => nav.navigate('Percakapan', { elderId, conversationId: cv.id })}
            />
          ))}
        </Rows>
      ) : (
        <Empty>Belum ada percakapan tercatat.</Empty>
      )}
    </Card>
  );
}

function RingkasanHarian({ summaries }) {
  return (
    <Card>
      <CardHead>
        <Title>Ringkasan harian</Title>
      </CardHead>

      {summaries.length ? (
        <Rows>
          {summaries.map((s) => {
            const lengkap = s.medication_taken === s.medication_total;
            const highlights = Array.isArray(s.highlights) ? s.highlights : [];
            return (
              <Row
                key={s.id}
                title={tanggal(s.summary_date)}
                sub={highlights.join(' · ') || 'Tidak ada catatan khusus'}
                end={
                  <Pill tone={lengkap ? 'good' : 'critical'}>
                    {s.medication_taken}/{s.medication_total} obat
                  </Pill>
                }
              />
            );
          })}
        </Rows>
      ) : (
        <Empty>Ringkasan harian akan muncul setelah app dipakai sehari penuh.</Empty>
      )}
    </Card>
  );
}
