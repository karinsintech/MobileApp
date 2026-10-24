import React from 'react';
import Svg, {Circle, Line, Path, Rect} from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
}

const strokeProps = (color: string) => ({
  stroke: color,
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function BellIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" {...strokeProps(color)} />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" {...strokeProps(color)} />
    </Svg>
  );
}

export function SearchIcon({size = 20, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="7" {...strokeProps(color)} />
      <Line x1="16.2" y1="16.2" x2="21" y2="21" {...strokeProps(color)} />
    </Svg>
  );
}

export function ScanIcon({size = 20, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" {...strokeProps(color)} />
      <Rect x="8" y="8" width="8" height="8" rx="1.5" {...strokeProps(color)} />
    </Svg>
  );
}

export function ChevronRightIcon({size = 18, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m9 18 6-6-6-6" {...strokeProps(color)} />
    </Svg>
  );
}

/** Navigation back chevron — mirrors ChevronRight for stack headers. */
export function ChevronLeftIcon({size = 18, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" {...strokeProps(color)} />
    </Svg>
  );
}

export function WarningIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10.3 3.8 2.5 17.4A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.6L13.7 3.8a2 2 0 0 0-3.4 0Z" {...strokeProps(color)} />
      <Line x1="12" y1="9" x2="12" y2="13" {...strokeProps(color)} />
      <Circle cx="12" cy="17" r="0.8" fill={color} />
    </Svg>
  );
}

export function TruckIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" {...strokeProps(color)} />
      <Circle cx="7" cy="18" r="2" {...strokeProps(color)} />
      <Circle cx="18" cy="18" r="2" {...strokeProps(color)} />
    </Svg>
  );
}

export function DashboardIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" rx="2" {...strokeProps(color)} />
      <Rect x="14" y="3" width="7" height="7" rx="2" {...strokeProps(color)} />
      <Rect x="3" y="14" width="7" height="7" rx="2" {...strokeProps(color)} />
      <Rect x="14" y="14" width="7" height="7" rx="2" {...strokeProps(color)} />
    </Svg>
  );
}

export function TollIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 21V3M19 21V3M9 21V3M15 21V3M3 7h18" {...strokeProps(color)} />
    </Svg>
  );
}

export function VehiclesIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 16 1.6-6.2A2.4 2.4 0 0 1 9 8h6a2.4 2.4 0 0 1 2.4 1.8L19 16" {...strokeProps(color)} />
      <Rect x="3" y="14" width="18" height="5" rx="2" {...strokeProps(color)} />
      <Circle cx="7" cy="19" r="1.5" fill={color} />
      <Circle cx="17" cy="19" r="1.5" fill={color} />
    </Svg>
  );
}

export function ClaimsIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="3" width="14" height="18" rx="2" {...strokeProps(color)} />
      <Path d="M9 3.5h6V6H9zM8.5 11h7M8.5 15h5" {...strokeProps(color)} />
    </Svg>
  );
}

export function MoreIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="1.5" fill={color} />
      <Circle cx="12" cy="12" r="1.5" fill={color} />
      <Circle cx="19" cy="12" r="1.5" fill={color} />
    </Svg>
  );
}

export function AlertDot({size = 8, color = '#FF6B6B'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 8 8">
      <Circle cx={4} cy={4} r={4} fill={color} />
    </Svg>
  );
}

export function CopyIcon({size = 16, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9" y="9" width="13" height="13" rx="2" {...strokeProps(color)} />
      <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...strokeProps(color)} />
    </Svg>
  );
}

export function LockIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="11" width="14" height="10" rx="2" {...strokeProps(color)} />
      <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...strokeProps(color)} />
      <Circle cx="12" cy="16" r="1.2" fill={color} />
    </Svg>
  );
}

export function ShieldCheckIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3 5 6v6c0 5 3.2 7.8 7 9 3.8-1.2 7-4 7-9V6l-7-3Z" {...strokeProps(color)} />
      <Path d="m9 12 2 2 4-4" {...strokeProps(color)} />
    </Svg>
  );
}

export function FileTextIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" {...strokeProps(color)} />
      <Path d="M14 3v5h5M9 13h6M9 17h4" {...strokeProps(color)} />
    </Svg>
  );
}

export function IdCardIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps(color)} />
      <Circle cx="9" cy="12" r="2.2" {...strokeProps(color)} />
      <Path d="M14 10h5M14 14h3" {...strokeProps(color)} />
    </Svg>
  );
}

export function PhoneIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.5 3.5h3l1.2 3.2-1.8 1.2a12 12 0 0 0 5.2 5.2l1.2-1.8 3.2 1.2v3a1.5 1.5 0 0 1-1.5 1.5A14.5 14.5 0 0 1 5 6.5 1.5 1.5 0 0 1 6.5 5"
        {...strokeProps(color)}
      />
    </Svg>
  );
}

export function CreditCardIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps(color)} />
      <Path d="M3 10h18M7 15h4" {...strokeProps(color)} />
    </Svg>
  );
}

export function RupeeIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M7 6h10M7 10h10M13 6c-2.5 0-4.5 1.5-4.5 4S10.5 14 13 14H7l6 4" {...strokeProps(color)} />
    </Svg>
  );
}

export function ClockIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" {...strokeProps(color)} />
      <Path d="M12 8v4.5L15 15" {...strokeProps(color)} />
    </Svg>
  );
}

export function BanIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" {...strokeProps(color)} />
      <Line x1="6.5" y1="6.5" x2="17.5" y2="17.5" {...strokeProps(color)} />
    </Svg>
  );
}

export function DownloadIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v10M8 10l4 4 4-4" {...strokeProps(color)} />
      <Path d="M5 18h14" {...strokeProps(color)} />
    </Svg>
  );
}

/** Cloud + download — same stroke language as DownloadIcon / tab icons. */
export function CloudDownloadIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7.5 18H7a4 4 0 0 1-.3-8 5.5 5.5 0 0 1 10.6-1.4A3.5 3.5 0 0 1 18.5 18H16.5"
        {...strokeProps(color)}
      />
      <Path d="M12 12v6M9.5 15.5 12 18l2.5-2.5" {...strokeProps(color)} />
    </Svg>
  );
}

/** Solid vehicle mark for brand tiles (enterprise lock hero). */
export function VehiclesSolidIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5.2 15.5 6.6 9.8A2.2 2.2 0 0 1 8.7 8h6.6a2.2 2.2 0 0 1 2.1 1.8l1.4 5.7"
        fill={color}
        opacity={0.92}
      />
      <Rect x="3.5" y="14" width="17" height="4.5" rx="1.8" fill={color} />
      <Circle cx="7.2" cy="19.2" r="1.4" fill={color} />
      <Circle cx="16.8" cy="19.2" r="1.4" fill={color} />
      <Circle cx="7.2" cy="19.2" r="0.55" fill="#0071C5" />
      <Circle cx="16.8" cy="19.2" r="0.55" fill="#0071C5" />
    </Svg>
  );
}

export function UsersIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3" {...strokeProps(color)} />
      <Path d="M3.5 19a5.5 5.5 0 0 1 11 0" {...strokeProps(color)} />
      <Circle cx="17" cy="9" r="2.2" {...strokeProps(color)} />
      <Path d="M15.2 19a4.2 4.2 0 0 1 5.3-3.5" {...strokeProps(color)} />
    </Svg>
  );
}

export function BuildingIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" {...strokeProps(color)} />
      <Path d="M15 10h4a1 1 0 0 1 1 1v10" {...strokeProps(color)} />
      <Path d="M8 8h3M8 12h3M8 16h3M4 21h16" {...strokeProps(color)} />
    </Svg>
  );
}

export function ChartIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 19V5M4 19h16" {...strokeProps(color)} />
      <Path d="M8 16v-5M12 16V8M16 16v-8" {...strokeProps(color)} />
    </Svg>
  );
}

export function CheckIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m5 12 5 5L20 7" {...strokeProps(color)} />
    </Svg>
  );
}

export function SendIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m4 11 16-7-7 16-2.2-6.8L4 11Z" {...strokeProps(color)} />
    </Svg>
  );
}

export function UserIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" {...strokeProps(color)} />
      <Path d="M5 19a7 7 0 0 1 14 0" {...strokeProps(color)} />
    </Svg>
  );
}

export function MessageIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" {...strokeProps(color)} />
    </Svg>
  );
}

export function InfoIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8" {...strokeProps(color)} />
      <Line x1="12" y1="11" x2="12" y2="16" {...strokeProps(color)} />
      <Circle cx="12" cy="8" r="0.9" fill={color} />
    </Svg>
  );
}

export function ArrowRightIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M13 6l6 6-6 6" {...strokeProps(color)} />
    </Svg>
  );
}

/** QR-code glyph for UPI VPA rows (web QrcodeOutlined parity). */
export function QrCodeIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="3" width="7" height="7" rx="1" {...strokeProps(color)} />
      <Rect x="14" y="3" width="7" height="7" rx="1" {...strokeProps(color)} />
      <Rect x="3" y="14" width="7" height="7" rx="1" {...strokeProps(color)} />
      <Path d="M14 14h3v3h-3zM17 17h3v3h-3zM14 20h3M20 14v3" {...strokeProps(color)} />
    </Svg>
  );
}

/** Circular refresh / sync glyph for live balance pull. */
export function RefreshIcon({size = 22, color = '#FFFFFF'}: IconProps) {
  const thick = {
    stroke: color,
    strokeWidth: 2.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M21 12a9 9 0 1 1-2.6-6.3" {...thick} />
      <Path d="M21 3v6h-6" {...thick} />
    </Svg>
  );
}
