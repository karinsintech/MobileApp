/**
 * Bordered horizontal chip/tab strip with edge fades + a chevron when more
 * options sit off-screen — operators otherwise cannot tell the row scrolls.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  type FlatListProps,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Colors, FontSize, Radius, Spacing } from '../../theme';

type ScrollableChipBarProps<T> = Omit<FlatListProps<T>, 'horizontal'> & {
  /** Extra style on the bordered container around the chips. */
  containerStyle?: StyleProp<ViewStyle>;
};

export function ScrollableChipBar<T>({
  containerStyle,
  contentContainerStyle,
  onScroll,
  onLayout,
  onContentSizeChange,
  ...listProps
}: ScrollableChipBarProps<T>) {
  const [viewportW, setViewportW] = useState(0);
  const [contentW, setContentW] = useState(0);
  const [offsetX, setOffsetX] = useState(0);

  // A few px of slack so tiny float rounding does not flash the fade forever.
  const canScrollRight = contentW > viewportW + 4 && offsetX < contentW - viewportW - 6;
  const canScrollLeft = offsetX > 6;

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    setViewportW(e.nativeEvent.layout.width);
    onLayout?.(e);
  }, [onLayout]);

  const handleContentSizeChange = useCallback((w: number, h: number) => {
    setContentW(w);
    onContentSizeChange?.(w, h);
  }, [onContentSizeChange]);

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffsetX(e.nativeEvent.contentOffset.x);
    onScroll?.(e);
  }, [onScroll]);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <FlatList
        {...listProps}
        horizontal
        showsHorizontalScrollIndicator={false}
        // Only reserve edge space when ‹ / › are visible — avoids empty side gaps at rest.
        contentContainerStyle={[
          styles.row,
          canScrollLeft && styles.rowPadLeft,
          canScrollRight && styles.rowPadRight,
          contentContainerStyle,
        ]}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />

      {canScrollLeft ? (
        <>
          <LinearGradient
            colors={['rgba(4,28,51,0.96)', 'rgba(4,28,51,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fadeLeft}
            pointerEvents="none"
          />
          <View style={styles.moreHintLeft} pointerEvents="none" accessibilityElementsHidden>
            <Text style={styles.moreHintText}>‹</Text>
          </View>
        </>
      ) : null}

      {canScrollRight ? (
        <>
          <LinearGradient
            colors={['rgba(4,28,51,0)', 'rgba(4,28,51,0.96)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.fadeRight}
            pointerEvents="none"
          />
          <View style={styles.moreHintRight} pointerEvents="none" accessibilityElementsHidden>
            <Text style={styles.moreHintText}>›</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing[1],
    // Extra top pad so claim count badges (absolute, top: -7) stay inside the strip.
    paddingTop: 12,
    paddingBottom: Spacing[2],
    paddingHorizontal: Spacing[2],
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    borderRadius: Radius.md,
    backgroundColor: Colors.glass.bg,
    // Visible so badge dots are not clipped; fades still sit above the chips.
    overflow: 'visible',
  },
  row: {
    gap: 8,
    paddingVertical: 2,
  },
  // Slim inset so chips clear the chevron without a wide empty strip.
  rowPadLeft: {
    paddingLeft: 16,
  },
  rowPadRight: {
    paddingRight: 16,
  },
  fadeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 28,
    borderTopLeftRadius: Radius.md,
    borderBottomLeftRadius: Radius.md,
  },
  fadeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
    borderTopRightRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  },
  moreHintLeft: {
    position: 'absolute',
    left: 2,
    top: 0,
    bottom: 0,
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreHintRight: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreHintText: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.infoLight,
    lineHeight: FontSize.xl + 2,
  },
});
