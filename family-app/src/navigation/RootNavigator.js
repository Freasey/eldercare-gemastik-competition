/**
 * Lima tab utama, sama seperti mockup, plus beberapa layar yang ditumpuk di
 * atasnya (percakapan, detail darurat, panggilan).
 */
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';

import { HomeScreen } from '../screens/HomeScreen.js';
import { ScheduleScreen } from '../screens/ScheduleScreen.js';
import { HistoryScreen } from '../screens/HistoryScreen.js';
import { EmergencyScreen } from '../screens/EmergencyScreen.js';
import { EmergencyDetailScreen } from '../screens/EmergencyDetailScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { TranscriptScreen } from '../screens/TranscriptScreen.js';
import { CallScreen } from '../screens/CallScreen.js';
import { LoginScreen } from '../screens/LoginScreen.js';
import { AddElderScreen, NoElderScreen } from '../screens/AddElderScreen.js';
import { PairDeviceScreen } from '../screens/PairDeviceScreen.js';

import { Icon } from '../components/Icon.js';
import { Loading } from '../components/ui.js';
import { useColors, useIsDark } from '../theme/theme.js';
import { useAuth } from '../context/AuthContext.js';
import { ElderProvider, useElders } from '../context/ElderContext.js';
import { useNotificationRouting } from '../notifications/useNotificationRouting.js';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TABS = [
  ['Beranda', HomeScreen, 'home'],
  ['Jadwal', ScheduleScreen, 'calendar'],
  ['Riwayat', HistoryScreen, 'chart'],
  ['Darurat', EmergencyScreen, 'siren'],
  ['Profil', ProfileScreen, 'user'],
];

function Tabs() {
  const c = useColors();
  const { elder } = useElders();
  const flagCount = elder?.status?.redFlags?.length ?? 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.ink3,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600' },
      }}
    >
      {TABS.map(([name, Component, icon]) => (
        <Tab.Screen
          key={name}
          name={name}
          component={Component}
          options={{
            tabBarIcon: ({ color }) => <Icon name={icon} size={21} color={color} />,
            // Lencana di Beranda memakai jumlah red flag dari daftar lansia,
            // supaya kelihatan tanpa harus membuka tabnya dulu.
            tabBarBadge: name === 'Beranda' && flagCount ? flagCount : undefined,
            tabBarBadgeStyle: { backgroundColor: c.critical, fontSize: 10 },
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

/**
 * Akun baru belum memantau siapa pun. Tab-nya sengaja tidak ditampilkan sama
 * sekali dalam keadaan itu semua tab bergantung pada `elder` yang belum ada,
 * jadi yang muncul cuma layar kosong tanpa penjelasan.
 */
function TabsOrEmpty(props) {
  const { elders, loading } = useElders();

  // Dipasang di sini, bukan di App.js: ini komponen paling luar yang sudah ada
  // di dalam ElderProvider SEKALIGUS di dalam navigator, dan keduanya
  // dibutuhkan untuk melompat ke kejadian darurat milik lansia yang benar.
  useNotificationRouting();

  if (loading) return <Loading label="Memuat data lansia…" />;
  if (elders.length === 0) return <NoElderScreen {...props} />;
  return <Tabs />;
}

export function RootNavigator() {
  const c = useColors();
  const isDark = useIsDark();
  const { user, restoring } = useAuth();

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: c.backdrop,
      card: c.surface,
      text: c.ink,
      border: c.line,
      primary: c.accent,
    },
  };

  if (restoring) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: c.surface }}>
        <Loading label="Menyiapkan…" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {user ? (
        <ElderProvider>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: c.surface },
              headerTintColor: c.ink,
              headerTitleStyle: { fontSize: 16, fontWeight: '700' },
              contentStyle: { backgroundColor: c.backdrop },
            }}
          >
            <Stack.Screen name="Tabs" component={TabsOrEmpty} options={{ headerShown: false }} />
            <Stack.Screen
              name="Percakapan"
              component={TranscriptScreen}
              options={{ title: 'Percakapan' }}
            />
            <Stack.Screen
              name="KejadianDarurat"
              component={EmergencyDetailScreen}
              options={{ title: 'Kejadian darurat' }}
            />
            <Stack.Screen
              name="Panggilan"
              component={CallScreen}
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="TambahLansia"
              component={AddElderScreen}
              options={{ title: 'Tambah lansia' }}
            />
            <Stack.Screen
              name="HubungkanPerangkat"
              component={PairDeviceScreen}
              options={{ title: 'Hubungkan perangkat' }}
            />
          </Stack.Navigator>
        </ElderProvider>
      ) : (
        <LoginScreen />
      )}
    </NavigationContainer>
  );
}
