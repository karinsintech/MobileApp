/**
 * PIN entry overlay — submits as soon as the 4th digit is entered (no Continue).
 * Errors and lockout messages render inside the card (MM-03).
 *
 * Not an RN <Modal>: Android Dialog windows often focus the field (caret blinks)
 * but never open the soft keyboard. This absolute overlay stays in the Activity
 * window so the number pad appears, while a transparent scrim keeps the login
 * background visible underneath.
 */

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Keyboard,
} from 'react-native';
import { Colors, FontSize, Radius, Spacing } from '../../../theme';

interface PinEntryModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  error?: string | null;
  isLoading?: boolean;
  /** When true, disable input/submit (client lockout). */
  locked?: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => void;
}

function PinEntryModalComponent({
  visible,
  title = 'Enter PIN',
  subtitle = 'Use your 4-digit account PIN',
  error = null,
  isLoading = false,
  locked = false,
  onCancel,
  onSubmit,
}: PinEntryModalProps) {
  const [pin, setPin] = useState('');
  const inputRef = useRef<TextInput>(null);
  // Prevents double-fire if onChangeText delivers 4 digits twice before loading flips.
  const submittedRef = useRef(false);
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  const focusPinInput = useCallback(() => {
    if (locked || isLoading) return;
    inputRef.current?.focus();
  }, [locked, isLoading]);

  useEffect(() => {
    if (!visible) {
      setPin('');
      submittedRef.current = false;
      return undefined;
    }

    // Same-window TextInput: focus after layout so the IME actually opens.
    const t = setTimeout(() => {
      focusPinInput();
    }, Platform.OS === 'android' ? 30 : 0);
    return () => clearTimeout(t);
  }, [visible, locked, focusPinInput]);

  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isLoading) onCancel();
      return true;
    });
    return () => sub.remove();
  }, [visible, isLoading, onCancel]);

  useEffect(() => {
    if (!error) return undefined;
    setPin('');
    submittedRef.current = false;
    const t = setTimeout(focusPinInput, 40);
    return () => clearTimeout(t);
  }, [error, focusPinInput]);

  const handleChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    setPin(digits);

    if (digits.length === 4 && !submittedRef.current) {
      submittedRef.current = true;
      Keyboard.dismiss();
      requestAnimationFrame(() => {
        onSubmitRef.current(digits);
      });
    }
  }, []);

  if (!visible) return null;

  const canEdit = !isLoading && !locked;

  return (
    <View
      style={styles.root}
      collapsable={false}
      accessibilityViewIsModal
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Transparent dim — login screen stays visible behind the PIN card. */}
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={isLoading ? undefined : onCancel}
          accessibilityLabel="Dismiss PIN entry"
        />

        <View style={styles.card} collapsable={false}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <TextInput
            ref={inputRef}
            style={[styles.input, error ? styles.inputError : null]}
            value={pin}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={4}
            secureTextEntry
            editable={canEdit}
            placeholder="••••"
            placeholderTextColor={Colors.text.subtle}
            autoFocus={canEdit}
            showSoftInputOnFocus
            blurOnSubmit={false}
            autoComplete="off"
            textContentType="oneTimeCode"
            importantForAutofill="no"
            caretHidden={false}
          />

          {isLoading ? (
            <ActivityIndicator color={Colors.yellow} style={styles.loading} />
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            disabled={isLoading}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

export const PinEntryModal = memo(PinEntryModalComponent);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  card: {
    backgroundColor: Colors.navy,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    padding: Spacing[5],
    gap: Spacing[3],
    zIndex: 1,
    elevation: 8,
  },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.white },
  subtitle: { fontSize: FontSize.sm, color: Colors.text.subtle, lineHeight: 20 },
  input: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: FontSize['2xl'],
    fontWeight: '700',
    color: Colors.white,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[4],
  },
  inputError: { borderColor: Colors.dangerBorder },
  loading: { marginTop: Spacing[1] },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    fontWeight: '600',
    lineHeight: 18,
  },
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: Colors.glass.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing[3],
    alignItems: 'center',
    marginTop: Spacing[2],
  },
  cancelText: { color: Colors.white, fontWeight: '600' },
});
