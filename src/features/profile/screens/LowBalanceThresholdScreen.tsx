/**
 * Low balance alert threshold — same walletAlertThreshold as web Settings.
 * Loaded and saved via /fleet-dashboard/user-preferences.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidBackground, GlassCard, ScreenHeader } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR } from '../../../utils/format';
import { resolveWalletTotalBalance } from '../../dashboard/utils/dashboardSummaryUtils';
import {
  evaluateWalletLowBalance,
  computeWalletAlertThreshold,
  resolveWalletAlertThreshold,
} from '../../../services/notifications/walletAlertUtils';
import {
  hydrateWalletAlertThresholdFromApi,
  persistWalletAlertThresholdToApi,
} from '../../../services/notifications/walletAlertPreferences';
import {
  clearDerivedPushCooldown,
  showDerivedFleetPush,
} from '../../../services/notifications/localFleetNotificationService';
import { isWalletAlertsEnabled } from '../../../services/notifications/notificationPreferences';
import { WALLET_THRESHOLD_MIN } from '../../../constants/walletThresholdConstants';
import { WalletThresholdSlider } from '../components/WalletThresholdSlider';
import { Cache } from '../../../services/storage/SecureStorage';
import type { DashboardSummary } from '../../../types/dashboard';
import { useAppSelector } from '../../../store';
import { resolveActiveCustomerId } from '../../../types/auth';
import type { MoreScreenProps } from '../../../navigation/types';

type Props = MoreScreenProps<'LowBalanceThreshold'>;

function buildDashboardCacheKey(userId?: number, customerId?: number): string {
  return `dashboard_snapshot:${userId ?? 'anon'}:${customerId ?? 'self'}`;
}

export default function LowBalanceThresholdScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);

  const [threshold, setThreshold] = useState(WALLET_THRESHOLD_MIN);
  const [minimumBalance, setMinimumBalance] = useState(0);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  // Once the user moves the slider, ignore late customerId hydration reloads
  // that would replace their value with the default (looks like Save failed).
  const hasEditedRef = useRef(false);
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;

  const defaultThreshold = computeWalletAlertThreshold(minimumBalance);

  const handleThresholdChange = useCallback((next: number) => {
    hasEditedRef.current = true;
    setThreshold(next);
  }, []);

  const loadSettings = useCallback(async () => {
    const cached = Cache.getJSON<DashboardSummary>(
      buildDashboardCacheKey(user?.userId, customerId),
    );
    const minBal = cached?.wallet?.minimumBalance ?? 0;

    setMinimumBalance(minBal);
    setCurrentBalance(
      cached?.wallet ? resolveWalletTotalBalance(cached.wallet) : null,
    );

    // Web GET /fleet-dashboard/user-preferences is the source of truth.
    await hydrateWalletAlertThresholdFromApi(user?.userId, customerId);

    if (hasEditedRef.current) {
      setLoading(false);
      return;
    }

    setThreshold(
      resolveWalletAlertThreshold(minBal, {
        userId: user?.userId,
        customerId,
      }),
    );
    setLoading(false);
  }, [user?.userId, customerId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { saved, synced } = await persistWalletAlertThresholdToApi(
        thresholdRef.current,
        user?.userId,
        customerId,
      );

      const cached = Cache.getJSON<DashboardSummary>(
        buildDashboardCacheKey(user?.userId, customerId),
      );
      const walletAlert = evaluateWalletLowBalance(cached?.wallet, {
        userId: user?.userId,
        customerId,
      });

      if (walletAlert.isLow && isWalletAlertsEnabled()) {
        clearDerivedPushCooldown('dash-wallet');
        const title = walletAlert.isEmpty
          ? 'FASTag wallet empty — recharge immediately to avoid toll failures'
          : `Wallet below alert limit (${formatINR(saved)}) — recharge to avoid toll failures`;

        showDerivedFleetPush({
          id: 'dash-wallet',
          category: 'low_wallet',
          title,
          body: `Total balance ${formatINR(walletAlert.totalBalance)} · Alert ${formatINR(saved)}`,
          createdAt: new Date().toISOString(),
          read: false,
        }).catch(() => undefined);
      }

      Alert.alert(
        synced ? 'Saved' : 'Saved on this device',
        synced
          ? `You will be alerted when your wallet balance drops below ${formatINR(saved)}. Same limit as the web portal.`
          : `Could not reach the server. The limit ${formatINR(saved)} is stored on this phone until the next successful save.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <LiquidBackground>
      <ScreenHeader title="Low Balance Alert" showBack />
      <ScrollView
        scrollEnabled={!isDraggingSlider}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
      >
        <GlassCard style={styles.card}>
          <Text style={styles.title}>Low balance threshold</Text>
          <Text style={styles.subtitle}>
            Same limit as web Settings. Default is operator minimum × 1.5. Saving updates the web portal too.
          </Text>

          {loading ? (
            <ActivityIndicator color={Colors.yellow} style={styles.loader} />
          ) : (
            <>
              {currentBalance != null ? (
                <View style={styles.balancePill}>
                  <Text style={styles.balanceLabel}>Current wallet balance</Text>
                  <Text style={styles.balanceValue}>{formatINR(currentBalance)}</Text>
                </View>
              ) : null}

              <WalletThresholdSlider
                value={threshold}
                onChange={handleThresholdChange}
                onDragStateChange={setIsDraggingSlider}
                minimumBalance={minimumBalance}
                defaultThreshold={defaultThreshold}
              />

              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.7 }]}
                onPress={() => { void handleSave(); }}
                disabled={saving}
                activeOpacity={0.85}
              >
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save threshold'}</Text>
              </TouchableOpacity>
            </>
          )}
        </GlassCard>
      </ScrollView>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2] },
  card: { padding: Spacing[4] },
  title: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.white, marginBottom: 8 },
  subtitle: { fontSize: FontSize.sm, color: Colors.text.subtle, lineHeight: 20, marginBottom: Spacing[4] },
  balancePill: {
    backgroundColor: Colors.infoBg,
    borderWidth: 1,
    borderColor: Colors.infoBorder,
    borderRadius: Radius.lg,
    padding: Spacing[3],
    marginBottom: Spacing[4],
    alignItems: 'center',
  },
  balanceLabel: { fontSize: FontSize.xs, color: Colors.infoLight, fontWeight: '600', marginBottom: 4 },
  balanceValue: { fontSize: FontSize.xl, fontWeight: '800', color: Colors.white },
  saveBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    alignItems: 'center',
  },
  saveText: { fontSize: FontSize.lg, fontWeight: '800', color: Colors.navy },
  loader: { marginVertical: Spacing[6] },
});
