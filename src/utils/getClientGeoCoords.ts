/**
 * Best-effort device geolocation for Login Sessions audit rows.
 * Fails soft (null) when permission denied, timeout, GPS off, or unavailable —
 * never blocks password / PIN sign-in or logout.
 *
 * Warm-up + in-memory cache ensure failed login attempts ("tries") still carry
 * lat/lng when permission was already granted on the login screen.
 *
 * App permission ≠ device Location toggle — both must be on for a fix.
 */
import { Platform, PermissionsAndroid, Linking, Alert, AppState } from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import DeviceInfo from 'react-native-device-info';

export type ClientGeoCoords = {
  latitude: number;
  longitude: number;
};

/** In-memory fix from warm-up / prior reads — Sign In must not wait on GPS. */
let cachedLoginGeo: ClientGeoCoords | null = null;
let cachedLoginGeoAtMs = 0;
const GEO_CACHE_TTL_MS = 120_000;

/** Avoid spamming the "turn on Location" alert on every Login remount. */
let promptedLocationServicesThisSession = false;

function rememberGeo(coords: ClientGeoCoords): ClientGeoCoords {
  cachedLoginGeo = coords;
  cachedLoginGeoAtMs = Date.now();
  return coords;
}

/** Instant coords from LoginScreen warm-up when still fresh. */
function getFreshCachedGeo(): ClientGeoCoords | null {
  if (!cachedLoginGeo) return null;
  if (Date.now() - cachedLoginGeoAtMs > GEO_CACHE_TTL_MS) return null;
  return cachedLoginGeo;
}

/** Check-only — never shows the system permission dialog. */
async function hasLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      return await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
    } catch {
      return false;
    }
  }
  // iOS: Info.plist gate only; getCurrentPosition soft-fails if denied.
  return true;
}

/** Ask for when-in-use location; returns false when the user declines. */
async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const fine = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      const already = await PermissionsAndroid.check(fine);
      if (already) return true;

      const result = await PermissionsAndroid.request(fine, {
        title: 'Location access',
        message:
          'Karins uses your location only to record where you signed in, for account security.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }

  // iOS prompts via CLLocationManager when getCurrentPosition runs,
  // as long as NSLocationWhenInUseUsageDescription is in Info.plist.
  return true;
}

/**
 * Device-level Location / GPS master switch (not app permission).
 * When false, getCurrentPosition fails even if ACCESS_FINE_LOCATION is granted.
 */
export async function isDeviceLocationEnabled(): Promise<boolean> {
  try {
    return await DeviceInfo.isLocationEnabled();
  } catch {
    // If the native probe fails, do not block warm-up — let GPS call decide.
    return true;
  }
}

/** Opens the system screen where device Location can be turned on. */
export function openDeviceLocationSettings(): void {
  if (Platform.OS === 'android') {
    // Prefer the Location source screen over generic app settings.
    Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => {
      Linking.openSettings().catch(() => {});
    });
    return;
  }
  Linking.openSettings().catch(() => {});
}

/**
 * One alert per app session when permission is OK but Location is off.
 * Soft — user can dismiss and still sign in without coords.
 */
export function promptEnableDeviceLocation(): void {
  if (promptedLocationServicesThisSession) return;
  promptedLocationServicesThisSession = true;

  Alert.alert(
    'Turn on Location',
    'Location permission is allowed, but device Location is off. Turn it on so Karins can record where you signed in.',
    [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open settings',
        onPress: () => openDeviceLocationSettings(),
      },
    ],
  );
}

/**
 * Resolve current lat/lng for login/logout audit — never throws to callers.
 * Uses a cached fix when available so Sign In is not blocked by a cold GPS lock.
 */
export async function getClientGeoCoords(
  timeoutMs = 10_000,
): Promise<ClientGeoCoords | null> {
  try {
    const allowed = await ensureLocationPermission();
    if (!allowed) return null;

    // Permission alone is not enough when the user disabled Location in Settings.
    const locationOn = await isDeviceLocationEnabled();
    if (!locationOn) {
      promptEnableDeviceLocation();
      return null;
    }

    const coords = await readPosition(timeoutMs);
    return coords ? rememberGeo(coords) : null;
  } catch {
    return null;
  }
}

/**
 * Sign-in critical path: never prompt for permission and never wait on a cold
 * GPS lock. Prefer warm-up cache so success AND failed attempts still stamp
 * location in Login Sessions; otherwise a short GPS read (600ms max).
 */
export async function getLoginAuditGeoCoords(): Promise<ClientGeoCoords | null> {
  try {
    const fromWarm = getFreshCachedGeo();
    if (fromWarm) return fromWarm;

    const allowed = await hasLocationPermission();
    if (!allowed) return null;

    const locationOn = await isDeviceLocationEnabled();
    if (!locationOn) return null;

    // Cache-only window — maximumAge below lets a warm OS fix return instantly.
    const coords = await readPosition(600);
    return coords ? rememberGeo(coords) : null;
  } catch {
    return null;
  }
}

/**
 * Warm GPS / permission on LoginScreen without tying it to the Sign In button.
 * If Location is off, prompts once to open settings.
 */
export function warmClientGeoCoords(): void {
  getClientGeoCoords(12_000).catch(() => {});
}

/**
 * LoginScreen: ask permission, prompt if Location is off, then warm a fix.
 * Call again when AppState becomes active so enabling Location mid-login works.
 */
export async function ensureLoginLocationReady(): Promise<void> {
  try {
    const allowed = await ensureLocationPermission();
    if (!allowed) return;

    const locationOn = await isDeviceLocationEnabled();
    if (!locationOn) {
      promptEnableDeviceLocation();
      return;
    }

    // Location just turned on — allow one more prompt later if they toggle it off again.
    // Keep prompted flag so we do not re-alert immediately after returning from settings.
    await getClientGeoCoords(12_000);
  } catch {
    // Soft — login must proceed without coords.
  }
}

/**
 * After user returns from Location settings, retry warm-up once Location is on.
 * Resets the one-shot prompt so a later off-state can alert again next session only.
 */
export function attachLoginLocationAppStateListener(): () => void {
  const sub = AppState.addEventListener('change', (next) => {
    if (next !== 'active') return;
    void (async () => {
      const allowed = await hasLocationPermission();
      if (!allowed) return;
      const locationOn = await isDeviceLocationEnabled();
      if (!locationOn) return;
      // User turned Location on — warm a fix for the upcoming Sign In.
      await getClientGeoCoords(12_000);
    })();
  });
  return () => sub.remove();
}

function readPosition(timeoutMs: number): Promise<ClientGeoCoords | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: ClientGeoCoords | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Bound tightly to the requested timeout — the old min-12s floor made even
    // "short" calls hang for many seconds when OEM GPS never called back.
    const safetyMs = Math.max(timeoutMs + 800, timeoutMs * 1.25);
    const safetyTimer = setTimeout(() => finish(null), safetyMs);

    Geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(safetyTimer);
        const { latitude, longitude } = position.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          (latitude === 0 && longitude === 0)
        ) {
          finish(null);
          return;
        }
        finish({ latitude, longitude });
      },
      () => {
        clearTimeout(safetyTimer);
        finish(null);
      },
      {
        enableHighAccuracy: false,
        timeout: timeoutMs,
        // Prefer a recent fix so Sign In does not wait for a fresh satellite lock.
        maximumAge: 120_000,
      },
    );
  });
}
