/**
 * Shared screen header — back, title/subtitle, and optional right actions
 * (download, filters). Always keeps a single row so narrow phones do not
 * push actions onto a separate band above the title.
 */

import React, { useContext } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { Colors, FontSize, FontFamily, AppTypography, Spacing } from '../../theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightElement?: React.ReactNode;
}

/** Slightly tighter title when the action cluster would otherwise crowd the row. */
const NARROW_HEADER_WIDTH = 380;

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.backBtn}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={styles.backArrow}>←</Text>
    </TouchableOpacity>
  );
}

export function ScreenHeader({ title, subtitle, showBack = false, rightElement }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  // Context (not useNavigation) so mandatory post-login screens outside a
  // stack navigator do not throw "Couldn't find a navigation object".
  const nav = useContext(NavigationContext);
  const { width } = useWindowDimensions();
  // Shrink title typography instead of stacking actions on their own row.
  const isNarrow = width < NARROW_HEADER_WIDTH && Boolean(rightElement);
  const canGoBack = Boolean(showBack && nav);

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.left}>
        {canGoBack ? <BackButton onPress={() => nav!.goBack()} /> : null}
        <View style={styles.titleBlock}>
          <Text
            style={[styles.title, isNarrow && styles.titleNarrow]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.2}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text
              style={styles.subtitle}
              numberOfLines={1}
              maxFontSizeMultiplier={1.15}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {/* flexShrink: 0 keeps download/filters glued to the trailing edge of this same row. */}
      {rightElement ? <View style={styles.right}>{rightElement}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing[4],
    paddingBottom: Spacing[3],
    gap: Spacing[2],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    flex: 1,
    minWidth: 0,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
    flexShrink: 0,
  },
  titleBlock: { flex: 1, minWidth: 0 },
  backBtn: {
    width: 36,
    height: 36,
    backgroundColor: Colors.glass.bg,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backArrow: { fontSize: 18, color: Colors.text.primary },
  // Main page title follows the app-wide 24-28px semi-bold guidance.
  title: {
    ...AppTypography.mainPageTitle,
    color: Colors.text.primary,
  },
  titleNarrow: { fontSize: FontSize['2xl'] },
  subtitle: {
    ...AppTypography.labelCaption,
    color: Colors.text.subtle,
    marginTop: 2,
    fontFamily: FontFamily.medium,
  },
});
