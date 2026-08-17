/**
 * Toll Spend card — mirrors web FleetDashboard TollSpendCard.
 * Owns its own period selection (web keeps the toll period inside this card,
 * not at page level) and renders comparable per-period bars plus avg-per-txn.
 */

import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { formatINR } from '../../../utils/format';
import type { TollSpend, TollPeriod } from '../../../types/dashboard';
import { readTollSpendAmount, readTollSpendTxnCount } from '../utils/tollSpendUtils';
import { DEFAULT_DASHBOARD_TOLL_PERIOD } from '../constants/dashboardDefaults';
import { dashboardHeader, dashboardContentFont, DASHBOARD_LIGHT_WHITE } from '../dashboardTypography';

/** Cap display scaling so Accessibility Large Text does not blow fixed rows. */
const MAX_FONT_SCALE = 1.2;

interface TollSpendCardProps {
  tollSpend?: TollSpend | null;
  loading?: boolean;
  onViewAll?: (period: TollPeriod) => void;
}

// Same five buckets the web card exposes, in the same display order.
const PERIODS: { value: TollPeriod; short: string }[] = [
  { value: 'TODAY', short: 'Today' },
  { value: 'YESTERDAY', short: 'Yesterday' },
  { value: 'THIS_MONTH', short: 'This Month' },
  { value: 'LAST_QUARTER', short: 'Last QT' },
  { value: 'THIS_FY', short: 'This FY' },
];

function TollSpendCard({ tollSpend, loading, onViewAll }: TollSpendCardProps) {
  // Default to today so the card opens on the current day's spend.
  const [period, setPeriod] = useState<TollPeriod>(DEFAULT_DASHBOARD_TOLL_PERIOD);
  const { width: screenWidth } = useWindowDimensions();
  // Narrow phones need a shorter label column so the bar + amount stay aligned.
  const isCompact = screenWidth < 380;

  const selectedAmount = readTollSpendAmount(tollSpend, period);
  const selectedTxns = readTollSpendTxnCount(tollSpend, period);

  // Bars are scaled against the largest period so the tallest is always full width.
  const maxAmount = useMemo(
    () => Math.max(...PERIODS.map((p) => readTollSpendAmount(tollSpend, p.value)), 1),
    [tollSpend],
  );

  return (
    <GlassCard style={styles.card}>
      <View style={styles.accent} />

      <View style={styles.head}>
        <Text style={styles.headLabel} maxFontSizeMultiplier={MAX_FONT_SCALE}>Toll Spend</Text>
        {onViewAll ? (
          <TouchableOpacity onPress={() => onViewAll?.(period)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.viewAll} maxFontSizeMultiplier={MAX_FONT_SCALE}>View all →</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.heroRow}>
        <Text
          style={styles.heroValue}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {loading && !tollSpend ? '—' : formatINR(selectedAmount)}
        </Text>
        <Text style={styles.heroTxns} maxFontSizeMultiplier={MAX_FONT_SCALE}>
          {selectedTxns > 0 ? `${selectedTxns.toLocaleString('en-IN')} txns` : '0 txns'}
        </Text>
      </View>

      <View style={styles.periods}>
        {PERIODS.map((p) => {
          const amount = readTollSpendAmount(tollSpend, p.value);
          // Keep a sliver visible for non-zero amounts so small periods still register.
          const widthPct = maxAmount > 0 ? Math.max((amount / maxAmount) * 100, amount > 0 ? 4 : 0) : 0;
          const isActive = period === p.value;

          return (
            <TouchableOpacity
              key={p.value}
              style={styles.periodRow}
              onPress={() => setPeriod(p.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.periodLabel,
                  isCompact && styles.periodLabelCompact,
                  isActive && styles.periodLabelActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {p.short}
              </Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${widthPct}%` }, isActive && styles.fillActive]} />
              </View>
              <Text
                style={[
                  styles.periodAmount,
                  isCompact && styles.periodAmountCompact,
                  isActive && styles.periodAmountActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                maxFontSizeMultiplier={MAX_FONT_SCALE}
              >
                {amount > 0 ? formatINR(amount, true) : '—'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing[3], padding: Spacing[4], overflow: 'hidden' },
  accent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, backgroundColor: Colors.blue },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing[2], gap: 8 },
  headLabel: { ...dashboardHeader, flexShrink: 1 },
  viewAll: { fontSize: dashboardContentFont.xs, color: Colors.infoLight, fontWeight: '600', flexShrink: 0 },
  heroRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: Spacing[3], gap: 8 },
  // Spend figures stay regular so the "Toll Spend" heading remains the bold signal.
  heroValue: { flex: 1, minWidth: 0, fontSize: FontSize['3xl'], fontWeight: '400', color: Colors.blue, letterSpacing: -0.5 },
  heroTxns: { fontSize: dashboardContentFont.xs, fontWeight: '400', color: DASHBOARD_LIGHT_WHITE, flexShrink: 0 },
  periods: { gap: 8 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Wide enough for "This Month" / "Yesterday" — compact mode must not clip these.
  periodLabel: {
    fontSize: dashboardContentFont.xs,
    color: DASHBOARD_LIGHT_WHITE,
    width: 88,
    flexShrink: 0,
  },
  periodLabelCompact: { width: 82 },
  periodLabelActive: { color: Colors.infoLight, fontWeight: '400' },
  track: { flex: 1, minWidth: 28, height: 6, borderRadius: 3, backgroundColor: Colors.glass.bgDark, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: Colors.glass.borderStrong },
  fillActive: { backgroundColor: Colors.blue },
  periodAmount: {
    fontSize: dashboardContentFont.xs,
    color: DASHBOARD_LIGHT_WHITE,
    width: 64,
    textAlign: 'right',
    fontWeight: '400',
    flexShrink: 0,
  },
  periodAmountCompact: { width: 56 },
  periodAmountActive: { color: Colors.white, fontWeight: '400' },
});

export default React.memo(TollSpendCard);
