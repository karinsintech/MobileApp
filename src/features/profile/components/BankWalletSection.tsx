/**
 * Bank / wallet account blocks on Profile — mirrors web UserProfile wallet grids.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Share, Alert, type LayoutChangeEvent } from 'react-native';
import { GlassCard } from '../../../components';
import { CopyIcon } from '../../../components/icons';
import { Colors, FontSize, Spacing } from '../../../theme';
import type { WalletDetailField } from '../utils/mapCustomerProfile';
import { openUpiPayment } from '../utils/upiPayment';

const ADMIN_WALLET = {
  accountNumber: 'QWALLET01LQPARTNER20',
  ifsc: 'YESB0CMSNOC',
  upiId: 'QWALLET01LQPARTNER20@yesbankltd',
};

async function copyText(label: string, value: string) {
  if (!value.trim()) return;
  try {
    await Share.share({ message: value });
  } catch {
    Alert.alert(label, value);
  }
}

async function copyAll(fields: WalletDetailField[], title: string) {
  const text = fields
    .filter((f) => f.value.trim())
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n');
  if (!text) return;
  try {
    await Share.share({ message: `${title}\n${text}` });
  } catch {
    Alert.alert(title, text);
  }
}

function fontSizeToFit(text: string, columnWidth: number): number {
  const chars = Math.max(text.trim().length, 1);
  const width = Math.max(columnWidth, 40);
  return Math.min(11, Math.max(7, Math.floor(width / (chars * 0.62))));
}

function DetailRow({
  label,
  yesValue,
  idfcValue,
  onCopyYes,
  onCopyIdfc,
}: {
  label: string;
  yesValue: string;
  idfcValue: string;
  onCopyYes: () => void;
  onCopyIdfc: () => void;
  large?: boolean;
}) {
  const isUpiId = label === 'UPI ID';
  const expandYesOverIdfc = isUpiId && !idfcValue.trim();
  const [colWidth, setColWidth] = useState(110);

  const onColLayout = (event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    if (next > 0 && Math.abs(next - colWidth) > 2) setColWidth(next);
  };

  const renderValue = (value: string) => (
    <Text
      style={[styles.valueText, { fontSize: fontSizeToFit(value || '—', colWidth) }]}
      selectable
      numberOfLines={1}
      allowFontScaling={false}
    >
      {value || '—'}
    </Text>
  );

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={1} allowFontScaling={false}>
        {label}
      </Text>
      <TouchableOpacity
        style={[styles.valueCol, expandYesOverIdfc && styles.valueColWide]}
        onPress={onCopyYes}
        disabled={!yesValue}
        onLayout={onColLayout}
      >
        {renderValue(yesValue)}
      </TouchableOpacity>
      {expandYesOverIdfc ? null : (
        <TouchableOpacity style={styles.valueCol} onPress={onCopyIdfc} disabled={!idfcValue} onLayout={onColLayout}>
          {renderValue(idfcValue)}
        </TouchableOpacity>
      )}
    </View>
  );
}

function UpiBox({
  yesUpi,
  idfcUpi,
  yesUpiUrl,
  idfcUpiUrl,
  yesPayeeName,
  idfcPayeeName,
  large = false,
}: {
  yesUpi: string;
  idfcUpi: string;
  yesUpiUrl?: string;
  idfcUpiUrl?: string;
  yesPayeeName?: string;
  idfcPayeeName?: string;
  large?: boolean;
}) {
  // Render UPI IDs in their own full-width card so long handles are fully readable
  const hasYes = yesUpi.trim().length > 0;
  const hasIdfc = idfcUpi.trim().length > 0;

  if (!hasYes && !hasIdfc) return null;

  return (
    <GlassCard style={styles.upiBox} noPadding>
      <View style={styles.upiBoxHeader}>
        <Text style={[styles.upiBoxHeaderText, large && styles.upiBoxHeaderTextLarge]}>UPI ID</Text>
      </View>
      {hasYes ? (
        <View style={styles.upiRow}>
          <TouchableOpacity
            style={styles.upiLinkHit}
            onPress={() => openUpiPayment(yesUpi, yesUpiUrl, yesPayeeName)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.upiLink, large && styles.upiLinkLarge]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {yesUpi}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { void copyText('UPI ID', yesUpi); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CopyIcon size={16} color={Colors.blue} />
          </TouchableOpacity>
        </View>
      ) : null}
      {hasYes && hasIdfc ? <View style={styles.upiDivider} /> : null}
      {hasIdfc ? (
        <View style={styles.upiRow}>
          <TouchableOpacity
            style={styles.upiLinkHit}
            onPress={() => openUpiPayment(idfcUpi, idfcUpiUrl, idfcPayeeName)}
            activeOpacity={0.7}
          >
            <Text
              style={[styles.upiLink, large && styles.upiLinkLarge]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {idfcUpi}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { void copyText('UPI ID', idfcUpi); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <CopyIcon size={16} color={Colors.blue} />
          </TouchableOpacity>
        </View>
      ) : null}
    </GlassCard>
  );
}

function WalletGrid({
  title,
  yesLabel,
  idfcLabel,
  yesBank,
  idfcBank,
  large = false,
}: {
  title: string;
  yesLabel: string;
  idfcLabel: string;
  yesBank: WalletDetailField[];
  idfcBank: WalletDetailField[];
  large?: boolean;
}) {
  // Separate UPI fields out so they get their own full-width box below the grid
  const nonUpiYes = yesBank.filter((f) => f.label !== 'UPI ID');
  const nonUpiIdfc = idfcBank.filter((f) => f.label !== 'UPI ID');
  const yesUpi = yesBank.find((f) => f.label === 'UPI ID')?.value ?? '';
  const idfcUpi = idfcBank.find((f) => f.label === 'UPI ID')?.value ?? '';
  const yesUpiUrl = yesBank.find((f) => f.label === 'UPI ID')?.upiUrl
    ?? yesBank.find((f) => f.label === 'AccName')?.upiUrl;
  const idfcUpiUrl = idfcBank.find((f) => f.label === 'UPI ID')?.upiUrl
    ?? idfcBank.find((f) => f.label === 'AccName')?.upiUrl;
  const yesPayeeName = yesBank.find((f) => f.label === 'AccName')?.value;
  const idfcPayeeName = idfcBank.find((f) => f.label === 'AccName')?.value;

  return (
  <View style={styles.block}>
    <View style={styles.blockHead}>
      <Text style={[styles.blockTitle, large && styles.blockTitleLarge]}>{title}</Text>
      <View style={styles.copyActions}>
        <TouchableOpacity onPress={() => copyAll(yesBank, yesLabel)}>
          <Text style={[styles.copyLink, large && styles.copyLinkLarge]}>Copy YES</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => copyAll(idfcBank, idfcLabel)}>
          <Text style={[styles.copyLink, large && styles.copyLinkLarge]}>Copy IDFC</Text>
        </TouchableOpacity>
      </View>
    </View>
    <GlassCard style={styles.gridCard} noPadding>
      <View style={[styles.row, styles.headerRow, large && styles.headerRowLarge]}>
        <Text style={[styles.headerCell, styles.headerCellField]} numberOfLines={1} allowFontScaling={false}>Field</Text>
        <Text style={styles.headerCell} numberOfLines={1} allowFontScaling={false}>{yesLabel}</Text>
        <Text style={styles.headerCell} numberOfLines={1} allowFontScaling={false}>{idfcLabel}</Text>
      </View>
      {nonUpiYes.map((item, index) => (
        <DetailRow
          key={item.label}
          label={item.label}
          yesValue={nonUpiYes[index]?.value ?? ''}
          idfcValue={nonUpiIdfc[index]?.value ?? ''}
          onCopyYes={() => copyText(item.label, nonUpiYes[index]?.value ?? '')}
          onCopyIdfc={() => copyText(item.label, nonUpiIdfc[index]?.value ?? '')}
          large={large}
        />
      ))}
    </GlassCard>
    <UpiBox
      yesUpi={yesUpi}
      idfcUpi={idfcUpi}
      yesUpiUrl={yesUpiUrl}
      idfcUpiUrl={idfcUpiUrl}
      yesPayeeName={yesPayeeName}
      idfcPayeeName={idfcPayeeName}
      large={large}
    />
  </View>
  );
}

export function AdminWalletSection() {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Admin Wallet Details</Text>
      <GlassCard style={styles.adminCard}>
        <TouchableOpacity onPress={() => copyText('AccNo', ADMIN_WALLET.accountNumber)}>
          <Text style={styles.adminLabel}>AccNo</Text>
          <Text style={styles.adminValue} selectable>{ADMIN_WALLET.accountNumber}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => copyText('IFSC', ADMIN_WALLET.ifsc)}>
          <Text style={styles.adminLabel}>IFSC</Text>
          <Text style={styles.adminValue} selectable>{ADMIN_WALLET.ifsc}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openUpiPayment(ADMIN_WALLET.upiId, undefined, ADMIN_WALLET.accountNumber)}>
          <Text style={styles.adminLabel}>UPI ID</Text>
          <Text style={styles.adminValue} selectable>{ADMIN_WALLET.upiId}</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

export function AgentWalletSection({
  accountNumber,
  ifsc,
  upiId,
}: {
  accountNumber: string;
  ifsc: string;
  upiId: string;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>Agent Wallet Details</Text>
      <GlassCard style={styles.adminCard}>
        <TouchableOpacity onPress={() => copyText('AccNo', accountNumber)}>
          <Text style={styles.adminLabel}>AccNo</Text>
          <Text style={styles.adminValue} selectable>{accountNumber || '—'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => copyText('IFSC', ifsc)}>
          <Text style={styles.adminLabel}>IFSC</Text>
          <Text style={styles.adminValue} selectable>{ifsc || '—'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openUpiPayment(upiId)}>
          <Text style={styles.adminLabel}>UPI ID</Text>
          <Text style={styles.adminValue} selectable>{upiId || '—'}</Text>
        </TouchableOpacity>
      </GlassCard>
    </View>
  );
}

export function CustomerWalletSections({
  fastagYesBank,
  fastagIdfc,
  corporateYesBank,
  corporateIdfc,
  showCorporate,
}: {
  fastagYesBank: WalletDetailField[];
  fastagIdfc: WalletDetailField[];
  corporateYesBank: WalletDetailField[];
  corporateIdfc: WalletDetailField[];
  showCorporate: boolean;
}) {
  return (
    <>
      <WalletGrid
        title="FASTag Account Information"
        yesLabel="YES Bank"
        idfcLabel="IDFC"
        yesBank={fastagYesBank}
        idfcBank={fastagIdfc}
      />
      {showCorporate ? (
        <WalletGrid
          title="Corporate Account Information"
          yesLabel="Corp. YES Bank"
          idfcLabel="Corp. IDFC"
          yesBank={corporateYesBank}
          idfcBank={corporateIdfc}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: Spacing[4] },
  blockHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  blockTitle: {
    flex: 1,
    minWidth: 120,
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.infoLight,
  },
  blockTitleLarge: {
    fontSize: FontSize.base,
  },
  copyActions: { flexDirection: 'row', gap: 12 },
  copyLink: { fontSize: FontSize.xs, color: Colors.blue, fontWeight: '600' },
  copyLinkLarge: { fontSize: FontSize.sm },
  gridCard: {},
  headerRow: { backgroundColor: Colors.blue, height: 36, alignItems: 'center' },
  headerRowLarge: { paddingVertical: 10 },
  headerCell: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'left',
    paddingLeft: 4,
  },
  headerCellLarge: {
    fontSize: FontSize.sm,
  },
  headerCellIdfc: {
    fontSize: FontSize.xs,
  },
  headerCellField: {
    flex: 0,
    width: 58,
    textAlign: 'left',
    paddingLeft: 4,
  },
  headerCellFieldLarge: {
    width: 84,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingHorizontal: 6,
  },
  rowLabel: {
    width: 58,
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 16,
    color: Colors.text.subtle,
    fontWeight: '600',
    textAlign: 'left',
    includeFontPadding: false,
  },
  valueCol: {
    flex: 1,
    paddingHorizontal: 3,
    minWidth: 0,
    justifyContent: 'center',
  },
  valueColWide: { flex: 2 },
  valueText: {
    fontSize: 10,
    lineHeight: 16,
    color: Colors.white,
    textAlign: 'left',
    includeFontPadding: false,
  },
  valueTextLarge: {
    fontSize: FontSize.sm,
  },
  valueTextCompact: {
    fontSize: 10,
  },
  valueTextCompactLarge: {
    fontSize: FontSize.xs,
  },
  valueTextAccountNumber: {
    fontSize: 9,
  },
  valueTextAccountNumberLarge: {
    fontSize: 10,
  },
  valueTextWide: {
    width: '100%',
    textAlign: 'left',
  },
  upiBox: { marginTop: 8, overflow: 'hidden' },
  upiBoxHeader: {
    backgroundColor: Colors.blue,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  upiBoxHeaderText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    color: Colors.white,
  },
  upiBoxHeaderTextLarge: { fontSize: FontSize.sm },
  upiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  upiLinkHit: { flex: 1, minWidth: 0 },
  upiLink: {
    fontSize: 11,
    lineHeight: 16,
    color: Colors.blue,
    fontWeight: '700',
    textDecorationLine: 'underline',
    includeFontPadding: false,
  },
  upiLinkLarge: { fontSize: FontSize.sm },
  upiDivider: { height: 1, backgroundColor: Colors.divider, marginHorizontal: 12 },
  adminCard: { gap: 12, padding: Spacing[4] },
  adminLabel: { fontSize: FontSize.xs, color: Colors.text.label, marginBottom: 2 },
  adminValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600', fontFamily: 'monospace' },
});
