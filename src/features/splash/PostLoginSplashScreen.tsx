/**
 * Karins Fleet — post-login emotional splash (shown once after sign-in).
 *
 * Story grows top → bottom: each beat mounts below the last, fades in, and
 * STAYS. Nothing is replaced or scrolled away — that "one comes / one goes"
 * feel was caused by auto-scroll + reserved empty space for hidden beats.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Animated, Easing, StyleSheet, Pressable, ScrollView,
  AccessibilityInfo, InteractionManager, Platform, LayoutAnimation, UIManager,
  type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';

// Android needs an explicit opt-in before LayoutAnimation can ease height growth.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SystemBars } from 'react-native-edge-to-edge';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path, Rect, Defs, RadialGradient, Stop } from 'react-native-svg';
import dayjs from 'dayjs';
import { useAppDispatch, useAppSelector } from '../../store';
import { setDashboardContext } from '../../store/slices/authSlice';
import { dashboardApi } from '../../services/api/dashboardApi';
import { Cache } from '../../services/storage/SecureStorage';
import {
  normalizeDashboardSummary,
  readFyPeriodAmount,
  resolveFySavingsDisplayTotal,
} from '../dashboard/utils/dashboardSummaryUtils';
import {
  buildFySavingsFromSummary,
  hasIncentiveProgramFromSummary,
} from '../dashboard/utils/fySavingsUtils';
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

const C = {
  bgA: '#060B16', bgB: '#02060D', bgC: '#0B0A07',
  white: '#FFFFFF',
  green: '#28A745', greenBright: '#34C759',
  amber: '#FFC107',
  w88: 'rgba(255,255,255,0.95)', w90: 'rgba(255,255,255,0.96)',
  w46: 'rgba(255,255,255,0.88)', w42: 'rgba(255,255,255,0.86)',
  w34: 'rgba(255,255,255,0.82)', w30: 'rgba(255,255,255,0.80)',
  w24: 'rgba(255,255,255,0.78)',
};

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string;
// iOS Fabric: opacity fades can blank text — use delayed mount instead of opacity.
const SKIP_OPACITY_FADE = Platform.OS === 'ios';
const IS_IOS = Platform.OS === 'ios';
const AMOUNT_FONT = IS_IOS ? undefined : MONO;

/**
 * Narrative clock — each step starts after the previous has largely landed
 * so the eye reads a clear top→bottom cascade (not overlapping swaps).
 */
const T = {
  greeting: 100,
  subtitle: 700,
  guardian: 1300,
  logStart: 2000,
  logStep: 650,
  tally: 0, // computed from log count
  payoff: 0,
  brand: 0,
  liveSync: 500,
  hardExit: 24000,
} as const;

const REVEAL_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const REVEAL_MS = 520;
const AFTER_BEAT_MS = 650; // gap after a major section before the next mounts

interface Props {
  onDone: () => void;
  customerName?: string | null;
}

interface SplashLog { tag: string; body: string; highlight?: boolean }
interface SplashBreakdownRow { label: string; tail: string; amt: number }
interface SplashData {
  previousDayLabel: string;
  previousDayShort: string;
  previousWeekday: string;
  totalSaved: number;
  highlightAmount: number;
  /** THIS FY when current-year recoveries exist; otherwise LAST FY. */
  savingsPeriodLabel: string;
  actions: number;
  logs: SplashLog[];
  breakdown: SplashBreakdownRow[];
}

/**
 * Appends a beat below whatever is already on screen.
 * Returns null until `delay` — so layout grows top→bottom (no empty reserved
 * slots). Then eases height + fades in. Never unmounts / fades out afterward.
 */
function Reveal({
  delay,
  duration = REVEAL_MS,
  dy = 6,
  reduce,
  style,
  children,
}: {
  delay: number;
  duration?: number;
  dy?: number;
  reduce: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(reduce || delay <= 0);
  const opacity = useRef(new Animated.Value(reduce || delay <= 0 ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reduce || delay <= 0 ? 0 : dy)).current;

  useEffect(() => {
    if (reduce || delay <= 0) {
      setVisible(true);
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }

    let anim: Animated.CompositeAnimation | null = null;
    const timer = setTimeout(() => {
      // Ease the new row into the column so the cascade feels continuous.
      LayoutAnimation.configureNext({
        duration: 280,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
      });
      setVisible(true);

      if (SKIP_OPACITY_FADE) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }

      opacity.setValue(0);
      translateY.setValue(dy);
      anim = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          easing: REVEAL_EASE,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          easing: REVEAL_EASE,
          useNativeDriver: true,
        }),
      ]);
      anim.start();
    }, delay);

    return () => {
      clearTimeout(timer);
      anim?.stop();
    };
  }, [delay, duration, dy, reduce, opacity, translateY]);

  if (!visible) return null;

  if (reduce || SKIP_OPACITY_FADE) {
    return <View style={style}>{children}</View>;
  }

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

/**
 * Isolated count-up — does not re-render the whole splash tree.
 *
 * startDelay is relative to THIS mount (Reveal already delayed the section).
 * Passing absolute splash-timeline delays here double-waited and left ₹0 on screen
 * until auto-advance dismissed the splash.
 */
function CountUpAmount({
  target,
  duration = 800,
  startDelay = 40,
  reduce,
  style,
}: {
  target: number;
  duration?: number;
  startDelay?: number;
  reduce: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const safeTarget = Math.max(0, Math.round(Number(target) || 0));
  const [val, setVal] = useState(reduce ? safeTarget : 0);

  useEffect(() => {
    if (reduce || safeTarget <= 0) {
      setVal(safeTarget);
      return;
    }

    let raf = 0;
    let lastPaint = 0;
    let cancelled = false;
    setVal(0);

    const begin = setTimeout(() => {
      if (cancelled) return;
      const t0 = Date.now();
      const tick = () => {
        if (cancelled) return;
        const now = Date.now();
        const p = Math.min((now - t0) / duration, 1);
        const eased = 1 - (1 - p) ** 3;
        if (now - lastPaint >= 32 || p >= 1) {
          lastPaint = now;
          setVal(Math.round(eased * safeTarget));
        }
        if (p < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          // Guarantee the final figure even if a frame was dropped.
          setVal(safeTarget);
        }
      };
      tick();
    }, startDelay);

    return () => {
      cancelled = true;
      clearTimeout(begin);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [safeTarget, duration, startDelay, reduce]);

  return (
    <Text style={style} allowFontScaling={false}>
      {inr(val)}
    </Text>
  );
}

/** Coerce scalar API money (number | numeric-string). Objects use readFyPeriodAmount. */
function coerceMoney(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  }
  // Object periods must not go through ?? thisYear (0 would hide lastYear).
  if (typeof value === 'object') {
    return Math.max(
      readFyPeriodAmount(value, 'thisYear'),
      readFyPeriodAmount(value, 'lastYear'),
    );
  }
  return 0;
}

function inr(n: number): string {
  const s = String(Math.max(0, Math.round(n)));
  const last3 = s.slice(-3);
  const head = s.slice(0, -3);
  return '₹' + (head ? head.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '') + last3;
}

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getPreviousDayContext() {
  const yesterday = dayjs().subtract(1, 'day');
  return {
    label: yesterday.format('DD MMM YYYY'),
    shortLabel: yesterday.format('DD MMM'),
    weekday: yesterday.format('dddd'),
  };
}

const EMPTY_SPLASH: SplashData = {
  previousDayLabel: getPreviousDayContext().label,
  previousDayShort: getPreviousDayContext().shortLabel,
  previousWeekday: getPreviousDayContext().weekday,
  totalSaved: 0,
  highlightAmount: 0,
  savingsPeriodLabel: 'THIS FY',
  actions: 0,
  logs: [],
  breakdown: [],
};

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

  // Backend returns `{ thisYear, lastYear }` objects — never Number(object).
  const hasIncentive = hasIncentiveProgramFromSummary(summary.savings);
  const fy = buildFySavingsFromSummary(summary.savings, summary.claims, hasIncentive);

  const thisClaims = Math.max(
    fy.thisYear.claimsRecovered,
    readFyPeriodAmount(summary.savings?.fyClaimsRecovered, 'thisYear'),
    coerceMoney(summary.claims?.recoveredFY),
  );
  const lastClaims = Math.max(
    fy.lastYear.claimsRecovered,
    readFyPeriodAmount(summary.savings?.fyClaimsRecovered, 'lastYear'),
    coerceMoney(summary.claims?.recoveredLastFY),
  );
  const thisIncentive = Math.max(
    fy.thisYear.incentiveAmount,
    readFyPeriodAmount(summary.savings?.fyIncentivePaid, 'thisYear'),
  );
  const lastIncentive = Math.max(
    fy.lastYear.incentiveAmount,
    readFyPeriodAmount(summary.savings?.fyIncentivePaid, 'lastYear'),
  );

  const thisTotal = Math.max(
    resolveFySavingsDisplayTotal(summary),
    coerceMoney(summary.savings?.fyTotalSavings),
    thisClaims + (hasIncentive ? thisIncentive : 0),
    thisClaims,
  );
  const lastTotal = lastClaims + (hasIncentive ? lastIncentive : 0);

  // Prefer this FY; if empty, show last FY so the tally is not stuck at ₹0.
  const useLastFy = thisTotal <= 0 && lastTotal > 0;
  const claimsRecovered = useLastFy ? lastClaims : thisClaims;
  const incentivePaid = useLastFy ? lastIncentive : thisIncentive;
  const totalSaved = useLastFy ? lastTotal : thisTotal;
  const periodTail = useLastFy ? 'last FY' : 'this FY';
  const savingsPeriodLabel = useLastFy ? 'LAST FY' : 'THIS FY';

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
  if (claimsRecovered > 0) {
    logs.push({ tag: 'CLAIMS', body: `recovered through verified claims · ${dayRef}.`, highlight: true });
  }
  if (driverExpiring > 0) {
    logs.push({ tag: 'DRIVERS', body: `${driverExpiring} licence renewal reminders raised · ${dayRef}.` });
  }
  if (complianceAlerts > 0) {
    logs.push({ tag: 'COMPLIANCE', body: `${complianceAlerts} compliance alerts flagged · ${dayRef}.` });
  }
  if (pendingChallans > 0) {
    logs.push({ tag: 'CHALLAN', body: `${pendingChallans} pending challans tracked · ${dayRef}.` });
  }
  if (yesterdayVehicleCount > 0) {
    logs.push({
      tag: 'FLEET',
      body: `${yesterdayVehicleCount} vehicles on road yesterday (${dayRef}).`,
    });
  }
  if (logs.length < 5 && fastagBalance > 0) {
    logs.push({ tag: 'FASTAG', body: `FASTag balance ${inr(fastagBalance)} monitored at end of ${dayRef}.` });
  }

  const breakdown: SplashBreakdownRow[] = [];
  if (claimsRecovered > 0) {
    breakdown.push({ label: 'Claims recovered', tail: periodTail, amt: claimsRecovered });
  }
  if (incentivePaid > 0) {
    breakdown.push({ label: 'Safety incentive earned', tail: periodTail, amt: incentivePaid });
  }
  const accounted = breakdown.reduce((sum, row) => sum + row.amt, 0);
  if (totalSaved > accounted) {
    breakdown.push({ label: 'Other recoveries', tail: periodTail, amt: totalSaved - accounted });
  }

  return {
    previousDayLabel: day.label,
    previousDayShort: day.shortLabel,
    previousWeekday: day.weekday,
    totalSaved,
    highlightAmount: claimsRecovered > 0 ? claimsRecovered : totalSaved,
    savingsPeriodLabel,
    actions: logs.length,
    logs: logs.slice(0, 5),
    breakdown,
  };
}

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
  const [reduce, setReduce] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryReady, setSummaryReady] = useState(false);
  const [groupAdminCustomerName, setGroupAdminCustomerName] = useState<string | null>(() =>
    pickFleetCustomerName(dashboardContext?.label),
  );

  const doneRef = useRef(false);
  const autoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardExitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const dawn = useRef(new Animated.Value(IS_IOS ? 0.35 : 0)).current;

  const activeCustomerId = resolveActiveCustomerId(dashboardContext, user?.defaultCustomerId);
  useEffect(() => {
    let alive = true;
    setSummaryReady(false);
    (async () => {
      try {
        const canScopeByCustomerId = requiresAdminContextPicker(user?.roleKey);
        const { data } = await dashboardApi.getSummary({
          ...(canScopeByCustomerId && activeCustomerId ? { customerId: activeCustomerId } : {}),
        });
        if (alive) setSummary(normalizeDashboardSummary(data));
      } catch {
        /* keep zeros — never show fabricated figures */
      } finally {
        if (alive) setSummaryReady(true);
      }
    })();
    return () => { alive = false; };
  }, [user?.roleKey, activeCustomerId]);

  useEffect(() => {
    if (!isCustomerGroupAdmin(user?.roleKey)) return;

    let alive = true;

    const applyName = (name: string, customerId: number) => {
      if (!alive) return;
      setGroupAdminCustomerName(name);
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
    dashboardContext?.label,
  ]);

  const splash = useMemo(() => buildSplashData(summary), [summary]);
  const reduceMotion = reduce === true;

  // Cascade clock: next major section waits until the previous row has landed.
  const logCount = splash.logs.length;
  const lastLogAt = logCount > 0
    ? T.logStart + (logCount - 1) * T.logStep
    : T.guardian;
  const tallyDelay = lastLogAt + AFTER_BEAT_MS;
  const payoffDelay = tallyDelay + AFTER_BEAT_MS + 200;
  const brandDelay = payoffDelay + AFTER_BEAT_MS + 200;
  const autoAdvanceDelay = brandDelay + 2400;

  const isGroupAdmin = isCustomerGroupAdmin(user?.roleKey);
  const fleetLabel =
    pickFleetCustomerName(
      summary?.customerName,
      groupAdminCustomerName,
      dashboardContext?.label,
      isGroupAdmin ? null : customerName,
      isGroupAdmin ? null : user?.customerName,
    ) || 'Your fleet';
  const greetingLine = `${greetingForHour()}.`;

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
    if (hardExitRef.current) { clearTimeout(hardExitRef.current); hardExitRef.current = null; }
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => onDoneRef.current(), IS_IOS ? 48 : 0);
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => { if (mounted) setReduce(!!r); })
      .catch(() => { if (mounted) setReduce(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!summaryReady) return;
    const ms = reduceMotion ? 3600 : autoAdvanceDelay;
    const start = requestAnimationFrame(() => {
      autoRef.current = setTimeout(finish, ms);
    });
    return () => {
      cancelAnimationFrame(start);
      if (autoRef.current) clearTimeout(autoRef.current);
    };
  }, [reduceMotion, summaryReady, autoAdvanceDelay, finish]);

  useEffect(() => {
    hardExitRef.current = setTimeout(finish, T.hardExit);
    return () => { if (hardExitRef.current) clearTimeout(hardExitRef.current); };
  }, [finish]);

  // One soft dawn fade only — ring/breathe loops competed with reveals for GPU
  // and made mid-narrative transitions hitch on mid-range devices.
  useEffect(() => {
    if (reduceMotion || SKIP_OPACITY_FADE) {
      dawn.setValue(1);
      return;
    }
    const dw = Animated.timing(dawn, {
      toValue: 1,
      duration: 1600,
      delay: tallyDelay,
      easing: REVEAL_EASE,
      useNativeDriver: true,
    });
    dw.start();
    return () => dw.stop();
  }, [reduceMotion, dawn, tallyDelay]);

  const cancelAuto = () => {
    if (autoRef.current) { clearTimeout(autoRef.current); autoRef.current = null; }
  };
  const onTapTally = () => {
    setInteracted(true);
    cancelAuto();
    setBreakdownOpen((o) => !o);
  };

  return (
    <View style={[styles.fill, { backgroundColor: C.bgB }]}>
      {IS_IOS ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: C.bgA }]} pointerEvents="none" />
      ) : (
        <LinearGradient
          colors={[C.bgA, C.bgB, C.bgC]}
          locations={[0, 0.64, 1]}
          useAngle
          angle={168}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <SystemBars hidden />

      {!IS_IOS ? (
        <>
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
          <Animated.View pointerEvents="none" style={[styles.dawnGlow, { opacity: reduceMotion ? 1 : dawn }]}>
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
        </>
      ) : null}

      <Reveal
        delay={T.liveSync}
        duration={500}
        dy={0}
        reduce={reduceMotion}
        style={[styles.liveSync, { top: insets.top + 12 }]}
      >
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>LIVE SYNC</Text>
      </Reveal>

      {/*
        Top-aligned column that grows downward as each Reveal mounts.
        No auto-scroll — scrolling away made earlier beats look like they left.
      */}
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: insets.top + 20,
            // Extra bottom pad so the Karins brand clears the tap hint on short phones.
            paddingBottom: Math.max(insets.bottom, 16) + 88,
            minHeight: '100%',
          },
        ]}
        showsVerticalScrollIndicator
        persistentScrollbar={Platform.OS === 'android'}
        scrollEnabled
        nestedScrollEnabled
        removeClippedSubviews={false}
        bounces
        alwaysBounceVertical={false}
        overScrollMode="auto"
      >
        {/*
          Hold the cascade until summary settles — otherwise CountUp mounts with
          target 0 and the tally never re-animates before auto-advance.
        */}
        {!summaryReady ? (
          <View style={styles.loadingBlock}>
            <Text style={styles.greeting}>{greetingLine}</Text>
            <Text style={styles.subtitle}>Preparing your fleet briefing…</Text>
          </View>
        ) : (
        <>
        <Reveal delay={T.greeting} reduce={reduceMotion}>
          <Text style={styles.greeting}>{greetingLine}</Text>
        </Reveal>

        <Reveal delay={T.subtitle} reduce={reduceMotion} style={styles.subtitleWrap}>
          <Text style={styles.subtitle}>
            {fleetLabel} · {splash.previousWeekday}, {splash.previousDayLabel}
          </Text>
        </Reveal>

        <Reveal delay={T.guardian} reduce={reduceMotion} style={styles.guardian}>
          <View style={styles.shieldWrap}>
            <View style={styles.shieldCore}>
              {IS_IOS ? (
                <Text style={styles.shieldCheck}>✓</Text>
              ) : (
                <Svg width={15} height={15} viewBox="0 0 16 16">
                  <Path d="M8 1.5l5 2v3.5c0 3.2-2.1 5.6-5 6.8-2.9-1.2-5-3.6-5-6.8V3.5l5-2z" stroke={C.greenBright} strokeWidth={1.3} fill="rgba(52,199,89,0.08)" />
                  <Path d="M5.6 8l1.7 1.7L10.6 6" stroke={C.greenBright} strokeWidth={1.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              )}
            </View>
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
            <Reveal
              key={`${l.tag}-${i}`}
              delay={T.logStart + i * T.logStep}
              reduce={reduceMotion}
              style={styles.logRow}
            >
              <View style={styles.checkCircle}>
                {IS_IOS ? (
                  <Text style={styles.logCheck}>✓</Text>
                ) : (
                  <Svg width={11} height={11} viewBox="0 0 11 11">
                    <Path d="M2 5.5l2.5 2.5L9 3" stroke={C.green} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.logTime}>{l.tag}</Text>
                {l.highlight ? (
                  <View style={styles.logBodyRow}>
                    <CountUpAmount
                      key={`claim-${splash.highlightAmount}`}
                      target={splash.highlightAmount}
                      duration={700}
                      startDelay={40}
                      reduce={reduceMotion}
                      style={[styles.logBody, styles.amber700]}
                    />
                    <Text style={styles.logBody}> {l.body}</Text>
                  </View>
                ) : (
                  <Text style={styles.logBody}>{l.body}</Text>
                )}
              </View>
            </Reveal>
          ))}
        </View>

        <Reveal delay={tallyDelay} reduce={reduceMotion} style={styles.tallyWrap}>
          <Pressable onPress={onTapTally}>
            <View style={styles.tally}>
              {!IS_IOS ? (
                <LinearGradient
                  colors={['rgba(255,193,7,0.10)', 'rgba(255,193,7,0.03)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
              ) : null}
              <View style={styles.tallyTop}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.tallyLabel}>
                    LOSS PREVENTED · {splash.savingsPeriodLabel}
                  </Text>
                  <Text style={styles.tallySub}>recovered & saved for your fleet</Text>
                </View>
                <CountUpAmount
                  key={`tally-${splash.totalSaved}-${splash.savingsPeriodLabel}`}
                  target={splash.totalSaved}
                  duration={900}
                  startDelay={40}
                  reduce={reduceMotion}
                  style={styles.tallyTotal}
                />
              </View>

              {splash.breakdown.length > 0 ? (
                <View style={styles.tallyAfford}>
                  <Text style={styles.afford}>
                    {breakdownOpen ? 'HIDE BREAKDOWN' : 'TAP TO SEE BREAKDOWN'}
                  </Text>
                  {IS_IOS ? (
                    <Text style={styles.affordChevron}>{breakdownOpen ? '▲' : '▼'}</Text>
                  ) : (
                    <Svg
                      width={11}
                      height={11}
                      viewBox="0 0 12 12"
                      style={{ transform: [{ rotate: breakdownOpen ? '180deg' : '0deg' }] }}
                    >
                      <Path d="M2.5 4.5L6 8l3.5-3.5" stroke="rgba(255,193,7,0.78)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  )}
                </View>
              ) : null}

              {breakdownOpen && splash.breakdown.length > 0 ? (
                <View style={styles.breakdown}>
                  {splash.breakdown.map((b) => (
                    <View key={b.label} style={styles.bdRow}>
                      <Text style={styles.bdLabel}>
                        {b.label} <Text style={styles.bdTail}>{b.tail}</Text>
                      </Text>
                      <Text style={styles.bdAmt} allowFontScaling={false}>{inr(b.amt)}</Text>
                    </View>
                  ))}
                  <View style={[styles.bdRow, styles.bdTotalRow]}>
                    <Text style={styles.bdTotalLabel}>TOTAL PREVENTED</Text>
                    <Text style={styles.bdTotalAmt} allowFontScaling={false}>
                      {inr(splash.totalSaved)}
                    </Text>
                  </View>
                  <Text style={styles.bdNote}>
                    Figures reflect your fleet&apos;s verified recoveries and savings this financial year.
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        </Reveal>

        <Reveal delay={payoffDelay} reduce={reduceMotion} style={styles.payoffWrap}>
          <Text style={styles.payoff}>
            Everything was handled.{'\n'}Before you opened your eyes.
          </Text>
          <Text style={styles.promise}>That&apos;s not a feature. That&apos;s a promise.</Text>
        </Reveal>

        <Reveal delay={brandDelay} reduce={reduceMotion} style={styles.brandBlock}>
          <View style={styles.brandRow}>
            <Text style={styles.brandKarins}>Karins</Text>
            <Text style={styles.brandFleet}>fleet</Text>
          </View>
          <Text style={styles.brandTag}>FLEET INTELLIGENCE PLATFORM</Text>
        </Reveal>
        </>
        )}
      </ScrollView>

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
  liveSync: {
    position: 'absolute',
    right: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 3,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.green },
  liveText: { fontSize: 9, fontFamily: MONO, color: C.w30, letterSpacing: 0.7 },

  scroll: {
    paddingHorizontal: PAD,
    // Grow to fill short stories; when content is taller (small phones / many logs)
    // ScrollView can scroll so the Karins brand stays reachable.
    flexGrow: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },
  loadingBlock: { paddingTop: 8 },

  greeting: {
    fontSize: 26,
    fontWeight: '700',
    color: C.white,
    letterSpacing: -0.5,
    lineHeight: 30,
    marginBottom: 2,
  },
  subtitleWrap: { marginBottom: 14 },
  subtitle: { fontSize: 13.5, color: C.w46, lineHeight: 20 },

  guardian: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  shieldWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(40,167,69,0.5)',
  },
  shieldCore: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(40,167,69,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(40,167,69,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nightWatch: {
    fontSize: 9.5,
    fontFamily: MONO,
    color: 'rgba(40,167,69,0.85)',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  guardianLine: { fontSize: 14, fontWeight: '600', color: C.w90, lineHeight: 18 },
  shieldCheck: { fontSize: 11, fontWeight: '700', color: C.greenBright, lineHeight: 13 },

  logList: { gap: 10, marginBottom: 14 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(40,167,69,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(40,167,69,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  logCheck: { fontSize: 11, fontWeight: '700', color: C.green, lineHeight: 13 },
  logTime: { fontSize: 10, color: C.w24, fontFamily: MONO, marginBottom: 2, letterSpacing: 0.4 },
  logBody: { fontSize: 14.5, fontWeight: '500', color: C.w88, lineHeight: 19 },
  logBodyRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline' },
  amber700: { color: C.amber, fontWeight: '700' },
  affordChevron: { fontSize: 9, color: 'rgba(255,193,7,0.78)', fontWeight: '700' },

  tally: {
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.24)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,193,7,0.04)',
  },
  tallyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tallyLabel: { fontSize: 10, color: C.w42, letterSpacing: 1, marginBottom: 3 },
  tallySub: { fontSize: 11.5, color: C.w34 },
  tallyTotal: {
    fontSize: 27,
    fontWeight: '800',
    color: C.amber,
    ...(AMOUNT_FONT ? { fontFamily: AMOUNT_FONT } : {}),
    letterSpacing: -0.5,
    flexShrink: 0,
  },
  tallyAfford: {
    marginTop: 11,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,193,7,0.14)',
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  afford: { fontSize: 10, fontWeight: '600', color: 'rgba(255,193,7,0.78)', letterSpacing: 0.5 },
  breakdown: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,193,7,0.14)',
    paddingTop: 11,
    paddingBottom: 13,
    gap: 9,
  },
  bdRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bdLabel: { fontSize: 12, color: 'rgba(255,255,255,0.90)', flex: 1 },
  bdTail: { color: C.w42 },
  bdAmt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.amber,
    ...(AMOUNT_FONT ? { fontFamily: AMOUNT_FONT } : {}),
  },
  bdTotalRow: {
    marginTop: 2,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  bdTotalLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.4 },
  bdTotalAmt: {
    fontSize: 14,
    fontWeight: '800',
    color: C.amber,
    ...(AMOUNT_FONT ? { fontFamily: AMOUNT_FONT } : {}),
  },
  bdNote: { fontSize: 10, color: C.w30, lineHeight: 14, marginTop: 1 },

  tallyWrap: { marginBottom: 14 },
  payoffWrap: { marginBottom: 4 },
  payoff: {
    fontSize: 20,
    fontWeight: '800',
    color: C.white,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  promise: { fontSize: 12.5, color: C.w34, marginTop: 8, fontStyle: 'italic' },

  brandBlock: { marginTop: 18, marginBottom: 4 },
  brandRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 5 },
  brandKarins: {
    fontFamily: FontFamily.logo,
    fontSize: 31,
    color: C.white,
    letterSpacing: -0.3,
    lineHeight: 32,
  },
  brandFleet: {
    fontSize: 17,
    fontWeight: '600',
    color: C.white,
    marginLeft: 10,
    marginBottom: 2,
  },
  brandTag: { fontSize: 9.5, color: C.white, letterSpacing: 1.2 },

  bottomHintWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    zIndex: 2,
  },
  bottomHint: { fontSize: 10, color: C.w24, letterSpacing: 0.6, fontFamily: MONO },
});

export default PostLoginSplashScreen;
