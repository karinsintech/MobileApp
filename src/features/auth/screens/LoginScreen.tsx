/**
 * Sign-in screen — password is the primary method; PIN and Fingerprint are
 * alternate methods after a prior session on this device.
 *
 * PIN opens a PIN-only popup and sends the remembered mobile with the PIN to
 * the backend. Fingerprint opens the OS biometric sheet immediately (no mobile).
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppDispatch, useAppSelector } from '../../../store';
import {
  signIn,
  signInWithPin,
  signInWithBiometric,
  clearError,
} from '../../../store/slices/authSlice';
import { LiquidBackground, GlassCard } from '../../../components';
import { Colors, FontFamily, FontSize, Spacing, Radius } from '../../../theme';
import type { AuthScreenProps } from '../../../navigation/types';
import { SecureStorage } from '../../../services/storage/SecureStorage';
import {
  resolvePinLoginMobile,
} from '../../../services/auth/pinAuthService';
import {
  canShowBiometricLoginButton,
  getBiometricLoginLabel,
  isBiometricLoginEnabled,
} from '../../../services/auth/biometricLoginService';
import {
  assertPinAttemptAllowed,
  getPinLockRemainingMs,
} from '../../../services/auth/pinAttemptGuard';
import {
  attachLoginLocationAppStateListener,
  ensureLoginLocationReady,
} from '../../../utils/getClientGeoCoords';
import { PinEntryModal } from '../../profile/components/PinEntryModal';

type Props = AuthScreenProps<'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { isLoading, error } = useAppSelector((s) => s.auth);

  const [mobileNo, setMobileNo] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showBiometricButton, setShowBiometricButton] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalError, setPinModalError] = useState<string | null>(null);
  const [pinModalLoading, setPinModalLoading] = useState(false);
  // Held for the open modal session so submit does not re-read storage mid-flight.
  const pinMobileRef = useRef<string | null>(null);
  const mobileRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const biometricLabel = getBiometricLoginLabel();

  // Hint is stable for the Login visit — avoid MMKV reads on every keystroke re-render.
  const pinMobileHint = useMemo(
    () => (SecureStorage.hasPinLoginIdentity()
      ? SecureStorage.getPinLoginMobileHint()
      : null),
    [],
  );

  const refreshBiometricButton = useCallback(() => {
    void canShowBiometricLoginButton().then(setShowBiometricButton);
  }, []);

  useEffect(() => {
    refreshBiometricButton();
  }, [refreshBiometricButton]);

  useEffect(() => {
    void ensureLoginLocationReady();
    return attachLoginLocationAppStateListener();
  }, []);

  const closePinModal = useCallback(() => {
    setPinModalVisible(false);
    setPinModalError(null);
    setPinModalLoading(false);
    pinMobileRef.current = null;
  }, []);

  /**
   * Opens PIN-only popup — mobile comes from process memory / last login, not the form.
   * Modal paints first; bcrypt mobile-bind check runs on the next tick so the
   * press handler does not freeze the UI for 100–300ms.
   */
  const handleOpenPinLogin = useCallback(() => {
    // Profile → Security toggle must be ON before PIN login is offered.
    if (!SecureStorage.isPinLoginEnabled()) {
      Alert.alert(
        'PIN Login',
        'PIN login is not enabled in settings. Enable it first in Profile → Security.',
      );
      return;
    }

    // Blur login fields so PIN can take the IME — avoid Keyboard.dismiss()
    // here; it can cancel the PIN focus that runs on the next frame.
    mobileRef.current?.blur();
    passwordRef.current?.blur();

    // Show the sheet on this tap — identity resolve runs after paint.
    pinMobileRef.current = null;
    setPinModalError(null);
    setPinModalVisible(true);

    setTimeout(() => {
      dispatch(clearError());

      const rememberedMobile = resolvePinLoginMobile();
      if (!rememberedMobile) {
        setPinModalVisible(false);
        Alert.alert(
          'PIN Login',
          pinMobileHint
            ? `Sign in once with password for +91 ${pinMobileHint}, then PIN login will be available.`
            : 'Sign in once with your mobile number and password, then enable PIN login in Profile → Security.',
        );
        return;
      }

      const lockError = assertPinAttemptAllowed(rememberedMobile);
      if (lockError) {
        setPinModalVisible(false);
        Alert.alert('PIN Login', lockError);
        return;
      }

      pinMobileRef.current = rememberedMobile;
    }, 0);
  }, [dispatch, pinMobileHint]);

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
      const message =
        (typeof result.payload === 'string' && result.payload.trim())
        || (typeof result.error?.message === 'string' && result.error.message.trim())
        || 'Unable to sign in. Please try again.';
      Alert.alert('Sign in failed', message);
      return;
    }
  };

  const handlePinModalSubmit = useCallback(async (pin: string) => {
    const trimmedMobile = pinMobileRef.current?.trim() ?? '';
    setPinModalError(null);

    if (!trimmedMobile || trimmedMobile.length !== 10) {
      setPinModalError('PIN login is not ready. Close and try again.');
      return;
    }

    const lockError = assertPinAttemptAllowed(trimmedMobile);
    if (lockError) {
      setPinModalError(lockError);
      return;
    }

    if (!/^\d{4}$/.test(pin.trim())) {
      setPinModalError('Enter your 4-digit PIN.');
      return;
    }

    setPinModalLoading(true);
    const result = await dispatch(signInWithPin({
      mobileNumber: trimmedMobile,
      pin: pin.trim(),
    }));
    setPinModalLoading(false);

    if (signInWithPin.fulfilled.match(result)) {
      closePinModal();
      return;
    }

    const message =
      (typeof result.payload === 'string' && result.payload.trim())
      || 'Incorrect PIN. Try again.';
    setPinModalError(message);
  }, [closePinModal, dispatch]);

  /** No mobile number — OS fingerprint / Face ID sheet opens immediately. */
  const handleBiometricSignIn = async () => {
    dispatch(clearError());
    // Profile → Security toggle must be ON before Fingerprint unlock is allowed.
    if (!isBiometricLoginEnabled()) {
      Alert.alert(
        biometricLabel,
        `${biometricLabel} is not enabled in settings. Enable it first in Profile → Security.`,
      );
      return;
    }
    const result = await dispatch(signInWithBiometric());
    if (signInWithBiometric.fulfilled.match(result)) {
      return;
    }
    const message =
      (typeof result.payload === 'string' && result.payload.trim())
      || `${biometricLabel} sign-in failed. Try password or PIN.`;
    Alert.alert(`${biometricLabel} sign-in`, message);
    refreshBiometricButton();
  };

  // Only when the modal is open — avoid MMKV lockout reads on password typing.
  const pinLocked = pinModalVisible
    && getPinLockRemainingMs(pinMobileRef.current?.trim() ?? '') > 0;

  return (
    <LiquidBackground>
      {/* Host gives the PIN overlay a real box to absolute-fill above the login UI. */}
      <View style={styles.screenHost} collapsable={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
          // Block login inputs while PIN is open so they cannot steal the IME.
          pointerEvents={pinModalVisible ? 'none' : 'auto'}
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

              <View style={styles.inputWrapper}>
                <View style={styles.flagRow}>
                  <Text style={styles.flag}>🇮🇳</Text>
                  <Text style={styles.dialCode}>+91</Text>
                </View>
                <TextInput
                  ref={mobileRef}
                  style={styles.input}
                  placeholder="Mobile number"
                  placeholderTextColor={Colors.text.subtle}
                  keyboardType="phone-pad"
                  returnKeyType="next"
                  maxLength={10}
                  value={mobileNo}
                  blurOnSubmit={false}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, '').slice(0, 10);
                    setMobileNo(digits);
                    dispatch(clearError());
                    if (digits.length === 10) {
                      passwordRef.current?.focus();
                    }
                  }}
                  onSubmitEditing={() => {
                    passwordRef.current?.focus();
                  }}
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
                onPress={() => { void handleSignIn(); }}
                disabled={isLoading || pinModalVisible}
                activeOpacity={0.85}
              >
                {isLoading && !pinModalVisible
                  ? <ActivityIndicator color={Colors.navy} />
                  : <Text style={styles.ctaText}>SignIn →</Text>}
              </TouchableOpacity>

              <View style={styles.orRow}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>or</Text>
                <View style={styles.orLine} />
              </View>

              <TouchableOpacity
                style={[styles.altBtn, isLoading && styles.ctaBtnDisabled]}
                onPress={handleOpenPinLogin}
                disabled={isLoading || pinModalVisible}
                activeOpacity={0.85}
                accessibilityLabel="Sign in with PIN"
              >
                <Text style={styles.altIcon}>🔢</Text>
                <Text style={styles.altText}>Sign in with PIN</Text>
              </TouchableOpacity>

              {showBiometricButton ? (
                <TouchableOpacity
                  style={[styles.altBtn, styles.altBtnSpaced, styles.biometricBtn, isLoading && styles.ctaBtnDisabled]}
                  onPress={() => { void handleBiometricSignIn(); }}
                  disabled={isLoading || pinModalVisible}
                  activeOpacity={0.85}
                  accessibilityLabel={`Sign in with ${biometricLabel}`}
                >
                  <Text style={styles.altIcon}>
                    {biometricLabel === 'Face Lock' ? '😊' : '👆'}
                  </Text>
                  <Text style={styles.altText}>Sign in with {biometricLabel}</Text>
                </TouchableOpacity>
              ) : null}
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

        {/* Absolute overlay (not RN Modal) — on top + transparent bg + working keyboard. */}
        <PinEntryModal
          visible={pinModalVisible}
          title="Sign in with PIN"
          subtitle="Enter your 4-digit PIN"
          error={pinModalError}
          isLoading={pinModalLoading}
          locked={pinLocked}
          onCancel={closePinModal}
          onSubmit={handlePinModalSubmit}
        />
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  screenHost:   { flex: 1 },
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
  orRow:        { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing[4], gap: 12 },
  orLine:       { flex: 1, height: 1, backgroundColor: Colors.divider },
  orText:       { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.80)', fontWeight: '600' },
  altBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    borderWidth: 1.5, borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.lg, padding: Spacing[4],
    backgroundColor: Colors.glass.bg,
  },
  altBtnSpaced: { marginTop: 12 },
  biometricBtn: {
    borderColor: 'rgba(0,113,197,0.65)',
    backgroundColor: 'rgba(0,113,197,0.22)',
  },
  altIcon: { fontSize: 20 },
  altText: { fontSize: FontSize.base, fontWeight: '700', color: Colors.white },
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
  demoLink:     { alignSelf: 'center', marginTop: Spacing[4] },
  demoLinkText: { fontSize: FontSize.base, color: Colors.text.subtle, fontWeight: '500' },
  demoLinkAccent: { color: Colors.infoLight, fontWeight: '700' },
});
