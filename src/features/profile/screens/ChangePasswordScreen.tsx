/**
 * Change password — mirrors web /account/change-password for the logged-in user.
 */

import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { profileApi } from '../../../services/api/profileApi';
import { ensureAuditGeoCoords } from '../../../utils/getClientGeoCoords';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { MoreScreenProps } from '../../../navigation/types';

type Props = MoreScreenProps<'ChangePassword'>;

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={Colors.text.subtle}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={styles.eyeBtn}
          onPress={() => setVisible((open) => !open)}
          activeOpacity={0.85}
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.eyeText}>{visible ? '🙈' : '👁'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Required', 'Enter your current password.');
      return;
    }
    if (!newPassword.trim()) {
      Alert.alert('Required', 'Enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert('Invalid password', 'New password must be different from your current password.');
      return;
    }

    setLoading(true);
    try {
      // Refresh GPS cache so change-password audit gets X-Client-Latitude/Longitude
      await ensureAuditGeoCoords(10_000);
      await profileApi.changePassword({
        currentPassword: currentPassword.trim(),
        newPassword: newPassword.trim(),
      });
      Alert.alert('Success', 'Password changed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Could not change password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Change Password" showBack />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>
          Enter your current password and choose a new one. You will stay signed in after updating.
        </Text>

        <GlassCard style={styles.card}>
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
          />
          <PasswordField
            label="New password"
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Enter new password"
          />
          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={Colors.navy} />
            ) : (
              <Text style={styles.submitText}>Submit</Text>
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.glass.bgMedium,
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FontSize.base,
    color: Colors.white,
  },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13 },
  eyeText: { fontSize: 16 },
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
