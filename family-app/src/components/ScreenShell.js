/**
 * Kerangka tiap tab: app bar (judul + akun) dan deretan chip untuk berpindah
 * lansia, lalu isi layar yang bisa digulir dan ditarik untuk muat ulang.
 *
 * Kepala layar sengaja TIDAK lagi punya garis pemisah dan latar putih sendiri.
 * Di redesign, judul duduk langsung di atas latar krem yang sama dengan isinya;
 * pemisahnya adalah jarak, bukan garis.
 */
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Chip, Avatar } from './ui.js';
import { type, useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useAuth } from '../context/AuthContext.js';
import { shortName } from '../lib/format.js';

export function ScreenShell({ title, subtitle, children, refreshing, onRefresh, action }) {
  const c = useColors();
  const { user } = useAuth();
  const { elders, elderId, setElderId } = useElders();
  const navigation = useNavigation();

  const banyakLansia = elders.length > 1;

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.backdrop }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 32 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          ) : undefined
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            {subtitle ? <Text style={[type.screenSub, { color: c.ink2 }]}>{subtitle}</Text> : null}
            <Text style={[type.screenTitle, { color: c.ink }]}>{title}</Text>
          </View>
          {action ?? <Avatar name={user?.name} size={44} />}
        </View>

        {/* Deretan chip hanya muncul kalau memang ada pilihan. Satu chip
            "Tambah" yang berdiri sendiri di bawah judul cuma jadi kebisingan;
            menambah lansia tetap bisa lewat layar Profil. */}
        {banyakLansia ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingRight: 8 }}
          >
            {elders.map((e) => (
              <Chip
                key={e.id}
                label={shortName(e.name)}
                active={e.id === elderId}
                onPress={() => setElderId(e.id)}
              />
            ))}
            <Chip label="Tambah" icon="plus" onPress={() => navigation.navigate('TambahLansia')} />
          </ScrollView>
        ) : null}

        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
