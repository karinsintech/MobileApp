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
