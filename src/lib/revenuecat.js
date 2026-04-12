// RevenueCat SDK wrapper.
//
// The SDK only runs on native (iOS via Capacitor). On web/PWA all calls
// short-circuit and return safe "not subscribed" values. The paywall is
// hidden on web with a "subscriptions available in iOS app" message.
//
// Call sequence:
//   1. initRevenueCat() — once after Firebase auth resolves
//   2. logInRevenueCat(uid) — after every sign-in (ties purchases to Firebase UID)
//   3. getOfferings() / purchasePackage() / restorePurchases() / hasEntitlement()
//      as needed
//   4. logOutRevenueCat() — on sign-out to clear SDK state

import { Capacitor } from '@capacitor/core';

// Public Apple API key — safe to embed in client code, per RevenueCat docs.
// Found in RevenueCat dashboard > Project Settings > API Keys.
const PUBLIC_IOS_KEY = 'appl_YsjXhHMAtUIVshbIHDUuxZHWlFD';

let sdkModule = null;
let configurePromise = null;
let nativeListenerHandle = null;
const listeners = new Set();

// Lazy-load the native module so web builds don't pay the cost.
async function loadSdk() {
  if (sdkModule) return sdkModule;
  sdkModule = await import('@revenuecat/purchases-capacitor');
  return sdkModule;
}

// Whether the RevenueCat Capacitor plugin is ACTUALLY available in the
// current native binary. Just checking `isNativePlatform()` isn't enough
// because a TestFlight build archived before the plugin was installed is
// still native but will throw when the plugin bridge is invoked. We use
// Capacitor's `isPluginAvailable` to probe the registry.
export function isRevenueCatAvailable() {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    // Plugin name used when registered by the RevenueCat SDK wrapper.
    return Capacitor.isPluginAvailable?.('Purchases') ?? false;
  } catch {
    return false;
  }
}

/**
 * Initialize the SDK. Idempotent + race-safe.
 *
 * Uses a cached in-flight promise so concurrent callers (e.g. React 19
 * StrictMode double-effect, or rapid sign-in/sign-out) all await the same
 * underlying configure() call. Without this, two listeners could be
 * registered with the native bridge, causing every customer update to
 * fire JS subscribers twice.
 *
 * Failure recovery: if any step throws, the cached promise is cleared so
 * the next caller can re-attempt. Without this, a single transient failure
 * during init would permanently wedge RC for the session.
 */
export async function initRevenueCat() {
  if (!isRevenueCatAvailable()) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    try {
      const { Purchases, LOG_LEVEL } = await loadSdk();
      await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
      await Purchases.configure({ apiKey: PUBLIC_IOS_KEY });

      // Register the native listener exactly once. Retain the handle so
      // we can remove it later if needed (e.g. during teardown).
      nativeListenerHandle = await Purchases.addCustomerInfoUpdateListener((result) => {
        for (const fn of listeners) {
          try { fn(result.customerInfo); } catch (e) { console.error('[RC listener]', e); }
        }
      });
    } catch (err) {
      // Allow next caller to retry from scratch.
      configurePromise = null;
      throw err;
    }
  })();

  return configurePromise;
}

/**
 * Associate the current Firebase user with their RevenueCat subscriber record.
 * This is how purchases get linked to the user across devices and reinstalls.
 */
export async function logInRevenueCat(uid) {
  if (!isRevenueCatAvailable() || !uid) return null;
  await initRevenueCat();
  const { Purchases } = await loadSdk();
  const { customerInfo } = await Purchases.logIn({ appUserID: uid });
  return customerInfo;
}

/** Clear the RevenueCat session (on sign-out). */
export async function logOutRevenueCat() {
  if (!isRevenueCatAvailable() || !configured) return;
  const { Purchases } = await loadSdk();
  try {
    await Purchases.logOut();
  } catch {
    // logOut throws if already anonymous — safe to ignore.
  }
}

/** Fetch the current offering (packages with prices from App Store).
 *
 * Falls back to the first offering in `all` if no offering is marked
 * Current in the RC dashboard — a common misconfiguration that would
 * otherwise wedge the paywall with "no subscription options available".
 */
export async function getOfferings() {
  if (!isRevenueCatAvailable()) return null;
  await initRevenueCat();
  const { Purchases } = await loadSdk();
  const result = await Purchases.getOfferings();
  const { current, all } = result || {};
  if (current) return current;
  // Fallback: pick the first offering that has packages. Useful when the
  // RC dashboard has offerings defined but none marked "Current".
  if (all && typeof all === 'object') {
    for (const key of Object.keys(all)) {
      const offering = all[key];
      if (offering?.availablePackages?.length) {
        console.warn('[RC] No current offering, falling back to', key);
        return offering;
      }
    }
  }
  return null;
}

/** Fetch current customer info (entitlements, active subscriptions). */
export async function getCustomerInfo() {
  if (!isRevenueCatAvailable()) return null;
  await initRevenueCat();
  const { Purchases } = await loadSdk();
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
}

/** Derive { hasPro, hasUltra } from a CustomerInfo object. */
export function deriveEntitlements(customerInfo) {
  if (!customerInfo?.entitlements?.active) {
    return { hasPro: false, hasUltra: false };
  }
  const active = customerInfo.entitlements.active;
  const hasUltra = !!active.ultra;
  const hasPro = hasUltra || !!active.pro;
  return { hasPro, hasUltra };
}

/** Start a purchase. Returns the updated { customerInfo, userCancelled }. */
export async function purchasePackage(aPackage) {
  if (!isRevenueCatAvailable()) throw new Error('RevenueCat not available on web');
  await initRevenueCat();
  const { Purchases, PURCHASES_ERROR_CODE } = await loadSdk();
  try {
    const result = await Purchases.purchasePackage({ aPackage });
    return { customerInfo: result.customerInfo, userCancelled: false };
  } catch (err) {
    if (err?.userCancelled || err?.code === PURCHASES_ERROR_CODE?.PURCHASE_CANCELLED_ERROR) {
      return { customerInfo: null, userCancelled: true };
    }
    throw err;
  }
}

/** Restore purchases (required by Apple App Review). */
export async function restorePurchases() {
  if (!isRevenueCatAvailable()) throw new Error('RevenueCat not available on web');
  await initRevenueCat();
  const { Purchases } = await loadSdk();
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

/**
 * Subscribe to customer info updates. Returns an unsubscribe function.
 * Use from React via useEffect.
 */
export function onCustomerInfoUpdate(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
