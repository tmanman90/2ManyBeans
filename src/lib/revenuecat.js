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

let configured = false;
let sdkModule = null;
const listeners = new Set();

// Lazy-load the native module so web builds don't pay the cost.
async function loadSdk() {
  if (sdkModule) return sdkModule;
  sdkModule = await import('@revenuecat/purchases-capacitor');
  return sdkModule;
}

export function isRevenueCatAvailable() {
  return Capacitor.isNativePlatform();
}

/** Initialize the SDK. Idempotent — safe to call multiple times. */
export async function initRevenueCat() {
  if (!isRevenueCatAvailable()) return;
  if (configured) return;

  const { Purchases, LOG_LEVEL } = await loadSdk();
  await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
  await Purchases.configure({ apiKey: PUBLIC_IOS_KEY });
  configured = true;

  // Wire up the listener once. We re-broadcast to our own subscribers.
  await Purchases.addCustomerInfoUpdateListener((result) => {
    for (const fn of listeners) {
      try { fn(result.customerInfo); } catch (e) { console.error('[RC listener]', e); }
    }
  });
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

/** Fetch the current offering (packages with prices from App Store). */
export async function getOfferings() {
  if (!isRevenueCatAvailable()) return null;
  await initRevenueCat();
  const { Purchases } = await loadSdk();
  const { current } = await Purchases.getOfferings();
  return current ?? null;
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
