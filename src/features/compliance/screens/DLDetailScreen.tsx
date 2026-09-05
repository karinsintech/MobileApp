/**
 * SARATHI licence detail — mirrors the web DrivingLicense eye-icon modal:
 * licence summary, endorsement, validity periods and COV table.
 * Biometric photo is never rendered (DPDP Restricted — stripped client-side).
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { complianceApi } from '../../../services/api/complianceApi';
import {
  LiquidBackground, GlassCard, SkeletonCard, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { fmtDate } from '../../../utils/format';
import { maskDlNumber, redactRedPii } from '../../../utils/piiProtection';
import { useAppSelector } from '../../../store';
import { resolveDriverFullName } from '../utils/driverNameUtils';
import { sanitizeDlPayload } from '../utils/sanitizeDlPayload';
import type { DLDetailPayload } from '../types/dlDetail';

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <View style={styles.tableHead}>
      {cols.map((col) => (
        <Text key={col} style={styles.tableHeadCell}>{col}</Text>
      ))}
    </View>
  );
}

export default function DLDetailScreen({ route }: any) {
  const dlId: number = route.params.dlId;
  const passedDetail: DLDetailPayload | undefined = route.params.detail;
  const passedDriverName: string | undefined = route.params.driverName;
  const { user } = useAppSelector((s) => s.auth);

  // Sanitize any detail that arrived via navigation so biometrics never sit in state.
  const [detail, setDetail] = useState<DLDetailPayload | null>(
    passedDetail ? sanitizeDlPayload(passedDetail) : null,
  );
  const [loading, setLoading] = useState(!passedDetail);
  const [error, setError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await complianceApi.getDLById(dlId);
      const payload = (data as any)?.result ?? data;
      if (payload && typeof payload === 'object') setDetail(sanitizeDlPayload(payload));
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [dlId]);

  useEffect(() => {
    if (!passedDetail) fetchData();
  }, [fetchData, passedDetail]);

  const lic = detail?.licenseDetails;
  const driverFullName = resolveDriverFullName(detail, passedDriverName);
  const displayDlNo = redactRedPii(lic?.dlLicno, user?.roleKey, maskDlNumber);

  return (
    <LiquidBackground>
      <ScreenHeader title="Driving License Details" showBack />

      {loading ? (
        <View style={styles.loadingWrap}>
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : error || !detail ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Could not load licence details.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <GlassCard style={styles.card}>
            <SectionTitle title="License Details" />
            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <DetailRow label="DL Status" value={lic?.dlStatus} />
                <DetailRow label="DL No" value={displayDlNo} />
                <DetailRow label="Driver Full Name" value={driverFullName} />
                <DetailRow label="Issue Date" value={fmtDate(lic?.dlIssuedt)} />
                <DetailRow
                  label="Issuing Office"
                  value={lic?.omRtoFullname || lic?.olaName}
                />
              </View>
            </View>
          </GlassCard>

          <GlassCard style={styles.card}>
            <SectionTitle title="Endorsement & Transaction Details" />
            <TableHeader cols={['Endorsed Date', 'Endorsed Office', 'Last Transaction']} />
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>{fmtDate(lic?.dlEndorsedt)}</Text>
              <Text style={styles.tableCell}>{lic?.dlEndorseAuth || '—'}</Text>
              <Text style={styles.tableCell}>{detail.serviceHistory?.[0]?.trName || '—'}</Text>
            </View>
          </GlassCard>

          <GlassCard style={styles.card}>
            <SectionTitle title="Validity Periods" />
            <TableHeader cols={['Type', 'From Date', 'To Date']} />
            {[
              { type: 'No Transport', from: lic?.dlNtValdfrDt, to: lic?.dlNtValdtoDt },
              { type: 'Transport', from: lic?.dlTrValdfrDt, to: lic?.dlTrValdtoDt },
              { type: 'Hazardous', from: lic?.dlHzValdfrDt, to: lic?.dlHzValdtoDt },
              { type: 'Hills', from: lic?.dlHlValdfrDt, to: lic?.dlHlValdtoDt },
            ].map((row) => (
              <View key={row.type} style={styles.tableRow}>
                <Text style={styles.tableCell}>{row.type}</Text>
                <Text style={styles.tableCell}>{fmtDate(row.from)}</Text>
                <Text style={styles.tableCell}>{fmtDate(row.to)}</Text>
              </View>
            ))}
          </GlassCard>

          {detail.authorizedVehicles && detail.authorizedVehicles.length > 0 ? (
            <GlassCard style={styles.card}>
              <SectionTitle title="Class of Vehicle (COV)" />
              <TableHeader cols={['Category', 'Class of Vehicles', 'Issued Date']} />
              {detail.authorizedVehicles.map((vehicle, idx) => (
                <View key={`${vehicle.vecatg}-${idx}`} style={styles.tableRow}>
                  <Text style={styles.tableCell}>{vehicle.vecatg || '—'}</Text>
                  <Text style={styles.tableCell}>{vehicle.covdesc || '—'}</Text>
                  <Text style={styles.tableCell}>
                    {fmtDate(vehicle.dcIssuedt || vehicle.covIssuedt)}
                  </Text>
                </View>
              ))}
            </GlassCard>
          ) : null}
        </ScrollView>
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing[4], gap: 10, paddingBottom: 32 },
  loadingWrap: { padding: Spacing[4], gap: 8 },
  errorWrap: { padding: Spacing[4], alignItems: 'center', gap: 12 },
  errorText: { color: Colors.dangerLight, fontSize: FontSize.base },
  retryBtn: {
    backgroundColor: Colors.blue,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  retryText: { color: Colors.white, fontWeight: '700' },
  card: { padding: Spacing[4] },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.infoLight,
    marginBottom: Spacing[3],
  },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCol: { flex: 1, gap: 8 },
  detailRow: { gap: 2 },
  detailLabel: { fontSize: FontSize.xs, color: Colors.text.label, fontWeight: '600' },
  detailValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  tableHead: {
    flexDirection: 'row',
    backgroundColor: Colors.blue,
    borderRadius: Radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  tableHeadCell: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.white,
    fontWeight: '600',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tableCell: {
    flex: 1,
    fontSize: FontSize.xs,
    color: Colors.text.secondary,
    textAlign: 'center',
  },
});
