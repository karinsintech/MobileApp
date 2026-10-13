/**
 * Lock-screen icons — only the shared Karins stroke SVG set (same language as
 * tab icons: Vehicles, Claims, Dashboard). Brand tiles can use a solid mark.
 */

import React from 'react';
import {
  BanIcon,
  BellIcon,
  BuildingIcon,
  ChartIcon,
  CheckIcon,
  ClaimsIcon,
  ClockIcon,
  CloudDownloadIcon,
  CreditCardIcon,
  FileTextIcon,
  IdCardIcon,
  LockIcon,
  RupeeIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
  VehiclesIcon,
  VehiclesSolidIcon,
  WarningIcon,
  type IconProps,
} from '../../components/icons';
import { Colors } from '../../theme';

export type ServiceAccessIconKey =
  | 'lock'
  | 'warning'
  | 'truck'
  | 'truckSolid'
  | 'idCard'
  | 'claims'
  | 'bell'
  | 'creditCard'
  | 'rupee'
  | 'chart'
  | 'fileText'
  | 'shield'
  | 'clock'
  | 'download'
  | 'search'
  | 'ban'
  | 'users'
  | 'building'
  | 'check';

const ICON_MAP: Record<ServiceAccessIconKey, React.ComponentType<IconProps>> = {
  lock: LockIcon,
  warning: WarningIcon,
  truck: VehiclesIcon,
  truckSolid: VehiclesSolidIcon,
  idCard: IdCardIcon,
  // e-Challan brand uses the same Claims document mark as the bottom tab.
  claims: ClaimsIcon,
  bell: BellIcon,
  creditCard: CreditCardIcon,
  rupee: RupeeIcon,
  chart: ChartIcon,
  fileText: FileTextIcon,
  shield: ShieldCheckIcon,
  clock: ClockIcon,
  download: CloudDownloadIcon,
  search: SearchIcon,
  ban: BanIcon,
  users: UsersIcon,
  building: BuildingIcon,
  check: CheckIcon,
};

/** Default feature-row tint — matches enterprise mock line icons. */
export const SERVICE_ACCESS_ICON_TINT = Colors.blueBright;

export function ServiceAccessIcon({
  name,
  size = 20,
  color = Colors.white,
}: {
  name: ServiceAccessIconKey;
  size?: number;
  color?: string;
}) {
  const Icon = ICON_MAP[name] ?? LockIcon;
  return <Icon size={size} color={color} />;
}
