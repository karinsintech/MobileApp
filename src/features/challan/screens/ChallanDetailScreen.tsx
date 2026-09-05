/**
 * e-Challan detail — mirrors web EchallanContainer view modal (Challan Summary + Offence Details).
 * List rows pass the full payload; no separate fetch is required.
 */

import React, { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import {
  LiquidBackground, GlassCard, StatusPill, ScreenHeader,
} from '../../../components';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { formatINR, fmtDateTime } from '../../../utils/format';
import { requiresAdminContextPicker } from '../../../types/auth';
import { maskDlNumber, redactRedPii } from '../../../utils/piiProtection';
import { useAppSelector } from '../../../store';
import type { MoreStackParamList } from '../../../navigation/types';
import type { ChallanOffenceRow } from '../types/challanDetail';
import ChallanPaymentCheckoutModal from '../components/ChallanPaymentCheckoutModal';
import { canPayChallan, hasChallanReceipt } from '../utils/challanPaymentRules';
import { checkChallanStatus, openChallanReceipt } from '../utils/challanPaymentAlerts';
import { useChallanPaymentFlow } from '../hooks/useChallanPaymentFlow';

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable numberOfLines={4}>
        {value?.toString().trim() ? value : '—'}
      </Text>
    </View>
  );
}

function Section({ title, rows }: { title: string; rows: [string, string | undefined | null][] }) {
  return (
    <GlassCard style={styles.section} noPadding>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>
        {rows.map(([label, value], i) => (
          <DetailRow key={`${label}-${i}`} label={label} value={value} />
        ))}
      </View>
    </GlassCard>
  );
}

function formatAmount(value?: string | number | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? formatINR(parsed) : String(value);
}

function OffenceCard({ row, index }: { row: ChallanOffenceRow; index: number }) {
  return (
    <GlassCard style={styles.offenceCard}>
      <Text style={styles.offenceIndex}>#{index + 1}</Text>
      <DetailRow label="Act" value={row.act} />
      <DetailRow label="Offence" value={row.offenceName} />
    </GlassCard>
  );
}

export default function ChallanDetailScreen() {
  const route = useRoute<RouteProp<MoreStackParamList, 'ChallanDetail'>>();
  const challan = route.params?.challan;
  const title = challan?.challanNo ?? route.params?.challanNo ?? 'Challan';
  const { user } = useAppSelector((s) => s.auth);
  const showCustomerName = requiresAdminContextPicker(user?.roleKey);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const {
    loadingPayButton,
    checkout,
    startPayment,
    handlePaymentEvent,
    handleClosePayment,
  } = useChallanPaymentFlow();

  if (!challan) {
    return (
      <LiquidBackground>
        <ScreenHeader title={title} showBack />
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Challan details are not available.</Text>
        </View>
      </LiquidBackground>
    );
  }

  const statusLabel = challan.challanStatus?.trim() || 'Unknown';
  const statusVariant = statusLabel.toLowerCase() === 'disposed'
    ? 'success'
    : statusLabel.toLowerCase() === 'pending'
      ? 'danger'
      : 'neutral';

  const summaryRows: [string, string | undefined | null][] = [
    ...(showCustomerName ? [['Customer Name', challan.customerName] as [string, string | undefined | null]] : []),
    ['Vehicle No', challan.vehicleNo],
    ['Challan No', challan.challanNo],
    ['Challan Date/Time', challan.challanDateTime ? fmtDateTime(challan.challanDateTime) : '—'],
    ['Fine Amount', formatAmount(challan.fineImposed)],
    ['Received Amount', formatAmount(challan.receivedAmount)],
    ['Receipt No', challan.receiptNo],
    ['Payment Status', challan.paymentStatus],
    ['Status', challan.challanStatus],
    ['Department', challan.department],
    ['Place', challan.challanPlace],
    ['RTO District', challan.rtoDistrictName],
    ['State Code', challan.stateCode],
    ['Driver Name', challan.driverName],
    ['Owner Name', challan.ownerName],
    ['Violator Name', challan.nameOfViolator],
    // Echallan.dl_no is RED-tier — mask for every non-ADMIN role.
    ['DL No', redactRedPii(challan.dlNo, user?.roleKey, maskDlNumber)],
    ['Sent to Reg Court', challan.sentToRegCourt],
    ['Sent to Virtual Court', challan.sentToVirtualCourt],
    ['Sent to Court On', challan.sentToCourtOn],
    ['Date of Proceeding', challan.dateOfProceeding],
    ['Court Name', challan.courtName],
    ['Court Address', challan.courtAddress],
    ['Document Impounded', challan.documentImpounded],
    ['Remark', challan.remark],
  ];

  const offences = challan.offensiveDetails ?? [];
  const showPay = canPayChallan(challan);
  const showReceipt = hasChallanReceipt(challan.paymentStatus);
  const isPayLoading = loadingPayButton === challan.challanNo;

  return (
    <LiquidBackground>
      <ScreenHeader title={challan.vehicleNo || title} showBack />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GlassCard variant="strong" style={styles.headerCard}>
          <Text style={styles.vehicleNo}>{challan.vehicleNo}</Text>
          <Text style={styles.challanNo} selectable>{challan.challanNo}</Text>
          <View style={styles.pillRow}>
            <StatusPill label={statusLabel} variant={statusVariant} small />
            {challan.paymentStatus ? (
              <StatusPill label={challan.paymentStatus} variant="info" small />
            ) : null}
          </View>
          <Text style={styles.fineAmount}>{formatAmount(challan.fineImposed)}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={async () => {
                setCheckingStatus(true);
                await checkChallanStatus(challan.vehicleNo, challan.challanNo);
                setCheckingStatus(false);
              }}
              disabled={checkingStatus}
            >
              {checkingStatus
                ? <ActivityIndicator size="small" color={Colors.blue} />
                : <Text style={styles.secondaryBtnText}>Check Status</Text>}
            </TouchableOpacity>

            {showReceipt && challan.paymentRequestId ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => openChallanReceipt(challan.paymentRequestId!, challan.challanNo)}
              >
                <Text style={styles.secondaryBtnText}>Receipt</Text>
              </TouchableOpacity>
            ) : null}

            {showPay ? (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => startPayment(challan.challanNo, challan.vehicleNo)}
                disabled={isPayLoading}
              >
                {isPayLoading
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Text style={styles.payBtnText}>Pay</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        </GlassCard>

        <Section title="Challan Summary" rows={summaryRows} />

        {offences.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>OFFENCE DETAILS</Text>
            {offences.map((row, index) => (
              <OffenceCard key={`${row.act ?? 'act'}-${index}`} row={row} index={index} />
            ))}
          </>
        ) : null}

        <View style={{ height: Spacing[6] }} />
      </ScrollView>

      <ChallanPaymentCheckoutModal
        checkout={checkout}
        onEvent={handlePaymentEvent}
        onClose={handleClosePayment}
      />
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing[4], paddingBottom: Spacing[6] },
  headerCard: { marginBottom: Spacing[3] },
  vehicleNo: {
    fontSize: FontSize['2xl'],
    fontWeight: '800',
    color: Colors.white,
    fontFamily: 'monospace',
  },
  challanNo: {
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    marginTop: 4,
    fontFamily: 'monospace',
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing[2], marginTop: Spacing[3] },
  fineAmount: {
    fontSize: FontSize.xl,
    fontWeight: '800',
    color: Colors.white,
    marginTop: Spacing[2],
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing[2],
    marginTop: Spacing[3],
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 90,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.blue },
  payBtn: {
    backgroundColor: '#3eb901',
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
  },
  payBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  section: { marginBottom: Spacing[3], overflow: 'hidden' },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.white,
    backgroundColor: Colors.blue,
    paddingHorizontal: Spacing[3],
    paddingVertical: 8,
  },
  sectionBody: { paddingHorizontal: Spacing[3], paddingVertical: 4 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing[3],
  },
  detailLabel: { fontSize: FontSize.sm, color: Colors.text.label, flex: 1 },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text.primary,
    fontWeight: '600',
    flex: 1.3,
    textAlign: 'right',
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.text.label,
    marginBottom: Spacing[2],
  },
  offenceCard: { marginBottom: Spacing[2], padding: Spacing[3] },
  offenceIndex: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.infoLight,
    marginBottom: Spacing[1],
  },
  errorWrap: { alignItems: 'center', paddingVertical: Spacing[6], paddingHorizontal: Spacing[5] },
  errorText: { color: Colors.text.secondary, fontSize: FontSize.base },
});
