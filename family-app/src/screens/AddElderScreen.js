/**
 * Tambah lansia — profil dibuat keluarga, bukan lansia (PLAN §2.1).
 *
 * Sesudah tersimpan, langsung diarahkan ke layar Hubungkan perangkat: profil
 * tanpa perangkat yang ter-pair belum berguna, dan kode pairing-nya cuma
 * berumur 15 menit jadi memang paling masuk akal diambil saat itu juga.
 */
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Button, Card, Note, Row, Rows, SectionTitle, Switch, Title } from '../components/ui.js';
import { Field, Input } from '../components/Sheet.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { createElder } from '../api/caretaker.js';

/**
 * Keadaan awal akun keluarga yang belum memantau siapa pun.
 *
 * Tanpa ini semua tab merender `null` (semuanya menunggu `elder` yang tidak
 * pernah ada), jadi app terlihat rusak padahal cuma belum ada datanya.
 */
export function NoElderScreen({ navigation }) {
  const c = useColors();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.backdrop }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 16 }}>
        <Card style={{ gap: 14 }}>
          <Title style={{ fontSize: 18 }}>Belum ada lansia yang dipantau</Title>
          <Note>
            Buat profil untuk orang tua atau kakek-nenek Anda dulu. Setelah itu Anda bisa mengatur
            jadwal obat, menerima kabar harian, dan dihubungi saat darurat.
          </Note>
          <Note>
            Beliau tidak perlu melakukan apa pun — seluruh penyiapan dikerjakan dari HP Anda.
          </Note>
          <Button
            label="Tambah lansia"
            icon="plus"
            onPress={() => navigation.navigate('TambahLansia')}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}

/** Zona waktu Indonesia. Salah zona = semua pengingat meleset berjam-jam. */
const TIMEZONES = [
  ['Asia/Jakarta', 'WIB', 'Sumatra, Jawa, Kalimantan Barat & Tengah'],
  ['Asia/Makassar', 'WITA', 'Kalimantan Timur/Selatan/Utara, Sulawesi, Bali, NTB, NTT'],
  ['Asia/Jayapura', 'WIT', 'Maluku, Papua'],
];

export function AddElderScreen({ navigation }) {
  const c = useColors();
  const { reload, setElderId } = useElders();

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [phone, setPhone] = useState('');
  const [relation, setRelation] = useState('');
  const [timezone, setTimezone] = useState('Asia/Jakarta');
  const [prayerReminder, setPrayerReminder] = useState(false);
  const [saving, setSaving] = useState(false);

  const tahun = Number(birthYear);
  const tahunValid =
    !birthYear || (Number.isInteger(tahun) && tahun >= 1900 && tahun <= new Date().getFullYear());
  const bisaSimpan = name.trim().length >= 2 && tahunValid && !saving;

  async function simpan() {
    setSaving(true);
    try {
      const { elder } = await createElder({
        name: name.trim(),
        birthYear: birthYear ? tahun : undefined,
        phone: phone.trim() || undefined,
        relation: relation.trim() || undefined,
        timezone,
        prayerReminder,
      });

      await reload();
      setElderId(elder.id);
      navigation.replace('HubungkanPerangkat', { elderId: elder.id, baruDibuat: true });
    } catch (err) {
      Alert.alert('Gagal menyimpan', err.message);
      setSaving(false);
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.backdrop }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}
        >
          <Card>
            <Title>Data lansia</Title>
            <Note>
              Hanya nama yang wajib. Sisanya bisa dilengkapi belakangan lewat tab Profil.
            </Note>

            <View style={{ gap: 13 }}>
              <Field label="Nama">
                <Input
                  value={name}
                  onChangeText={setName}
                  placeholder="Ibu Sumarni"
                  autoCapitalize="words"
                />
              </Field>

              <Field label="Tahun lahir" hint={tahunValid ? undefined : 'Tahun lahir tidak masuk akal'}>
                <Input
                  value={birthYear}
                  onChangeText={setBirthYear}
                  placeholder="1954"
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </Field>

              <Field label="Nomor telepon">
                <Input value={phone} onChangeText={setPhone} placeholder="0812…" keyboardType="phone-pad" />
              </Field>

              <Field label="Hubungan Anda dengan beliau">
                <Input
                  value={relation}
                  onChangeText={setRelation}
                  placeholder="Anak kandung"
                  autoCapitalize="sentences"
                />
              </Field>
            </View>
          </Card>

          <Card>
            <Title>Zona waktu</Title>
            <Note>
              Dipakai untuk menentukan jam pengingat dibacakan. Pilih sesuai tempat tinggal beliau,
              bukan tempat tinggal Anda.
            </Note>
            <Rows>
              {TIMEZONES.map(([value, label, daerah]) => (
                <Row
                  key={value}
                  title={label}
                  sub={daerah}
                  onPress={() => setTimezone(value)}
                  end={
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        borderWidth: 2,
                        borderColor: timezone === value ? c.accent : c.lineStrong,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {timezone === value ? (
                        <View
                          style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }}
                        />
                      ) : null}
                    </View>
                  }
                />
              ))}
            </Rows>
          </Card>

          <Card>
            <Title>Pengingat</Title>
            <Rows>
              <Row
                icon="moon"
                title="Pengingat waktu sholat"
                sub="Asisten ikut mengingatkan waktu sholat"
                end={<Switch on={prayerReminder} onPress={() => setPrayerReminder((v) => !v)} />}
              />
            </Rows>
          </Card>

          <SectionTitle>Langkah berikutnya</SectionTitle>
          <Note style={{ paddingHorizontal: 2 }}>
            Setelah disimpan, Anda akan diberi kode untuk dipindai HP beliau. Jadwal obat bisa diisi
            kapan saja lewat tab Jadwal.
          </Note>

          <Button
            label={saving ? 'Menyimpan…' : 'Simpan & hubungkan perangkat'}
            icon="check"
            onPress={simpan}
            disabled={!bisaSimpan}
            loading={saving}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
