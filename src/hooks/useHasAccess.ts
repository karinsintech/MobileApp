/**
 * Hook — whether the signed-in user has a Role Management privilege ID.
 * Mirrors web useHasAccess; unresolved or failed fetches deny mapped features.
 */

import { useAppSelector } from '../store';
import { canAccessByPrivilege } from '../utils/hasAccess';
import type { PrivilegeId } from '../types/accessMenus';

export function useHasAccess(
  privilegeIds: PrivilegeId | PrivilegeId[] | string | string[] | undefined,
): boolean {
  const accessMenus = useAppSelector((s) => s.role.accessMenus);
  const privilegesLoaded = useAppSelector((s) => s.role.privilegesLoaded);
  return canAccessByPrivilege(accessMenus, privilegesLoaded, privilegeIds);
}
