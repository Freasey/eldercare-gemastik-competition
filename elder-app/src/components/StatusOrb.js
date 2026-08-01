/**
 * Satu-satunya "UI" di layar sesi: lingkaran yang menunjukkan app sedang
 * mendengar, berpikir, atau bicara.
 *
 * Gerakannya dibedakan, bukan cuma warnanya — pengguna dengan buta warna atau
 * katarak tetap bisa membedakan denyut cepat (mendengar) dari denyut pelan
 * (bicara). Aturan yang sama dipakai app keluarga: warna tidak pernah berdiri
 * sendiri sebagai penanda status.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { colors } from '../theme.js';

const GERAK = {
  membuka: { warna: colors.thinking, durasi: 1400, skala: 1.06 },
  mendengar: { warna: colors.listening, durasi: 900, skala: 1.22 },
  berpikir: { warna: colors.thinking, durasi: 700, skala: 1.1 },
  bicara: { warna: colors.speaking, durasi: 1800, skala: 1.14 },
  selesai: { warna: colors.thinking, durasi: 0, skala: 1 },
  darurat: { warna: colors.critical, durasi: 600, skala: 1.25 },
  gagal: { warna: colors.thinking, durasi: 0, skala: 1 },
  siap: { warna: colors.accent, durasi: 0, skala: 1 },
};

export function StatusOrb({ fase, size = 200 }) {
  const denyut = useRef(new Animated.Value(0)).current;
  const { warna, durasi, skala } = GERAK[fase] ?? GERAK.siap;

  useEffect(() => {
    denyut.setValue(0);
    if (!durasi) return undefined;

    const animasi = Animated.loop(
      Animated.sequence([
        Animated.timing(denyut, {
          toValue: 1,
          duration: durasi,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(denyut, {
          toValue: 0,
          duration: durasi,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animasi.start();
    return () => animasi.stop();
  }, [denyut, durasi, fase]);

  const transform = [{ scale: denyut.interpolate({ inputRange: [0, 1], outputRange: [1, skala] }) }];

  return (
    <View style={{ width: size * 1.3, height: size * 1.3, alignItems: 'center', justifyContent: 'center' }}>
      {/* Lingkaran luar yang memudar — memberi kesan "napas" tanpa perlu
          animasi warna, yang tidak bisa dijalankan native driver. */}
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: warna,
          opacity: 0.18,
          transform: [{ scale: denyut.interpolate({ inputRange: [0, 1], outputRange: [1, skala * 1.15] }) }],
        }}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: warna,
          transform,
        }}
      />
    </View>
  );
}
