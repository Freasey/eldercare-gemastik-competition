/**
 * Beranda kabar hari ini.
 *
 * Kartu prioritas di tengah layar adalah pembeda utama produk: keluarga bisa
 * membaca kalimat persis yang akan diucapkan asisten ke lansia berikutnya,
 * beserta alasannya. Angkanya datang dari `GET .../assistant/context`, jadi
 * yang tampil di sini benar-benar keputusan context engine di backend
 * bukan tiruan aturan yang ditulis ulang di sisi app.
 */
import { useCallback } from 'react';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Avatar,
  Card,
  Empty,
  ErrorState,
  LinkButton,
  Loading,
  Note,
  Pill,
  ProgressBar,
  RowCard,
  SectionTitle,
  StatusIcon,
  Title,
} from '../components/ui.js';
import { Icon } from '../components/Icon.js';
import { radius, type, useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import {
  fetchAssistantContext,
  fetchReminders,
  fetchTimeline,
  fetchWeekSummary,
} from '../api/caretaker.js';
import { jam, lateMinutes, relatif, shortName, tanggal, umur } from '../lib/format.js';
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
    <ScreenShell
      title="Kabar hari ini"
      subtitle={tanggal(new Date())}
      refreshing={refreshing}
      onRefresh={refresh}
    >
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {loading && !data ? <Loading /> : null}

      {data ? (
        <>
          <BarisStatistik data={data} />
          <KartuLansia elder={elder} redFlags={data.context.redFlags} />
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
    <View style={{ flex: 1, justifyContent: 'center', padding: 18, backgroundColor: c.backdrop }}>
      {children}
    </View>
  );
}

/* ---------------- tiga angka di puncak layar ---------------- */

function BarisStatistik({ data }) {
  const obat = data.reminders.filter((r) => r.type === 'medication');
  const obatSelesai = obat.filter((r) => r.status === 'confirmed').length;
  const mood = data.context.lastCheckin?.mood_score;
  const ngobrol = data.timeline.filter(
    (i) => i.kind === 'conversation' && new Date(i.at).toDateString() === new Date().toDateString(),
  ).length;

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Statistik
        icon="pill"
        value={obatSelesai}
        suffix={`/${obat.length}`}
        label="Obat hari ini"
        ratio={obat.length ? obatSelesai / obat.length : 0}
      />
      <Statistik
        icon="heart"
        value={mood ?? '–'}
        suffix={mood ? '/5' : ''}
        label="Suasana hati"
        ratio={mood ? mood / 5 : 0}
      />
      <Statistik
        icon="chat"
        value={ngobrol}
        suffix="ngobrol"
        label="Percakapan"
        // Percakapan tidak punya target harian, jadi bilahnya cuma menandai
        // ada/belum ada hari ini. Angka pastinya tetap terbaca di atasnya,
        // jadi tidak ada informasi yang cuma hidup di panjang bilah.
        ratio={ngobrol > 0 ? 1 : 0}
      />
    </View>
  );
}

function Statistik({ icon, value, suffix, label, ratio }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, gap: 9, padding: 13 }}>
      <Icon name={icon} size={20} color={c.accent} />

      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text style={[type.statNumber, { color: c.ink }]} numberOfLines={1}>
          {value}
        </Text>
        {suffix ? (
          <Text style={[type.statSuffix, { color: c.ink2, flexShrink: 1 }]} numberOfLines={1}>
            {suffix}
          </Text>
        ) : null}
      </View>

      <Note style={{ fontSize: 12 }} numberOfLines={1}>{label}</Note>
      <ProgressBar value={ratio} />
    </Card>
  );
}

/* ---------------- kartu-kartu ---------------- */

function KartuLansia({ elder, redFlags }) {
  const perluPerhatian = redFlags.length > 0;

  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <Avatar name={elder.name} size={52} />
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Title>{elder.name}</Title>
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
    </Card>
  );
}

/**
 * Kalimat berikutnya dari asisten, di atas latar aprikot. Ini slot "narasi" di
 * redesign bedanya isinya bukan cerita karangan, melainkan keluaran context
 * engine yang benar-benar akan diucapkan ke lansia.
 */
function KartuPrioritas({ elder, opening }) {
  const c = useColors();

  return (
    <View style={{ backgroundColor: c.warm, borderRadius: radius.card, padding: 17, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Icon name="chat" size={14} color={c.warningInk} />
        <Text style={[type.label, { color: c.warningInk }]}>
          {OPENING_LABELS[opening.kind] || 'Pembuka percakapan'}
        </Text>
      </View>

      <Text style={[type.quote, { color: c.ink }]}>“{opening.speech}”</Text>

      <Note>
        Kalimat ini yang akan diucapkan asisten ke {shortName(elder.name)} saat sesi berikutnya
        dimulai.
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
        const kritis = (FLAG_TONE[f.severity] || 'warning') === 'critical';
        return (
          <View
            key={f.key}
            style={{
              flexDirection: 'row',
              gap: 13,
              alignItems: 'flex-start',
              backgroundColor: kritis ? c.criticalSoft : c.warningSoft,
              borderRadius: radius.card,
              padding: 15,
            }}
          >
            <Icon name="alert" size={19} color={kritis ? c.critical : c.warning} />
            <Text
              style={[
                type.rowTitle,
                { flex: 1, color: kritis ? c.critical : c.warningInk, lineHeight: 22 },
              ]}
            >
              {f.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Judul bagian + tautan "lihat semua" di sisi kanannya. */
function KepalaBagian({ title, action, onPress }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <SectionTitle>{title}</SectionTitle>
      <LinkButton label={action} onPress={onPress} />
    </View>
  );
}

function SisaJadwal({ reminders, onLihatSemua }) {
  const sisa = reminders.filter((r) => r.status === 'pending' || r.status === 'spoken');

  return (
    <View style={{ gap: 10 }}>
      <KepalaBagian title="Sisa jadwal hari ini" action="Semua jadwal" onPress={onLihatSemua} />

      {sisa.length ? (
        sisa.map((r) => {
          const meta = scheduleMeta(r.type);
          const telat = lateMinutes(r.due_at) >= 30;
          return (
            <RowCard
              key={r.id}
              icon={meta.icon}
              iconTint={meta.tint}
              title={r.title}
              sub={
                meta.label +
                (r.is_critical ? ' · penting' : '') +
                (telat ? ' · belum dikonfirmasi' : '')
              }
              time={jam(r.due_at)}
              end={telat ? <StatusIcon status="missed" /> : null}
            />
          );
        })
      ) : (
        <Card><Empty>Semua jadwal hari ini sudah selesai.</Empty></Card>
      )}
    </View>
  );
}

function AktivitasTerbaru({ items, elderId, onLihatSemua }) {
  const nav = useNavigation();

  // Reminder yang masih menunggu tidak ditampilkan di sini sudah punya
  // kartunya sendiri di atas. Feed ini isinya yang sudah terjadi.
  const feed = items.filter((i) => i.kind !== 'reminder' || i.status !== 'pending').slice(0, 5);

  return (
    <View style={{ gap: 10 }}>
      <KepalaBagian title="Aktivitas terbaru" action="Lihat riwayat" onPress={onLihatSemua} />

      {feed.length ? (
        feed.map((it) => (
          <BarisLini key={`${it.kind}-${it.id}`} item={it} elderId={elderId} nav={nav} />
        ))
      ) : (
        <Card><Empty>Belum ada aktivitas tercatat.</Empty></Card>
      )}
    </View>
  );
}

function BarisLini({ item, elderId, nav }) {
  const c = useColors();

  if (item.kind === 'reminder') {
    const meta = scheduleMeta(item.type);
    return (
      <RowCard
        icon={meta.icon}
        iconTint={meta.tint}
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
      <RowCard
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
      <RowCard
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
    <RowCard
      icon="heart"
      title={`Suasana hati ${item.mood_score}/5`}
      sub={item.note || `Tercatat ${relatif(item.at)}`}
      time={jam(item.at)}
    />
  );
}
