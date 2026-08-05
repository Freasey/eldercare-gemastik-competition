/**
 * AI Caretaker app keluarga.
 * Sisi caregiver dari ekosistem dua sisi di ../PLAN.md.
 */
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Diimpor per-bobot, BUKAN dari akar paketnya. Akar paket me-`require` seluruh
// 14 varian (termasuk tujuh italic dan bobot yang tidak dipakai), dan Metro
// tidak bisa membuang require aset yang tak terpakai jalur itu menambah
// ~1,2 MB ke APK demi berkas yang tidak pernah dirender.
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { ThemeProvider } from './src/theme/theme.js';
import { AuthProvider } from './src/context/AuthContext.js';
import { RootNavigator } from './src/navigation/RootNavigator.js';

// Splash bawaan ditahan supaya TIDAK hilang sebelum huruf siap. Tanpa ini
// urutannya jadi splash → layar tunggu buatan sendiri → app, yaitu dua layar
// tunggu berturut-turut untuk satu penantian yang sama.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Seluruh skala huruf menyebut fontFamily Plus Jakarta Sans (lihat
  // theme/tokens.js), jadi merender sebelum berkasnya siap berarti satu kedipan
  // teks dengan huruf sistem yang metriknya berbeda tata letaknya ikut
  // bergeser saat font akhirnya masuk.
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // Kegagalan memuat huruf TIDAK menahan app: huruf sistem jelek, tapi jauh
  // lebih baik daripada splash yang tidak pernah menyingkir.
  const siap = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (siap) SplashScreen.hideAsync().catch(() => {});
  }, [siap]);

  // `null`, bukan indikator muat: yang terlihat pengguna selama ini adalah
  // splash bawaan yang masih ditahan di atasnya.
  if (!siap) return null;

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
