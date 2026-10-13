/**
 * Gates Vahan / eChallan / Sarathi screens for CUSTOMER and CUSTOMER_GROUP_ADMIN.
 * Staff and other roles pass through. Fail closed on API errors so locked
 * services never leak list data. Re-checks when CGA switches customer.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LiquidBackground } from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { authApi } from '../../../services/api/authApi';
import { useAppSelector } from '../../../store';
import {
  isCustomerGroupAdmin,
  type RoleKey,
} from '../../../types/auth';
import type { ServiceAccessKey } from '../../../types/serviceAccess';
import { getServiceLockCopy } from '../serviceAccessCopy';
import ServiceAccessLockedPanel from './ServiceAccessLockedPanel';

interface ServiceFeatureGateProps {
  serviceKey: ServiceAccessKey;
  /** Display name for loading copy; lock panel uses serviceAccessCopy labels. */
  serviceLabel?: string;
  /** When 'request', locked panel opens straight on the unlock form (profile CTA). */
  initialLockStep?: 'intro' | 'request';
  children: React.ReactNode;
}

function requiresServiceEnrollment(roleKey?: RoleKey): boolean {
  // Match web ServiceFeatureGate — only CUSTOMER and CGA follow enrollment flags.
  return roleKey === 'CUSTOMER' || isCustomerGroupAdmin(roleKey);
}

export default function ServiceFeatureGate({
  serviceKey,
  serviceLabel,
  initialLockStep = 'intro',
  children,
}: ServiceFeatureGateProps) {
  const roleKey = useAppSelector((s) => s.auth.user?.roleKey);
  // CGA switch refreshes session access — re-fetch when the active customer changes.
  const customerId = useAppSelector(
    (s) => s.auth.dashboardContext?.customerId ?? s.auth.user?.defaultCustomerId,
  );

  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileMobile, setProfileMobile] = useState('');
  const [profileEmail, setProfileEmail] = useState('');

  const label = serviceLabel?.trim() || getServiceLockCopy(serviceKey).serviceLabel;

  useEffect(() => {
    if (!requiresServiceEnrollment(roleKey)) {
      setHasAccess(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadAccess = async () => {
      setLoading(true);
      try {
        const { data } = await authApi.getServiceAccess();
        if (cancelled) return;
        setHasAccess(Boolean(data?.access?.[serviceKey]));
        setProfileName(String(data?.name || '').trim());
        setProfileMobile(String(data?.mobileNumber ?? '').trim());
        setProfileEmail(String(data?.emailId || '').trim());
      } catch {
        if (cancelled) return;
        // Fail closed — show lock rather than leaking enrollment-gated data.
        setHasAccess(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadAccess();
    return () => {
      cancelled = true;
    };
  }, [roleKey, serviceKey, customerId]);

  if (loading) {
    return (
      <LiquidBackground>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.yellow} />
          <Text style={styles.loadingText}>Checking {label} access…</Text>
        </View>
      </LiquidBackground>
    );
  }

  if (!hasAccess) {
    return (
      <ServiceAccessLockedPanel
        serviceKey={serviceKey}
        serviceLabel={label}
        initialName={profileName}
        initialMobile={profileMobile}
        initialEmail={profileEmail}
        initialStep={initialLockStep}
      />
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing[5],
  },
  loadingText: {
    marginTop: Spacing[3],
    fontSize: FontSize.base,
    color: Colors.white,
    textAlign: 'center',
  },
});
