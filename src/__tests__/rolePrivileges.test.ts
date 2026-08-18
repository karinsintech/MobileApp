import { canAccessByPrivilege, hasAnyPrivilege, hasPrivilege } from '../utils/hasAccess';
import { PrivilegeIds, type AccessMenuItem } from '../types/accessMenus';
import { getMoreMenu } from '../navigation/menuConfig';

describe('hasPrivilege / hasAnyPrivilege', () => {
  const menus: AccessMenuItem[] = [
    { id: '201' },
    { id: ' 130 ' },
  ];

  it('matches privilege ids with trim', () => {
    expect(hasPrivilege(menus, PrivilegeIds.CHALLAN_MENU)).toBe(true);
    expect(hasPrivilege(menus, PrivilegeIds.CLAIM_SUMMARY_MENU)).toBe(true);
    expect(hasPrivilege(menus, PrivilegeIds.VEHICLE_MENU)).toBe(false);
  });

  it('supports any-of lists', () => {
    expect(hasAnyPrivilege(menus, [PrivilegeIds.VEHICLE_MENU, PrivilegeIds.CHALLAN_MENU])).toBe(true);
    expect(hasAnyPrivilege(menus, [PrivilegeIds.VEHICLE_MENU, PrivilegeIds.PRODUCT_MENU])).toBe(false);
  });
});

describe('canAccessByPrivilege', () => {
  const menus: AccessMenuItem[] = [{ id: '201' }];

  it('fails closed until privileges are loaded', () => {
    expect(canAccessByPrivilege([], false, PrivilegeIds.CHALLAN_MENU)).toBe(false);
    expect(canAccessByPrivilege(menus, false, PrivilegeIds.VEHICLE_MENU)).toBe(false);
  });

  it('requires the privilege after menus load', () => {
    expect(canAccessByPrivilege(menus, true, PrivilegeIds.CHALLAN_MENU)).toBe(true);
    expect(canAccessByPrivilege(menus, true, PrivilegeIds.VEHICLE_MENU)).toBe(false);
  });

  it('allows unmapped features (role-only)', () => {
    expect(canAccessByPrivilege(menus, true, undefined)).toBe(true);
  });
});

describe('getMoreMenu privilege intersection', () => {
  it('hides challan when privilege is revoked after load', () => {
    const withChallan = getMoreMenu('CUSTOMER', [{ id: '201' }, { id: '193' }], true)
      .flatMap((s) => s.items.map((i) => i.key));
    expect(withChallan).toContain('challans');

    const withoutChallan = getMoreMenu('CUSTOMER', [{ id: '193' }], true)
      .flatMap((s) => s.items.map((i) => i.key));
    expect(withoutChallan).not.toContain('challans');
    expect(withoutChallan).toContain('tagInventory');
  });

  it('keeps role-only tiles like recharge when privileges load', () => {
    const keys = getMoreMenu('CUSTOMER', [], true).flatMap((s) => s.items.map((i) => i.key));
    expect(keys).toContain('recharge');
    expect(keys).toContain('profile');
    expect(keys).not.toContain('challans');
  });
});
