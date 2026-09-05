/**
 * Check Driver License modal — mirrors web DrivingLicenseContainer
 * Check Status → Sarathi preview → Add flow.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import dayjs from 'dayjs';
import { complianceApi } from '../../../services/api/complianceApi';
import { getApiErrorMessage } from '../../../services/api/client';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';
import { fmtDate } from '../../../utils/format';
import { maskDlNumber, redactRedPii } from '../../../utils/piiProtection';
import { useAppSelector } from '../../../store';
import { resolveDriverFullName } from '../utils/driverNameUtils';
import {
  sanitizeDlPayload,
  sanitizeDlPayloadForPersist,
} from '../utils/sanitizeDlPayload';
import type { DLDetailPayload } from '../types/dlDetail';

/** Backend DL pattern — state code + year + serial (optional letter / space). */
const DL_NUMBER_REGEX = /^[A-Z]{2}[0-9]{2}[A-Z]?\s?(19|20)[0-9]{2}[0-9]{7}$/;
/** Indian mobile: starts 6–9, 10 digits, not all identical. */
const MOBILE_REGEX = /^(?!([6-9])\1{9})[6-9]\d{9}$/;

interface DLCheckStatusModalProps {
  visible: boolean;
  onClose: () => void;
  /** Called after create-driver succeeds so the list can refresh. */
  onAdded: () => void;
}

interface DriverInputForm {
  licenseNumber: string;
  driverName: string;
  mobileNo: string;
  dateOfBirth: string;
}

const EMPTY_FORM: DriverInputForm = {
  licenseNumber: '',
  driverName: '',
  mobileNo: '',
  dateOfBirth: '',
};

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value?.trim() ? value : '—'}</Text>
    </View>
  );
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

function validateForm(form: DriverInputForm): string | null {
  const dlNumber = form.licenseNumber.trim().toUpperCase();
  const driverName = form.driverName.trim();
  const mobileNo = form.mobileNo.replace(/\s+/g, '');
  const dob = form.dateOfBirth.trim();

  if (!dlNumber) return 'Driving License number is required';
  if (!driverName) return 'Driver Name is required';
  if (!mobileNo) return 'Mobile Number is required';
  if (!MOBILE_REGEX.test(mobileNo)) return 'Enter a valid 10-digit mobile number';
  if (!dob) return 'Date of Birth is required';
  if (!DL_NUMBER_REGEX.test(dlNumber)) return 'Invalid Driving License number format';
  return null;
}

export default function DLCheckStatusModal({
  visible,
  onClose,
  onAdded,
}: DLCheckStatusModalProps) {
  const { user } = useAppSelector((s) => s.auth);
  const [form, setForm] = useState<DriverInputForm>(EMPTY_FORM);
  const [licenseData, setLicenseData] = useState<DLDetailPayload | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [dobPickerOpen, setDobPickerOpen] = useState(false);
  const [DatePickerComponent, setDatePickerComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    if (!visible) {
      setForm(EMPTY_FORM);
      setLicenseData(null);
      setSearchLoading(false);
      setAddLoading(false);
      setDobPickerOpen(false);
    }
  }, [visible]);

  const ensureDatePicker = () => {
    if (DatePickerComponent) return;
    import('@react-native-community/datetimepicker')
      .then((mod) => setDatePickerComponent(() => mod.default))
      .catch(() => { /* calendar optional */ });
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setLicenseData(null);
    onClose();
  };

  const handleCheckStatus = async () => {
    const validationError = validateForm(form);
    if (validationError) {
      Alert.alert('Validation', validationError);
      return;
    }

    setSearchLoading(true);
    setLicenseData(null);
    try {
      const { data } = await complianceApi.searchDLStatus({
        dlNumber: form.licenseNumber.trim().toUpperCase(),
        dob: form.dateOfBirth.trim(),
        mobileNo: form.mobileNo.replace(/\s+/g, ''),
        driverName: form.driverName.trim(),
      });

      // Sarathi success payloads set errorStatus to the string "false".
      // Strip Aadhaar/biometrics immediately — preview must not hold Restricted data.
      if (data?.errorStatus === 'false' && data?.errorMessage === null && data?.result) {
        setLicenseData(sanitizeDlPayload(data.result));
        return;
      }

      if (data?.errorMessage === 'Details not available ') {
        Alert.alert('Warning', 'Driver license Not found');
        return;
      }

      if (data?.errorMessage) {
        Alert.alert('Warning', String(data.errorMessage));
        return;
      }

      Alert.alert('Warning', 'Driver license Not found');
    } catch (error: unknown) {
      Alert.alert('Error', getApiErrorMessage(error, 'Something went wrong'));
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!licenseData) return;

    setAddLoading(true);
    try {
      // Persist only the sanitized payload — never re-upload biometrics/Aadhaar.
      const safeResult = sanitizeDlPayloadForPersist(licenseData);
      if (!safeResult) {
        Alert.alert('Error', 'Licence payload is incomplete');
        return;
      }
      await complianceApi.createDriver({
        result: safeResult,
        mobileNo: form.mobileNo.replace(/\s+/g, ''),
        dob: form.dateOfBirth.trim(),
        driverName: form.driverName.trim(),
      });
      Alert.alert('Success', 'Driver details saved successfully');
      handleClose();
      onAdded();
    } catch (error: unknown) {
      Alert.alert('Error', getApiErrorMessage(error, 'Error occurred while inserting data'));
    } finally {
      setAddLoading(false);
    }
  };

  const dobLabel = form.dateOfBirth
    ? dayjs(form.dateOfBirth, 'YYYY-MM-DD').format('DD-MM-YYYY')
    : '* Date of Birth';

  const renderDobPicker = () => {
    if (!dobPickerOpen) return null;

    const currentValue = form.dateOfBirth
      ? dayjs(form.dateOfBirth, 'YYYY-MM-DD').toDate()
      : dayjs().subtract(18, 'year').toDate();

    if (Platform.OS === 'android') {
      if (!DatePickerComponent) {
        ensureDatePicker();
        return null;
      }
      return (
        <DatePickerComponent
          value={currentValue}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={(_event: any, date?: Date) => {
            setDobPickerOpen(false);
            if (date) {
              setForm((prev) => ({ ...prev, dateOfBirth: dayjs(date).format('YYYY-MM-DD') }));
            }
          }}
        />
      );
    }

    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => setDobPickerOpen(false)}>
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setDobPickerOpen(false)}
        >
          <View style={styles.dateSheet}>
            <Text style={styles.pickerTitle}>Date of Birth</Text>
            {DatePickerComponent ? (
              <DatePickerComponent
                value={currentValue}
                mode="date"
                display="spinner"
                themeVariant="dark"
                maximumDate={new Date()}
                onChange={(_event: any, date?: Date) => {
                  if (date) {
                    setForm((prev) => ({ ...prev, dateOfBirth: dayjs(date).format('YYYY-MM-DD') }));
                  }
                }}
              />
            ) : (
              <Text style={styles.dateLoading}>Loading calendar…</Text>
            )}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setDobPickerOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const lic = licenseData?.licenseDetails;
  const driverFullName = resolveDriverFullName(licenseData, form.driverName);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.title}>Check Driver License</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scroll}
          >
            <TextInput
              style={styles.input}
              placeholder="* DL No"
              placeholderTextColor={Colors.text.subtle}
              autoCapitalize="characters"
              value={form.licenseNumber}
              onChangeText={(licenseNumber) => setForm((prev) => ({ ...prev, licenseNumber }))}
            />
            <TextInput
              style={styles.input}
              placeholder="* Driver Name"
              placeholderTextColor={Colors.text.subtle}
              value={form.driverName}
              onChangeText={(driverName) => setForm((prev) => ({ ...prev, driverName }))}
            />
            <TextInput
              style={styles.input}
              placeholder="* Mobile No"
              placeholderTextColor={Colors.text.subtle}
              keyboardType="phone-pad"
              maxLength={10}
              value={form.mobileNo}
              onChangeText={(mobileNo) => setForm((prev) => ({
                ...prev,
                mobileNo: mobileNo.replace(/\D/g, '').slice(0, 10),
              }))}
            />

            <TouchableOpacity
              style={styles.select}
              onPress={() => { ensureDatePicker(); setDobPickerOpen(true); }}
              activeOpacity={0.85}
            >
              <Text style={styles.selectLabel}>Date of Birth</Text>
              <Text style={[
                styles.selectValue,
                !form.dateOfBirth && styles.selectPlaceholder,
              ]}>
                {dobLabel}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, searchLoading && styles.btnDisabled]}
              onPress={handleCheckStatus}
              disabled={searchLoading}
              activeOpacity={0.85}
            >
              {searchLoading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Check Status</Text>
              )}
            </TouchableOpacity>

            {licenseData ? (
              <View style={styles.preview}>
                <Text style={styles.previewTitle}>Driving License Details</Text>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryCol}>
                    <DetailRow label="DL Status" value={lic?.dlStatus} />
                    {/* RED-tier: keep plaintext only for ADMIN; createDriver still uses unsanitized-of-mask payload. */}
                    <DetailRow
                      label="DL No"
                      value={redactRedPii(lic?.dlLicno, user?.roleKey, maskDlNumber)}
                    />
                    <DetailRow label="Driver Name" value={driverFullName} />
                    <DetailRow label="Issue Date" value={fmtDate(lic?.dlIssuedt)} />
                    <DetailRow
                      label="Issuing Office"
                      value={lic?.omRtoFullname || lic?.olaName}
                    />
                  </View>
                </View>

                <Text style={styles.sectionTitle}>Endorsement & Transaction Details</Text>
                <TableHeader cols={['Endorsed Date', 'Endorsed Office', 'Last Transaction']} />
                <View style={styles.tableRow}>
                  <Text style={styles.tableCell}>{fmtDate(lic?.dlEndorsedt)}</Text>
                  <Text style={styles.tableCell}>{lic?.dlEndorseAuth || '—'}</Text>
                  <Text style={styles.tableCell}>
                    {licenseData.serviceHistory?.[0]?.trName || '—'}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>Validity Periods</Text>
                <TableHeader cols={['Type', 'From Date', 'To Date']} />
                {[
                  { type: 'No Transport', from: lic?.dlNtValdfrDt, to: lic?.dlNtValdtoDt },
                  { type: 'Transport', from: lic?.dlTrValdfrDt, to: lic?.dlTrValdtoDt },
                  { type: 'Hazardous', from: lic?.dlHzValdfrDt, to: lic?.dlHzValdtoDt },
                ].map((row) => (
                  <View key={row.type} style={styles.tableRow}>
                    <Text style={styles.tableCell}>{row.type}</Text>
                    <Text style={styles.tableCell}>{fmtDate(row.from)}</Text>
                    <Text style={styles.tableCell}>{fmtDate(row.to)}</Text>
                  </View>
                ))}

                {Array.isArray(licenseData.authorizedVehicles)
                  && licenseData.authorizedVehicles.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>Class of Vehicle (COV)</Text>
                    <TableHeader cols={['Category', 'Class of Vehicles', 'Issued Date']} />
                    {licenseData.authorizedVehicles.map((vehicle, idx) => (
                      <View key={`${vehicle.vecatg}-${idx}`} style={styles.tableRow}>
                        <Text style={styles.tableCell}>{vehicle.vecatg || '—'}</Text>
                        <Text style={styles.tableCell}>{vehicle.covdesc || '—'}</Text>
                        <Text style={styles.tableCell}>
                          {fmtDate(vehicle.dcIssuedt || vehicle.covIssuedt)}
                        </Text>
                      </View>
                    ))}
                  </>
                ) : null}

                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleClose}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.secondaryBtnText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.addBtn, addLoading && styles.btnDisabled]}
                    onPress={handleAdd}
                    disabled={addLoading}
                    activeOpacity={0.85}
                  >
                    {addLoading ? (
                      <ActivityIndicator color={Colors.white} />
                    ) : (
                      <Text style={styles.primaryBtnText}>Add</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>

      {renderDobPicker()}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '92%',
    backgroundColor: Colors.navy,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingBottom: Spacing[4],
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    paddingBottom: Spacing[2],
  },
  title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  closeText: { fontSize: FontSize.lg, color: Colors.text.subtle, fontWeight: '600' },
  scroll: { paddingHorizontal: Spacing[4], gap: 10, paddingBottom: Spacing[6] },
  input: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: FontSize.sm,
    color: Colors.white,
  },
  select: {
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectLabel: { fontSize: FontSize.xs, color: Colors.text.label, marginBottom: 2 },
  selectValue: { fontSize: FontSize.sm, color: Colors.white, fontWeight: '600' },
  selectPlaceholder: { color: Colors.text.subtle, fontWeight: '500' },
  primaryBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  addBtn: { flex: 1 },
  btnDisabled: { opacity: 0.7 },
  primaryBtnText: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.white },
  secondaryBtn: {
    flex: 1,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: Radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text.secondary },
  preview: {
    marginTop: Spacing[2],
    gap: 8,
    padding: Spacing[3],
    borderRadius: Radius.lg,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
  },
  previewTitle: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.infoLight,
    textAlign: 'center',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    color: Colors.infoLight,
    marginTop: Spacing[2],
    marginBottom: 4,
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
  previewActions: { flexDirection: 'row', gap: 8, marginTop: Spacing[3] },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  dateSheet: {
    backgroundColor: Colors.navy,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing[4],
    paddingBottom: Spacing[6],
  },
  pickerTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing[3],
  },
  dateLoading: {
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    textAlign: 'center',
    paddingVertical: Spacing[4],
  },
});
