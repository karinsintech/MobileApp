/**
 * Indian financial year helpers — Apr–Mar labelling for savings cards
 * and incentive receipt FY eligibility (web CommissionReport parity).
 */

export function getIndianFYStartYear(date = new Date()): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  return month >= 3 ? year : year - 1;
}

export function formatIndianFYLabel(fyStartYear: number): string {
  const endSuffix = String(fyStartYear + 1).slice(-2);
  return `${fyStartYear}-${endSuffix}`;
}

/**
 * Indian FY that contains a calendar quarter, keyed by the quarter's first month.
 * Jan–Mar quarters belong to the prior FY (e.g. Jan 2026 → FY 2025-26).
 */
export function getIndianFYStartYearForQuarter(
  calendarYear: number,
  startMonth: number,
): number {
  return startMonth >= 4 ? calendarYear : calendarYear - 1;
}
