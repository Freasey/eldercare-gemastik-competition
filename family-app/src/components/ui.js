/**
 * Primitif tampilan yang dipakai di banyak layar. Bentuk & ukurannya
 * mengikuti `mockup-keluarga/styles.css` (kartu 18px, baris 12px, dst).
 */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Icon } from './Icon.js';
import { cardShadow, useColors } from '../theme/theme.js';
import { initials as toInitials } from '../lib/format.js';

/* ---------------- teks ---------------- */

export function Title({ children, style }) {
  const c = useColors();
  return <Text style={[{ fontSize: 14.5, fontWeight: '700', color: c.ink }, style]}>{children}</Text>;
}

export function Body({ children, style, numberOfLines }) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: 13.5, lineHeight: 20, color: c.ink }, style]}>
      {children}
    </Text>
  );
}

export function Note({ children, style, numberOfLines }) {
  const c = useColors();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: 12, lineHeight: 18, color: c.ink2 }, style]}>
      {children}
    </Text>
  );
}

export function SectionTitle({ children, style }) {
  const c = useColors();
  return (
    <Text
      style={[
        { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: c.ink3 },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ---------------- wadah ---------------- */

export function Card({ children, style }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.surface,
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.line,
          padding: 15,
          gap: 11,
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
 * Satu baris daftar: [jam] [ikon] [judul + keterangan] [ujung].
 * Kalau `onPress` diisi, seluruh baris jadi tombol.
 */
export function Row({ time, icon, iconColor, iconBg, title, sub, end, onPress, children }) {
  const c = useColors();

  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 }}>
      {time ? (
        <Text
          style={{
            fontSize: 12.5,
            fontWeight: '700',
            color: c.ink2,
            width: 42,
            fontVariant: ['tabular-nums'],
          }}
        >
          {time}
        </Text>
      ) : null}

      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconBg || c.surface2,
          }}
        >
          {typeof icon === 'string' ? (
            <Icon name={icon} size={16} color={iconColor || c.ink2} />
          ) : (
            icon
          )}
        </View>
      ) : null}

      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {title != null ? (
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: c.ink }}>{title}</Text>
        ) : null}
        {sub != null ? <Note numberOfLines={3}>{sub}</Note> : null}
        {children}
      </View>

      {end ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{end}</View> : null}
    </View>
  );

  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {inner}
    </Pressable>
  );
}

/* ---------------- lencana & status ---------------- */

/** Lencana kecil. `tone`: neutral | good | warning | critical */
export function Pill({ children, tone = 'neutral', icon }) {
  const c = useColors();
  const map = {
    neutral: [c.surface2, c.ink2, c.ink3],
    good: [c.goodSoft, c.good, c.good],
    warning: [c.warningSoft, c.warning, c.warning],
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
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 999,
      }}
    >
      {icon ? (
        <Icon name={icon} size={12} color={fg} />
      ) : (
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
      )}
      <Text style={{ fontSize: 11.5, fontWeight: '650', color: fg }}>{children}</Text>
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
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg,
      }}
    >
      <Icon name={name} size={13} color={fg} />
    </View>
  );
}

export function Avatar({ name, size = 40, bg, fg }) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: bg || c.accentSoft,
      }}
    >
      <Text style={{ fontSize: size * 0.34, fontWeight: '700', color: fg || c.accentInk }}>
        {toInitials(name)}
      </Text>
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
          paddingVertical: 13,
          paddingHorizontal: 16,
          borderRadius: 14,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={17} color={fg} /> : null}
          <Text style={{ fontSize: 14.5, fontWeight: '650', color: fg }}>{label}</Text>
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
      <Text style={{ fontSize: 12.5, fontWeight: '650', color: c.accent }}>{label}</Text>
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
        paddingHorizontal: 13,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? 'transparent' : c.line,
        backgroundColor: active ? c.accent : c.surface,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={14} color={active ? c.onAccent : c.ink2} /> : null}
      <Text style={{ fontSize: 12.5, fontWeight: '650', color: active ? c.onAccent : c.ink2 }}>
        {label}
      </Text>
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
    <Text style={{ fontSize: 13, color: c.ink3, textAlign: 'center', paddingVertical: 16 }}>
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
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: c.criticalSoft,
          }}
        >
          <Icon name="alert" size={16} color={c.critical} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Title>Gagal memuat data</Title>
          <Note>{message}</Note>
        </View>
      </View>
      {onRetry ? <Button label="Coba lagi" icon="sync" variant="ghost" onPress={onRetry} /> : null}
    </Card>
  );
}
