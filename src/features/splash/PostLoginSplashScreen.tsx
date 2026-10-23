import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Animated, Easing, StyleSheet, Pressable, ScrollView,
  AccessibilityInfo, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../../store';
import { setDashboardContext } from '../../store/slices/authSlice';
import { dashboardApi } from '../../services/api/dashboardApi';
import { Cache } from '../../services/storage/SecureStorage';
import { normalizeDashboardSummary } from '../dashboard/utils/dashboardSummaryUtils';
import { resolveYesterdayVehicleCount } from '../dashboard/utils/fleetUtilizationUtils';
import {
  filterAssociatedCustomers,
  isCustomerGroupAdminLabel,
  normalizeCustomers,
  resolveDefaultCustomerOption,
} from '../dashboard/components/customerContextUtils';
import {
  isCustomerGroupAdmin,
  requiresAdminContextPicker,
  resolveActiveCustomerId,
  type DashboardContext,
} from '../../types/auth';
import type { DashboardSummary } from '../../types/dashboard';
import { FontFamily } from '../../theme';

const CONTEXT_CACHE_KEY = 'dashboard_context';
const CUSTOMERS_CACHE_KEY = 'associated_customers';

interface CustomersCacheEntry {
  list: { customerId: number; customerName: string; mobileNumber?: number | string }[];
  fetchedAt: number;
}

/**
 * Karins Fleet — post-login "emotional" splash (deployment design).
 * Shown once after a successful sign-in, before the main app shell loads.
 *
 * Narrative (~7.5s, auto-continues to home):
 *   greeting → guardian strip → overnight activity → loss-prevented tally
 *   → emotional payoff → Karins brand → auto-advance / tap to skip.
 *
 * Pure RN Animated + react-native-svg. Respects Reduce Motion.
 */

const C = {
  bgA: '#060B16', bgB: '#02060D', bgC: '#0B0A07',
  white: '#FFFFFF',
  green: '#28A745', greenBright: '#34C759',
  amber: '#FFC107',
  // Keep body copy readable on dark splash — avoid washed-out transparent whites.
  w88: 'rgba(255,255,255,0.95)', w90: 'rgba(255,255,255,0.96)',
  w46: 'rgba(255,255,255,0.88)', w42: 'rgba(255,255,255,0.86)',
  w34: 'rgba(255,255,255,0.82)', w30: 'rgba(255,255,255,0.80)',
  w24: 'rgba(255,255,255,0.78)',
};
// JetBrains Mono is not in Info.plist — missing faces paint blank on iOS.
// Menlo / monospace keep tally and timestamps readable without shipping another TTF.
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;
// iOS Fabric: Animated opacity fades + LinearGradient-as-flex-parent both leave the
// narrative blank (only the absolute bottom hint painted). Skip fades on iOS.
const SKIP_REVEAL_ANIM = Platform.OS === 'ios';

interface Props {
  onDone: () => void;
  /** Logged-in customer / fleet name for the greeting line */
  customerName?: string | null;
}

function Reveal({
  delay, duration = 600, dy = 12, reduce, style, children,
}: { delay: number; duration?: number; dy?: number; reduce: boolean; style?: object; children: React.ReactNode }) {
  // Plain View on iOS / Reduce Motion — never gate copy behind Animated opacity.
  const v = useRef(new Animated.Value(reduce || SKIP_REVEAL_ANIM ? 1 : 0)).current;
  useEffect(() => {
    if (reduce || SKIP_REVEAL_ANIM) {
      v.setValue(1);
      return;
    }
    v.setValue(0);
    const a = Animated.timing(v, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [v, delay, duration, reduce]);

  if (reduce || SKIP_REVEAL_ANIM) {
    return <View style={style}>{children}</View>;
  }

  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [dy, 0] });
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function inr(n: number): string {
  const s = String(Math.max(0, Math.round(n)));
  const last3 = s.slice(-3);
  const head = s.slice(0, -3);
  return '₹' + (head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function useCountUp(target: number, duration: number, startDelay: number, reduce: boolean): number {
  const [val, setVal] = useState(reduce ? target : 0);
  useEffect(() => {
    if (reduce) { setVal(target); return; }
    let raf = 0; let t0 = 0; let lastPaint = 0;
    const begin = setTimeout(() => {
      t0 = Date.now();
      const tick = () => {
        const now = Date.now();
        const p = Math.min((now - t0) / duration, 1);
        // Throttle React re-renders — full RAF would repaint ~60×/s for two counters.
        if (now - lastPaint >= 50 || p >= 1) {
          lastPaint = now;
          setVal(Math.round(p * target));
        }
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      tick();
    }, startDelay);
    return () => { clearTimeout(begin); if (raf) cancelAnimationFrame(raf); };
  }, [target, duration, startDelay, reduce]);
  return val;
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Calendar context for the splash — always the previous day, rolling at midnight. */
function getPreviousDayContext() {
  const yesterday = dayjs().subtract(1, 'day');
  return {
    label: yesterday.format('DD MMM YYYY'),
    shortLabel: yesterday.format('DD MMM'),
    weekday: yesterday.format('dddd'),
  };
}

interface SplashLog { tag: string; body: string; highlight?: boolean }
interface SplashBreakdownRow { label: string; tail: string; amt: number }
interface SplashData {
  previousDayLabel: string;
  previousDayShort: string;
  previousWeekday: string;
  totalSaved: number;
  // Headline figure rendered with the count-up in the "blocked" log line.
  highlightAmount: number;
  actions: number;
  logs: SplashLog[];
  breakdown: SplashBreakdownRow[];
}

const EMPTY_SPLASH: SplashData = {
  previousDayLabel: getPreviousDayContext().label,
  previousDayShort: getPreviousDayContext().shortLabel,
  previousWeekday: getPreviousDayContext().weekday,
  totalSaved: 0, highlightAmount: 0, actions: 0, logs: [], breakdown: [],
};

// Maps the real dashboard summary into the splash's narrative slots — toll and
// fleet utilisation figures come from yesterday's bucket so the story matches
// "what happened while you were away" and updates automatically each calendar day.
function buildSplashData(summary: DashboardSummary | null): SplashData {
  const day = getPreviousDayContext();
  if (!summary) {
    return {
      ...EMPTY_SPLASH,
      previousDayLabel: day.label,
      previousDayShort: day.shortLabel,
      previousWeekday: day.weekday,
    };
  }

  const claimsRecovered = summary.savings?.fyClaimsRecovered ?? 0;
  const incentivePaid = summary.savings?.fyIncentivePaid ?? 0;
  const totalSaved = summary.savings?.fyTotalSavings ?? (Number(claimsRecovered) + Number(incentivePaid));

  const yesterdayToll = summary.tollSpend?.yesterday;
  const txnCount = yesterdayToll?.txnCount ?? 0;
  const tollAmount = yesterdayToll?.amount ?? 0;
  const yesterdayVehicleCount = resolveYesterdayVehicleCount(summary.fleet, summary.tollSpend);
  const driverExpiring = summary.drivers?.expiringSoon ?? 0;
  const complianceAlerts = summary.compliance?.totalAlerts ?? 0;
  const fastagBalance = summary.wallet?.fastagBalance ?? 0;
  const pendingChallans = summary.challans?.pendingCount ?? 0;
  const dayRef = day.shortLabel;

  const logs: SplashLog[] = [];
  if (txnCount > 0) {
    logs.push({
      tag: 'TOLL',
      body: `${txnCount} toll transactions on ${dayRef}${tollAmount > 0 ? ` · ${inr(tollAmount)}` : ''}.`,
    });
  }
  if (Number(claimsRecovered) > 0) logs.push({ tag: 'CLAIMS', body: `recovered through verified claims · ${dayRef}.`, highlight: true });
  if (driverExpiring > 0) logs.push({ tag: 'DRIVERS', body: `${driverExpiring} licence renewal reminders raised · ${dayRef}.` });
  if (complianceAlerts > 0) logs.push({ tag: 'COMPLIANCE', body: `${complianceAlerts} compliance alerts flagged · ${dayRef}.` });
  if (pendingChallans > 0) logs.push({ tag: 'CHALLAN', body: `${pendingChallans} pending challans tracked · ${dayRef}.` });
  if (yesterdayVehicleCount > 0) {
    logs.push({
      tag: 'FLEET',
      body: `${yesterdayVehicleCount} vehicles on road yesterday (${dayRef}).`,
    });
  }
  if (logs.length < 5 && fastagBalance > 0) {
    logs.push({ tag: 'FASTAG', body: `FASTag balance ${inr(fastagBalance)} monitored at end of ${dayRef}.` });
  }

  // Recovery breakdown from the real savings components; total stays consistent
  // with the FY total by adding an "other recoveries" remainder when needed.
  const breakdown: SplashBreakdownRow[] = [];
  if (Number(claimsRecovered) > 0) breakdown.push({ label: 'Claims recovered', tail: 'this FY', amt: Number(claimsRecovered) });
  if (Number(incentivePaid) > 0) breakdown.push({ label: 'Safety incentive earned', tail: 'this FY', amt: Number(incentivePaid) });
  const accounted = breakdown.reduce((sum, row) => sum + row.amt, 0);
  if (totalSaved > accounted) {
    breakdown.push({ label: 'Other recoveries', tail: 'this FY', amt: totalSaved - accounted });
  }

  return {
    previousDayLabel: day.label,
    previousDayShort: day.shortLabel,
    previousWeekday: day.weekday,
    totalSaved,
    // Fall back to the FY total so the headline is never ₹0 when only the
    // aggregate savings figure is available.
    highlightAmount: Number(claimsRecovered) > 0 ? Number(claimsRecovered) : totalSaved,
    actions: logs.length,
    logs: logs.slice(0, 5),
    breakdown,
  };
}

/** Prefer a real fleet customer name — never show the BDM "Customer Group Admin" label. */
function pickFleetCustomerName(...candidates: Array<string | null | undefined>): string | null {
  for (const raw of candidates) {
    const name = raw?.trim();
    if (name && !isCustomerGroupAdminLabel(name)) return name;
  }
  return null;
}

export function PostLoginSplashScreen({ onDone, customerName }: Props) {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const { user, dashboardContext } = useAppSelector((s) => s.auth);
  // Default false so the narrative mounts immediately — waiting on AccessibilityInfo
  // previously left only the dark LinearGradient shell (looks like a black screen).
  const [reduce, setReduce] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  // CGA login customerName is the BDM account — resolve the selected fleet customer separately.
  const [groupAdminCustomerName, setGroupAdminCustomerName] = useState<string | null>(() =>
    pickFleetCustomerName(dashboardContext?.label),
  );
  const doneRef = useRef(false);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardExitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  // Start dawn visible enough that a failed native fade cannot hide the whole palette.
  const dawn = useRef(new Animated.Value(Platform.OS === 'ios' ? 0.35 : 0)).current;

  // Pull the real fleet summary so the splash figures match the dashboard. The
  // session scopes the customer; admin roles still pass an explicit customerId.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);
        const customerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
        const { data } = await dashboardApi.getSummary({
          ...(canScopeByCustomerId && customerId ? { customerId } : {}),
        });
        if (alive) setSummary(normalizeDashboardSummary(data));
      } catch {
        /* keep zeros — never show fabricated figures */
      }
    })();
    return () => { alive = false; };
  }, [user?.roleKey, user?.defaultCustomerId, dashboardContext]);

  // Customer group admin: map defaultCustomerId → associated-customers name so the
  // splash subtitle shows the fleet customer, not the BDM account from sign-in.
  useEffect(() => {
    if (!isCustomerGroupAdmin(user?.roleKey)) return;

    let alive = true;

    const applyName = (name: string, customerId: number) => {
      if (!alive) return;
      setGroupAdminCustomerName(name);
      // Persist so the dashboard header/dropdown don't briefly flash the BDM label.
      dispatch(setDashboardContext({
        customerId,
        scopeType: 'CUSTOMER',
        label: name,
      }));
      Cache.setJSON(CONTEXT_CACHE_KEY, {
        customerId,
        scopeType: 'CUSTOMER',
        label: name,
      } satisfies DashboardContext);
    };

    const cachedContext = Cache.getJSON<DashboardContext>(CONTEXT_CACHE_KEY);
    const cachedName = pickFleetCustomerName(dashboardContext?.label, cachedContext?.label);
    const activeId =
      dashboardContext?.customerId ?? user?.defaultCustomerId ?? cachedContext?.customerId ?? null;

    if (cachedName && activeId != null) {
      applyName(cachedName, activeId);
    }

    (async () => {
      try {
        const cachedCustomers = Cache.getJSON<CustomersCacheEntry>(CUSTOMERS_CACHE_KEY);
        let list = cachedCustomers?.list?.length
          ? filterAssociatedCustomers(cachedCustomers.list, { excludeUserId: user?.userId })
          : [];

        if (!list.length) {
          const { data } = await dashboardApi.getCustomerList();
          list = filterAssociatedCustomers(normalizeCustomers(data), {
            excludeUserId: user?.userId,
          });
        }

        const match = resolveDefaultCustomerOption(
          list,
          user?.defaultCustomerId,
          dashboardContext?.customerId ?? cachedContext?.customerId,
        );
        if (match) applyName(match.customerName, match.customerId);
      } catch {
        /* keep whatever label we already resolved from cache/context */
      }
    })();

    return () => { alive = false; };
  }, [
    dispatch,
    user?.roleKey,
    user?.userId,
    user?.defaultCustomerId,
    dashboardContext?.customerId,
  ]);

  const splash = useMemo(() => buildSplashData(summary), [summary]);
  const reduceMotion = reduce === true;

  // Count-ups re-run when their target changes. On iOS show final figures immediately
  // so the splash is readable without waiting on delayed RAF counters.
  const susAmount = useCountUp(
    splash.highlightAmount,
    700,
    2600,
    reduceMotion || SKIP_REVEAL_ANIM,
  );
  const total = useCountUp(
    splash.totalSaved,
    1000,
    4600,
    reduceMotion || SKIP_REVEAL_ANIM,
  );

  const isGroupAdmin = isCustomerGroupAdmin(user?.roleKey);
  // Summary / associated-customers for CGA; plain customerName for everyone else.
  const fleetLabel =
    pickFleetCustomerName(
      summary?.customerName,
      groupAdminCustomerName,
      dashboardContext?.label,
      isGroupAdmin ? null : customerName,
      isGroupAdmin ? null : user?.customerName,
    ) || 'Your fleet';
  const greetingLine = `${greetingForHour()}.`;

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
    if (hardExitRef.current) { clearTimeout(hardExitRef.current); hardExitRef.current = null; }
    onDoneRef.current();
  };

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => { if (mounted) setReduce(!!r); })
      .catch(() => { if (mounted) setReduce(false); });
    return () => { mounted = false; };
  }, []);

  // Narrative auto-advance — iOS shows everything at once so a shorter hold is enough.
  useEffect(() => {
    const ms = reduceMotion ? 2400 : SKIP_REVEAL_ANIM ? 4500 : 7600;
    autoRef.current = setTimeout(finish, ms);
    return () => { if (autoRef.current) clearTimeout(autoRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  // Absolute escape hatch: even if the user opens the tally (cancels auto) and
  // somehow never taps Continue, leave the splash so login can never soft-lock.
  useEffect(() => {
    hardExitRef.current = setTimeout(finish, 12000);
    return () => { if (hardExitRef.current) clearTimeout(hardExitRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Decorative loops only — skip on iOS where native-driver opacity is unreliable.
    if (reduceMotion || SKIP_REVEAL_ANIM) return;
    const mkRing = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 2600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    const r1 = mkRing(ring1, 0);
    const r2 = mkRing(ring2, 1300);
    const br = Animated.loop(Animated.sequence([
      Animated.timing(breathe, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(breathe, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    const dw = Animated.timing(dawn, { toValue: 1, duration: 1400, delay: 4200, easing: Easing.ease, useNativeDriver: true });
    r1.start(); r2.start(); br.start(); dw.start();
    return () => { r1.stop(); r2.stop(); br.stop(); dw.stop(); };
  }, [reduceMotion, ring1, ring2, breathe, dawn]);

  const cancelAuto = () => { if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; } };
  const onTapTally = () => { setInteracted(true); cancelAuto(); setBreakdownOpen((o) => !o); };

  const ringStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.7] }) }],
  });
  const breatheStyle = {
    opacity: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
    transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
  };

  // Gradient is a background layer only. On iOS Fabric, LinearGradient as the flex
  // parent often lays out absolute kids (bottom hint) but leaves ScrollView blank.
  return (
    <View style={[styles.fill, { backgroundColor: C.bgB }]}>
      <LinearGradient
        colors={[C.bgA, C.bgB, C.bgC]}
        locations={[0, 0.64, 1]}
        useAngle
        angle={168}
        style={StyleSheet.absoluteFillObject}
        pointerEvents="none"
      />
      <SystemBars hidden />

      <View pointerEvents="none" style={styles.blueGlow}>
        <Svg width={260} height={210}>
          <Defs>
            <RadialGradient id="blue" cx="130" cy="0" rx="130" ry="105" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="rgba(0,90,180,1)" stopOpacity={0.14} />
              <Stop offset="0.7" stopColor="rgba(0,90,180,1)" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={260} height={210} fill="url(#blue)" />
        </Svg>
      </View>
      <Animated.View pointerEvents="none" style={[styles.dawnGlow, { opacity: reduceMotion || SKIP_REVEAL_ANIM ? 1 : dawn }]}>
        <Svg width={360} height={240}>
          <Defs>
            <RadialGradient id="dawn" cx="180" cy="240" rx="180" ry="150" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor="#FFB056" stopOpacity={0.13} />
              <Stop offset="0.4" stopColor="#FF8C3C" stopOpacity={0.05} />
              <Stop offset="0.72" stopColor="#FF8C3C" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={360} height={240} fill="url(#dawn)" />
        </Svg>
      </Animated.View>

      <Reveal delay={6900} duration={500} dy={0} reduce={reduceMotion} style={[styles.liveSync, { top: insets.top + 12 }]}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE SYNC</Text>
      </Reveal>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: 72 }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled
      >
        <Reveal delay={150} reduce={reduceMotion}>
          <Text style={styles.greeting}>{greetingLine}</Text>
        </Reveal>
        <Reveal delay={500} reduce={reduceMotion} style={{ marginBottom: 22 }}>
          <Text style={styles.subtitle}>
            {fleetLabel} · {splash.previousWeekday}, {splash.previousDayLabel}
          </Text>
        </Reveal>

        <Reveal delay={950} reduce={reduceMotion} style={styles.guardian}>
          <View style={styles.shieldWrap}>
            {!reduceMotion && !SKIP_REVEAL_ANIM && <Animated.View style={[styles.ring, ringStyle(ring1)]} />}
            {!reduceMotion && !SKIP_REVEAL_ANIM && <Animated.View style={[styles.ring, ringStyle(ring2)]} />}
            {!reduceMotion && !SKIP_REVEAL_ANIM ? (
              <Animated.View style={[styles.shieldCore, breatheStyle]}>
                <Svg width={15} height={15} viewBox="0 0 16 16">
                  <Path d="M8 1.5l5 2v3.5c0 3.2-2.1 5.6-5 6.8-2.9-1.2-5-3.6-5-6.8V3.5l5-2z" stroke={C.greenBright} strokeWidth={1.3} fill="rgba(52,199,89,0.08)" />
                  <Path d="M5.6 8l1.7 1.7L10.6 6" stroke={C.greenBright} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </Animated.View>
            ) : (
              <View style={styles.shieldCore}>
                <Svg width={15} height={15} viewBox="0 0 16 16">
                  <Path d="M8 1.5l5 2v3.5c0 3.2-2.1 5.6-5 6.8-2.9-1.2-5-3.6-5-6.8V3.5l5-2z" stroke={C.greenBright} strokeWidth={1.3} fill="rgba(52,199,89,0.08)" />
                  <Path d="M5.6 8l1.7 1.7L10.6 6" stroke={C.greenBright} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nightWatch}>FLEET ACTIVITY · {splash.previousDayShort.toUpperCase()}</Text>
            <Text style={styles.guardianLine}>
              {splash.actions > 0
                ? `Karins acted ${splash.actions} ${splash.actions === 1 ? 'time' : 'times'} for your fleet on ${splash.previousDayShort}.`
                : `No major alerts on ${splash.previousDayShort} — your fleet stayed protected.`}
            </Text>
          </View>
        </Reveal>

        <View style={styles.logList}>
          {splash.logs.map((l, i) => (
            <Reveal key={`${l.tag}-${i}`} delay={1600 + i * 500} duration={550} reduce={reduceMotion} style={styles.logRow}>
              <View style={styles.checkCircle}>
                <Svg width={11} height={11} viewBox="0 0 11 11">
                  <Path d="M2 5.5l2.5 2.5L9 3" stroke={C.green} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logTime}>{l.tag}</Text>
                {l.highlight ? (
                  <Text style={styles.logBody}>
                    <Text style={styles.amber700}>{inr(susAmount)}</Text> {l.body}
                  </Text>
                ) : (
                  <Text style={styles.logBody}>{l.body}</Text>
                )}
              </View>
            </Reveal>
          ))}
        </View>

        <Reveal delay={4400} reduce={reduceMotion} style={{ marginBottom: 20 }}>
          <Pressable onPress={onTapTally}>
            <LinearGradient
              colors={['rgba(255,193,7,0.10)', 'rgba(255,193,7,0.03)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.tally}
            >
              <View style={styles.tallyTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tallyLabel}>LOSS PREVENTED · THIS FY</Text>
                  <Text style={styles.tallySub}>recovered & saved for your fleet</Text>
                </View>
                <Text style={styles.tallyTotal}>{inr(total)}</Text>
              </View>

              {splash.breakdown.length > 0 ? (
                <View style={styles.tallyAfford}>
                  <Text style={styles.afford}>{breakdownOpen ? 'HIDE BREAKDOWN' : 'TAP TO SEE BREAKDOWN'}</Text>
                  <Svg width={11} height={11} viewBox="0 0 12 12" style={{ transform: [{ rotate: breakdownOpen ? '180deg' : '0deg' }] }}>
                    <Path d="M2.5 4.5L6 8l3.5-3.5" stroke="rgba(255,193,7,0.78)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </View>
              ) : null}

              {breakdownOpen && splash.breakdown.length > 0 && (
                <View style={styles.breakdown}>
                  {splash.breakdown.map((b) => (
                    <View key={b.label} style={styles.bdRow}>
                      <Text style={styles.bdLabel}>{b.label} <Text style={styles.bdTail}>{b.tail}</Text></Text>
                      <Text style={styles.bdAmt}>{inr(b.amt)}</Text>
                    </View>
                  ))}
                  <View style={[styles.bdRow, styles.bdTotalRow]}>
                    <Text style={styles.bdTotalLabel}>TOTAL PREVENTED</Text>
                    <Text style={styles.bdTotalAmt}>{inr(splash.totalSaved)}</Text>
                  </View>
                  <Text style={styles.bdNote}>Figures reflect your fleet's verified recoveries and savings this financial year.</Text>
                </View>
              )}
            </LinearGradient>
          </Pressable>
        </Reveal>

        <Reveal delay={5400} reduce={reduceMotion}>
          <Text style={styles.payoff}>Everything was handled.{'\n'}Before you opened your eyes.</Text>
          <Text style={styles.promise}>That&apos;s not a feature. That&apos;s a promise.</Text>
        </Reveal>

        <Reveal delay={6200} reduce={reduceMotion} style={{ marginTop: 22 }}>
          <View style={styles.brandRow}>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
          </View>
          <Text style={styles.brandTag}>FLEET INTELLIGENCE PLATFORM</Text>
        </Reveal>

        <View style={{ height: 64 }} />
      </ScrollView>

      {/* Always painted — never behind a delayed Reveal, so tap-to-skip cannot soft-lock. */}
      <View style={[styles.bottomHintWrap, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Pressable onPress={finish} hitSlop={16} accessibilityRole="button" accessibilityLabel="Continue to home">
          <Text style={styles.bottomHint}>
            {interacted ? 'Continue to Dashboard →' : 'Tap or wait — continues to Dashboard →'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const PAD = 28;
const styles = StyleSheet.create({
  fill: { flex: 1 },
  blueGlow: { position: 'absolute', top: -70, left: '50%', marginLeft: -130 },
  dawnGlow: { position: 'absolute', bottom: -40, left: '50%', marginLeft: -180 },
  liveSync: { position: 'absolute', right: 22, flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 3 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveText: { fontSize: 9, fontFamily: MONO, color: C.w30, letterSpacing: 0.7 },

  scroll: { paddingHorizontal: PAD },

  greeting: { fontSize: 27, fontWeight: '700', color: C.white, letterSpacing: -0.5, lineHeight: 30, marginBottom: 4 },
  subtitle: { fontSize: 13.5, color: C.w46, lineHeight: 20 },

  guardian: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  shieldWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(40,167,69,0.5)' },
  shieldCore: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(40,167,69,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(40,167,69,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  nightWatch: { fontSize: 9.5, fontFamily: MONO, color: 'rgba(40,167,69,0.85)', letterSpacing: 1.2, marginBottom: 3 },
  guardianLine: { fontSize: 14, fontWeight: '600', color: C.w90, lineHeight: 18 },

  logList: { gap: 14, marginBottom: 22 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(40,167,69,0.12)',
    borderWidth: 1.5, borderColor: 'rgba(40,167,69,0.55)', alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  logTime: { fontSize: 10, color: C.w24, fontFamily: MONO, marginBottom: 2, letterSpacing: 0.4 },
  logBody: { fontSize: 14.5, fontWeight: '500', color: C.w88, lineHeight: 19 },
  amber700: { color: C.amber, fontWeight: '700' },

  tally: { borderWidth: 1, borderColor: 'rgba(255,193,7,0.24)', borderRadius: 12, paddingHorizontal: 16, paddingTop: 14 },
  tallyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tallyLabel: { fontSize: 10, color: C.w42, letterSpacing: 1, marginBottom: 3 },
  tallySub: { fontSize: 11.5, color: C.w34 },
  tallyTotal: { fontSize: 27, fontWeight: '800', color: C.amber, fontFamily: MONO, letterSpacing: -0.5 },
  tallyAfford: {
    marginTop: 11, borderTopWidth: 1, borderTopColor: 'rgba(255,193,7,0.14)', height: 34,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  afford: { fontSize: 10, fontWeight: '600', color: 'rgba(255,193,7,0.78)', letterSpacing: 0.5 },
  breakdown: { borderTopWidth: 1, borderTopColor: 'rgba(255,193,7,0.14)', paddingTop: 11, paddingBottom: 13, gap: 9 },
  bdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bdLabel: { fontSize: 12, color: 'rgba(255,255,255,0.90)', flex: 1 },
  bdTail: { color: C.w42 },
  bdAmt: { fontSize: 12.5, fontWeight: '700', color: C.amber, fontFamily: MONO },
  bdTotalRow: { marginTop: 2, paddingTop: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  bdTotalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.4 },
  bdTotalAmt: { fontSize: 14, fontWeight: '800', color: C.amber, fontFamily: MONO },
  bdNote: { fontSize: 10, color: C.w30, lineHeight: 14, marginTop: 1 },

  payoff: { fontSize: 21, fontWeight: '800', color: C.white, lineHeight: 26, letterSpacing: -0.3 },
  promise: { fontSize: 12.5, color: C.w34, marginTop: 9, fontStyle: 'italic' },

  brandRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 5 },
  brandKarins: { fontFamily: FontFamily.logo, fontSize: 31, color: C.white, letterSpacing: -0.3, lineHeight: 32 },
  brandFleet: { fontSize: 17, fontWeight: '600', color: C.white, marginLeft: 10, marginBottom: 2 },
  brandTag: { fontSize: 9.5, color: C.white, letterSpacing: 1.2 },

  bottomHintWrap: { position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center', zIndex: 2 },
  bottomHint: { fontSize: 10, color: C.w24, letterSpacing: 0.6, fontFamily: MONO },
});

export default PostLoginSplashScreen;
