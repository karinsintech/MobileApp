/**
 * Vahan / eChallan / Sarathi profile tab body — enrollment Active|Inactive.
 * When Inactive, shows a Request Access card that opens the gated service screen.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { GlassCard } from '../../../components';
import { ArrowRightIcon } from '../../../components/icons';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';

export type EnrollmentStatus = 'Active' | 'Inactive';

interface ServiceEnrollmentStatusProps {
  serviceLabel: string;
  status?: EnrollmentStatus;
  loading?: boolean;
  error?: boolean;
  /** Opens the locked service flow so the customer can submit an unlock request. */
  onRequestAccess?: () => void;
}

export default function ServiceEnrollmentStatus({
  serviceLabel,
  status = 'Inactive',
  loading = false,
  error = false,
  onRequestAccess,
}: ServiceEnrollmentStatusProps) {
  const isActive = status === 'Active';
  const showRequestAccess =
    !loading && !error && !isActive && typeof onRequestAccess === 'function';

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>{serviceLabel} Service</Text>

      {loading ? (
        <ActivityIndicator color={Colors.blue} style={styles.spinner} />
      ) : error ? (
        <Text style={styles.errorText}>
          Unable to load service status. Please try again later.
        </Text>
      ) : (
        <>
          {/* Keep label + status adjacent (web profile-service-status-row parity). */}
          <View style={styles.row}>
            <Text style={styles.label}>Enrollment Status:</Text>
            <Text
              style={[
                styles.statusValue,
                isActive ? styles.statusActive : styles.statusInactive,
              ]}
            >
              {status}
            </Text>
          </View>

          {showRequestAccess ? (
            <View style={styles.requestBlock}>
              <Text style={styles.requestDesc}>
                {serviceLabel} is not enabled for your account. Submit a request
                and our support team will enable it after verification.
              </Text>
              <TouchableOpacity
                style={styles.requestBtn}
                onPress={onRequestAccess}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Request Access"
              >
                <Text style={styles.requestBtnText}>Request Access</Text>
                <ArrowRightIcon size={16} color={Colors.navy} />
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing[3],
    padding: Spacing[4],
    gap: Spacing[3],
  },
  title: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    display: 'flex',
    justifyContent: 'center',
    textAlign: 'center',
    alignItems: 'center',
  },
  spinner: { alignSelf: 'flex-start', marginTop: 4 },
  errorText: {
    fontSize: FontSize.sm,
    color: Colors.dangerLight,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: {
    fontSize: FontSize.base,
    color: Colors.white,
    fontWeight: '500',
  },
  statusValue: {
    fontSize: FontSize.base,
    fontWeight: '700',
  },
  statusActive: {
    color: Colors.successLight,
  },
  // High-contrast Inactive — muted greys disappear on the glass card.
  statusInactive: {
    color: Colors.yellow,
  },
  requestBlock: {
    gap: Spacing[3],
    paddingTop: Spacing[1],
  },
  requestDesc: {
    fontSize: FontSize.sm,
    color: Colors.white,
    lineHeight: 20,
    opacity: 0.9,
  },
  requestBtn: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.yellow,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  requestBtnText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.navy,
  },
});
