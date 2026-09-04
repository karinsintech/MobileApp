/**
 * Change or reset the device app lock PIN.
 * Requires the current PIN so an unlocked session cannot silently replace it.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import {
  changeAppLockPin,
  clearAppLockPin,
  verifyAppLockPin,
} from '../../../services/auth/appLockPinService';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { MoreScreenProps } from '../../../navigation/types';

type Props = MoreScreenProps<'ChangeAppLockPin'>;

function PinField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        placeholder="4-digit PIN"
        placeholderTextColor={Colors.text.subtle}
      />
    </View>
  );
}

export default function ChangeAppLockPinScreen({ navigation }: Props) {
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    setError(null);
    if (currentPin.length !== 4) {
      setError('Enter your current 4-digit app lock PIN.');
      return;
    }
    if (pin.length !== 4) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('New PIN and confirmation do not match.');
      return;
    }

    const result = changeAppLockPin(currentPin, pin);
    if (!result.ok) {
      setError(result.message);
      setCurrentPin('');
      return;
    }

    Alert.alert('Success', 'App lock PIN updated.', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove app lock PIN?',
      'After idle lockout you will only be able to unlock with fingerprint until you set a new PIN.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (currentPin.length !== 4) {
              setError('Enter your current app lock PIN to remove it.');
              return;
            }
            const verified = verifyAppLockPin(currentPin);
            if (!verified.ok) {
              setError(verified.message);
              setCurrentPin('');
              return;
            }
            clearAppLockPin();
            Alert.alert('Removed', 'App lock PIN has been removed.', [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          },
        },
      ],
    );
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Change App Lock PIN" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Enter your current app lock PIN, then choose a new 4-digit PIN.
          This does not change your account PIN.
        </Text>

        <GlassCard style={styles.card}>
          <PinField label="Current PIN" value={currentPin} onChangeText={setCurrentPin} />
          <PinField label="New PIN" value={pin} onChangeText={setPin} />
          <PinField label="Confirm new PIN" value={confirmPin} onChangeText={setConfirmPin} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>Update App Lock PIN</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.removeBtn}
            onPress={handleRemove}
            activeOpacity={0.85}
          >
            <Text style={styles.removeText}>Remove App Lock PIN</Text>
          </TouchableOpacity>
        </GlassCard>
      </ScrollView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing[4], paddingBottom: Spacing[8] },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    lineHeight: 20,
    marginBottom: Spacing[4],
  },
  card: { padding: Spacing[4], gap: Spacing[4] },
  field: { gap: 6 },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.white },
  input: {
    backgroundColor: Colors.glass.bgMedium,
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FontSize.base,
    color: Colors.white,
    letterSpacing: 4,
  },
  error: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    fontWeight: '600',
  },
  submitBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  submitText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy },
  removeBtn: {
    borderWidth: 1.5,
    borderColor: Colors.dangerBorder,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[3],
    alignItems: 'center',
  },
  removeText: { fontSize: FontSize.base, fontWeight: '600', color: Colors.dangerLight },
});
