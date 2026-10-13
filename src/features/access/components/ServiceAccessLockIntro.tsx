/**
 * Locked-service intro — Vahan / eChallan / Sarathi.
 * Left-aligned brand header, benefits card, sticky Request Access footer.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LiquidBackground, ScreenHeader } from '../../../components';
import { ArrowRightIcon, InfoIcon } from '../../../components/icons';
import { Colors, FontSize, FontFamily, Spacing, Radius } from '../../../theme';
import type { ServiceLockCopy } from '../serviceAccessCopy';
import { ServiceAccessIcon, SERVICE_ACCESS_ICON_TINT } from '../serviceAccessIcons';

interface ServiceAccessLockIntroProps {
  copy: ServiceLockCopy;
  onRequestAccess: () => void;
}

export default function ServiceAccessLockIntro({
  copy,
  onRequestAccess,
}: ServiceAccessLockIntroProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <LiquidBackground>
      <ScreenHeader title={copy.screenTitle} showBack />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Brand header — left-aligned icon + title row */}
        <View style={styles.hero}>
          <View style={styles.brandIconWrap}>
            <ServiceAccessIcon name={copy.brandIcon} size={26} color={Colors.white} />
          </View>
          <View style={styles.heroText}>
            <View style={styles.heroTitleRow}>
              <Text style={styles.heroTitle}>{copy.heroTitle}</Text>
              
            </View>
            <Text style={styles.tagline}>{copy.tagline}</Text>
          </View>
        </View>

        <View style={styles.card}>
          {/* Warning sits left of the label so status reads as one inline cue */}
          <View style={styles.statusRow}>
            <ServiceAccessIcon name="warning" size={20} color={Colors.warning} />
            <Text style={styles.statusText}>Access not enabled</Text>
          </View>

          {/* Features stretch evenly so leftover height is shared, not one empty gap */}
          <View style={styles.featuresBlock}>
            <Text style={styles.featuresHeading}>What you can do once enabled</Text>
            <View style={styles.featuresList}>
              {copy.features.map((feature, index) => (
                <View
                  key={feature.title}
                  style={[
                    styles.featureRow,
                    index < copy.features.length - 1 && styles.featureRowBorder,
                  ]}
                >
                  <View style={styles.featureIconWrap}>
                    <ServiceAccessIcon
                      name={feature.icon}
                      size={18}
                      color={SERVICE_ACCESS_ICON_TINT}
                    />
                  </View>
                  <View style={styles.featureText}>
                    <Text style={styles.featureTitle}>{feature.title}</Text>
                    <Text style={styles.featureDesc}>{feature.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.poweredBy}>
            <InfoIcon size={13} color={Colors.blueBright} />
            <Text style={styles.poweredByText}>{copy.poweredBy}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: bottomPad }]}>
        <TouchableOpacity
          style={styles.requestBtn}
          onPress={onRequestAccess}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Request Access"
        >
          <Text style={styles.requestBtnText}>Request Access</Text>
          <ArrowRightIcon size={16} color={Colors.navy} />
        </TouchableOpacity>
      </View>
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[3],
    paddingBottom: Spacing[3],
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[3],
    marginBottom: Spacing[5],
  },
  brandIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    flex: 1,
    gap: 6,
  },
  heroTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  heroTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.white,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: Colors.glass.interactive,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
  },
  badgeText: {
    fontFamily: FontFamily.semibold,
    fontSize: 9,
    fontWeight: '700',
    color: Colors.blueBright,
    letterSpacing: 0.8,
  },
  tagline: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.sm,
    color: Colors.text.secondary,
    lineHeight: 18,
    textAlign: 'left',
  },

  card: {
    flexGrow: 1,
    justifyContent: 'space-between',
    borderRadius: Radius.xl,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 1,
    borderColor: Colors.glass.border,
    paddingHorizontal: Spacing[5],
    paddingTop: Spacing[5],
    paddingBottom: Spacing[4],
    gap: Spacing[4],
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  statusText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.warningLight,
  },
  featuresBlock: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  featuresHeading: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: Spacing[3],
  },
  featuresList: {
    flexGrow: 1,
    justifyContent: 'space-evenly',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: Spacing[2],
  },
  featureRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.divider,
  },
  featureIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.sm,
    backgroundColor: Colors.glass.interactive,
    borderWidth: 1,
    borderColor: Colors.glass.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    gap: 3,
  },
  featureTitle: {
    fontFamily: FontFamily.semibold,
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.white,
  },
  featureDesc: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
    color: Colors.text.subtle,
    lineHeight: 20,
  },
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: Spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.divider,
  },
  poweredByText: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.base,
    color: Colors.text.muted,
    lineHeight: 18,
  },

  footer: {
    paddingHorizontal: Spacing[4],
    paddingTop: Spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.navBorder,
    backgroundColor: Colors.navBg,
  },
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.yellow,
    borderRadius: Radius.md,
    paddingVertical: 14,
    minHeight: 48,
  },
  requestBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.base,
    fontWeight: '800',
    color: Colors.navy,
  },
});
