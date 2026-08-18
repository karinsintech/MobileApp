import {
  isAllowedChallanPopupUrl,
  parseChallanPaymentNavigation,
} from '../parseChallanPaymentNavigation';

describe('parseChallanPaymentNavigation', () => {
  it('reads success from a named status query param on any https host', () => {
    expect(
      parseChallanPaymentNavigation('https://gov-portal.example.in/pay?status=success'),
    ).toBe('PAYMENT_SUCCESS');
  });

  it('does not match status embedded in another query value', () => {
    expect(
      parseChallanPaymentNavigation(
        'https://gateway.example.com/redirect?next=https%3A%2F%2Fevil%2F%3Fstatus%3Dcancel',
      ),
    ).toBeNull();
  });

  it('does not match paymentsuccess in the hostname', () => {
    expect(parseChallanPaymentNavigation('https://paymentsuccess.evil.tld/')).toBeNull();
  });

  it('does not match status in the hash fragment', () => {
    expect(parseChallanPaymentNavigation('https://evil.tld/#status=success')).toBeNull();
  });

  it('reads pathname success on trusted Razorpay origin', () => {
    expect(
      parseChallanPaymentNavigation('https://checkout.razorpay.com/v1/payment-success'),
    ).toBe('PAYMENT_SUCCESS');
  });

  it('reads cancel from paymentStatus query param', () => {
    expect(
      parseChallanPaymentNavigation('https://fleet.karins.in/callback?paymentStatus=cancelled'),
    ).toBe('PAYMENT_CANCEL');
  });
});

describe('isAllowedChallanPopupUrl', () => {
  it('allows https bank / 3DS popups', () => {
    expect(isAllowedChallanPopupUrl('https://acs.bank.example/3ds')).toBe(true);
  });

  it('allows about:blank', () => {
    expect(isAllowedChallanPopupUrl('about:blank')).toBe(true);
  });

  it('blocks javascript and file schemes', () => {
    expect(isAllowedChallanPopupUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedChallanPopupUrl('file:///etc/passwd')).toBe(false);
  });
});
