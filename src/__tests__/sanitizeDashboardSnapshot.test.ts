import { sanitizeDashboardSnapshot } from '../features/dashboard/utils/sanitizeDashboardSnapshot';
import type { DashboardSummary } from '../types/dashboard';

describe('sanitizeDashboardSnapshot', () => {
  it('drops recentPending and topVehiclesByFine while keeping counts', () => {
    const summary = {
      challans: {
        pendingCount: 3,
        pendingAmount: 1500,
        recentPending: [{ id: 1, vehicleNo: 'TN01AB1234', date: '2026-01-01', amount: 500, status: 'PENDING' }],
        topVehiclesByFine: [{ vehicleNo: 'TN01AB1234', amount: 500, challanCount: 1 }],
      },
    } as DashboardSummary;

    const sanitized = sanitizeDashboardSnapshot(summary);

    expect(sanitized.challans?.pendingCount).toBe(3);
    expect(sanitized.challans?.pendingAmount).toBe(1500);
    expect(sanitized.challans?.recentPending).toBeUndefined();
    expect(sanitized.challans?.topVehiclesByFine).toBeUndefined();
  });

  it('leaves summaries without challans unchanged', () => {
    const summary = { wallet: { fastagBalance: 10 } } as DashboardSummary;
    expect(sanitizeDashboardSnapshot(summary)).toEqual(summary);
  });
});
