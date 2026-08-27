import { maskMobileNumber } from '../utils/maskMobileNumber';

describe('maskMobileNumber', () => {
  it('masks the middle five digits of a 10-digit mobile', () => {
    expect(maskMobileNumber('9876543210')).toBe('98XXXXX210');
  });

  it('leaves non-10-digit values unchanged', () => {
    expect(maskMobileNumber('12345')).toBe('12345');
  });
});
