import {
  parsePlausibleNotificationTimestamp,
  sanitizeRemoteNotificationData,
} from '../sanitizeRemoteNotificationData';

describe('sanitizeRemoteNotificationData', () => {
  it('keeps allow-listed keys and drops unknown remote fields', () => {
    expect(
      sanitizeRemoteNotificationData({
        category: 'echallan',
        screen: 'ChallanList',
        evil: '<script>',
      }),
    ).toEqual({ category: 'echallan' });
  });

  it('caps oversized values', () => {
    const longBody = 'x'.repeat(600);
    const sanitized = sanitizeRemoteNotificationData({ body: longBody });
    expect(sanitized.body?.length).toBe(512);
  });

  it('rejects implausible createdAt values', () => {
    const farFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const parsed = parsePlausibleNotificationTimestamp(farFuture);
    expect(parsed).not.toBe(farFuture);
    expect(Number.isFinite(new Date(parsed).getTime())).toBe(true);
  });
});
