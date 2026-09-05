/**
 * Strips vehicle/challan PII from dashboard snapshots before they hit MMKV.
 * Counts and totals remain so cold-start cards still paint; lists reload from API.
 */

// Was '../../types/dashboard' (one level too shallow) — resolved to nonexistent
// src/features/types/dashboard and left this PII-stripping util unchecked by tsc.
import type { DashboardSummary } from '../../../types/dashboard';

export function sanitizeDashboardSnapshot(summary: DashboardSummary): DashboardSummary {
  if (!summary.challans) return summary;

  const { recentPending: _recentPending, topVehiclesByFine: _topVehiclesByFine, ...rest } =
    summary.challans;

  return {
    ...summary,
    challans: rest,
  };
}
