/**
 * Claims card — mirrors web FleetDashboard ClaimsSection.
 * Shows the claim pipeline as a donut + legend; tapping a status opens Claims
 * with that chip pre-selected so the list is already filtered.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { GlassCard } from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR } from '../../../utils/format';
import type { ClaimsSummary } from '../../../types/dashboard';
import type { ClaimFilter } from '../../claims/claimStatus';
import { dashboardHeader, dashboardSubheading, dashboardContentFont, DASHBOARD_LIGHT_WHITE } from '../dashboardTypography';

/** Dashboard legend keys that can deep-link into Claims status chips. */
export type ClaimsCardFilterKey =
  | 'approved'
  | 'pending'
  | 'waitingForDoc'
  | 'rejected'
  | 'expired';

interface ClaimsCardProps {
  claims?: ClaimsSummary | null;
  onViewAll?: () => void;
  /** Opens Claims with the matching status chip (Approved / Waiting Docs / …). */
  onFilter?: (filter: ClaimFilter) => void;
}

// Same pipeline stages/colors the web claims card uses.
const LEGENDS: {
  key: ClaimsCardFilterKey;
  label: string;
  color: string;
  /** Claims list chip selected when this legend row is tapped. */
  claimFilter: ClaimFilter;
}[] = [
  { key: 'approved', label: 'Approved', color: Colors.success, claimFilter: 'APPROVED' },
  { key: 'pending', label: 'Pending', color: Colors.blue, claimFilter: 'PENDING' },
  { key: 'waitingForDoc', label: 'Waiting Docs', color: Colors.warning, claimFilter: 'WAITING_FOR_DOC' },
  { key: 'rejected', label: 'Rejected', color: Colors.danger, claimFilter: 'REJECTED' },
  { key: 'expired', label: 'Expired', color: Colors.text.subtle, claimFilter: 'EXPIRED' },
];

// SVG donut geometry — consistent with the Fleet / Driver dashboard rings.
const DONUT_SIZE = 92;
const DONUT_RADIUS = 30;
const DONUT_STROKE = 8;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

/**
 * Renders the claim pipeline (approved/pending/waiting/rejected/expired) as a
 * coloured donut. Each arc is proportional to its share of the total claims so
 * the dominant stage is visible at a glance, matching the Fleet/Driver charts.
 */
function ClaimsDonut({ claims, total }: { claims?: ClaimsSummary | null; total: number }) {
  // Guard against divide-by-zero when there are no claims yet.
  const safeTotal = total || 1;
  let accumulated = 0;

  return (
    <View style={styles.donutWrap}>
      <Svg viewBox="0 0 100 100" width={DONUT_SIZE} height={DONUT_SIZE}>
        {/* Base ring backs the coloured segments and fills empty gaps. */}
        <Circle
          cx={50}
          cy={50}
          r={DONUT_RADIUS}
          fill="none"
          stroke={Colors.glass.border}
          strokeWidth={DONUT_STROKE}
        />
        {total > 0
          ? LEGENDS.map((leg) => {
            const value = (claims?.[leg.key] as number) ?? 0;
            const dash = (value / safeTotal) * DONUT_CIRCUMFERENCE;
            // Quarter-turn offset starts the first arc at 12 o'clock.
            const offset = DONUT_CIRCUMFERENCE / 4 - accumulated;
            accumulated += dash;
            // Skip zero-value stages so they don't draw a stray dot.
            if (dash <= 0) return null;

            return (
              <Circle
                key={leg.key}
                cx={50}
                cy={50}
                r={DONUT_RADIUS}
                fill="none"
                stroke={leg.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${dash} ${DONUT_CIRCUMFERENCE - dash}`}
                strokeDashoffset={offset}
                strokeLinecap="butt"
              />
            );
          })
          : null}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{total}</Text>
        <Text style={styles.donutLabel}>Claims</Text>
      </View>
    </View>
  );
}

function ClaimsCard({ claims, onViewAll, onFilter }: ClaimsCardProps) {
  const approved = claims?.approved ?? 0;
  const waitingForDoc = claims?.waitingForDoc ?? 0;
  const recovered = claims?.recoveredFY ?? 0;

  // Donut total is the sum of the five pipeline stages so the segments and the
  // centre count always agree (the API `total` may include other buckets).
  const pipelineTotal = LEGENDS.reduce((sum, leg) => sum + ((claims?.[leg.key] as number) ?? 0), 0);

  const handleFilter = (claimFilter: ClaimFilter) => {
    if (onFilter) onFilter(claimFilter);
    else onViewAll?.();
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headMain}>
          <Text style={styles.headLabel}>Claims</Text>
          <View style={styles.headStat}>
            <TouchableOpacity
              onPress={() => handleFilter('APPROVED')}
              disabled={!onFilter && !onViewAll}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.headValue, { color: Colors.success }]}>
                Approved : {approved}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleFilter('WAITING_FOR_DOC')}
              disabled={!onFilter && !onViewAll}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.headValue, { color: Colors.warning }]}>
                Waiting for Docs : {waitingForDoc}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.headRight}>
          {onViewAll ? (
            <TouchableOpacity style={styles.viewBtn} onPress={onViewAll} activeOpacity={0.85}>
              <Text style={styles.viewBtnText}>View</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.chartRow}>
          <ClaimsDonut claims={claims} total={pipelineTotal} />

          <View style={styles.legendCol}>
            {LEGENDS.map((leg) => {
              const value = (claims?.[leg.key] as number) ?? 0;
              const pct = pipelineTotal > 0 ? Math.round((value / pipelineTotal) * 100) : 0;
              const canTap = Boolean(onFilter || onViewAll) && value > 0;

              return (
                <View key={leg.key} style={styles.legendRow}>
                  <View style={styles.legendLeft}>
                    <View style={[styles.dot, { backgroundColor: leg.color }]} />
                    <Text style={styles.legendLabel} numberOfLines={1}>
                      {leg.label}
                    </Text>
                  </View>
                  <View style={styles.legendRight}>
                    {canTap ? (
                      <TouchableOpacity
                        onPress={() => handleFilter(leg.claimFilter)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.legendValueTap, { color: leg.color }]}>{value}</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.legendValue, { color: leg.color }]}>{value}</Text>
                    )}
                    <Text style={styles.legendPct}>{pipelineTotal > 0 ? `${pct}%` : '—'}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* FY recovery is the emotional payoff — only show when money was won back. */}
        {recovered > 0 ? (
          <View style={styles.recoveredRow}>
            <Text style={styles.recoveredLabel}>Claim Recovered This FY</Text>
            <Text style={styles.recoveredValue}>{formatINR(recovered, true)}</Text>
          </View>
        ) : null}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing[3], padding: 0, overflow: 'hidden' },
  head: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing[4], borderBottomWidth: 1, borderBottomColor: Colors.successBorder, backgroundColor: Colors.successBg,
  },
  headMain: { flex: 1, minWidth: 0, gap: 4 },
  headLabel: { ...dashboardHeader },
  headStat: { flexDirection: 'column', alignItems: 'flex-start', gap: 6, paddingRight: 8 },
  headValue: { ...dashboardSubheading, fontWeight: '400', flexShrink: 1 },
  headSub: { ...dashboardSubheading },
  headRight: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rejectedBadge: { backgroundColor: Colors.dangerBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.sm },
  rejectedText: { fontSize: dashboardContentFont.xs, color: Colors.dangerLight, fontWeight: '400' },
  viewBtn: {
    backgroundColor: Colors.blue,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  viewBtnText: { color: Colors.white, fontWeight: '700', fontSize: dashboardContentFont.sm },
  body: { padding: Spacing[4], gap: 12 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  donutWrap: {
    width: DONUT_SIZE, height: DONUT_SIZE, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  // Overlay the total/label centred on the SVG ring without affecting layout.
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Claim counts/amounts stay regular under the bold card heading.
  donutValue: { fontSize: FontSize.xl, fontWeight: '400', color: Colors.white },
  donutLabel: { fontSize: dashboardContentFont.micro, fontWeight: '400', color: DASHBOARD_LIGHT_WHITE, letterSpacing: 0.5 },
  legendCol: { flex: 1, minWidth: 0, gap: 7 },
  legendRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 2, flexShrink: 0 },
  legendLabel: { fontSize: dashboardContentFont.xs, color: DASHBOARD_LIGHT_WHITE, flexShrink: 1 },
  legendRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  legendValue: { fontSize: dashboardContentFont.sm, fontWeight: '400' },
  legendValueTap: { fontSize: dashboardContentFont.sm, fontWeight: '400', textDecorationLine: 'none' },
  legendPct: { fontSize: dashboardContentFont.xs, color: DASHBOARD_LIGHT_WHITE, minWidth: 28, textAlign: 'right' },
  recoveredRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, padding: 10, backgroundColor: Colors.successBg, borderWidth: 1, borderColor: Colors.successBorder, borderRadius: Radius.md,
  },
  recoveredLabel: { fontSize: dashboardContentFont.xs, fontWeight: '400', color: Colors.successLight, letterSpacing: 0.5 },
  recoveredValue: { fontSize: FontSize.lg, fontWeight: '400', color: Colors.success },
});

export default React.memo(ClaimsCard);
