/**
 * VAHAN Compliance card — mirrors web FleetDashboard ComplianceSection.
 * Breaks the fleet's document health into per-document bars (expired vs expiring vs compliant)
 * so customers can spot which RC documents need renewal before penalties hit.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { GlassCard } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { ComplianceSummary, ComplianceItem } from '../../../types/dashboard';
import {
  type ComplianceExpiryStatus,
  type RcListNavParams,
  buildRcListBlacklistNavParams,
  buildRcListNavParams,
} from '../../compliance/utils/complianceNavigationUtils';
import { dashboardHeader, dashboardContentFont, DASHBOARD_LIGHT_WHITE } from '../dashboardTypography';

const MAX_FONT_SCALE = 1.2;

interface ComplianceCardProps {
  compliance?: ComplianceSummary | null;
  onViewAll?: () => void;
  /** Drill into VAHAN RC list with expiry filters (web count-link parity). */
  onCompliancePress?: (params: RcListNavParams) => void;
}

// Same six VAHAN documents the web card tracks, in the same order.
const DOCS: {
  key: keyof Omit<ComplianceSummary, 'totalAlerts' | 'totalVehicles' | 'blacklistCount'>;
  label: string;
}[] = [
  { key: 'fitness', label: 'Fitness' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'pucc', label: 'PUCC' },
  { key: 'permit', label: 'Permit' },
  { key: 'tax', label: 'Tax' },
  { key: 'np', label: 'NP' },
];

function CountTap({
  count,
  tone,
  onPress,
  compact,
}: {
  count: number;
  tone: ComplianceExpiryStatus;
  onPress: () => void;
  compact?: boolean;
}) {
  const textStyle = compact ? styles.countTextCompact : styles.countText;
  if (count <= 0) {
    return <Text style={[textStyle, styles.countPlain]}>{count}</Text>;
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
      <Text style={[
        textStyle,
        styles.countTap,
        tone === 'expired' ? styles.countExpired : tone === 'expiring' ? styles.countExpiring : styles.countValid,
      ]}>
        {count}
      </Text>
    </TouchableOpacity>
  );
}

/** Single document row: red (expired) + amber (expiring 30d) + green (compliant) split bar. */
function DocBar({
  docKey,
  label,
  item,
  max,
  compact,
  onCompliancePress,
}: {
  docKey: string;
  label: string;
  item?: ComplianceItem;
  max: number;
  compact?: boolean;
  onCompliancePress?: (params: RcListNavParams) => void;
}) {
  const expired = item?.expired ?? 0;
  // API sends exp30 (legacy) and expiringSoon — both map to the 30-day window.
  const expiring30 = item?.exp30 ?? item?.expiringSoon ?? 0;
  const compliant = item?.valid ?? 0;
  const hasAlerts = expired > 0 || expiring30 > 0;

  const handlePress = (status: ComplianceExpiryStatus) => {
    onCompliancePress?.(buildRcListNavParams(docKey, status));
  };

  const expiredPct = max > 0 ? (expired / max) * 100 : 0;
  const expiringPct = max > 0 ? (expiring30 / max) * 100 : 0;
  const compliantPct = max > 0 ? (compliant / max) * 100 : 0;

  return (
    <View style={[styles.docRow, compact && styles.docRowCompact]}>
      <Text
        style={[styles.docLabel, compact && styles.docLabelCompact]}
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}>
        {label}
      </Text>
      <View style={[styles.track, compact && styles.trackCompact]}>
        {!hasAlerts ? (
          <View style={[styles.fill, styles.fillOk]} />
        ) : (
          <>
            <View style={[styles.fill, { width: `${expiredPct}%`, backgroundColor: Colors.danger }]} />
            <View style={[styles.fill, { width: `${expiringPct}%`, backgroundColor: Colors.warning }]} />
            {compliant > 0 ? (
              <View style={[styles.fill, { width: `${compliantPct}%`, backgroundColor: Colors.success }]} />
            ) : null}
          </>
        )}
      </View>
      <View style={[styles.countsWrap, compact && styles.countsWrapCompact]}>
        <CountTap count={expired} tone="expired" compact={compact} onPress={() => handlePress('expired')} />
        <Text style={[styles.countSep, compact && styles.countSepCompact]} maxFontSizeMultiplier={MAX_FONT_SCALE}>/</Text>
        <CountTap
          count={expiring30}
          tone="expiring"
          compact={compact}
          onPress={() => handlePress('expiring')}
        />
        <Text style={[styles.countSep, compact && styles.countSepCompact]} maxFontSizeMultiplier={MAX_FONT_SCALE}>/</Text>
        <CountTap count={compliant} tone="valid" compact={compact} onPress={() => handlePress('valid')} />
      </View>
    </View>
  );
}

/**
 * Same grid as Fitness/NP/PUCC: bar + blacklisted / 0 / clear.
 * Blacklist has no "expiring" window — middle slot stays 0 for column alignment.
 */
function BlacklistBar({
  blacklistCount,
  totalVehicles,
  compact,
  onCompliancePress,
}: {
  blacklistCount: number;
  totalVehicles: number;
  compact?: boolean;
  onCompliancePress?: (params: RcListNavParams) => void;
}) {
  const base = Math.max(0, totalVehicles);
  const flagged = Math.max(0, blacklistCount);
  const clearCount = Math.max(0, base - flagged);
  const flaggedPct = base > 0 ? (flagged / base) * 100 : 0;
  const clearPct = Math.max(0, 100 - flaggedPct);
  const hasFlagged = flagged > 0;

  return (
    <View style={[styles.docRow, compact && styles.docRowCompact]}>
      <Text
        style={[styles.docLabel, compact && styles.docLabelCompact]}
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
      >
        Black list
      </Text>
      <View style={[styles.track, compact && styles.trackCompact]}>
        {!hasFlagged ? (
          <View style={[styles.fill, styles.fillOk]} />
        ) : (
          <>
            <View style={[styles.fill, { width: `${flaggedPct}%`, backgroundColor: Colors.danger }]} />
            {clearCount > 0 ? (
              <View style={[styles.fill, { width: `${clearPct}%`, backgroundColor: Colors.success }]} />
            ) : null}
          </>
        )}
      </View>
      <View style={[styles.countsWrap, compact && styles.countsWrapCompact]}>
        <CountTap
          count={flagged}
          tone="expired"
          compact={compact}
          onPress={() => onCompliancePress?.(buildRcListBlacklistNavParams())}
        />
        <Text style={[styles.countSep, compact && styles.countSepCompact]} maxFontSizeMultiplier={MAX_FONT_SCALE}>/</Text>
        <Text
          style={[
            compact ? styles.countTextCompact : styles.countText,
            styles.countExpiring,
          ]}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          0
        </Text>
        <Text style={[styles.countSep, compact && styles.countSepCompact]} maxFontSizeMultiplier={MAX_FONT_SCALE}>/</Text>
        <Text
          style={[
            compact ? styles.countTextCompact : styles.countText,
            styles.countValid,
          ]}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {clearCount}
        </Text>
      </View>
    </View>
  );
}

function ComplianceCard({ compliance, onViewAll, onCompliancePress }: ComplianceCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  // Phones under ~400px need stacked header + flexible bars so labels/counts don't clip.
  const isNarrow = screenWidth < 400;
  const total = compliance?.totalAlerts ?? 0;
  const blacklistCount = compliance?.blacklistCount ?? 0;
  const totalVehicles = compliance?.totalVehicles ?? 0;
  const allClear = total === 0;

  // Scale bars to fleet size so compliant (green) segments are visible alongside alerts.
  const maxVal = DOCS.reduce((m, { key }) => {
    const item = compliance?.[key];
    const expired = item?.expired ?? 0;
    const expiring = item?.exp30 ?? item?.expiringSoon ?? 0;
    const valid = item?.valid ?? 0;
    return Math.max(m, expired + expiring + valid);
  }, totalVehicles);

  return (
    <GlassCard style={styles.card}>
      <View style={[
        styles.head,
        allClear ? styles.headClear : styles.headAlert,
      ]}>
        {/* Title always one line; Action Required sits on the line below */}
        <View style={styles.headMain}>
          <Text
            style={styles.headLabel}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}>
            Vahan Compliance
          </Text>
          <Text
            style={[styles.headValue, { color: allClear ? Colors.success : Colors.danger }]}
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            Action Required : {total}
          </Text>
        </View>
        <View style={styles.headActions}>
          {onViewAll ? (
            <TouchableOpacity style={styles.viewBtn} onPress={onViewAll} activeOpacity={0.85}>
              <Text style={styles.viewBtnText} maxFontSizeMultiplier={MAX_FONT_SCALE}>View</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={[styles.body, isNarrow && styles.bodyNarrow]}>
        {DOCS.map(({ key, label }) => (
          <DocBar
            key={key}
            docKey={key}
            label={label}
            item={compliance?.[key]}
            max={Math.max(maxVal, 1)}
            compact={isNarrow}
            onCompliancePress={onCompliancePress}
          />
        ))}
        {/* After NP — same bar + count columns as web BlacklistBar. */}
        <BlacklistBar
          blacklistCount={blacklistCount}
          totalVehicles={totalVehicles > 0 ? totalVehicles : Math.max(maxVal, 1)}
          compact={isNarrow}
          onCompliancePress={onCompliancePress}
        />
      </View>

      <View style={[styles.legend, isNarrow && styles.legendNarrow]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.danger }]} />
          <Text style={styles.legendText}>Expired</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
          <Text style={styles.legendText}>Expiring 30d</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.legendText}>Compliant</Text>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing[3], padding: 0, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: Spacing[4],
    borderBottomWidth: 1,
    gap: 10,
  },
  headClear: { borderBottomColor: Colors.successBorder, backgroundColor: Colors.successBg },
  headAlert: { borderBottomColor: Colors.dangerBorder, backgroundColor: Colors.dangerBg },
  headMain: { flex: 1, minWidth: 0, gap: 4 },
  // Never shrink the title mid-word — keep "Vahan Compliance" on one line
  headLabel: { ...dashboardHeader, flexShrink: 0 },
  headValue: { fontSize: FontSize.sm, fontWeight: '400' },
  headActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, paddingTop: 1 },
  viewBtn: { backgroundColor: Colors.blue, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.md },
  viewBtnText: { color: Colors.white, fontWeight: '700', fontSize: dashboardContentFont.sm },
  body: { padding: Spacing[4], gap: 9 },
  bodyNarrow: { paddingHorizontal: Spacing[3], gap: 8 },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docRowCompact: { gap: 6 },
  docLabel: {
    fontSize: dashboardContentFont.xs,
    color: DASHBOARD_LIGHT_WHITE,
    width: 64,
    flexShrink: 0,
    textAlign: 'right',
  },
  docLabelCompact: {
    width: 52,
    fontSize: 10,
  },
  // Flex track fills leftover space so small phones don't clip counts
  track: {
    flex: 1,
    minWidth: 72,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.glass.bgDark,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  trackCompact: {
    minWidth: 56,
    height: 5,
  },
  fill: { height: '100%' },
  fillOk: { width: '100%', backgroundColor: Colors.success, borderRadius: 3 },
  countsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 72,
    flexShrink: 0,
    gap: 1,
  },
  countsWrapCompact: {
    minWidth: 58,
  },
  // Doc counts stay regular so only "Vahan Compliance" is bold.
  countText: { fontSize: dashboardContentFont.xs, fontWeight: '400' },
  countTextCompact: { fontSize: 10, fontWeight: '400' },
  countPlain: { color: DASHBOARD_LIGHT_WHITE },
  countTap: {},
  countExpired: { color: Colors.dangerLight },
  countExpiring: { color: Colors.warningLight },
  countValid: { color: Colors.success },
  countSep: { fontSize: dashboardContentFont.xs, fontWeight: '400', color: DASHBOARD_LIGHT_WHITE },
  countSepCompact: { fontSize: 10 },
  legend: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 14,
    paddingHorizontal: Spacing[4], paddingBottom: Spacing[3], paddingTop: 2,
    borderTopWidth: 1, borderTopColor: Colors.glass.border,
  },
  legendNarrow: {
    paddingHorizontal: Spacing[3],
    gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 2 },
  legendText: { fontSize: dashboardContentFont.tiny, color: DASHBOARD_LIGHT_WHITE, fontWeight: '400' },
});

export default React.memo(ComplianceCard);
