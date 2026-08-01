/**
 * Kerangka tiap tab: app bar (judul + akun) dan deretan chip untuk berpindah
 * lansia, lalu isi layar yang bisa digulir dan ditarik untuk muat ulang.
 */
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Chip, Avatar } from './ui.js';
import { useColors } from '../theme/theme.js';
import { useElders } from '../context/ElderContext.js';
import { useAuth } from '../context/AuthContext.js';
import { shortName } from '../lib/format.js';

export function ScreenShell({ title, subtitle, children, refreshing, onRefresh }) {
  const c = useColors();
  const { user } = useAuth();
  const { elders, elderId, setElderId } = useElders();
  const navigation = useNavigation();

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.surface }}>
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 6,
          paddingBottom: 12,
          gap: 12,
          backgroundColor: c.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: c.line,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.2, color: c.ink }}>
              {title}
            </Text>
            <Text style={{ fontSize: 12.5, color: c.ink2 }}>{subtitle}</Text>
          </View>
          <Avatar name={user?.name} size={38} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingRight: 8 }}
        >
          {elders.length > 1
            ? elders.map((e) => (
                <Chip
                  key={e.id}
                  label={shortName(e.name)}
                  active={e.id === elderId}
                  onPress={() => setElderId(e.id)}
                />
              ))
            : null}
          <Chip label="Tambah" icon="plus" onPress={() => navigation.navigate('TambahLansia')} />
        </ScrollView>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: c.backdrop }}
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 28 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}
