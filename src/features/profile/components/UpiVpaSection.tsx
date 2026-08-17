/**
 * Profile UPI VPA list — same mapping as web UserProfile:
 * VRN + NETC.{vehicleNo}@LIV, with copy and a QR modal from vehicle.upiUrl.
 */

import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Pressable, Share, Alert,
  ScrollView,
} from 'react-native';
import { GlassCard } from '../../../components';
import { AppImage } from '../../../components/common/AppImage';
import { CopyIcon } from '../../../components/icons';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import type { VpaItem } from '../utils/mapCustomerProfile';
import { openUpiPayment } from '../utils/upiPayment';

interface Props {
  items: VpaItem[];
}

function qrImageUrl(payload: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(payload)}`;
}

async function copyText(label: string, value: string) {
  if (!value.trim()) return;
  try {
    await Share.share({ message: value });
  } catch {
    Alert.alert(label, value);
  }
}

export function UpiVpaSection({ items }: Props) {
  const [searchVrn, setSearchVrn] = useState('');
  const [selected, setSelected] = useState<VpaItem | null>(null);

  const filtered = useMemo(() => {
    const needle = searchVrn.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.vrn.toLowerCase().includes(needle));
  }, [items, searchVrn]);

  const qrPayload = selected?.upiUrl?.trim()
    || (selected ? `upi://pay?pa=${selected.vpa}&pn=${selected.vrn}&mode=02&purpose=00&cu=INR` : '');

  return (
    <>
      <Text style={styles.sectionLabel}>UPI VPA</Text>
      <GlassCard style={styles.card} noPadding>
        <View style={styles.searchWrap}>
          <TextInput
            value={searchVrn}
            onChangeText={setSearchVrn}
            placeholder="ex: TN36AA5005"
            placeholderTextColor={Colors.text.subtle}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.search}
          />
        </View>

        <View style={styles.table}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerCell, styles.vrnCol]}>VRN</Text>
            <Text style={[styles.headerCell, styles.vpaCol]}>UPI ID</Text>
            <Text style={[styles.headerCell, styles.qrCol]}>QR</Text>
          </View>

          <View style={styles.listFrame}>
            <ScrollView
              nestedScrollEnabled
              style={styles.vpaList}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {filtered.length === 0 ? (
                <Text style={styles.empty}>No vehicles with a VPA.</Text>
              ) : (
                filtered.map((item) => (
                  <View key={String(item.vId)} style={styles.bodyRow}>
                    <Text style={[styles.cell, styles.vrnCol]} numberOfLines={1}>{item.vrn}</Text>
                    <View style={styles.vpaCol}>
                      <TouchableOpacity
                        style={styles.vpaLinkHit}
                        onPress={() => openUpiPayment(item.vpa, item.upiUrl, item.vrn)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={styles.vpaLink}
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.65}
                        >
                          {item.vpa}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { void copyText('UPI ID', item.vpa); }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <CopyIcon size={14} color={Colors.blue} />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.qrCol}
                      onPress={() => setSelected(item)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.qrLink}>QR</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </GlassCard>

      <Modal
        visible={selected != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={styles.scrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          {selected ? (
            <View style={styles.sheet}>
              <Text style={styles.sheetLabel}>VRN</Text>
              <Text style={styles.sheetValue}>{selected.vrn}</Text>
              <Text style={styles.sheetLabel}>UPI ID</Text>
              <TouchableOpacity onPress={() => openUpiPayment(selected.vpa, selected.upiUrl, selected.vrn)}>
                <Text style={styles.sheetVpa}>{selected.vpa}</Text>
              </TouchableOpacity>
              {qrPayload ? (
                <AppImage
                  source={{ uri: qrImageUrl(qrPayload) }}
                  style={styles.qrImage}
                  resizeMode="contain"
                />
              ) : null}
              <Text style={styles.hint}>Scan the QR code to proceed with a secure payment.</Text>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.text.label,
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
    paddingLeft: 2,
  },
  card: { marginBottom: Spacing[4] },
  searchWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  search: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.md,
    color: Colors.white,
    fontSize: FontSize.xs,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  table: { width: '100%' },
  listFrame: { height: 168, minHeight: 168, width: '100%' },
  vpaList: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: Colors.blue,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  headerCell: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.white },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    minHeight: 32,
  },
  cell: { fontSize: FontSize.xs, color: Colors.white, fontWeight: '600' },
  vrnCol: { flex: 0.28, minWidth: 0, paddingRight: 4 },
  vpaCol: { flex: 0.57, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  vpaLinkHit: { flex: 1, minWidth: 0 },
  qrCol: { flex: 0.15, minWidth: 28, alignItems: 'flex-end' },
  vpaLink: {
    fontSize: FontSize.xs,
    color: Colors.blue,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  qrLink: { fontSize: FontSize.xs, color: Colors.yellow, fontWeight: '800' },
  empty: {
    padding: Spacing[4],
    color: Colors.text.secondary,
    fontSize: FontSize.sm,
  },
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: Spacing[5],
  },
  sheet: {
    backgroundColor: Colors.navy,
    borderRadius: Radius.lg,
    padding: Spacing[4],
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
  },
  sheetLabel: { fontSize: FontSize.xs, color: Colors.text.subtle, fontWeight: '700', marginTop: 8 },
  sheetValue: { fontSize: FontSize.lg, color: Colors.white, fontWeight: '800' },
  sheetVpa: {
    fontSize: FontSize.sm,
    color: Colors.blue,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  qrImage: { width: 220, height: 220, alignSelf: 'center', marginVertical: Spacing[4], backgroundColor: Colors.white },
  hint: { fontSize: FontSize.xs, color: Colors.text.subtle, textAlign: 'center', marginBottom: Spacing[3] },
  closeBtn: {
    backgroundColor: Colors.yellow,
    borderRadius: Radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeText: { fontSize: FontSize.base, fontWeight: '800', color: Colors.navy },
});
