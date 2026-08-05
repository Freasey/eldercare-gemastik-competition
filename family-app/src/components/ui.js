/**
 * Primitif tampilan yang dipakai di banyak layar.
 *
 * Bentuk & ukurannya mengikuti redesign "Elda Companion": kartu 18px, ubin
 * ikon rounded-square 44px, dan jam baris berada di KANAN dengan warna teal
 * bukan di kiri dengan warna abu seperti versi sebelumnya.
 *
 * Semua ukuran huruf datang dari `theme/tokens.js: type`, dan tiap entri di
 * sana menyebut `fontFamily`, bukan `fontWeight` alasannya ada di komentar
 * berkas itu (huruf muatan sendiri + Android).
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from './Icon.js';
import { cardShadow, radius, type, useColors } from '../theme/theme.js';
import { initials as toInitials } from '../lib/format.js';

/* ---------------- teks ---------------- */

export function Title({ children, style }) {
  const c = useColors();
  return <Text style={[type.cardTitle, { color: c.ink }, style]}>{children}</Text>;
}

export function Body({ children, style, numberOfLines }) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[type.body, { color: c.ink }, style]}>
      {children}
    </Text>
  );
}

export function Note({ children, style, numberOfLines }) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[type.sub, { color: c.ink2 }, style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, style }) {
  const c = useColors();
  return <Text style={[type.label, { color: c.ink3 }, style]}>{children}</Text>;
}

/* ---------------- wadah ---------------- */

export function Card({ children, style }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: radius.card,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
          padding: 16,
          gap: 12,
        },
        cardShadow(c),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function CardHead({ children }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      {children}
    </View>
  );
}

/** Pemisah tipis antar baris di dalam satu kartu. */
export function Rows({ children }) {
  const c = useColors();
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return (
    <View>
      {items.map((child, i) => (
        <View
          key={child?.key ?? i}
          style={
            i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : undefined
          }
        >
          {child}
        </View>
      ))}
    </View>
  );
}

/**
 * Ubin ikon rounded-square. `tint`: sage (netral) | accent (obat/kontrol)
 * atau warna latar & ikon yang ditentukan sendiri lewat `bg`/`color`.
 */
export function IconTile({ name, tint = 'sage', bg, color, size = 44 }) {
  const c = useColors();
  const latar = bg || (tint === 'accent' ? c.accentSoft : c.sageSoft);
  const isi = color || (tint === 'accent' ? c.accent : c.accentInk);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.tile,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: latar,
      }}
    >
      {typeof name === 'string' ? <Icon name={name} size={size * 0.45} color={isi} /> : name}
    </View>
  );
}

/**
 * Satu baris daftar: [ubin ikon] [judul + keterangan] [jam] [ujung].
 *
 * Jam sengaja berada di sisi kanan bersama `end`, bukan di kiri seperti versi
 * lama seluruh daftar di redesign menaruhnya di sana, dan kolom kiri yang
 * kosong membuat judulnya tidak pernah sejajar antar kartu.
 *
 * Kalau `onPress` diisi, seluruh baris jadi tombol.
 */
export function Row({
  time,
  icon,
  iconColor,
  iconBg,
  iconTint,
  title,
  badge,
  sub,
  end,
  onPress,
  children,
}) {
  const c = useColors();

  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 12 }}>
      {icon ? (
        <IconTile name={icon} tint={iconTint} bg={iconBg} color={iconColor} />
      ) : null}

      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        {title != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            {/* flexShrink, bukan numberOfLines: judul panjang boleh mengecil
                ruangnya, tapi lencana di sebelahnya tidak boleh ikut terdorong
                keluar layar. */}
            <Text style={[type.rowTitle, { color: c.ink, flexShrink: 1 }]}>{title}</Text>
            {badge}
          </View>
        ) : null}
        {sub != null ? <Note numberOfLines={3}>{sub}</Note> : null}
        {children}
      </View>

      {time || end ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {time ? <Text style={[type.rowTime, { color: c.accent }]}>{time}</Text> : null}
          {end}
        </View>
      ) : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {inner}
    </Pressable>
  );
}

/**
 * Satu baris yang berdiri sebagai kartunya sendiri.
 *
 * Di redesign, daftar jadwal dan aktivitas tidak lagi berupa satu kartu berisi
 * banyak baris berpemisah, melainkan tumpukan kartu terpisah. Padding kartunya
 * dikecilkan supaya padding milik `Row` yang menentukan tinggi baris kalau
 * keduanya dipakai penuh, barisnya jadi terlalu tinggi.
 */
export function RowCard({ style, ...rowProps }) {
  return (
    <Card style={[{ paddingVertical: 4, paddingHorizontal: 14, gap: 0 }, style]}>
      <Row {...rowProps} />
    </Card>
  );
}

/* ---------------- lencana & status ---------------- */

/** Lencana kecil. `tone`: neutral | good | warning | critical */
export function Pill({ children, tone = 'neutral', icon }) {
  const c = useColors();
  const map = {
    neutral: [c.surface2, c.ink2, c.ink3],
    good: [c.goodSoft, c.good, c.good],
    warning: [c.warningSoft, c.warningInk, c.warning],
    critical: [c.criticalSoft, c.critical, c.critical],
  };
  const [bg, fg, dot] = map[tone] || map.neutral;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: radius.pill,
      }}
    >
      {icon ? (
        <Icon name={icon} size={12} color={fg} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      )}
      <Text style={[type.pill, { color: fg }]}>{children}</Text>
    </View>
  );
}

/**
 * Ikon status reminder. Warna selalu ditemani bentuk ikon yang berbeda,
 * jadi tetap bisa dibedakan tanpa melihat warna.
 */
export function StatusIcon({ status }) {
  const c = useColors();
  const map = {
    confirmed: [c.goodSoft, c.good, 'check'],
    pending: [c.surface2, c.ink3, 'clock'],
    spoken: [c.surface2, c.ink3, 'clock'],
    snoozed: [c.warningSoft, c.warning, 'clock'],
    missed: [c.criticalSoft, c.critical, 'alert'],
    skipped: [c.surface2, c.ink3, 'minus'],
  };
  const [bg, fg, name] = map[status] || map.pending;

  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
      }}
    >
      <Icon name={name} size={14} color={fg} />
    </View>
  );
}

export function Avatar({ name, size = 44, bg, fg }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg || c.sageSoft,
      }}
    >
      <Text style={{ fontFamily: type.cardTitle.fontFamily, fontSize: size * 0.34, color: fg || c.accentInk }}>
        {toInitials(name)}
      </Text>
    </View>
  );
}

/**
 * Bilah kemajuan tipis di kaki kartu statistik. Selalu berpasangan dengan
 * angkanya sendiri, jadi tidak ada informasi yang hanya ada di panjang bilah.
 */
export function ProgressBar({ value = 0, tone }) {
  const c = useColors();
  const lebar = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${lebar * 100}%`, height: '100%', backgroundColor: tone || c.accent }} />
    </View>
  );
}

/* ---------------- kontrol ---------------- */

/** `variant`: primary | ghost | danger */
export function Button({ label, icon, onPress, variant = 'primary', disabled, loading, style }) {
  const c = useColors();
  const map = {
    primary: [c.accent, c.onAccent, 'transparent'],
    ghost: [c.surface2, c.ink, c.line],
    danger: [c.critical, '#ffffff', 'transparent'],
  };
  const [bg, fg, border] = map[variant] || map.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: bg,
          borderColor: border,
          borderWidth: StyleSheet.hairlineWidth,
          paddingVertical: 15,
          paddingHorizontal: 18,
          borderRadius: radius.row,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} /> : null}
          <Text style={[type.button, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Tombol teks tanpa latar, untuk aksi sekunder di kepala kartu. */
export function LinkButton({ label, onPress }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      <Text style={[type.chip, { color: c.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 15,
        paddingVertical: 9,
        borderRadius: radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? 'transparent' : c.line,
        backgroundColor: active ? c.accent : c.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={active ? c.onAccent : c.ink2} /> : null}
      <Text style={[type.chip, { color: active ? c.onAccent : c.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Sakelar tampilan saja tidak menyimpan state sendiri. Dipakai untuk panel
 * privasi yang sengaja terkunci: keluarga bisa melihat, tidak bisa mengubah.
 */
export function Switch({ on, onPress, disabled }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 28,
        borderRadius: 14,
        padding: 3,
        justifyContent: 'center',
        backgroundColor: on ? c.accent : c.surface3,
        opacity: pressed && !disabled ? 0.8 : 1,
      })}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: c.surface,
          transform: [{ translateX: on ? 18 : 0 }],
        }}
      />
    </Pressable>
  );
}

/* ---------------- keadaan kosong / muat / gagal ---------------- */

export function Empty({ children }) {
  const c = useColors();
  return (
    <Text style={[type.sub, { color: c.ink3, textAlign: 'center', paddingVertical: 18 }]}>
      {children}
    </Text>
  );
}

export function Loading({ label = 'Memuat…' }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 40 }}>
      <ActivityIndicator color={c.accent} />
      <Note>{label}</Note>
    </View>
  );
}

export function ErrorState({ message, onRetry }) {
  const c = useColors();
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 13, alignItems: 'flex-start' }}>
        <IconTile name="alert" bg={c.criticalSoft} color={c.critical} size={40} />
        <View style={{ flex: 1, gap: 4 }}>
          <Title>Gagal memuat data</Title>
          <Note>{message}</Note>
        </View>
      </View>
      {onRetry ? <Button label="Coba lagi" icon="sync" variant="ghost" onPress={onRetry} /> : null}
    </Card>
  );
}
