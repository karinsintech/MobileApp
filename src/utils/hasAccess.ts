/**
 * Privilege checks — mirrors web useHasAccess against accessMenusPortal IDs.
 */

import type { AccessMenuItem, PrivilegeId } from '../types/accessMenus';

/** True when the user was granted this privilege ID in role management. */
export function hasPrivilege(
  accessMenus: AccessMenuItem[] | null | undefined,
  privilegeId: PrivilegeId | string,
): boolean {
  if (!accessMenus?.length) return false;
  const target = String(privilegeId).trim();
  return accessMenus.some((menu) => String(menu.id).trim() === target);
}

/** True when the user has at least one of the listed privileges. */
export function hasAnyPrivilege(
  accessMenus: AccessMenuItem[] | null | undefined,
  privilegeIds: PrivilegeId | PrivilegeId[] | string | string[],
): boolean {
  const ids = Array.isArray(privilegeIds) ? privilegeIds : [privilegeIds];
  return ids.some((id) => hasPrivilege(accessMenus, id));
}

/**
 * Role-management gate for a feature.
 * - While menus are unresolved or failed: deny mapped features (fail closed).
 * - After a successful load: require the mapped privilege(s).
 */
export function canAccessByPrivilege(
  accessMenus: AccessMenuItem[] | null | undefined,
  privilegesLoaded: boolean,
  privilegeIds: PrivilegeId | PrivilegeId[] | string | string[] | undefined,
): boolean {
  // No privilege mapping → role template alone decides visibility.
  if (privilegeIds == null) return true;
  if (!privilegesLoaded) return false;
  return hasAnyPrivilege(accessMenus, privilegeIds);
}
