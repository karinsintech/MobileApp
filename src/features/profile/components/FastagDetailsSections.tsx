/**
 * Fastag tab — Customer Details + Balance Details.
 * Mirrors web UserProfile Fastag sections (Master Customer Fastag parity),
 * including live balance refresh via GET /user/customer-balance.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { GlassCard } from '../../../components';
import { RefreshIcon } from '../../../components/icons';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { fmtDateTime } from '../../../utils/format';
import type { CustomerProfileView } from '../utils/mapCustomerProfile';

interface Props {
  profile: CustomerProfileView;
  refreshingBalance: boolean;
  onRefreshBalance: () => void;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function DetailLine({ label, value, trailing }: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  // Two-column row: label left, value (+ refresh) right — same as web Fastag detail cells.
  return (
    <View style={styles.line}>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <View style={styles.valueRow}>
        <Text style={styles.value} numberOfLines={2} selectable>
          {value}
        </Text>
        {trailing ? <View style={styles.trailingSlot}>{trailing}</View> : null}
      </View>
    </View>
  );
}

export function FastagDetailsSections({
  profile,
  refreshingBalance,
  onRefreshBalance,
}: Props) {
  const statusLabel =
    profile.status === 1 ? 'ACTIVE' : profile.status === 0 ? 'INACTIVE' : '—';
  const customerTypeLabel =
    profile.customerType === 1
      ? 'INDIVIDUAL'
      : profile.customerType === 2
        ? 'CORPORATE'
        : '—';

  return (
    <>
      <Text style={styles.sectionLabel}>CUSTOMER DETAILS</Text>
      <GlassCard style={styles.card}>
        <DetailLine label="Customer Name" value={displayValue(profile.firstName)} />
        <View style={styles.divider} />
        <DetailLine label="Customer ID" value={displayValue(profile.yapEntityId)} />
        <View style={styles.divider} />
        <DetailLine label="Agent Name" value={displayValue(profile.agentName)} />
        <View style={styles.divider} />
        <DetailLine
          label="Registered Date"
          value={
            profile.yapRegisteredDate
              ? fmtDateTime(profile.yapRegisteredDate)
              : '—'
          }
        />
        <View style={styles.divider} />
        <DetailLine label="Status" value={statusLabel} />
        <View style={styles.divider} />
        <DetailLine label="Customer Type" value={customerTypeLabel} />
      </GlassCard>

      <Text style={styles.sectionLabel}>BALANCE DETAILS</Text>
      <GlassCard style={styles.card}>
        <DetailLine
          label="Minimum Balance"
          value={displayValue(profile.minimumBalance)}
        />
        <View style={styles.divider} />
        <DetailLine
          label="Balance"
          value={displayValue(profile.balance)}
          trailing={
            profile.yapEntityId ? (
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={onRefreshBalance}
                disabled={refreshingBalance}
                accessibilityLabel="Refresh balance"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {refreshingBalance ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <RefreshIcon size={18} color={Colors.white} />
                )}
              </TouchableOpacity>
            ) : null
          }
        />
        <View style={styles.divider} />
        <DetailLine
          label="Fund Transfer Threshold"
          value={displayValue(profile.autoFundThreshold)}
        />
        {profile.customerType === 2 ? (
          <>
            <View style={styles.divider} />
            <DetailLine
              label="Auto Fund Transfer"
              value={profile.autoFundTransfer === 1 ? 'YES' : 'NO'}
            />
          </>
        ) : null}
        <View style={styles.divider} />
        <DetailLine
          label="Last Updated"
          value={
            profile.balanceLastUpdatedAt
              ? fmtDateTime(profile.balanceLastUpdatedAt)
              : '—'
          }
        />
      </GlassCard>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: FontSize.base,
    fontWeight: '600',
    color: Colors.text.label,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
    paddingLeft: 2,
  },
  card: {
    marginBottom: Spacing[4],
    paddingVertical: 4,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 12,
    minHeight: 44,
  },
  // Fixed left column so labels line up; values sit in the right column.
  label: {
    width: 148,
    flexShrink: 0,
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.white,
  },
  valueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    minWidth: 0,
  },
  value: {
    flexShrink: 1,
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.white,
    textAlign: 'left',
  },
  trailingSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // High-contrast chip; icon centered inside so it sits level with the balance text.
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blue,
    borderWidth: 1,
    borderColor: Colors.blueBright,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.divider,
  },
});
