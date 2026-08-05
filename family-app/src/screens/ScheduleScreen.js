/**
 * Jadwal daftar pengingat berulang milik lansia, plus form tambah/ubah.
 *
 * Perubahan di sini langsung dikirim ke backend, yang membuat ulang
 * `reminder_events` (lihat `schedules.routes.js`). Lansia tidak perlu
 * melakukan apa pun asisten yang menyesuaikan jam bicaranya (PLAN §2.3).
 */
import { useCallback, useState } from 'react';
import { Alert, View } from 'react-native';
import { ScreenShell } from '../components/ScreenShell.js';
import {
  Body,
  Button,
  Card,
  Chip,
  Empty,
  ErrorState,
  IconTile,
  Loading,
  Note,
  Pill,
  RowCard,
  SectionTitle,
  Switch,
  Title,
} from '../components/ui.js';
import { Field, Input, Sheet } from '../components/Sheet.js';
import { font } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useApi } from '../lib/useApi.js';
import {
  createSchedule,
  deleteSchedule,
  fetchSchedules,
  updateSchedule,
} from '../api/caretaker.js';
import {
  DAY_LABEL,
  DAY_ORDER,
  DAY_PRESETS,
  formatDays,
  jamDariTime,
  sameDays,
  shortName,
  trimTime,
} from '../lib/format.js';
import { SCHEDULE_TYPES, scheduleMeta } from '../lib/constants.js';

const FILTERS = [
  ['all', 'Semua'],
  ['medication', 'Obat'],
  ['prayer', 'Ibadah'],
  ['activity', 'Aktivitas'],
  ['sleep', 'Istirahat'],
];

export function ScheduleScreen() {
  const { elder } = useElders();
  const elderId = elder?.id;

  const [filter, setFilter] = useState('all');
  const [sheet, setSheet] = useState(null); // null | { schedule?: object }

  const run = useCallback(async () => (await fetchSchedules(elderId)).schedules, [elderId]);
  const { data: schedules, error, loading, refreshing, refresh } = useApi(run, { enabled: !!elderId });

  if (!elder) return null;

  const list = (schedules || []).filter((s) => filter === 'all' || s.type === filter);

  return (
    <>
      <ScreenShell
        title="Jadwal"
        subtitle="Atur pengingat harian"
        refreshing={refreshing}
        onRefresh={refresh}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FILTERS.map(([v, l]) => (
            <Chip key={v} label={l} active={filter === v} onPress={() => setFilter(v)} />
          ))}
        </View>

        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
        {loading && !schedules ? <Loading /> : null}

        {schedules ? (
          <>
            <View style={{ gap: 10 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <SectionTitle>Jadwal berulang</SectionTitle>
                <Note>{list.length} jadwal aktif</Note>
              </View>

              {list.length ? (
                list.map((s) => (
                  <BarisJadwal key={s.id} schedule={s} onPress={() => setSheet({ schedule: s })} />
                ))
              ) : (
                <Card><Empty>Belum ada jadwal untuk kategori ini.</Empty></Card>
              )}
            </View>

            <Button label="Tambah jadwal" icon="plus" onPress={() => setSheet({})} />

            <CatatanSinkron elder={elder} />
          </>
        ) : null}
      </ScreenShell>

      <SheetJadwal
        state={sheet}
        elder={elder}
        onClose={() => setSheet(null)}
        onSaved={() => {
          setSheet(null);
          refresh();
        }}
      />
    </>
  );
}

function BarisJadwal({ schedule, onPress }) {
  const meta = scheduleMeta(schedule.type);

  // "penting" tidak lagi ikut di baris keterangan sudah punya lencananya
  // sendiri di sebelah judul, dan menyebutnya dua kali cuma jadi ulangan.
  const sub = [formatDays(schedule.days_of_week), schedule.dosage].filter(Boolean).join(' · ');

  return (
    <RowCard
      time={jamDariTime(schedule.time_of_day)}
      icon={meta.icon}
      iconTint={meta.tint}
      title={schedule.title}
      badge={
        schedule.is_critical ? (
          <Pill tone="warning" icon="alert">
            Penting
          </Pill>
        ) : null
      }
      sub={sub}
      onPress={onPress}
    />
  );
}

function CatatanSinkron({ elder }) {
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 13, alignItems: 'flex-start' }}>
        <IconTile name="sync" tint="accent" size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <Title>Langsung tersinkron</Title>
          <Note>
            Perubahan jadwal langsung dikirim ke HP {shortName(elder.name)}. Beliau tidak perlu
            melakukan apa pun asisten yang akan mengingatkan sesuai jam baru.
          </Note>
        </View>
      </View>
    </Card>
  );
}

/* ---------------- form tambah/ubah ---------------- */

function SheetJadwal({ state, elder, onClose, onSaved }) {
  const editing = !!state?.schedule;
  const s = state?.schedule;

  // `key` memaksa form dibuat ulang tiap kali sheet dibuka untuk jadwal lain,
  // supaya isian tidak terbawa dari jadwal sebelumnya.
  return (
    <Sheet
      visible={!!state}
      onClose={onClose}
      title={editing ? 'Ubah jadwal' : 'Tambah jadwal'}
      lead={`Jadwal ${editing ? 'yang diubah' : 'baru'} langsung dikirim ke HP ${shortName(elder.name)}.`}
    >
      {state ? (
        <FormJadwal
          key={s?.id ?? 'baru'}
          elderId={elder.id}
          schedule={s}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </Sheet>
  );
}

function FormJadwal({ elderId, schedule, onClose, onSaved }) {
  const editing = !!schedule;

  const [type, setType] = useState(schedule?.type || 'medication');
  const [title, setTitle] = useState(schedule?.title || '');
  const [time, setTime] = useState(schedule ? trimTime(schedule.time_of_day) : '07:00');
  const [dosage, setDosage] = useState(schedule?.dosage || '');
  const [days, setDays] = useState(schedule?.days_of_week?.slice() || DAY_PRESETS.all.slice());
  const [critical, setCritical] = useState(schedule ? !!schedule.is_critical : true);
  const [busy, setBusy] = useState(false);

  function toggleDay(d) {
    setDays((prev) => {
      if (prev.includes(d)) {
        // Minimal satu hari harus tetap aktif, kalau tidak jadwalnya mati.
        return prev.length > 1 ? prev.filter((x) => x !== d) : prev;
      }
      return [...prev, d];
    });
  }

  async function simpan() {
    const jamValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
    if (!jamValid) return Alert.alert('Jam belum benar', 'Tulis jam dengan format 24 jam, contoh 07:00.');
    if (title.trim().length < 2) return Alert.alert('Nama jadwal kosong', 'Isi dulu nama jadwalnya.');

    setBusy(true);
    try {
      if (editing) {
        await updateSchedule(elderId, schedule.id, {
          title: title.trim(),
          timeOfDay: time,
          daysOfWeek: days,
          isCritical: critical,
        });
      } else {
        await createSchedule(elderId, {
          type,
          title: title.trim(),
          timeOfDay: time,
          daysOfWeek: days,
          isCritical: critical,
          // Backend menolak jadwal obat tanpa data obat (schedules.routes.js).
          ...(type === 'medication'
            ? { medication: { name: title.trim(), dosage: dosage.trim() || undefined } }
            : {}),
        });
      }
      onSaved();
    } catch (err) {
      Alert.alert('Gagal menyimpan', err.message);
    } finally {
      setBusy(false);
    }
  }

  function hapus() {
    Alert.alert('Hapus jadwal?', `"${schedule.title}" tidak akan diingatkan lagi.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteSchedule(elderId, schedule.id);
            onSaved();
          } catch (err) {
            Alert.alert('Gagal menghapus', err.message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      {/* Jenis dikunci saat mengubah: memindahkan jadwal obat ke jenis lain
          akan memutus kaitannya dengan data obat di backend. */}
      <Field label="Jenis" hint={editing ? 'Jenis jadwal tidak bisa diubah setelah dibuat.' : undefined}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {Object.entries(SCHEDULE_TYPES).map(([v, m]) => (
            <Chip
              key={v}
              label={m.label}
              icon={m.icon}
              active={type === v}
              onPress={() => !editing && setType(v)}
            />
          ))}
        </View>
      </Field>

      <Field label="Nama jadwal">
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder="Contoh: Minum Candesartan"
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Field label="Jam" style={{ flex: 1 }} hint="Format 24 jam">
          <Input
            value={time}
            onChangeText={(t) => setTime(formatJamKetikan(t))}
            placeholder="07:00"
            keyboardType="number-pad"
            maxLength={5}
          />
        </Field>
        {type === 'medication' && !editing ? (
          <Field label="Dosis" style={{ flex: 1 }} hint="Boleh dikosongkan">
            <Input value={dosage} onChangeText={setDosage} placeholder="8 mg" />
          </Field>
        ) : null}
      </View>

      <Field label="Hari" hint={`Berlaku: ${formatDays(days)}`}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <Chip
            label="Setiap hari"
            active={sameDays(days, DAY_PRESETS.all)}
            onPress={() => setDays(DAY_PRESETS.all.slice())}
          />
          <Chip
            label="Hari kerja"
            active={sameDays(days, DAY_PRESETS.weekday)}
            onPress={() => setDays(DAY_PRESETS.weekday.slice())}
          />
          <Chip
            label="Akhir pekan"
            active={sameDays(days, DAY_PRESETS.weekend)}
            onPress={() => setDays(DAY_PRESETS.weekend.slice())}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {DAY_ORDER.map((d) => (
            <Chip
              key={d}
              label={DAY_LABEL[d]}
              active={days.includes(d)}
              onPress={() => toggleDay(d)}
            />
          ))}
        </View>
      </Field>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 4,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Body style={{ fontFamily: font.semibold }}>Tandai penting</Body>
          <Note>Kalau terlewat, keluarga langsung diberi tahu.</Note>
        </View>
        <Switch on={critical} onPress={() => setCritical((v) => !v)} />
      </View>

      <Button
        label={editing ? 'Simpan perubahan' : 'Simpan jadwal'}
        onPress={simpan}
        loading={busy}
      />
      {editing ? (
        <Button label="Hapus jadwal" variant="ghost" icon="trash" onPress={hapus} />
      ) : null}
      <Button label="Batal" variant="ghost" onPress={onClose} />
    </>
  );
}

/** Sisipkan ":" otomatis supaya pengetikan jam terasa seperti input waktu. */
function formatJamKetikan(text) {
  const angka = text.replace(/\D/g, '').slice(0, 4);
  if (angka.length <= 2) return angka;
  return `${angka.slice(0, 2)}:${angka.slice(2)}`;
}
