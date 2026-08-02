/**
 * AI Caretaker app lansia.
 * Sisi voice-first dari ekosistem dua sisi di ../PLAN.md.
 *
 * Tidak ada router di sini, dan memang tidak boleh ada: app hanya punya dua
 * keadaan belum terhubung ke seorang lansia, atau sudah (PLAN §2.6).
 */
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DeviceProvider, useDevice } from './src/context/DeviceContext.js';
import { PairingScreen } from './src/screens/PairingScreen.js';
import { SessionScreen } from './src/screens/SessionScreen.js';
import { colors } from './src/theme.js';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <DeviceProvider>
        <Isi />
      </DeviceProvider>
    </SafeAreaProvider>
  );
}

function Isi() {
  const { status } = useDevice();

  if (status === 'memuat') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.backdrop, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return status === 'terhubung' ? <SessionScreen /> : <PairingScreen />;
}
