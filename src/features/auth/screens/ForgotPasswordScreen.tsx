/**
 * Forgot Password — public account recovery, mirroring the web `/forgot-password`
 * page so both clients behave identically against the same backend route.
 *
 * Three steps are driven by a single endpoint (PUT /user/forgot-password):
 *   1. mobile number  → OTP_SENT
 *   2. 4-digit OTP    → OTP_VERIFIED (+ resetToken)
 *   3. new password + resetToken → PASSWORD_CHANGED
 *
 * The server issues a one-time `resetToken` after OTP proof; step 3 must send
 * that token with the new password (or resubmit OTP) before TTL expires.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../../../services/api/authApi';
import { getApiErrorMessage } from '../../../services/api/client';
import { ensureAuditGeoCoords } from '../../../utils/getClientGeoCoords';
import { LiquidBackground, GlassCard } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { AuthScreenProps } from '../../../navigation/types';

type Props = AuthScreenProps<'ForgotPassword'>;

const MOBILE_LENGTH = 10;
const OTP_LENGTH = 4;
const OTP_VALIDITY_MINUTES = 5;

// Mirrors the backend Joi password rule so the user sees the constraint before
// a round trip; the server still enforces it as the source of truth.
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,32}$/;
const PASSWORD_RULE_MESSAGE =
  'Password must be 8-32 characters with an uppercase letter, a lowercase letter, a number and a special character (@$!%*#?&).';

export default function ForgotPasswordScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const otpRefs = useRef<(TextInput | null)[]>([]);

  const [step, setStep] = useState(1);
  const [isLoading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Web parity: empty required fields show an inline hint rather than a banner.
  const [hasFieldError, setFieldError] = useState(false);

  const [mobileNo, setMobileNo] = useState('');
  // The number the server matched, used for steps 2 and 3 so a later edit to the
  // input field can never retarget an in-flight reset at a different account.
  const [submittedMobileNo, setSubmittedMobileNo] = useState('');

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(''));
  // Captured from OTP_VERIFIED and required on the password step — omitting it
  // triggers "OTP or reset token is required to set a new password".
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isNewPasswordVisible, setNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setConfirmPasswordVisible] = useState(false);

  useEffect(() => {
    // Warm GPS while the user fills the form — final reset must stamp Location
    void ensureAuditGeoCoords(12_000);
  }, []);

  /** Returns to step 1 keeping the mobile number, so "Resend" is one tap. */
  const restartFlow = () => {
    setStep(1);
    setOtp(Array(OTP_LENGTH).fill(''));
    // Stale tokens are invalid once a new OTP is requested — drop them here.
    setResetToken(null);
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setNotice('');
    setFieldError(false);
  };

  const handleBack = () => {
    if (step === 1) {
      navigation.goBack();
      return;
    }
    // A half-finished reset can't be resumed: verification is tied to the most
    // recent OTP, so going back means starting over with a fresh code.
    restartFlow();
  };

  const handleOtpChange = (value: string, index: number) => {
    // Digits only — a pasted or auto-filled string would otherwise fill a box
    // with a letter that the server rejects as an incorrect OTP.
    const digit = value.replace(/\D/g, '').slice(-1);
    const nextOtp = [...otp];
    nextOtp[index] = digit;
    setOtp(nextOtp);

    if (digit && index < OTP_LENGTH - 1) otpRefs.current[index + 1]?.focus();
    if (!digit && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleSendOtp = async () => {
    setError('');
    setNotice('');
    setFieldError(false);

    // Backend requires a 10-digit number starting 6-9; fail fast on length.
    if (mobileNo.length !== MOBILE_LENGTH) {
      setFieldError(true);
      return;
    }

    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword({ mobileNo });

      setSubmittedMobileNo(data.mobileNumber ?? mobileNo);
      setOtp(Array(OTP_LENGTH).fill(''));
      setNotice(data.message);
      setStep(2);
    } catch (err) {
      // Covers "User not found" and "Failed to send OTP" — both arrive as 400.
      setError(getApiErrorMessage(err, 'Error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const submittedOtp = otp.join('');

    if (submittedOtp.length !== OTP_LENGTH) {
      setError(`Enter valid ${OTP_LENGTH}-digit OTP`);
      return;
    }

    setError('');
    setNotice('');
    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword({
        mobileNo: submittedMobileNo,
        submittedOtp,
      });

      // Backend mints a single-use hex token after OTP proof; step 3 must echo it.
      if (data.resetToken) {
        setResetToken(data.resetToken);
      }
      setNotice(data.message);
      setStep(3);
    } catch (err) {
      // "Incorrect OTP" and "OTP has expired" are both 400 with a usable message.
      setError(getApiErrorMessage(err, 'Error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError('');
    setNotice('');
    setFieldError(false);

    if (!newPassword || !confirmPassword) {
      setFieldError(true);
      return;
    }

    if (!PASSWORD_PATTERN.test(newPassword)) {
      setError(PASSWORD_RULE_MESSAGE);
      return;
    }

    // Confirmation is client-side only; the API takes a single `password` field.
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Joi rejects password-only bodies; without a token the user never leaves step 3.
    if (!resetToken) {
      setError('Session expired. Please verify the OTP again.');
      return;
    }

    setLoading(true);
    try {
      // Ensure GPS is cached so the interceptor can stamp Login Session Location
      await ensureAuditGeoCoords(10_000);
      const { data } = await authApi.forgotPassword({
        mobileNo: submittedMobileNo,
        password: newPassword,
        resetToken,
      });

      // Reset does not create a session — the user must sign in with the new
      // password, so hand them straight back to Login.
      Alert.alert('Password updated', data.message, [
        // navigate (not replace) pops back to the Login already in the stack.
        { text: 'Sign In', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (err) {
      // 403 here means the token expired or a newer OTP invalidated this reset.
      setError(getApiErrorMessage(err, 'Error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const stepCopy = ({
    1: {
      title: 'Forgot your password?',
      subtitle: "Enter the mobile number linked to your account and we'll send you a secure verification code.",
    },
    2: {
      title: 'Enter verification code',
      subtitle: `We sent a ${OTP_LENGTH}-digit code to +91 ${submittedMobileNo}. Enter it below to continue.`,
    },
    3: {
      title: 'Set a new password',
      subtitle: "Choose a strong password you haven't used before on this account.",
    },
  } as const)[step as 1 | 2 | 3] ?? {
    title: 'Forgot your password?',
    subtitle: "Enter the mobile number linked to your account and we'll send you a secure verification code.",
  };

  const submitLabel = step === 1
    ? 'Send verification code'
    : step === 2 ? 'Verify code' : 'Reset password';

  const handleSubmit = step === 1
    ? handleSendOtp
    : step === 2 ? handleVerifyOtp : handleResetPassword;

  return (
    <LiquidBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>

          <Text style={styles.eyebrow}>ACCOUNT RECOVERY</Text>
          <Text style={styles.title}>{stepCopy.title}</Text>
          <Text style={styles.subtitle}>{stepCopy.subtitle}</Text>

          <View style={styles.progressRow}>
            {[1, 2, 3].map((index) => (
              <View
                key={index}
                style={[styles.progressBar, index <= step && styles.progressBarActive]}
              />
            ))}
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {notice && !error ? (
            <View style={styles.noticeBox}>
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <GlassCard>
            {step === 1 ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={styles.inputWrapper}>
                  <View style={styles.flagRow}>
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.dialCode}>+91</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter mobile number"
                    placeholderTextColor={Colors.text.subtle}
                    keyboardType="phone-pad"
                    returnKeyType="done"
                    maxLength={MOBILE_LENGTH}
                    value={mobileNo}
                    onChangeText={(text) => setMobileNo(text.replace(/\D/g, ''))}
                    onSubmitEditing={handleSendOtp}
                  />
                </View>
                {hasFieldError ? (
                  <Text style={styles.hint}>Please enter a valid 10-digit mobile number</Text>
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.label}>One-time password</Text>
                <View style={styles.otpRow}>
                  {otp.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(ref) => { otpRefs.current[index] = ref; }}
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      value={digit}
                      onChangeText={(text) => handleOtpChange(text, index)}
                      keyboardType="number-pad"
                      maxLength={1}
                      selectTextOnFocus
                    />
                  ))}
                </View>
                <TouchableOpacity style={styles.resendBtn} onPress={restartFlow} disabled={isLoading}>
                  <Text style={styles.resendText}>Didn't get it? Resend code</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Text style={styles.label}>New password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter new password"
                    placeholderTextColor={Colors.text.subtle}
                    secureTextEntry={!isNewPasswordVisible}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    importantForAutofill="no"
                    textContentType="none"
                  />
                  <TouchableOpacity
                    onPress={() => setNewPasswordVisible((visible) => !visible)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.eyeIcon}>{isNewPasswordVisible ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
                {hasFieldError && !newPassword ? (
                  <Text style={styles.hint}>Please enter a new password</Text>
                ) : null}

                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm new password"
                    placeholderTextColor={Colors.text.subtle}
                    secureTextEntry={!isConfirmPasswordVisible}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    returnKeyType="done"
                    onSubmitEditing={handleResetPassword}
                    importantForAutofill="no"
                    textContentType="none"
                  />
                  <TouchableOpacity
                    onPress={() => setConfirmPasswordVisible((visible) => !visible)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.eyeIcon}>{isConfirmPasswordVisible ? '🙈' : '👁'}</Text>
                  </TouchableOpacity>
                </View>
                {hasFieldError && !confirmPassword ? (
                  <Text style={styles.hint}>Please confirm your password</Text>
                ) : null}

                <Text style={styles.ruleText}>{PASSWORD_RULE_MESSAGE}</Text>
              </>
            ) : null}

            <TouchableOpacity
              style={[styles.cta, isLoading && styles.ctaDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color={Colors.navy} />
                : <Text style={styles.ctaText}>{submitLabel} →</Text>
              }
            </TouchableOpacity>
          </GlassCard>

          <Text style={styles.footNote}>
            {step === 3
              ? "🔒 You'll be asked to sign in once your password is updated"
              : `🔒 Verification codes expire in ${OTP_VALIDITY_MINUTES} minutes for your security`}
          </Text>

          <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.switchText}>Remembered it? Sign in instead</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  kav:           { flex: 1 },
  scroll:        { flexGrow: 1, paddingHorizontal: Spacing[5], justifyContent: 'center' },
  backBtn:       { width: 38, height: 38, backgroundColor: Colors.glass.bg, borderWidth: 1, borderColor: Colors.glass.border, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing[6] },
  backArrow:     { fontSize: 18, color: Colors.white },
  eyebrow:       { fontSize: FontSize.xs, color: Colors.infoLight, letterSpacing: 1.6, fontWeight: '700', marginBottom: Spacing[2] },
  title:         { fontSize: FontSize['3xl'], fontWeight: '800', color: Colors.white, marginBottom: Spacing[2] },
  subtitle:      { fontSize: FontSize.base, color: Colors.text.subtle, lineHeight: 22, marginBottom: Spacing[4] },
  progressRow:   { flexDirection: 'row', gap: 6, marginBottom: Spacing[4] },
  progressBar:   { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.glass.border },
  progressBarActive: { backgroundColor: Colors.yellow },
  errorBox:      { backgroundColor: Colors.dangerBg, borderRadius: Radius.md, padding: 10, marginBottom: Spacing[3] },
  errorText:     { color: Colors.dangerLight, fontSize: FontSize.sm, fontWeight: '500', lineHeight: 19 },
  noticeBox:     { backgroundColor: Colors.glass.bgMedium, borderRadius: Radius.md, padding: 10, marginBottom: Spacing[3] },
  noticeText:    { color: Colors.infoLight, fontSize: FontSize.sm, fontWeight: '500', lineHeight: 19 },
  label:         { fontSize: FontSize.sm, color: Colors.text.secondary, fontWeight: '600', marginBottom: 8 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.glass.bg, borderWidth: 1.5, borderColor: Colors.glass.border,
    borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12,
  },
  flagRow:       { flexDirection: 'row', alignItems: 'center', gap: 5, borderRightWidth: 1, borderRightColor: Colors.glass.border, paddingRight: 10 },
  flag:          { fontSize: 18 },
  dialCode:      { fontSize: FontSize.base, color: Colors.text.secondary, fontWeight: '500' },
  input:         { flex: 1, fontSize: FontSize.base, color: Colors.white, padding: 0 },
  inputIcon:     { fontSize: 15 },
  eyeIcon:       { fontSize: 16 },
  hint:          { color: Colors.dangerLight, fontSize: FontSize.sm, marginTop: -4, marginBottom: 10 },
  otpRow:        { flexDirection: 'row', gap: 10, marginBottom: Spacing[3] },
  otpBox:        { flex: 1, height: 56, backgroundColor: Colors.glass.bg, borderWidth: 1.5, borderColor: Colors.glass.border, borderRadius: Radius.lg, textAlign: 'center', fontSize: FontSize['3xl'], fontWeight: '700', color: Colors.white },
  otpBoxFilled:  { borderColor: Colors.glass.borderStrong },
  resendBtn:     { alignSelf: 'flex-start', marginBottom: Spacing[3] },
  resendText:    { color: Colors.infoLight, fontSize: FontSize.base, fontWeight: '600' },
  ruleText:      { fontSize: FontSize.xs, color: Colors.text.subtle, lineHeight: 17, marginBottom: Spacing[3] },
  cta:           { backgroundColor: Colors.yellow, borderRadius: Radius.lg, padding: Spacing[4], alignItems: 'center', marginTop: Spacing[2] },
  ctaDisabled:   { opacity: 0.6 },
  ctaText:       { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy, letterSpacing: 0.3 },
  footNote:      { textAlign: 'center', fontSize: FontSize.xs, color: Colors.text.subtle, lineHeight: 17, marginTop: Spacing[4] },
  switchBtn:     { alignSelf: 'center', marginTop: Spacing[3] },
  switchText:    { color: Colors.infoLight, fontSize: FontSize.base, fontWeight: '500' },
});
