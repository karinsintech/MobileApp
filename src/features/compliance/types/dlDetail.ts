/**
 * SARATHI full licence payload — shape returned in list row fullResponse.result
 * and shown in the web eye-icon detail modal.
 */

export interface DLDetailPayload {
  licenseDetails?: {
    dlStatus?: string;
    dlLicno?: string;
    dlIssuedt?: string;
    omRtoFullname?: string;
    olaName?: string;
    dlEndorsedt?: string;
    dlEndorseAuth?: string;
    dlNtValdfrDt?: string;
    dlNtValdtoDt?: string;
    dlTrValdfrDt?: string;
    dlTrValdtoDt?: string;
    dlHzValdfrDt?: string;
    dlHzValdtoDt?: string;
    dlHlValdfrDt?: string;
    dlHlValdtoDt?: string;
  };
  /** Names only — Aadhaar / biometric keys are stripped client-side (DPDP). */
  personalDetails?: {
    bioFullName?: string;
    bioFirstName?: string;
    bioMiddleName?: string;
    bioLastName?: string;
  };
  /**
   * Intentionally omitted from the client type: biPhoto / signatures / fingerprints
   * are Restricted and must never be held in React state (see sanitizeDlPayload).
   */
  serviceHistory?: Array<{ trName?: string }>;
  authorizedVehicles?: Array<{
    vecatg?: string;
    covdesc?: string;
    /** Sarathi field used by web PDF / COV table */
    dcIssuedt?: string;
    covIssuedt?: string;
  }>;
}
