# Karins Fleet Mobile App — Test Report

**Regenerated 2026-08-27** from real command output as part of the CERT-In VAPT
Round 5 code-fix pass. This replaces the previous version of this file, whose
pass/fail counts (6/6 suites, 34/34 tests, "zero lint errors and zero lint
warnings") did not match what the shipped test suite actually produced when run
(confirmed independently by the Round 5 VAPT re-test: 3 of 13 suites and 3 of 63
tests failed once `@react-native/jest-preset` — missing from `devDependencies` —
was installed so the suite could run at all). Every number below was captured by
actually running the corresponding command against this tree, not carried over
from a prior report.

## Environment

- Node.js: v22.22.2
- npm: 10.9.7 (canonical package manager — see note below)
- React Native: 0.86.0
- React: 19.2.3
- TypeScript: 5.9.3
- Jest: 29.7.0

**Package manager note:** the tree previously carried both `package-lock.json`
(npm) and `pnpm-lock.yaml`, with the prior version of this report citing `pnpm`.
The project's own CI configs (`codemagic.yaml`, `.github/workflows/objective-c-xcode.yml`)
both use `npm ci`/`npm install`, and `pnpm-lock.yaml` was stale — it predated
this round's dependency changes and was never regenerated. `pnpm-lock.yaml` has
been removed; `package-lock.json` is the single, CI-matching, verified-reproducible
lockfile (`npm ci` runs clean against it — see below).

## Automated validation executed

### Install reproducibility

Command:

```bash
rm -rf node_modules && npm ci
```

Result: **Passed** — clean install from the committed lockfile, 1149 packages,
no peer-dependency errors.

### TypeScript

Command:

```bash
npm run type-check
```

Result: **16 pre-existing errors across 9 files**, none introduced by this
round's fixes (each file below was checked individually against this round's
diff and confirmed untouched by it):

- `src/features/claims/components/ClaimFilterPanel.tsx`
- `src/features/dashboard/utils/sanitizeDashboardSnapshot.ts`
- `src/features/notifications/components/BroadcastNotificationPopupHost.tsx`
- `src/features/notifications/components/NotificationImagePreview.tsx`
- `src/features/tickets/screens/RaiseTicketScreen.tsx`
- `src/features/tickets/screens/TicketChatScreen.tsx`
- `src/features/tickets/screens/TicketListScreen.tsx`
- `src/navigation/RootNavigator.tsx`
- `src/services/session/sessionPrivacy.ts`

These are mostly navigation param-type mismatches (a `TicketChat`/`RaiseTicket`
stack route not fully wired into `MoreStackParamList`) and one Keychain
`SetOptions` typing issue — pre-existing debt from earlier rounds, out of scope
for this security-fix pass. Flagged here rather than hidden so they stay visible
for a follow-up pass.

### ESLint

Command:

```bash
npm run lint
```

Result: **50 pre-existing problems (10 errors, 40 warnings)** across files
this round did not touch. Every file this round's security fixes modified
(`fileExport.ts`, `mmkvEncryption.ts`, `encryptedMmkv.ts`,
`backgroundFleetSync.ts`, `parseChallanPaymentNavigation.ts`, `menuConfig.test.ts`,
and the report-export/vehicle/toll screens) was individually lint-checked and
carries no new errors or warnings from this round's changes.

### Unit tests

Command:

```bash
npm test
```

Result: **Passed**

- Test suites: 12 passed / 12 total
- Tests: 63 passed / 63 total
- Snapshots: 0

This includes `src/__tests__/menuConfig.test.ts`, which this round fixed (it was
asserting role-menu visibility without accounting for the fail-closed Role
Management privilege gate added in an earlier round — the test needed to load
privileges to exercise steady-state behavior, not the code, which was correct),
and `src/features/challan/utils/__tests__/parseChallanPaymentNavigation.test.ts`,
which now passes end-to-end after this round's R3-M2 popup-allowlist fix and a
second query-param-status regression this round found and fixed in the same
function.

`src/__tests__/fixtures.ts` (a shared fixture module, not a test file) was
previously being picked up by Jest's default `__tests__/**` match and failing
with "must contain at least one test"; it's now excluded via
`testPathIgnorePatterns` rather than counted as a 13th, permanently-failing suite.

### Dependency audit

Command:

```bash
npm audit
```

Result: **19 vulnerabilities (11 moderate, 8 high, 0 critical)** — mostly
transitive Firebase SDK dependencies. Not remediated in this round (dependency
version bumps were out of scope for this security-fix pass and risk breaking
native builds without device-level regression testing); flagged for a follow-up
dependency-upgrade pass.

### Native builds (Android/iOS)

**Not executed in this environment.** This is a cloud sandbox with no Android
SDK, Xcode, or physical/emulated device available — Gradle/CocoaPods builds,
app installation, and on-device testing cannot be run here. The previous
version of this report claimed passing Android/iOS Metro production bundles;
that claim is removed rather than repeated, since it could not be re-verified
from this environment. Native build and device regression should be run in the
project's actual CI/build environment (`codemagic.yaml` already targets this)
before release.

## Functional scope not executable from this environment

Unchanged from the prior report — these still require native projects,
devices/emulators, backend access, and production-like credentials:

- Login against live Karins authentication
- Customer switching against the live session API
- Dashboard API reconciliation against production data
- Wallet Recharge/payment completion
- E-Challan Pay Now completion and callback handling
- Push notification receipt, tap routing, and permissions
- Biometric/keychain/device-security flows (including this round's R3-M1 fix —
  the logic was unit-verifiable, but the actual locked-device Keychain read
  failure can only be observed on a real or emulated device)
- Android/iOS file download and sharing (including this round's R5-M1 fix — the
  share-sheet handoff needs a device to actually exercise)
- Runtime performance on low/mid-range Android hardware
- APK/AAB/IPA compilation, signing, installation, and store validation

These should be covered through device-level regression and UAT before release.

## Recommended device regression matrix

Unchanged from the prior report:

- Android 10, 12, 14, and 15
- One 320–360 dp compact device
- One mid-range 390–412 dp Android device
- One iPhone with a compact width
- One modern iPhone with Dynamic Island
- Slow/unstable network and offline recovery
- Customer, Customer Group Admin, Vehicle Group Admin, Agent, Employee, and Admin roles
- Large text at 130%
- Reduced motion and reduced transparency where supported

Priority additions for this round specifically:

- 3-D Secure / bank OTP popup flow for challan card payments (R3-M2 fix) on at
  least one real bank card, not just the test fixture
- Report/vehicle export → share sheet → save-to-Downloads and send-to-another-app
  paths (R5-M1 fix) on both platforms
- A locked-then-unlocked background-fetch cycle to confirm the app no longer
  mints a replacement MMKV key and instead retries after unlock (R3-M1 fix)
