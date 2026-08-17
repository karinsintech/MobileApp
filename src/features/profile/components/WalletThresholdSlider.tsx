/**
 * Low balance threshold slider — pure RN control (no native RNCSlider module).
 * Matches web min/max/step; works after Metro reload without a native rebuild.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, PanResponder, LayoutChangeEvent,
} from 'react-native';
import { Colors, FontSize, Spacing } from '../../../theme';
import { formatINR } from '../../../utils/format';
import {
  WALLET_THRESHOLD_MAX,
  WALLET_THRESHOLD_MIN,
  WALLET_THRESHOLD_STEP,
  ratioToThreshold,
  snapWalletThreshold,
  thresholdToRatio,
} from '../../../constants/walletThresholdConstants';

const THUMB_SIZE = 28;

interface WalletThresholdSliderProps {
  value: number;
  onChange: (next: number) => void;
  onDragStateChange?: (isDragging: boolean) => void;
  disabled?: boolean;
  minimumBalance?: number;
  defaultThreshold?: number;
}

export function WalletThresholdSlider({
  value,
  onChange,
  onDragStateChange,
  disabled = false,
  minimumBalance: _minimumBalance = 0,
  defaultThreshold: _defaultThreshold = 0,
}: WalletThresholdSliderProps) {
  const snapped = snapWalletThreshold(value);
  const [trackWidth, setTrackWidth] = useState(0);

  const trackWidthRef = useRef(0);
  const trackLeftRef = useRef(0);
  const trackRef = useRef<View>(null);
  const onChangeRef = useRef(onChange);
  const onDragStateChangeRef = useRef(onDragStateChange);
  const disabledRef = useRef(disabled);

  onChangeRef.current = onChange;
  onDragStateChangeRef.current = onDragStateChange;
  disabledRef.current = disabled;

  const measureTrack = useCallback(() => {
    trackRef.current?.measureInWindow((x, _y, width) => {
      trackLeftRef.current = x;
      trackWidthRef.current = width;
      setTrackWidth(width);
    });
  }, []);

  const updateFromPageX = useCallback((pageX: number) => {
    if (disabledRef.current || trackWidthRef.current <= 0) return;
    const localX = pageX - trackLeftRef.current;
    const ratio = localX / trackWidthRef.current;
    onChangeRef.current(ratioToThreshold(ratio));
  }, []);

  const panResponder = useMemo(
    () => PanResponder.create({
      // Capture before the parent ScrollView so the thumb actually moves.
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onStartShouldSetPanResponderCapture: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponderCapture: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (evt) => {
        onDragStateChangeRef.current?.(true);
        updateFromPageX(evt.nativeEvent.pageX);
      },
      onPanResponderMove: (evt) => updateFromPageX(evt.nativeEvent.pageX),
      onPanResponderRelease: () => onDragStateChangeRef.current?.(false),
      onPanResponderTerminate: () => onDragStateChangeRef.current?.(false),
    }),
    [updateFromPageX],
  );

  const handleTrackLayout = (_event: LayoutChangeEvent) => {
    measureTrack();
  };

  const fillRatio = thresholdToRatio(snapped);
  const thumbLeft = trackWidth > 0
    ? fillRatio * (trackWidth - THUMB_SIZE)
    : 0;

  return (
    <View style={styles.wrap}>
      <Text style={styles.amount}>{formatINR(snapped)}</Text>
    

      <View
        ref={trackRef}
        style={[styles.trackHit, disabled && styles.trackDisabled]}
        onLayout={handleTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${fillRatio * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            { left: thumbLeft, opacity: disabled ? 0.5 : 1 },
          ]}
        />
      </View>

      <View style={styles.rangeRow}>
        <Text style={styles.rangeText}>{formatINR(WALLET_THRESHOLD_MIN, true)}</Text>
        <Text style={styles.rangeText}>{formatINR(WALLET_THRESHOLD_MAX, true)}</Text>
      </View>

      <Text style={styles.stepNote}>
        Adjust in {formatINR(WALLET_THRESHOLD_STEP, true)} steps
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing[4] },
  amount: {
    fontSize: FontSize['5xl'],
    fontWeight: '800',
    color: Colors.white,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.text.subtle,
    textAlign: 'center',
    marginBottom: Spacing[5],
  },
  trackHit: {
    height: 44,
    justifyContent: 'center',
    marginBottom: 4,
  },
  trackDisabled: { opacity: 0.55 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.glass.borderStrong,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: Colors.yellow,
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 8,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.yellow,
    borderWidth: 3,
    borderColor: Colors.navy,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingHorizontal: 2,
  },
  rangeText: {
    fontSize: FontSize.xs,
    color: Colors.text.subtle,
    fontWeight: '600',
  },
  stepNote: {
    marginTop: Spacing[2],
    fontSize: FontSize.xs,
    color: Colors.text.subtle,
    textAlign: 'center',
  },
});
