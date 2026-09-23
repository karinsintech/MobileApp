/**
 * Device app lock PIN setup — used from Profile and as a mandatory post-login gate.
 * Separate from the server account PIN used for quick login.
 *
 * Mandatory mode (fresh install / reinstall / PIN removed): no back button;
 * saving unlocks the main app shell. Optional mode keeps Profile back navigation.
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

export type SetAppLockPinFormProps = {
  /** When true, user cannot leave until a PIN is saved (post-login / reinstall). */
  mandatory?: boolean;
  /** Called after a successful save — Profile uses goBack; gate relies on PIN subscription. */
  onComplete?: () => void;
};

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

/**
 * Shared set-PIN UI — RootNavigator mounts this in mandatory mode before MainTabs.
 */
export function SetAppLockPinForm({
  mandatory = false,
  onComplete,
}: SetAppLockPinFormProps) {
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
        mandatory
          ? 'Your app lock PIN is saved. You will use it to unlock Karins after idle lockout.'
          : 'This PIN unlocks the app after idle lockout — it is not your account PIN.',
        [
          {
            text: 'OK',
            onPress: () => {
              onComplete?.();
            },
          },
        ],
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Could not set app lock PIN.';
      Alert.alert('Error', message);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader
        title="Set App Lock PIN"
        // Mandatory setup cannot be skipped — idle unlock needs this PIN.
        showBack={!mandatory}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          {mandatory
            ? 'Create a 4-digit app lock PIN to continue. Without it, the app cannot unlock after idle lockout. This is separate from your account PIN for quick sign-in.'
            : 'Create a 4-digit PIN used only to unlock Karins after idle lockout. This is separate from your account PIN for quick sign-in.'}
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

export default function SetAppLockPinScreen({ navigation }: Props) {
  return (
    <SetAppLockPinForm onComplete={() => navigation.goBack()} />
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
