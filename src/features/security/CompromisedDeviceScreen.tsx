/**
 * Full-screen stop when BLOCK_ON_ROOT trips on a rooted/jailbroken device.
 * No navigation escape — the session must not be usable on this handset.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontFamily, FontSize, Spacing } from '../../theme';

type Props = {
  reasons?: string[];
};

export function CompromisedDeviceScreen({ reasons = [] }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.brandKarins}>Karins</Text>
      <Text style={styles.brandFleet}>fleet</Text>
      <Text style={styles.title}>Device not permitted</Text>
      <Text style={styles.body}>
        This device appears rooted, jailbroken, or otherwise compromised. Karins Fleet
        cannot run here because financial and fleet data would not be protected.
      </Text>
      {reasons.length > 0 ? (
        <View style={styles.reasonBox}>
          {reasons.map((reason) => (
            <Text key={reason} style={styles.reason}>
              • {reason}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.footer}>
        Use an unmodified device, or contact your fleet administrator.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.navy,
    paddingHorizontal: Spacing[6],
    justifyContent: 'center',
  },
  brandKarins: {
    fontFamily: FontFamily.logo,
    fontSize: 36,
    color: Colors.white,
    letterSpacing: -0.3,
  },
  brandFleet: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.white,
    marginBottom: Spacing[6],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    color: Colors.white,
    marginBottom: Spacing[3],
  },
  body: {
    fontSize: FontSize.base,
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 22,
    marginBottom: Spacing[5],
  },
  reasonBox: {
    backgroundColor: Colors.dangerBg,
    borderRadius: 12,
    padding: Spacing[4],
    marginBottom: Spacing[5],
    gap: 6,
  },
  reason: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    lineHeight: 18,
  },
  footer: {
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    lineHeight: 18,
  },
});
