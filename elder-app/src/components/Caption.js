/**
 * Live caption — teks dari apa yang sedang diucapkan app, dan dari apa yang
 * sedang didengarnya.
 *
 * Ini bukan sekadar hiasan: tanpa layar dan tanpa tombol, caption adalah
 * satu-satunya bukti bagi lansia bahwa app benar-benar mendengar. Sekaligus
 * jalur pakai untuk yang pendengarannya berkurang (PLAN §2.2).
 */
import { ScrollView, Text } from 'react-native';
import { colors, type } from '../theme.js';

/** Kalimat panjang dikecilkan sedikit, tapi tidak pernah di bawah 24. */
const ukuran = (teks) => (teks.length > 110 ? type.captionSmall : type.caption);

export function Caption({ text, tone = 'ink' }) {
  if (!text) return null;

  return (
    <ScrollView
      style={{ maxHeight: 320, alignSelf: 'stretch' }}
      contentContainerStyle={{ paddingHorizontal: 28, paddingVertical: 8 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontSize: ukuran(text),
          lineHeight: ukuran(text) * 1.45,
          textAlign: 'center',
          color: tone === 'critical' ? colors.critical : colors.ink,
          fontWeight: '600',
        }}
      >
        {text}
      </Text>
    </ScrollView>
  );
}
