/**
 * Horizontal card tabs for customer profile — same keys/labels as web
 * UserProfile (My Profile, Fastag, Vahan, eChallan, Sarathi).
 */

import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import { Colors, FontSize, Spacing, Radius } from '../../../theme';

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
  if (tabs.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <TouchableOpacity
              key={tab.key}
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
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  row: {
    paddingHorizontal: Spacing[4],
    gap: 8,
    paddingBottom: Spacing[2],
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    backgroundColor: Colors.glass.bg,
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
