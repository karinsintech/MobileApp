import {
  canViewUnmaskedRedPii,
  maskBankAccount,
  maskDlNumber,
  maskGstin,
  maskPan,
  redactRedPii,
} from '../utils/piiProtection';

describe('piiProtection', () => {
  it('allows only ADMIN to view RED PII unmasked', () => {
    expect(canViewUnmaskedRedPii('ADMIN')).toBe(true);
    expect(canViewUnmaskedRedPii('EMPLOYEE')).toBe(false);
    expect(canViewUnmaskedRedPii('CUSTOMER')).toBe(false);
    expect(canViewUnmaskedRedPii(undefined)).toBe(false);
  });

  it('masks bank account to last 4', () => {
    expect(maskBankAccount('123456789012')).toBe('********9012');
  });

  it('masks PAN to last 4', () => {
    expect(maskPan('ABCDE1234F')).toBe('******234F');
  });

  it('masks GSTIN to last 4', () => {
    // 15-char GSTIN → 11 stars + last 4 (A1Z5)
    expect(maskGstin('22AAAAA0000A1Z5')).toBe('***********A1Z5');
  });

  it('masks DL number to last 4', () => {
    expect(maskDlNumber('MH1420110001234')).toBe('***********1234');
  });

  it('redactRedPii leaves ADMIN plaintext and masks everyone else', () => {
    expect(redactRedPii('123456789012', 'ADMIN', maskBankAccount)).toBe('123456789012');
    expect(redactRedPii('123456789012', 'EMPLOYEE', maskBankAccount)).toBe('********9012');
    expect(redactRedPii('', 'EMPLOYEE', maskBankAccount)).toBe('');
  });
});
