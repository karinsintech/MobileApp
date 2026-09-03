import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../../store';
import { signIn, signInWithPin, clearError } from '../../../store/slices/authSlice';
import { LiquidBackground, GlassCard } from '../../../components';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '../../../theme';
import type { AuthScreenProps } from '../../../navigation/types';
import { SecureStorage } from '../../../services/storage/SecureStorage';
import { assertPinLoginMobile } from '../../../services/auth/pinAuthService';
import {
  assertPinAttemptAllowed,
  getPinLockRemainingMs,
} from '../../../services/auth/pinAttemptGuard';
import { PinEntryModal } from '../../profile/components/PinEntryModal';

type Props = AuthScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((s) => s.auth);

  const [mobileNo, setMobileNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  // Masked hint only — never pre-fill the full account identifier (MM-07).
  const [pinMobileHint, setPinMobileHint] = useState<string | null>(null);
  const [pinLoginReady, setPinLoginReady] = useState(false);
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const refreshPinIdentity = useCallback(() => {
    const enabled = SecureStorage.isPinLoginEnabled() && SecureStorage.hasPinLoginIdentity();
    setPinLoginReady(enabled);
    setPinMobileHint(enabled ? SecureStorage.getPinLoginMobileHint() : null);
  }, []);

  useEffect(() => {
    refreshPinIdentity();
  }, [refreshPinIdentity]);

  const handleSignIn = async () => {
    if (!mobileNo.trim() || !password.trim()) {
      Alert.alert('Required', 'Enter your mobile number and password.');
      return;
    }

    const result = await dispatch(signIn({
      username: mobileNo.trim(),
      password,
    }));

    if (!signIn.fulfilled.match(result)) {
      // Prefer rejectWithValue string; then RTK error message; never show a blank alert.
      const message =
        (typeof result.payload === 'string' && result.payload.trim())
        || (typeof result.error?.message === 'string' && result.error.message.trim())
        || 'Unable to sign in. Please try again.';
      Alert.alert('Sign in failed', message);
      return;
    }
  };

  const handleOpenPinLogin = () => {
    dispatch(clearError());
    setPinModalError(null);
    const trimmedMobile = mobileNo.trim();
    const mobileError = assertPinLoginMobile(trimmedMobile);
    if (mobileError) {
      Alert.alert(
        'Mobile required',
        pinMobileHint
          ? `Enter the full 10-digit number for +91 ${pinMobileHint}, then sign in with PIN.`
          : mobileError,
      );
      return;
    }

    const lockError = assertPinAttemptAllowed(trimmedMobile);
    if (lockError) setPinModalError(lockError);
    setShowPinModal(true);
  };

  const handlePinSignIn = async (pin: string) => {
    setPinModalError(null);
    const result = await dispatch(signInWithPin({
      mobileNumber: mobileNo.trim(),
      pin,
    }));

    if (signInWithPin.fulfilled.match(result)) {
      setShowPinModal(false);
      setPinModalError(null);
      return;
    }

    const message =
      (typeof result.payload === 'string' && result.payload.trim())
      || 'Incorrect PIN. Try again.';
    setPinModalError(message);
  };

  return (
    <LiquidBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
        <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

          <View style={styles.logoBlock}>
            <View style={styles.brandRow}>
              <Text style={styles.brandKarins}>Karins</Text>
              <Text style={styles.brandFleet}>fleet</Text>
            </View>
            <Text style={styles.brandTag}>FLEET INTELLIGENCE PLATFORM</Text>
          </View>

          <GlassCard style={styles.formCard}>
            <Text style={styles.heading}>Sign In</Text>
            <Text style={styles.subheading}>Access your fleet command center</Text>

            {/* {pinLoginReady && pinMobileHint ? (
              <Text style={styles.pinHint}>
                PIN login saved for +91 {pinMobileHint} — enter the full number below
              </Text>
            ) : null} */}

            <View style={styles.inputWrapper}>
              <View style={styles.flagRow}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.dialCode}>+91</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Mobile number"
                placeholderTextColor={Colors.text.subtle}
                keyboardType="phone-pad"
                returnKeyType="next"
                maxLength={10}
                value={mobileNo}
                onChangeText={(t) => { setMobileNo(t); dispatch(clearError()); }}
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            <View style={[styles.inputWrapper, styles.inputFocused]}>
              <Text style={styles.inputIcon}>🔒</Text>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={Colors.text.subtle}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                value={password}
                onChangeText={(t) => { setPassword(t); dispatch(clearError()); }}
                importantForAutofill="no"
                textContentType="none"
              />
              <TouchableOpacity onPress={() => setShowPass((v) => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.forgotBtn} onPress={() => navigation.navigate('ForgotPassword')}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ctaBtn, isLoading && styles.ctaBtnDisabled]}
              onPress={handleSignIn}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              {isLoading
                ? <ActivityIndicator color={Colors.navy} />
                : <Text style={styles.ctaText}>SignIn →</Text>
              }
            </TouchableOpacity>

            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>or</Text>
              <View style={styles.orLine} />
            </View>

            <TouchableOpacity
              style={[styles.pinBtn, isLoading && styles.ctaBtnDisabled]}
              onPress={handleOpenPinLogin}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <Text style={styles.pinIcon}>🔢</Text>
              <Text style={styles.pinText}>Sign in with PIN</Text>
            </TouchableOpacity>
          </GlassCard>

          <TouchableOpacity
            style={styles.demoLink}
            onPress={() => navigation.navigate('RequestDemo')}
          >
            <Text style={styles.demoLinkText}>
              Not a customer yet? <Text style={styles.demoLinkAccent}>Request a demo</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <PinEntryModal
        visible={showPinModal}
        subtitle={
          pinMobileHint
            ? `Enter the 4-digit PIN for +91 ${pinMobileHint}`
            : `Enter the 4-digit PIN for +91 ${mobileNo.trim() || 'your mobile'}`
        }
        error={pinModalError}
        isLoading={isLoading}
        locked={getPinLockRemainingMs(mobileNo.trim()) > 0}
        onCancel={() => {
          setShowPinModal(false);
          setPinModalError(null);
        }}
        onSubmit={handlePinSignIn}
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  kav:          { flex: 1 },
  container:    { flex: 1, paddingHorizontal: Spacing[5], justifyContent: 'center' },
  logoBlock:    { alignItems: 'center', marginBottom: Spacing[8] },
  brandRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 },
  brandKarins: { fontFamily: FontFamily.logo, fontSize: 40, color: Colors.white, letterSpacing: -0.3, lineHeight: 42 },
  brandFleet: { fontSize: 20, fontWeight: '600', color: Colors.white, marginLeft: 10, marginBottom: 2 },
  brandTag: { fontSize: FontSize.xs, color: Colors.white, letterSpacing: 1.8, marginTop: 2, fontWeight: '600' },
  formCard:     { marginBottom: Spacing[5] },
  heading:      { fontSize: FontSize['3xl'], fontWeight: '800', color: Colors.white, marginBottom: 4 },
  subheading:   { fontSize: FontSize.base, color: 'rgba(255,255,255,0.88)', marginBottom: Spacing[5] },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: Colors.glass.bg, borderWidth: 1.5, borderColor: Colors.glass.border,
    borderRadius: Radius.lg, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12,
  },
  inputFocused: { borderColor: 'rgba(0,113,197,0.55)', shadowColor: 'rgba(0,113,197,0.2)', shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 1 },
  flagRow:      { flexDirection: 'row', alignItems: 'center', gap: 5, borderRightWidth: 1, borderRightColor: Colors.glass.border, paddingRight: 10 },
  flag:         { fontSize: 18 },
  dialCode:     { fontSize: FontSize.base, color: Colors.text.secondary, fontWeight: '500' },
  input:        { fontSize: FontSize.base, color: Colors.white, flex: 1 },
  inputIcon:    { fontSize: 15, marginRight: 2 },
  eyeIcon:      { fontSize: 16 },
  errorBox:     { backgroundColor: Colors.dangerBg, borderRadius: Radius.md, padding: 10, marginBottom: 10 },
  errorText:    { color: Colors.dangerLight, fontSize: FontSize.sm, fontWeight: '500' },
  forgotBtn:    { alignSelf: 'flex-end', marginBottom: Spacing[5] },
  forgotText:   { color: Colors.infoLight, fontSize: FontSize.base, fontWeight: '500' },
  ctaBtn:       { backgroundColor: Colors.yellow, borderRadius: Radius.lg, padding: Spacing[4], alignItems: 'center', shadowColor: 'rgba(255,193,7,0.4)', shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, shadowOpacity: 1 },
  ctaBtnDisabled:{ opacity: 0.6 },
  ctaText:      { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy, letterSpacing: 0.3 },
  orRow:        { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing[4], gap: 12 },
  orLine:       { flex: 1, height: 1, backgroundColor: Colors.divider },
  orText:       { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.80)', fontWeight: '600' },
  pinBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.lg, padding: Spacing[4],
    backgroundColor: Colors.glass.bg,
  },
  pinIcon: { fontSize: 20 },
  pinText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
  pinHint: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.82)',
    marginBottom: Spacing[3],
    lineHeight: 18,
  },
  securityNote: { textAlign: 'center', fontSize: FontSize.xs, color: 'rgba(255,255,255,0.78)', letterSpacing: 0.5, marginTop: Spacing[4] },
  demoLink:     { alignSelf: 'center', marginTop: Spacing[4] },
  demoLinkText: { fontSize: FontSize.base, color: Colors.text.subtle, fontWeight: '500' },
  demoLinkAccent: { color: Colors.infoLight, fontWeight: '700' },
});
