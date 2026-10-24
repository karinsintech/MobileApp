/**
 * App screen canvas — navy gradient + soft glows behind content.
 *
 * On iOS (Fabric), putting Flex children directly inside LinearGradient often
 * leaves FlatLists at height 0 (blank body until a filter toggle). The gradient
 * is painted absolutely; a real View owns the flex layout for children.
 */

import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {Colors} from '../../theme';

interface LiquidBackgroundProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Inner screens use a calmer gradient to protect data readability. */
  variant?: 'full' | 'light';
}

export function LiquidBackground({
  children,
  style,
  variant = 'full',
}: LiquidBackgroundProps) {
  const colors = variant === 'full'
    ? [Colors.bg.d0, Colors.bg.d1, Colors.bg.d2, Colors.bg.d3]
    : [Colors.bg.d2, Colors.bg.d1, Colors.bg.d0];

  return (
    <View style={[styles.fill, style]}>
      <LinearGradient
        colors={colors}
        locations={variant === 'full' ? [0, 0.28, 0.68, 1] : [0, 0.58, 1]}
        start={{x: 0.15, y: 0}}
        end={{x: 0.85, y: 1}}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View pointerEvents="none" style={styles.blueGlow} />
      <View pointerEvents="none" style={styles.cyanGlow} />
      <View pointerEvents="none" style={styles.bottomGlow} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {flex: 1},
  content: {
    flex: 1,
    width: '100%',
    // Explicit column so ScreenHeader + FlatList share height predictably on iOS.
    flexDirection: 'column',
  },
  blueGlow: {
    position: 'absolute',
    top: -150,
    right: -130,
    width: 390,
    height: 390,
    borderRadius: 195,
    backgroundColor: 'rgba(0,113,197,0.16)',
  },
  cyanGlow: {
    position: 'absolute',
    top: 210,
    left: -190,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(99,230,255,0.035)',
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -180,
    right: -130,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: 'rgba(47,128,255,0.07)',
  },
});
