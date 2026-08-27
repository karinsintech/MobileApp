/**
 * Device integrity checks via jail-monkey (MASVS-RESILIENCE-1 / MM-09).
 *
 * Evaluates root/jailbreak and Frida/Xposed-style hooks. Consumed at App
 * bootstrap when BLOCK_ON_ROOT is enabled — before restoreSession so a
 * compromised handset never rehydrates a Keychain session.
 *
 * ADB / debugger / external-storage signals are recorded only when a
 * high-confidence signal already tripped (lab devices often have ADB on).
 */

import JailMonkey from 'jail-monkey';
import { Platform } from 'react-native';

export type DeviceIntegrityReport = {
  isCompromised: boolean;
  reasons: string[];
};

/**
 * Failures in the native module are treated as non-compromised so a missing
 * link on a fresh clone does not brick the app in CI.
 */
export async function assessDeviceIntegrity(): Promise<DeviceIntegrityReport> {
  const reasons: string[] = [];

  try {
    // High-confidence block signals — rooted/jailbroken or runtime hooking.
    if (JailMonkey.isJailBroken()) {
      reasons.push(
        Platform.OS === 'ios' ? 'Jailbreak indicators detected' : 'Root indicators detected',
      );
    }

    if (typeof JailMonkey.hookDetected === 'function' && JailMonkey.hookDetected()) {
      reasons.push('Runtime hooking framework detected');
    }

    const isCompromised = reasons.length > 0;
    if (!isCompromised) {
      return { isCompromised: false, reasons: [] };
    }

    // Extra context once we are already blocking.
    try {
      if (await JailMonkey.isDebuggedMode()) {
        reasons.push('Debugger is attached');
      }
    } catch {
      // Some devices throw when the debug probe is unavailable.
    }

    if (Platform.OS === 'android') {
      if (JailMonkey.isOnExternalStorage()) {
        reasons.push('App installed on external/untrusted storage');
      }
      if (JailMonkey.AdbEnabled()) {
        reasons.push('ADB debugging is enabled');
      }
    }

    return { isCompromised: true, reasons };
  } catch {
    // Native module unavailable — do not block; build/link issues are separate.
    return { isCompromised: false, reasons: [] };
  }
}
