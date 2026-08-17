/**
 * Low balance threshold slider bounds — aligned with the web settings control.
 * Range starts at 0; default alert = operator minimum balance × 1.5 (e.g. 100 → 150).
 */

export const WALLET_THRESHOLD_MIN = 0;
export const WALLET_THRESHOLD_MAX = 500_000;
/** Fine step so low minimum balances (e.g. min 100 → alert 150) land on a valid tick. */
export const WALLET_THRESHOLD_STEP = 50;

/** Snap a raw amount to the nearest valid slider step inside the allowed range. */
export function snapWalletThreshold(value: number | string): number {
  // Coerce JSON/API strings ("150") — Number.isFinite("150") is false and would
  // otherwise drop a persisted threshold back to ₹0 on reload.
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return WALLET_THRESHOLD_MIN;

  const clamped = Math.min(
    WALLET_THRESHOLD_MAX,
    Math.max(WALLET_THRESHOLD_MIN, numeric),
  );

  const stepIndex = Math.round((clamped - WALLET_THRESHOLD_MIN) / WALLET_THRESHOLD_STEP);
  return WALLET_THRESHOLD_MIN + stepIndex * WALLET_THRESHOLD_STEP;
}

const THRESHOLD_SPAN = WALLET_THRESHOLD_MAX - WALLET_THRESHOLD_MIN;

export function thresholdToRatio(value: number): number {
  return (snapWalletThreshold(value) - WALLET_THRESHOLD_MIN) / THRESHOLD_SPAN;
}

export function ratioToThreshold(ratio: number): number {
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  return snapWalletThreshold(WALLET_THRESHOLD_MIN + clampedRatio * THRESHOLD_SPAN);
}
