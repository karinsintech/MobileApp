import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LiquidBackground, GlassCard } from '../../../components';
import { Colors, FontSize, Spacing } from '../../../theme';
import { useAppSelector } from '../../../store';
import { getMoreMenu, type MenuTarget } from '../../../navigation/menuConfig';
import { useUnreadNotificationCount } from '../../notifications/hooks/useUnreadNotificationCount';

export default function MoreMenuScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<any>();
  const roleKey = useAppSelector((s) => s.auth.user?.roleKey);
  const accessMenus = useAppSelector((s) => s.role.accessMenus);
  const privilegesLoaded = useAppSelector((s) => s.role.privilegesLoaded);
  const isLoading = useAppSelector((s) => s.role.isLoading);
  const unreadNotifications = useUnreadNotificationCount();

  // Role template ∩ web Role Management privileges (SideNav parity).
  const sections = getMoreMenu(roleKey, accessMenus, privilegesLoaded);

  const go = (target: MenuTarget) => {
    if (target.tab) {
      nav.navigate(target.tab, { screen: target.screen, params: target.params });
    } else {
      nav.navigate(target.screen, target.params);
    }
  };

  return (
    <LiquidBackground>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>More</Text>
      </View>
      {!privilegesLoaded && isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.yellow} />
          <Text style={styles.loadingText}>Checking access...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>
              <View style={styles.grid}>
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.tile}
                    onPress={() => go(item.target)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                  >
                    <GlassCard style={styles.tileCard}>
                      <View style={styles.tileIconWrap}>
                        <Text style={styles.tileIcon}>{item.icon}</Text>
                        {item.key === 'notifications' && unreadNotifications > 0 ? (
                          <View style={styles.notifBadge}>
                            <Text style={styles.notifBadgeText}>
                              {unreadNotifications > 9 ? '9+' : unreadNotifications}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.tileLabel}>{item.label}</Text>
                    </GlassCard>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </LiquidBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing[4], paddingBottom: Spacing[3] },
  title:  { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing[4], paddingBottom: Spacing[4], gap: 12 },
  loadingText: { fontSize: FontSize.base, color: Colors.white, textAlign: 'center' },
  scroll: { paddingHorizontal: Spacing[4], paddingTop: Spacing[2], paddingBottom: 32 },
  section: { marginBottom: Spacing[4] },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.text.label, letterSpacing: 1.2, marginBottom: Spacing[2] },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile:   { width: '47%' },
  tileCard:  { alignItems: 'center', paddingVertical: 20, gap: 8 },
  tileIconWrap: { position: 'relative' },
  tileIcon:  { fontSize: 28 },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.white,
  },
  tileLabel: { fontSize: FontSize.base, fontWeight: '600', color: Colors.white, textAlign: 'center' },
});
