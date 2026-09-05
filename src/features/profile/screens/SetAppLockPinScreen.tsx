/**
 * First-time device app lock PIN setup.
 * Separate from the server account PIN used for quick login.
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
import { setAppLockPin } from '../../../services/auth/appLockPinService';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { MoreScreenProps } from '../../../navigation/types';

type Props = MoreScreenProps<'SetAppLockPin'>;

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

export default function SetAppLockPinScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handleSubmit = () => {
    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'App lock PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('Mismatch', 'PIN and confirmation do not match.');
      return;
    }

    try {
      setAppLockPin(pin);
      Alert.alert(
        'App lock PIN set',
        'This PIN unlocks the app after 2 minutes idle — it is not your account PIN.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Could not set app lock PIN.';
      Alert.alert('Error', message);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Set App Lock PIN" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Create a 4-digit PIN used only to unlock Karins after idle lockout.
          This is separate from your account PIN for quick sign-in.
        </Text>

        <GlassCard style={styles.card}>
          <PinField label="App lock PIN" value={pin} onChangeText={setPin} />
          <PinField label="Confirm PIN" value={confirmPin} onChangeText={setConfirmPin} />

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Text style={styles.submitText}>Save App Lock PIN</Text>
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
  submitBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  submitText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy },
});
