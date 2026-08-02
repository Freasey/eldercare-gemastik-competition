/**
 * AI Caretaker app keluarga.
 * Sisi caregiver dari ekosistem dua sisi di ../PLAN.md.
 */
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/theme.js';
import { AuthProvider } from './src/context/AuthContext.js';
import { RootNavigator } from './src/navigation/RootNavigator.js';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
