import {
  sanitizeDlPayload,
  sanitizeDlPayloadForPersist,
  toDlPhotoSrc,
} from '../features/compliance/utils/sanitizeDlPayload';

describe('sanitizeDlPayload', () => {
  it('keeps face photo and strips fingerprints / Aadhaar while keeping licence summary', () => {
    const raw = {
      licenseDetails: { dlLicno: 'MH1420110001234', dlStatus: 'ACTIVE' },
      personalDetails: {
        bioFullName: 'Test Driver',
        bioAadhaarNo: '123412341234',
        bioAadhaarName: 'Test',
        bioPerDetAadhaar: '123412341234',
        aadharAuthenticated: true,
      },
      bioImageDetails: {
        biPhoto: 'base64photo',
        biSignature: 'sig',
        biLeftThumb: 'thumb',
      },
      fullResponse: { nested: true },
      authorizedVehicles: [{ vecatg: 'LMV' }],
    };

    const cleaned = sanitizeDlPayload(raw);

    expect(cleaned.licenseDetails?.dlLicno).toBe('MH1420110001234');
    expect(cleaned.personalDetails?.bioFullName).toBe('Test Driver');
    expect((cleaned.personalDetails as any)?.bioAadhaarNo).toBeUndefined();
    expect((cleaned.personalDetails as any)?.bioPerDetAadhaar).toBeUndefined();
    expect((cleaned.personalDetails as any)?.aadharAuthenticated).toBeUndefined();
    // Face photo is required for View (web parity); thumbs/signature stay stripped.
    expect(cleaned.bioImageDetails?.biPhoto).toBe('base64photo');
    expect((cleaned.bioImageDetails as any)?.biSignature).toBeUndefined();
    expect((cleaned.bioImageDetails as any)?.biLeftThumb).toBeUndefined();
    expect((cleaned as any).fullResponse).toBeUndefined();
    expect(cleaned.authorizedVehicles?.[0]?.vecatg).toBe('LMV');
  });

  it('strips top-level bioPerDetAadhaar and biometric image keys', () => {
    const cleaned = sanitizeDlPayload({
      bioPerDetAadhaar: '999988887777',
      biPhoto: 'photo',
      licenseDetails: { dlLicno: 'MH01' },
    });
    expect((cleaned as any).bioPerDetAadhaar).toBeUndefined();
    expect((cleaned as any).biPhoto).toBeUndefined();
    expect(cleaned.licenseDetails?.dlLicno).toBe('MH01');
  });

  it('sanitizeDlPayloadForPersist drops bioImageDetails before createDriver', () => {
    const cleaned = sanitizeDlPayloadForPersist({
      licenseDetails: { dlLicno: 'MH01' },
      bioImageDetails: { biPhoto: 'base64photo' },
    });
    expect(cleaned?.licenseDetails?.dlLicno).toBe('MH01');
    expect(cleaned?.bioImageDetails).toBeUndefined();
  });

  it('sanitizeDlPayloadForPersist returns null for empty input', () => {
    expect(sanitizeDlPayloadForPersist(null)).toBeNull();
    expect(sanitizeDlPayloadForPersist(undefined)).toBeNull();
  });

  it('toDlPhotoSrc prefixes raw base64 as a jpeg data URI', () => {
    expect(toDlPhotoSrc('abc123')).toBe('data:image/jpeg;base64,abc123');
    expect(toDlPhotoSrc('data:image/png;base64,xyz')).toBe('data:image/png;base64,xyz');
    expect(toDlPhotoSrc('')).toBeNull();
    expect(toDlPhotoSrc(null)).toBeNull();
  });
});
