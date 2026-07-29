/**
 * Beranda — kabar hari ini.
 *
 * Kartu prioritas di tengah layar adalah pembeda utama produk: keluarga bisa
 * membaca kalimat persis yang akan diucapkan asisten ke lansia berikutnya,
 * beserta alasannya. Angkanya datang dari `GET .../assistant/context`, jadi
 * yang tampil di sini benar-benar keputusan context engine di backend —
 * bukan tiruan aturan yang ditulis ulang di sisi app.
 */
import { useCallback } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Avatar,
  Body,
  Card,
  CardHead,
  Empty,
  ErrorState,
  LinkButton,
  Loading,
  Note,
  Pill,
  Row,
  Rows,
  SectionTitle,
  StatusIcon,
  Title,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import {
  fetchAssistantContext,
  fetchReminders,
  fetchTimeline,
  fetchWeekSummary,
} from '../api/caretaker.js';
import {
  jam,
  lateMinutes,
  relatif,
  shortName,
  tanggal,
  umur,
} from '../lib/format.js';
import { FLAG_TONE, OPENING_LABELS, scheduleMeta, EMERGENCY_TITLES } from '../lib/constants.js';

export function HomeScreen() {
  const nav = useNavigation();
  const { elder, loading: eldersLoading, error: eldersError, reload } = useElders();
  const elderId = elder?.id;

  const run = useCallback(async () => {
    const [context, reminders, timeline, week] = await Promise.all([
      fetchAssistantContext(elderId),
      fetchReminders(elderId),
      fetchTimeline(elderId, 2),
      fetchWeekSummary(elderId),
    ]);
    return { context, reminders: reminders.reminders, timeline: timeline.items, week: week.week };
  }, [elderId]);

  const { data, error, loading, refreshing, refresh } = useApi(run, { enabled: !!elderId });

  if (eldersError) return <Center><ErrorState message={eldersError} onRetry={reload} /></Center>;
  if (eldersLoading) return <Center><Loading /></Center>;
  if (!elder) {
    return (
      <Center>
        <Card>
          <Title>Belum ada lansia terhubung</Title>
          <Note>
            Buat profil lansia dari akun keluarga, lalu masukkan kode penghubung di HP beliau.
          </Note>
        </Card>
      </Center>
    );
  }

  return (
    <ScreenShell title="Kabar hari ini" subtitle={tanggal(new Date())} refreshing={refreshing} onRefresh={refresh}>
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <KartuLansia elder={elder} data={data} />
          <KartuPrioritas elder={elder} opening={data.context.opening} />
          <RedFlags flags={data.context.redFlags} />
          <SisaJadwal reminders={data.reminders} onLihatSemua={() => nav.navigate('Jadwal')} />
          <AktivitasTerbaru
            items={data.timeline}
            elderId={elder.id}
            onLihatSemua={() => nav.navigate('Riwayat')}
          />
        </>
      ) : null}
    </ScreenShell>
  );
}

/** Pembungkus untuk keadaan sebelum ada lansia terpilih (app bar belum relevan). */
function Center({ children }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 16, backgroundColor: c.backdrop }}>
      {children}
    </View>
  );
}

function KartuLansia({ elder, data }) {
  const c = useColors();
  const perluPerhatian = data.context.redFlags.length > 0;

  const obat = data.reminders.filter((r) => r.type === 'medication');
  const obatSelesai = obat.filter((r) => r.status === 'confirmed').length;
  const mood = data.context.lastCheckin?.mood_score;
  const ngobrol = data.timeline.filter(
    (i) => i.kind === 'conversation' && new Date(i.at).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar name={elder.name} size={46} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Title style={{ fontSize: 16 }}>{elder.name}</Title>
          <Note>
            {umur(elder.birth_year) ? `${umur(elder.birth_year)} tahun · ` : ''}
            {elder.relation || 'Keluarga'}
          </Note>
          <Note>
            {elder.status?.lastActiveAt
              ? `Terakhir aktif ${relatif(elder.status.lastActiveAt)}`
              : 'Belum ada aktivitas tercatat'}
          </Note>
        </View>
        <Pill tone={perluPerhatian ? 'warning' : 'good'}>
          {perluPerhatian ? 'Perlu perhatian' : 'Aman'}
        </Pill>
      </View>

      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: c.line,
          paddingTop: 12,
          marginTop: 2,
        }}
      >
        <Stat value={obatSelesai} suffix={`/${obat.length}`} label="Obat hari ini" />
        <Stat value={mood ?? '–'} suffix={mood ? '/5' : ''} label="Suasana hati" />
        <Stat value={ngobrol} suffix="×" label="Ngobrol" />
      </View>
    </Card>
  );
}

function Stat({ value, suffix, label }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Body style={{ fontSize: 21, fontWeight: '700' }}>{value}</Body>
        {suffix ? <Note style={{ fontSize: 12 }}>{suffix}</Note> : null}
      </View>
      <Note style={{ fontSize: 11, color: c.ink3 }}>{label}</Note>
    </View>
  );
}

function KartuPrioritas({ elder, opening }) {
  const c = useColors();

  return (
    <View
      style={{
        backgroundColor: c.accentSoft,
        borderRadius: 18,
        padding: 15,
        gap: 9,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="chat" size={13} color={c.accentInk} />
        <Note style={{ fontSize: 11.5, fontWeight: '700', color: c.accentInk }}>
          {OPENING_LABELS[opening.kind] || 'Pembuka percakapan'}
        </Note>
      </View>

      <Body style={{ fontSize: 15.5, lineHeight: 23, fontWeight: '600', color: c.ink }}>
        “{opening.speech}”
      </Body>

      <Note style={{ color: c.accentInk }}>
        Kalimat ini yang akan diucapkan asisten ke {shortName(elder.name)} saat tombol ditekan
        berikutnya.
      </Note>
    </View>
  );
}

function RedFlags({ flags }) {
  const c = useColors();
  if (!flags?.length) return null;

  return (
    <View style={{ gap: 10 }}>
      <SectionTitle>Perlu diperhatikan</SectionTitle>
      {flags.map((f) => {
        const tone = FLAG_TONE[f.severity] || 'warning';
        const bg = tone === 'critical' ? c.criticalSoft : c.warningSoft;
        const fg = tone === 'critical' ? c.critical : c.warning;
        return (
          <View
            key={f.key}
            style={{
              flexDirection: 'row',
              gap: 11,
              alignItems: 'flex-start',
              backgroundColor: bg,
              borderRadius: 14,
              padding: 13,
            }}
          >
            <Icon name="alert" size={16} color={fg} />
            <Body style={{ flex: 1, fontSize: 13, fontWeight: '600' }}>{f.label}</Body>
          </View>
        );
      })}
    </View>
  );
}

function SisaJadwal({ reminders, onLihatSemua }) {
  const sisa = reminders.filter((r) => r.status === 'pending' || r.status === 'spoken');

  return (
    <Card>
      <CardHead>
        <Title>Sisa jadwal hari ini</Title>
        <LinkButton label="Semua jadwal" onPress={onLihatSemua} />
      </CardHead>

      {sisa.length ? (
        <Rows>
          {sisa.map((r) => {
            const meta = scheduleMeta(r.type);
            const telat = lateMinutes(r.due_at) >= 30;
            return (
              <Row
                key={r.id}
                time={jam(r.due_at)}
                icon={meta.icon}
                title={r.title}
                sub={
                  meta.label +
                  (r.is_critical ? ' · penting' : '') +
                  (telat ? ' · belum dikonfirmasi' : '')
                }
                end={<StatusIcon status={telat ? 'missed' : r.status} />}
              />
            );
          })}
        </Rows>
      ) : (
        <Empty>Semua jadwal hari ini sudah selesai.</Empty>
      )}
    </Card>
  );
}

function AktivitasTerbaru({ items, elderId, onLihatSemua }) {
  const nav = useNavigation();

  // Reminder yang masih menunggu tidak ditampilkan di sini — sudah punya
  // kartunya sendiri di atas. Feed ini isinya yang sudah terjadi.
  const feed = items
    .filter((i) => i.kind !== 'reminder' || i.status !== 'pending')
    .slice(0, 5);

  return (
    <Card>
      <CardHead>
        <Title>Aktivitas terbaru</Title>
        <LinkButton label="Lihat riwayat" onPress={onLihatSemua} />
      </CardHead>

      {feed.length ? (
        <Rows>
          {feed.map((it) => (
            <TimelineRow key={`${it.kind}-${it.id}`} item={it} elderId={elderId} nav={nav} />
          ))}
        </Rows>
      ) : (
        <Empty>Belum ada aktivitas tercatat.</Empty>
      )}
    </Card>
  );
}

function TimelineRow({ item, elderId, nav }) {
  const c = useColors();

  if (item.kind === 'reminder') {
    const meta = scheduleMeta(item.type);
    return (
      <Row
        icon={meta.icon}
        title={item.title}
        sub={
          item.status === 'confirmed'
            ? 'Dikonfirmasi sudah dilakukan'
            : item.status === 'missed'
              ? 'Terlewat, tidak ada jawaban'
              : item.status === 'skipped'
                ? 'Sengaja dilewati'
                : 'Sudah diingatkan'
        }
        end={<StatusIcon status={item.status} />}
      />
    );
  }

  if (item.kind === 'conversation') {
    return (
      <Row
        icon="chat"
        title={OPENING_LABELS[item.opening_kind] || 'Percakapan'}
        sub={item.summary || `${jam(item.at)} · belum ada ringkasan`}
        end={<Icon name="chevron" size={16} color={c.ink3} />}
        onPress={() => nav.navigate('Percakapan', { elderId, conversationId: item.id })}
      />
    );
  }

  if (item.kind === 'emergency') {
    return (
      <Row
        icon="siren"
        iconBg={c.criticalSoft}
        iconColor={c.critical}
        title={EMERGENCY_TITLES[item.trigger_type] || 'Kejadian darurat'}
        sub={item.detail || relatif(item.at)}
        end={<Icon name="chevron" size={16} color={c.ink3} />}
        onPress={() => nav.navigate('Darurat')}
      />
    );
  }

  // checkin
  return (
    <Row
      icon="heart"
      title={`Suasana hati ${item.mood_score}/5`}
      sub={item.note || `Tercatat ${relatif(item.at)}`}
      end={<Note>{jam(item.at)}</Note>}
    />
  );
}
