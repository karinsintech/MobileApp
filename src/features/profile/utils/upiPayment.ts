/**
 * Opens a UPI collect/pay screen in GPay, PhonePe, or any installed UPI app.
 * Amount is omitted so the user enters it in the payment app.
 */

import { Alert, Linking } from 'react-native';

export function openUpiPayment(upiId: string, upiUrl?: string, payeeName?: string) {
  const handle = upiId.trim();
  if (!handle) return;

  const stored = upiUrl?.trim() ?? '';
  const payUrl = /^upi:/i.test(stored)
    ? stored
    : `upi://pay?pa=${encodeURIComponent(handle)}&pn=${encodeURIComponent(payeeName?.trim() || 'Karins FASTag')}&cu=INR`;

  Linking.openURL(payUrl).catch(() => {
    Alert.alert(
      'UPI app not found',
      'Install Google Pay or PhonePe to pay this UPI ID.',
    );
  });
}
