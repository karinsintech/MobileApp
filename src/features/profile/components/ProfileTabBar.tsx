/**
 * Horizontal card tabs for customer profile — same keys/labels as web
 * UserProfile (My Profile, Fastag, Vahan, eChallan, Sarathi).
 * Uses ScrollableChipBar so overflow tabs show a › fade hint.
 */

import React, { useMemo } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
} from 'react-native';
import { ScrollableChipBar } from '../../../components';
import { Colors, FontSize, Radius, Spacing } from '../../../theme';

export type ProfileTabKey =
  | 'profile'
  | 'fastag'
  | 'vahan'
  | 'echallan'
  | 'sarathi';

export interface ProfileTabItem {
  key: ProfileTabKey;
  label: string;
}

interface ProfileTabBarProps {
  tabs: ProfileTabItem[];
  activeKey: ProfileTabKey;
  onChange: (key: ProfileTabKey) => void;
}

export default function ProfileTabBar({
  tabs,
  activeKey,
  onChange,
}: ProfileTabBarProps) {
  const data = useMemo(() => tabs, [tabs]);

  if (tabs.length === 0) return null;

  return (
    <ScrollableChipBar
      containerStyle={styles.wrap}
      data={data}
      keyExtractor={(tab) => tab.key}
      renderItem={({ item: tab }) => {
        const active = tab.key === activeKey;
        return (
          <TouchableOpacity
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(tab.key)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing[3],
    marginHorizontal: Spacing[4],
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    backgroundColor: Colors.glass.bgMedium,
  },
  tabActive: {
    backgroundColor: Colors.blue,
    borderColor: Colors.blueBright,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  tabTextActive: {
    color: Colors.white,
    fontWeight: '700',
  },
});
