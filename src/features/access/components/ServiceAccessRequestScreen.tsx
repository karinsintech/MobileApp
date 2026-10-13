/**
 * Request Access form screen — opened from the lock intro CTA.
 * Submits /auth/service-unlock-request (same payload as web).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidBackground, ScreenHeader } from '../../../components';
import { InfoIcon } from '../../../components/icons';
import { Colors, FontSize, FontFamily, Spacing, Radius } from '../../../theme';
import { authApi } from '../../../services/api/authApi';
import { SecureStorage } from '../../../services/storage/SecureStorage';
import { useAppSelector } from '../../../store';
import type { ServiceLockCopy } from '../serviceAccessCopy';

const MESSAGE_MAX = 500;

interface ServiceAccessRequestScreenProps {
  copy: ServiceLockCopy;
  initialName?: string;
  initialMobile?: string;
  initialEmail?: string;
  onBack: () => void;
}

function normalizeMobile(raw?: string | number | null): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(-10);
}

function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ServiceAccessRequestScreen({
  copy,
  initialName = '',
  initialMobile = '',
  initialEmail = '',
  onBack,
}: ServiceAccessRequestScreenProps) {
  const insets = useSafeAreaInsets();
  const customerName = useAppSelector((s) => s.auth.user?.customerName ?? '');

  const accountName = useMemo(() => {
    const fromApi = String(initialName || '').trim();
    const fromSession = String(customerName || '').trim();
    return fromApi || fromSession || '';
  }, [customerName, initialName]);

  const [name, setName] = useState(accountName);
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState(copy.defaultMessage);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [focusedField, setFocusedField] = useState<
    'name' | 'mobile' | 'email' | 'message' | null
  >(null);

  useEffect(() => {
    setName(accountName);
    const apiMobile = normalizeMobile(initialMobile);
    const loginMobile = normalizeMobile(SecureStorage.getLastLoginMobile());
    const candidate = isValidMobile(apiMobile) ? apiMobile : loginMobile;
    setMobile(isValidMobile(candidate) ? candidate : '');
    setEmail(String(initialEmail || '').trim());
    setMessage(copy.defaultMessage);
    setSubmitted(false);
  }, [accountName, copy.defaultMessage, initialEmail, initialMobile]);

  const handleSubmit = async () => {
    const contactName = name.trim();
    if (!contactName) {
      Alert.alert('Name required', 'Please enter your account or company name.');
      return;
    }

    const normalizedMobile = normalizeMobile(mobile);
    if (!isValidMobile(normalizedMobile)) {
      Alert.alert('Invalid mobile', 'Enter a valid 10-digit mobile number.');
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    const noteParts = [message.trim() || copy.defaultMessage];
    if (trimmedEmail) {
      noteParts.push(`Email: ${trimmedEmail}`);
    }
    const note = noteParts.join('\n\n');

    setSubmitting(true);
    try {
      const { data } = await authApi.submitServiceUnlockRequest({
        serviceName: copy.serviceLabel,
        name: contactName,
        mobileNumber: normalizedMobile,
        message: note,
      });

      if (!data?.enquiryId) {
        Alert.alert('Request failed', 'Request could not be saved. Please try again.');
        return;
      }

      setSubmitted(true);
    } catch {
      Alert.alert('Request failed', 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Request Access" showBack onBack={onBack} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: 24 + Math.max(insets.bottom, 12) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {submitted ? (
            <View style={styles.successCard}>
              <Text style={styles.successTitle}>Request submitted</Text>
              <Text style={styles.successDesc}>{copy.successDesc}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={onBack} activeOpacity={0.85}>
                <Text style={styles.secondaryBtnText}>Back to service</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{copy.formTitle}</Text>
              {/* <Text style={styles.formSub}>{copy.formSub}</Text> */}

              <Text style={styles.fieldLabel}>NAME</Text>
              <TextInput
                style={[styles.input, focusedField === 'name' && styles.inputFocused]}
                value={name}
                onChangeText={setName}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="Enter account name"
                placeholderTextColor={Colors.input.placeholder}
                autoCapitalize="words"
              />

              <Text style={styles.fieldLabel}>MOBILE NUMBER</Text>
              <View
                style={[
                  styles.mobileRow,
                  focusedField === 'mobile' && styles.inputFocused,
                ]}
              >
                <View style={styles.mobileCode}>
                  <Text style={styles.mobileCodeText}>+91</Text>
                </View>
                <TextInput
                  style={styles.mobileInput}
                  value={mobile}
                  onChangeText={(text) => setMobile(normalizeMobile(text))}
                  onFocus={() => setFocusedField('mobile')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="10-digit mobile"
                  placeholderTextColor={Colors.input.placeholder}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
              </View>

              <Text style={styles.fieldLabel}>EMAIL ID (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, focusedField === 'email' && styles.inputFocused]}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                placeholder="contact@company.com"
                placeholderTextColor={Colors.input.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.fieldLabel}>MESSAGE</Text>
              <View style={styles.messageWrap}>
                <TextInput
                  style={[
                    styles.input,
                    styles.textArea,
                    focusedField === 'message' && styles.inputFocused,
                  ]}
                  value={message}
                  onChangeText={(text) => setMessage(text.slice(0, MESSAGE_MAX))}
                  onFocus={() => setFocusedField('message')}
                  onBlur={() => setFocusedField(null)}
                  placeholder={copy.defaultMessage}
                  placeholderTextColor={Colors.input.placeholder}
                  multiline
                  maxLength={MESSAGE_MAX}
                />
                <Text style={styles.charCount}>
                  {message.length} / {MESSAGE_MAX}
                </Text>
              </View>

              <View style={styles.infoNote}>
                <Text style={styles.infoNoteText}>{copy.requestInfoNote}</Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.88}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.primaryBtnText}>Submit Request</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing[4],
    gap: Spacing[3],
  },
  formCard: {
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    padding: Spacing[4],
  },
  formTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 4,
  },
  formSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    lineHeight: 18,
    marginBottom: Spacing[4],
  },
  fieldLabel: {
    fontFamily: FontFamily.medium,
    fontSize: 10,
    fontWeight: '600',
    color: Colors.text.muted,
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: Spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.bg.d1,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 11,
    color: Colors.white,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
  },
  inputFocused: { borderColor: Colors.blueBright },
  mobileRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.bg.d1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  mobileCode: {
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.glass.border,
    backgroundColor: Colors.bg.d2,
  },
  mobileCodeText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  mobileInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 11,
    color: Colors.white,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
  },
  messageWrap: { position: 'relative' },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingBottom: 28,
  },
  charCount: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    fontFamily: FontFamily.regular,
    fontSize: 10,
    color: Colors.text.muted,
  },
  infoNote: {
    marginTop: Spacing[3],
  },
  infoNoteText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    lineHeight: 20,
    color: Colors.text.secondary,
  },
  primaryBtn: {
    marginTop: Spacing[3],
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
  successCard: {
    backgroundColor: Colors.successBg,
    borderWidth: 1,
    borderColor: Colors.successBorder,
    borderRadius: Radius.md,
    padding: Spacing[5],
    alignItems: 'center',
    gap: Spacing[2],
  },
  successTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.white,
  },
  successDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  secondaryBtn: {
    marginTop: Spacing[2],
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.link,
  },
});
