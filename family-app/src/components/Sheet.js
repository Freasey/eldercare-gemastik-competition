/**
 * Panel yang naik dari bawah layar, padanan `.sheet` di mockup HTML.
 * Dipakai untuk form tambah/ubah jadwal.
 */
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { font, useColors } from '../theme/theme.js';
import { Note } from './ui.js';

export function Sheet({ visible, onClose, title, lead, children }) {
  const c = useColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Pressable kosong menahan tap supaya tidak tembus ke scrim di belakang. */}
          <Pressable
            onPress={() => {}}
            style={{
              backgroundColor: c.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: 26,
              maxHeight: '90%',
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: c.surface3,
                marginBottom: 14,
              }}
            />

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
              <View style={{ gap: 5 }}>
                <Text style={{ fontFamily: font.extrabold, fontSize: 20, letterSpacing: -0.3, color: c.ink }}>
                  {title}
                </Text>
                {lead ? <Note>{lead}</Note> : null}
              </View>
              {children}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

/** Satu isian berlabel. */
export function Field({ label, hint, children, style }) {
  const c = useColors();
  return (
    <View style={[{ gap: 6 }, style]}>
      <Text style={{ fontFamily: font.semibold, fontSize: 13, color: c.ink2 }}>{label}</Text>
      {children}
      {hint ? <Note style={{ color: c.ink3 }}>{hint}</Note> : null}
    </View>
  );
}

export function Input({ value, onChangeText, placeholder, keyboardType, maxLength, autoCapitalize }) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.ink3}
      keyboardType={keyboardType}
      maxLength={maxLength}
      autoCapitalize={autoCapitalize}
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.lineStrong,
        backgroundColor: c.surface2,
        borderRadius: 12,
        paddingHorizontal: 13,
        paddingVertical: 12,
        fontSize: 14.5,
        color: c.ink,
      }}
    />
  );
}
