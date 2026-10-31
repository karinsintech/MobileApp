/**
 * Change the logged-in user's 4-digit account PIN.
 * Authenticated session is enough — no current-PIN step (users who forgot
 * the old PIN can still set a replacement after password login).
 */

import React, { useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  View,
} from 'react-native';
import { userApi } from '../../../services/api/userApi';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { MoreScreenProps } from '../../../navigation/types';

type Props = MoreScreenProps<'ChangePin'>;

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

export default function ChangePinScreen({ navigation }: Props) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);

    if (pin.length !== 4) {
      setError('New PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setError('New PIN and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await userApi.changePin({
        pin,
        confirmPin,
      });
      Alert.alert('Success', 'PIN changed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      setError(err?.message ?? 'Could not change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Change PIN" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Choose a new 4-digit PIN for quick login on this account.
        </Text>

        <GlassCard style={styles.card}>
          <PinField label="New PIN" value={pin} onChangeText={setPin} />
          <PinField label="Confirm new PIN" value={confirmPin} onChangeText={setConfirmPin} />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.navy} />
            ) : (
              <Text style={styles.submitText}>Update PIN</Text>
            )}
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
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    fontWeight: '600',
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy },
});
