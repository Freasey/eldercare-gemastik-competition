/**
 * Layar masuk.
 *
 * Tombol Google masih dimatikan: Android OAuth client ID belum ada karena
 * butuh SHA-1 dari keystore, dan keystore baru terbit setelah build pertama
 * (PLAN §5). Sampai itu selesai, masuk lewat login tamu satu-satunya jalur
 * yang jalan di backend lokal maupun production.
 */
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon.js';
import { Body, Button, Note } from '../components/ui.js';
import { useAuth } from '../context/AuthContext.js';
import { useColors } from '../theme/theme.js';
import { API_URL } from '../api/client.js';

export function LoginScreen() {
  const c = useColors();
  const { signInAsGuest } = useAuth();
  const [busy, setBusy] = useState(false);

  async function masuk() {
    setBusy(true);
    try {
      await signInAsGuest();
    } catch (err) {
      Alert.alert('Tidak bisa masuk', err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 26, gap: 18 }}
      >
        <View
          style={{
            width: 58,
            height: 58,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.accentSoft,
          }}
        >
          <Icon name="heart" size={30} color={c.accent} />
        </View>

        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 30, fontWeight: '700', lineHeight: 38, color: c.ink }}>
            Tetap dekat{'\n'}dengan orang tua
          </Text>
          <Body style={{ color: c.ink2 }}>
            Atur pengingat obat, lihat kabar harian, dan terima peringatan darurat tanpa harus
            terus menelepon.
          </Body>
        </View>

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button
            label="Masuk dengan Google"
            icon="google"
            variant="ghost"
            disabled
            onPress={() =>
              Alert.alert(
                'Belum aktif',
                'Google Sign-In menyusul setelah Android OAuth client ID dibuat (butuh SHA-1 dari build pertama).',
              )
            }
          />
          <Button label="Coba sebagai tamu" onPress={masuk} loading={busy} />
        </View>

        <View style={{ gap: 6, marginTop: 6 }}>
          <Note>
            Mode tamu membuat akun sementara berisi data contoh bebas kamu ubah. Akunnya
            terhapus kalau tidak dipakai 7 hari; masuk dengan Google untuk menyimpannya.
          </Note>
          <Note>Data kesehatan hanya dibagikan sesuai izin yang diberikan lansia.</Note>
          <Note style={{ color: c.ink3 }}>Server: {API_URL}</Note>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
