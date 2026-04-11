# Subscription Paywall PRD

## Overview

Coffee Hub's AI features (tasting coach, bean scan, chat, Aiden recipes, product shots) cost real money per API call. Based on COGS analysis in the commercialization playbook, optimized per-user costs are ~$0.51/mo for Pro and ~$1.61/mo for Ultra. Giving unlimited AI to free users destroys unit economics.

This PRD adds tiered subscription monetization via RevenueCat + Apple In-App Subscriptions following a **three-tier model**: Free (demo taste of AI), Pro (metered AI for enthusiasts), and Ultra (unlimited AI + Fellow push for prosumers). Trial is 3 days (2026 market trend, faster commitment decision, reduces trial abuse exposure).

## Subscription Tiers

### Free Tier

Fully functional specialty coffee inventory app with a small, lifetime-capped taste of AI to demonstrate value before the paywall. Free users never exceed ~$0.01 in API costs lifetime.

| Feature | Cap |
|---------|-----|
| Bean inventory | 5 active beans max |
| Manual tasting notes | Unlimited |
| Peak status tracking | Unlimited |
| Jar slot management | Unlimited |
| Spider chart visualization | Unlimited |
| **AI bean scan** | **3 lifetime** |
| **AI taste test chat** | **1 lifetime** |
| All other AI features | Locked (paywall) |

**Why lifetime, not monthly:**
- Monthly limits invite reset-waiting and multi-account abuse
- Lifetime limits force a commitment moment the week they install
- Same cost to serve (~$0.006 per scan, ~$0.02 per taste test)
- Cleaner UX: the counter never resets, users know exactly what they're using

### Pro Tier — $4.99/mo or $49.99/yr (17% off)

Everything in Free, plus metered AI access for everyday enthusiasts. Caps protect cost structure while remaining generous for normal use.

| Feature | Cap | Model |
|---------|-----|-------|
| Bean inventory | Unlimited | n/a |
| AI bean scan + enrichment | 20/month | Gemini 2.5 Flash |
| AI taste test chat | 10/month | Claude Haiku 4.5 |
| Aiden brew recipes (share link import) | Unlimited | GPT-5.4 |
| Hand brew recipes | Unlimited | GPT-5.4 |
| General chat assistant | Included in taste test cap | Claude Haiku 4.5 |
| AI product shots | 5/month | Gemini Nano Banana |
| Professor Ruphus stories | Unlimited (low cost) | GPT-5.4 Mini |
| Tasting score extraction | Unlimited (low cost) | GPT-5.4 Mini |
| Container/freeze tracking | Yes | n/a |
| Next-bean suggestion | Yes | Gemini Flash |
| Export/share tasting notes | Yes | n/a |
| **Push to Fellow Aiden** | **No (Ultra only)** | n/a |
| **Multi-brewer support** | **No (Ultra only)** | n/a |

**Per-user COGS at full usage:** ~$0.51/month. At $4.99/mo after 15% Apple commission ($4.24 net), **gross margin ~88%**.

### Ultra Tier — $9.99/mo or $99.99/yr (17% off)

Everything in Pro with unlimited AI, plus the hardware integration features that only matter to prosumers who own a Fellow Aiden or multiple brewers.

| Feature | Cap |
|---------|-----|
| Everything in Pro | Unlimited instead of metered |
| AI bean scan | Unlimited |
| AI taste test chat | Unlimited |
| AI product shots | 20/month (protects Gemini image gen costs) |
| **Push recipe directly to Fellow Aiden account** | **Yes** |
| **Multi-brewer recipe support** (V60, Chemex, AeroPress, etc.) | **Yes** |
| Priority model routing (Sonnet 4.6 for taste test) | Yes |

**Per-user COGS at full usage:** ~$1.61/month. At $9.99/mo after 15% Apple commission ($8.49 net), **gross margin ~81%**.

### Pricing Rationale

| Option | Monthly | Annual | Annual Savings | Apple Net (15% SBP) |
|--------|---------|--------|---------------|---------------------|
| Pro Monthly | $4.99 | — | — | $4.24/mo |
| Pro Annual | — | $49.99 | 17% | $42.49/yr ($3.54/mo) |
| Ultra Monthly | $9.99 | — | — | $8.49/mo |
| Ultra Annual | — | $99.99 | 17% | $84.99/yr ($7.08/mo) |

- **Pro is priced cheaper than a single bag of specialty coffee** ($15-25). Clear value.
- **17% annual discount** is industry standard (2026). 33% would leave money on the table.
- **Ultra anchors Pro as the reasonable middle option** (pricing psychology).
- **Aiden owners ($335 hardware) are Tier 1 prosumers** who gladly pay $9.99/mo for hardware integration.
- **Break-even: ~120 paid users** at blended $7/mo ARPU (fixed costs ~$500/mo, variable ~$1/user).

### Free Tier Usage Tracking

Free AI usage counters live in the user document under `subscription.freeUsage`:

```json
{
  "subscription": {
    "status": null,
    "freeUsage": {
      "aiScans": 2,
      "tasteTests": 0
    }
  }
}
```

**Enforcement:**
- Client-side: read counter from `SubscriptionContext`, show "2 of 3 free scans used" in UI
- Server-side: API proxies increment the counter on successful AI call, reject with 403 if at cap
- Atomicity: use Firestore `increment(1)` to avoid race conditions
- Reset on upgrade: when user subscribes to Pro/Ultra, counter becomes irrelevant (server checks entitlement first)

**Server-side check order in `withCorsAuthFree` (new middleware):**
1. Verify Firebase auth token (existing `withCorsAuth`)
2. Check entitlement: is user Pro or Ultra? → allow, skip counter
3. If free user, check feature-specific counter
4. If under cap, increment counter atomically and allow
5. If at cap, return 403 `free_tier_exhausted` with paywall trigger

## RevenueCat Integration

### Why RevenueCat (not raw StoreKit)

- Handles receipt validation server-side (Apple requires this for production)
- Cross-platform ready if Android ships later
- Webhook system for real-time subscription events
- REST API v2 for server-side entitlement checks
- Free up to $2,500/mo tracked revenue (more than enough for launch)
- Avoids building and maintaining StoreKit receipt validation, grace period logic, billing retry handling

### RevenueCat Dashboard Configuration

**Project:** Create project "Coffee Hub" in RevenueCat dashboard.

**App:** Add iOS app with bundle ID `com.talmeltzer.coffeehub`. Paste the App Store Connect Shared Secret and set up the App Store Server Notifications v2 URL (RevenueCat provides this).

**Products (map to App Store Connect products):**

| RevenueCat Product ID | App Store Product ID | Type |
|-----------------------|---------------------|------|
| `pro_monthly` | `com.talmeltzer.coffeehub.pro.monthly` | Auto-renewable subscription ($4.99/mo) |
| `pro_annual` | `com.talmeltzer.coffeehub.pro.annual` | Auto-renewable subscription ($49.99/yr) |
| `ultra_monthly` | `com.talmeltzer.coffeehub.ultra.monthly` | Auto-renewable subscription ($9.99/mo) |
| `ultra_annual` | `com.talmeltzer.coffeehub.ultra.annual` | Auto-renewable subscription ($99.99/yr) |

**Entitlements:**

| Entitlement ID | Products | Grants |
|---------------|----------|--------|
| `pro` | `pro_monthly`, `pro_annual` | Metered AI access (Pro tier caps) |
| `ultra` | `ultra_monthly`, `ultra_annual` | Unlimited AI + Fellow push + multi-brewer |

Ultra is a **strict superset** of Pro. When checking entitlement server-side, an Ultra user automatically has `pro` entitlement + `ultra` entitlement. Use `hasUltra` for Ultra-only features (Fellow push, multi-brewer), and `hasPro` (= Pro OR Ultra) for all other AI gates.

**Offerings:**

| Offering ID | Description | Packages |
|-------------|-------------|----------|
| `default` | Standard paywall | `$rc_monthly` (pro_monthly), `$rc_annual` (pro_annual), `ultra_monthly`, `ultra_annual` |

### App Store Connect Setup

1. Go to App Store Connect > Your App > Subscriptions
2. Create Subscription Group: "Coffee Hub"
3. Within the group, set subscription levels (upgrade/downgrade hierarchy):
   - Level 1 (highest): Ultra Annual, Ultra Monthly
   - Level 2: Pro Annual, Pro Monthly
4. Add four subscriptions:
   - `com.talmeltzer.coffeehub.pro.monthly`: $4.99/month, **3-day free trial**
   - `com.talmeltzer.coffeehub.pro.annual`: $49.99/year, **3-day free trial**
   - `com.talmeltzer.coffeehub.ultra.monthly`: $9.99/month, **3-day free trial**
   - `com.talmeltzer.coffeehub.ultra.annual`: $99.99/year, **3-day free trial**
5. Set localized display names and descriptions for each
6. Enable "Offer Code" support (optional, for future promo codes)
7. Under App Information > App Store Server Notifications, paste RevenueCat's v2 notification URL
8. Generate Shared Secret (App-Specific), paste into RevenueCat dashboard

### Client SDK Setup

Install the Capacitor plugin:

```bash
npm install @revenuecat/purchases-capacitor
npx cap sync
```

Initialize in `src/main.jsx` after auth resolves (RevenueCat needs the Firebase UID to associate purchases with users):

```js
import { Purchases } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';

// After user authenticates:
if (Capacitor.isNativePlatform()) {
  await Purchases.configure({
    apiKey: 'appl_XXXXXXXX', // RevenueCat public iOS API key (safe to embed)
  });
  // Identify user so purchases attach to their Firebase UID
  await Purchases.logIn({ appUserID: user.uid });
}
```

On web (PWA), RevenueCat SDK is not needed. Web users cannot purchase subscriptions (iOS App Store only). The server-side entitlement check still gates API access for all platforms.

## 2026 Apple Rejection Patterns (MUST READ)

Apple aggressively rejected subscription apps throughout Q1 2026 under Guideline 3.1.2. The paywall design below is engineered to avoid every known rejection trap as of April 2026.

### Rejection 1: Toggle Paywalls Are Dead

In mid-January 2026, Apple started mass-rejecting apps with toggle paywalls (paywalls with a switch to enable/disable the free trial). Rationale: toggles hide the trial from users who don't engage with them.

**Do NOT:**
- Add a toggle anywhere on the paywall
- Hide the trial terms behind an accordion or tap
- Make the user take any action to see the trial clearly

**Do:**
- Show the trial prominently in the CTA itself ("Start 3-Day Free Trial")
- Show "then $X/month" directly below the CTA

### Rejection 2: Misleading Price Display

Showing "$4.99/month" prominently when the selected plan is annual at $49.99 is treated as misleading.

**Do:**
- Each plan card displays its own monthly AND effective price ("$4.99/mo" AND "$49.99 billed annually")
- Selected plan is visually clear (border + background color)
- Never show a price that conflicts with what the user is about to buy

### Rejection 3: Legal Links Missing From Paywall UI

Terms of Use and Privacy Policy must be visible **in the app UI of the paywall itself**, not just in Settings or on your website.

**Do:**
- Tappable "Terms of Use" and "Privacy Policy" links in the paywall footer
- Links must open the actual documents (web view or in-app browser)

### Rejection 4: Missing Restore Button

Apple's review checklist requires a visible Restore Purchases option on any paywall. Users reinstalling or switching devices must be able to restore without contacting support.

**Do:**
- "Restore Purchases" text link visible on the paywall
- Also available in Settings (belt and suspenders)

### Rejection 5: Price Mismatch Between Paywall and App Store Connect

If your paywall hardcodes "$4.99/mo" and Apple changes your localized price, or if currency formatting differs between paywall and ASC, the app gets rejected.

**Do:**
- Pull prices dynamically from `Purchases.getOfferings()` — the `package.product.priceString` field returns Apple's exact localized display
- Never hardcode prices in the UI

### Rejection 6: CTA Mismatch With Action

"Start Free Trial" button that leads to an immediate charge (no trial) = rejection. "Subscribe Now" button that actually starts a trial = rejection.

**Do:**
- Check `package.product.introPrice` — if present and is a free trial, show "Start 3-Day Free Trial"; otherwise show "Subscribe"
- Conditionally render CTA copy based on the real package data

## Paywall UI

### When It Appears

The paywall triggers when a free user taps any gated AI feature, OR when a free user hits their lifetime cap on bean scans or taste tests:

- Tasting tab: tap "Start Tasting" (guided coach) → free tier gets 1 before paywall
- Chat tab: send any message → included in taste test cap
- Bean scan: tap camera icon in Add Bean flow → free tier gets 3 before paywall
- AI Fill: tap "AI Fill" button in manual entry → counted as bean scan
- Aiden: tap "Brew with Aiden" on any bean card → Pro+ only
- Product shot: tap "Generate Photo" on bean detail → Pro+ only
- Professor Ruphus: tap the story icon on bean card → Pro+ only (cheap but keeps signal clean)
- Fellow Aiden Push: "Push to Aiden" button → **Ultra only**
- Multi-brewer: V60/Chemex/AeroPress mode → **Ultra only**

### Recommended Approach: Custom React Component

Use a custom React paywall component, not RevenueCat's native paywall template. Reasons:

1. The app already has a strong visual identity (warm Ghibli-inspired theme with `styles/theme.js` palette). A native template would clash.
2. Custom gives full control over copy, layout, and A/B testing.
3. RevenueCat's Capacitor plugin exposes `getOfferings()` and `purchasePackage()` directly, so the purchase flow is still handled by RevenueCat.
4. The paywall needs to conditionally promote Pro vs Ultra based on which feature triggered it (Fellow Aiden tap → promote Ultra, bean scan cap → promote Pro).

### Paywall Component: `src/components/PaywallSheet.jsx`

**CRITICAL: No toggle. Two-card side-by-side layout with dynamic pricing from RevenueCat offerings.**

Full-screen modal (or large bottom sheet), layout:

```
┌───────────────────────────────────────────┐
│                                       [X] │
│           [Illustration]                  │
│                                            │
│     Unlock AI-Powered Brewing              │
│                                            │
│   • AI tasting coach with guided scoring  │
│   • Instant bean scanning from photos     │
│   • Personalized hand brew recipes        │
│   • Coffee chat with expert knowledge     │
│                                            │
│  ┌──────────────┐    ┌──────────────┐     │
│  │     PRO      │    │    ULTRA     │     │
│  │              │    │   BEST VALUE │     │
│  │  $4.99/mo    │    │  $9.99/mo    │     │
│  │     or       │    │     or       │     │
│  │ $49.99/yr    │    │ $99.99/yr    │     │
│  │  (Save 17%)  │    │  (Save 17%)  │     │
│  │              │    │              │     │
│  │ 20 scans/mo  │    │  Unlimited   │     │
│  │ 10 chats/mo  │    │              │     │
│  │ 5 shots/mo   │    │ + Aiden push │     │
│  │              │    │ + Multi-brew │     │
│  └──────────────┘    └──────────────┘     │
│  (selected)                                │
│                                            │
│   [ Start 3-Day Free Trial → Pro Annual ] │
│                                            │
│       3-day free trial, then $49.99/yr     │
│              Cancel anytime                │
│                                            │
│   Terms of Use  ·  Privacy Policy          │
│           Restore Purchases                │
└───────────────────────────────────────────┘
```

Key requirements (all MUST-HAVES to pass Apple review):

- **Two cards side-by-side** (Pro and Ultra). No toggle, no tabs, no accordion.
- **Each card shows monthly AND annual price** with the savings percentage
- **Default-selected plan is Pro Annual** (highest LTV, best value positioning)
- **Within each card, user can switch between monthly and annual** via segmented control inside the card (NOT a global toggle)
- **Prices pulled dynamically** from `Purchases.getOfferings()` via `package.product.priceString`
- **CTA text changes based on selection:** "Start 3-Day Free Trial → Pro Annual" when Pro Annual is selected, "Start 3-Day Free Trial → Ultra Monthly" when Ultra Monthly is selected, etc.
- **CTA shows trial language only if the package has a free trial intro price** (`package.product.introPrice`)
- **Subtitle under CTA** makes trial terms unambiguous: "3-day free trial, then $49.99/year. Cancel anytime."
- **Terms of Use and Privacy Policy links** must be tappable (required by Apple)
- **Restore Purchases link** must be visible (required by Apple)
- On web: show "Subscriptions are available in the iOS app"

### Context-Aware Paywall Variant

When a user hits a specific gate, promote the relevant tier:

| Trigger | Default Selected Card | Copy Variation |
|---------|----------------------|----------------|
| Free tier scan cap (3/3 used) | Pro Annual | "You've used all 3 free scans. Unlock unlimited scanning." |
| Free tier taste test cap (1/1 used) | Pro Annual | "Ready to really learn tasting? Unlock unlimited coaching." |
| "Push to Aiden" tap | **Ultra Annual** | "Send recipes straight to your Fellow Aiden. Ultra required." |
| Multi-brewer tap | **Ultra Annual** | "Generate recipes for V60, Chemex, and AeroPress with Ultra." |
| Generic AI feature tap (Pro+) | Pro Annual | Default copy |

### Paywall Trigger Hook: `src/hooks/usePaywall.js`

```js
import { useState } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';

export function usePaywall() {
  const { hasPro, hasUltra, freeUsage } = useSubscription();
  const [paywallContext, setPaywallContext] = useState(null);

  // Wrap any AI action. Pass a context hint so the paywall can tailor its promotion.
  const requirePro = (action, { feature = 'generic' } = {}) => {
    if (hasPro) return action();
    setPaywallContext({ trigger: feature, promote: 'pro' });
  };

  const requireUltra = (action, { feature = 'aiden' } = {}) => {
    if (hasUltra) return action();
    setPaywallContext({ trigger: feature, promote: 'ultra' });
  };

  // Free tier metered gates (bean scan, taste test)
  const requireScanQuota = (action) => {
    if (hasPro) return action();
    if ((freeUsage?.aiScans ?? 0) >= 3) {
      return setPaywallContext({ trigger: 'scan_cap', promote: 'pro' });
    }
    return action();
  };

  const requireTasteQuota = (action) => {
    if (hasPro) return action();
    if ((freeUsage?.tasteTests ?? 0) >= 1) {
      return setPaywallContext({ trigger: 'taste_cap', promote: 'pro' });
    }
    return action();
  };

  return { paywallContext, setPaywallContext, requirePro, requireUltra, requireScanQuota, requireTasteQuota };
}
```

## Server-Side Entitlement Gating

Client-side checks are bypassable. Every AI API proxy must verify the user's subscription status server-side before processing the request.

### New Utility: `api/lib/checkEntitlement.js`

```js
// Server-side entitlement check via RevenueCat REST API v2
const RC_API_KEY = process.env.REVENUECAT_API_KEY; // Secret key, NOT public
const RC_BASE = 'https://api.revenuecat.com/v2';

// In-memory cache: uid -> { pro: bool, ultra: bool, expiresAt: timestamp }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function checkEntitlement(uid) {
  // Check cache first
  const cached = cache.get(uid);
  if (cached && Date.now() < cached.expiresAt) {
    return { pro: cached.pro, ultra: cached.ultra };
  }

  const res = await fetch(
    `${RC_BASE}/projects/{project_id}/customers/${uid}/active_entitlements`,
    {
      headers: {
        'Authorization': `Bearer ${RC_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) {
    // On RC API failure, fail open for pro (paying users shouldn't be blocked)
    console.error('RevenueCat API error:', res.status, await res.text());
    return { pro: true, ultra: false };
  }

  const data = await res.json();
  const entitlements = new Set(data.items?.map(e => e.entitlement_identifier) ?? []);
  const result = {
    pro: entitlements.has('pro') || entitlements.has('ultra'), // Ultra implies Pro
    ultra: entitlements.has('ultra'),
  };

  // Cache the result
  cache.set(uid, { ...result, expiresAt: Date.now() + CACHE_TTL });

  return result;
}
```

### Integration into `withCorsAuth` Middleware

Three new wrappers in `api/lib/cors-auth.js`:

```js
import { checkEntitlement } from './checkEntitlement.js';
import { getDb } from './firebaseAdmin.js';

// Pro-gated: Ultra users also have access
export function withCorsAuthPro(handler) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken) {
      const { pro } = await checkEntitlement(decodedToken.uid);
      if (!pro) {
        return res.status(403).json({
          error: 'subscription_required',
          tier: 'pro',
          message: 'This feature requires Coffee Hub Pro.',
        });
      }
    }
    return handler(req, res, decodedToken);
  });
}

// Ultra-gated: only Ultra users
export function withCorsAuthUltra(handler) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (decodedToken) {
      const { ultra } = await checkEntitlement(decodedToken.uid);
      if (!ultra) {
        return res.status(403).json({
          error: 'subscription_required',
          tier: 'ultra',
          message: 'This feature requires Coffee Hub Ultra.',
        });
      }
    }
    return handler(req, res, decodedToken);
  });
}

// Metered free tier: allow N free calls, then require Pro
export function withCorsAuthMetered(handler, { feature, freeLimit }) {
  return withCorsAuth(async (req, res, decodedToken) => {
    if (!decodedToken) return handler(req, res, decodedToken);

    const { pro } = await checkEntitlement(decodedToken.uid);
    if (pro) return handler(req, res, decodedToken);

    // Free user: check and increment counter atomically
    const db = getDb();
    const userRef = db.collection('users').doc(decodedToken.uid);
    const snap = await userRef.get();
    const used = snap.data()?.subscription?.freeUsage?.[feature] ?? 0;

    if (used >= freeLimit) {
      return res.status(403).json({
        error: 'free_tier_exhausted',
        feature,
        used,
        limit: freeLimit,
        message: `You've used all ${freeLimit} free ${feature}. Upgrade to Pro for unlimited access.`,
      });
    }

    // Increment counter BEFORE calling AI (pay for attempts, not just successes, to prevent retry abuse)
    const FieldValue = (await import('firebase-admin/firestore')).FieldValue;
    await userRef.update({
      [`subscription.freeUsage.${feature}`]: FieldValue.increment(1),
    });

    return handler(req, res, decodedToken);
  });
}
```

**Proxy assignments:**

| Proxy | Wrapper | Feature key | Free limit |
|-------|---------|-------------|-----------|
| `api/claude.js` (tasting coach + chat) | `withCorsAuthMetered` | `tasteTests` | 1 |
| `api/gemini.js` (bean scan + AI Fill) | `withCorsAuthMetered` | `aiScans` | 3 |
| `api/openai.js` (recipes, stories, scoring) | `withCorsAuthPro` | n/a | 0 |
| `api/aiden.js` (Aiden brew profiles) | `withCorsAuthPro` | n/a | 0 |
| `api/product-shot.js` (product shots) | `withCorsAuthPro` | n/a | 0 |
| `api/aiden-push.js` (push recipe to Fellow) [new] | `withCorsAuthUltra` | n/a | 0 |

Note: A new endpoint `api/aiden-push.js` splits the existing aiden proxy so the Push action can be Ultra-gated separately from recipe generation (Pro).

### 403 Response Handling on Client

Update `src/lib/fetchWithRetry.js` to detect both error codes:

```js
if (response.status === 403) {
  const data = await response.json();
  if (data.error === 'subscription_required') {
    const err = new Error(data.message);
    err.code = 'subscription_required';
    err.tier = data.tier; // 'pro' or 'ultra'
    throw err;
  }
  if (data.error === 'free_tier_exhausted') {
    const err = new Error(data.message);
    err.code = 'free_tier_exhausted';
    err.feature = data.feature;
    throw err;
  }
}
```

Components catch these error codes and trigger the contextual paywall.

## Client-Side Entitlement State

### New Context: `src/contexts/SubscriptionContext.jsx`

```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { Capacitor } from '@capacitor/core';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ uid, children }) {
  const [state, setState] = useState({ hasPro: false, hasUltra: false, plan: null, freeUsage: {}, loading: true });

  useEffect(() => {
    if (!uid) {
      setState({ hasPro: false, hasUltra: false, plan: null, freeUsage: {}, loading: false });
      return;
    }

    // Source 1: Firestore user doc (works on all platforms, updated by webhook)
    const unsub = onSnapshot(doc(db, 'users', uid), (snap) => {
      const sub = snap.data()?.subscription ?? {};
      const active = sub.status === 'active' || sub.status === 'trial';
      setState({
        hasPro: active && (sub.plan?.startsWith('pro') || sub.plan?.startsWith('ultra')),
        hasUltra: active && sub.plan?.startsWith('ultra'),
        plan: sub.plan ?? null,
        status: sub.status ?? null,
        freeUsage: sub.freeUsage ?? {},
        loading: false,
      });
    });

    // Source 2: RevenueCat SDK (native only, most up-to-date)
    if (Capacitor.isNativePlatform()) {
      Purchases.getCustomerInfo().then(({ customerInfo }) => {
        const hasPro = customerInfo.entitlements.active['pro'] !== undefined ||
                       customerInfo.entitlements.active['ultra'] !== undefined;
        const hasUltra = customerInfo.entitlements.active['ultra'] !== undefined;
        setState(prev => ({ ...prev, hasPro, hasUltra, loading: false }));
      });

      Purchases.addCustomerInfoUpdateListener(({ customerInfo }) => {
        const hasPro = customerInfo.entitlements.active['pro'] !== undefined ||
                       customerInfo.entitlements.active['ultra'] !== undefined;
        const hasUltra = customerInfo.entitlements.active['ultra'] !== undefined;
        setState(prev => ({ ...prev, hasPro, hasUltra }));
      });
    }

    return unsub;
  }, [uid]);

  return (
    <SubscriptionContext.Provider value={state}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
```

### Provider Placement in `src/main.jsx`

Wrap inside `AuthContext` (needs uid) but outside `App`:

```jsx
<AuthContext.Provider value={authValue}>
  <SubscriptionProvider uid={user?.uid}>
    <UserPreferencesProvider value={contextValue}>
      <App ... />
    </UserPreferencesProvider>
  </SubscriptionProvider>
</AuthContext.Provider>
```

## Firestore Schema Changes

### User Document: `users/{uid}`

Add a `subscription` field for fast client reads and free tier usage tracking:

```json
{
  "subscription": {
    "status": "active",
    "plan": "pro_annual",
    "expiresAt": "2027-04-09T00:00:00Z",
    "originalPurchaseDate": "2026-04-09T00:00:00Z",
    "trialEnd": "2026-04-12T00:00:00Z",
    "store": "app_store",
    "managementUrl": null,
    "freeUsage": {
      "aiScans": 0,
      "tasteTests": 0
    }
  }
}
```

Status values: `"active"` | `"trial"` | `"expired"` | `"cancelled"` | `null` (never subscribed)

Plan values: `"pro_monthly"` | `"pro_annual"` | `"ultra_monthly"` | `"ultra_annual"` | `null` (free)

For entitlement checks:
- `hasPro` = `status` in (`active`, `trial`) AND `plan` starts with `pro` OR `ultra`
- `hasUltra` = `status` in (`active`, `trial`) AND `plan` starts with `ultra`

`freeUsage` is never reset. Counters stay in place even after a user subscribes (makes downgrade/resubscribe handling cleaner).

### Security Rules Update

The existing `users/{uid}` rule must allow the server (Admin SDK) to write `subscription.*` fields. Client can read but NOT write `subscription` directly (only the webhook and metered middleware can).

```
match /users/{userId} {
  allow read: if request.auth.uid == userId;
  allow write: if request.auth.uid == userId
    && !('subscription' in request.resource.data.diff(resource.data).affectedKeys());
  // Admin SDK (server) bypasses all rules, so webhook + metered middleware work
}
```

## RevenueCat Webhook

RevenueCat sends events (purchase, renewal, cancellation, billing issue, expiration) to a webhook endpoint. This keeps Firestore in sync without polling.

### New Endpoint: `api/revenuecat-webhook.js`

Same structure as the original PRD, but now maps product IDs to both tier (pro vs ultra) and cycle (monthly vs annual):

```js
// Map RC product_id to subscription.plan
function mapPlan(productId) {
  if (productId.includes('ultra.annual')) return 'ultra_annual';
  if (productId.includes('ultra.monthly')) return 'ultra_monthly';
  if (productId.includes('pro.annual')) return 'pro_annual';
  if (productId.includes('pro.monthly')) return 'pro_monthly';
  return null;
}
```

Other webhook logic (status mapping, event types, auth header) is unchanged from original PRD.

### Webhook Configuration

1. In RevenueCat dashboard: Settings > Webhooks
2. URL: `https://2manybeans.vercel.app/api/revenuecat-webhook`
3. Auth header: Bearer token matching `REVENUECAT_WEBHOOK_AUTH_KEY` env var
4. Events to send: all subscription lifecycle events

## Restore Purchases Flow

Required by Apple App Review. Users must be able to restore purchases on a new device or after reinstall.

### Trigger Points

1. PaywallSheet: "Restore Purchases" link at bottom (REQUIRED for Apple)
2. SettingsPage: "Restore Purchases" row

### Implementation

```js
async function handleRestore() {
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const hasPro = customerInfo.entitlements.active['pro'] !== undefined ||
                   customerInfo.entitlements.active['ultra'] !== undefined;
    if (hasPro) {
      showToast('Subscription restored');
    } else {
      showToast('No active subscription found');
    }
  } catch (err) {
    showToast('Could not restore purchases. Please try again.');
  }
}
```

## Manage Subscription Link

Users need a way to cancel or change their subscription. Apple requires this.

### In SettingsPage

Add a "Manage Subscription" row that deep-links to iOS subscription settings:

```js
import { Capacitor } from '@capacitor/core';

function openManageSubscription() {
  if (Capacitor.isNativePlatform()) {
    window.open('https://apps.apple.com/account/subscriptions', '_blank');
  }
}
```

Show this row only when `status === 'active'` or `status === 'trial'` or `status === 'cancelled'` (so they can resubscribe).

## New Environment Variables

Add to Vercel:

| Variable | Scope | Description |
|----------|-------|-------------|
| `REVENUECAT_API_KEY` | Server only | RevenueCat secret API key (for REST API v2 entitlement checks) |
| `REVENUECAT_WEBHOOK_AUTH_KEY` | Server only | Shared secret for webhook authentication |

The RevenueCat public iOS API key is embedded in client code (this is expected and safe, per RevenueCat docs).

## Testing Plan

### StoreKit Sandbox Testing

1. Create a Sandbox Apple ID in App Store Connect (Users and Access > Sandbox > Testers)
2. On test device: Settings > App Store > Sandbox Account, sign in with sandbox ID
3. Sandbox subscriptions renew on accelerated schedule:
   - Monthly: renews every 5 minutes
   - Annual: renews every 30 minutes
   - Trial: 2 minutes (real world: 3 days)
   - Max 6 renewals per subscription, then expires

### Verification Checklist

**Free tier metered gates:**
- [ ] New free user can do 3 bean scans before paywall appears
- [ ] Free user counter persists across app restarts
- [ ] 4th scan attempt triggers `free_tier_exhausted` paywall
- [ ] Paywall copy: "You've used all 3 free scans"
- [ ] Same flow for 1 free taste test chat
- [ ] Free user blocked from Pro-only features (Aiden recipes, product shots) immediately

**Purchase flow (Pro and Ultra):**
- [ ] Free user taps AI feature, paywall appears with two cards
- [ ] Pro Annual is default-selected, shows "3-day free trial then $49.99/year"
- [ ] Tapping Ultra card updates CTA to "Start 3-Day Free Trial → Ultra Annual"
- [ ] Monthly/annual toggle within each card works, updates CTA and price
- [ ] Pro monthly purchase succeeds (sandbox)
- [ ] Pro annual purchase succeeds (sandbox)
- [ ] Ultra monthly purchase succeeds (sandbox)
- [ ] Ultra annual purchase succeeds (sandbox)
- [ ] 3-day free trial starts correctly (2 min in sandbox)
- [ ] Trial converts to paid after sandbox trial period
- [ ] PaywallSheet dismisses after successful purchase
- [ ] AI features work immediately after purchase (no app restart needed)

**Tier-specific gating:**
- [ ] Pro user can use all AI features up to caps (20 scans, 10 chats, 5 shots /month)
- [ ] Pro user tapping "Push to Aiden" sees Ultra-promotion paywall
- [ ] Pro user tapping multi-brewer sees Ultra-promotion paywall
- [ ] Ultra user can push to Aiden successfully
- [ ] Ultra user has no caps on scans/chats

**Dynamic pricing (Apple rejection prevention):**
- [ ] Paywall prices come from `Purchases.getOfferings()`, not hardcoded
- [ ] CTA text reflects actual `introPrice` of selected package
- [ ] No toggle present on paywall (Apple rejection trigger)
- [ ] Terms of Use link opens actual Terms page
- [ ] Privacy Policy link opens actual Privacy Policy page
- [ ] Restore Purchases link visible

**Server-side gating:**
- [ ] Unauthenticated request to `/api/claude` returns 401
- [ ] Free user at cap request to `/api/gemini` returns 403 `free_tier_exhausted`
- [ ] Free user request to `/api/openai` returns 403 `subscription_required` tier=pro
- [ ] Free user request to `/api/aiden-push` returns 403 `subscription_required` tier=ultra
- [ ] Pro user request to `/api/aiden-push` returns 403 `subscription_required` tier=ultra
- [ ] Ultra user request to `/api/aiden-push` returns normal response
- [ ] Authenticated Pro user request to `/api/claude` returns normal AI response
- [ ] RevenueCat API failure: request falls through (fail-open for Pro)
- [ ] Entitlement cache: second request within 5 min does not hit RC API

**Subscription lifecycle:**
- [ ] RevenueCat webhook fires on purchase, Firestore `subscription.status` updates to `"active"`, `plan` set correctly (pro_monthly, pro_annual, ultra_monthly, ultra_annual)
- [ ] Cancellation webhook sets status to `"cancelled"`, user retains access until `expiresAt`
- [ ] Expiration webhook sets status to `"expired"`, AI features gated again, free counters NOT reset
- [ ] Renewal webhook re-activates expired subscription
- [ ] Upgrade Pro → Ultra: webhook updates plan correctly

**Restore and manage:**
- [ ] "Restore Purchases" on paywall recovers existing subscription
- [ ] "Restore Purchases" in Settings works
- [ ] "Manage Subscription" opens iOS subscription settings
- [ ] User who cancels and resubscribes regains access

**Edge cases:**
- [ ] PWA user sees "subscriptions available in iOS app" message
- [ ] Offline user with cached `subscription.status === "active"` can still browse free features
- [ ] Multiple devices: purchase on device A, device B picks up entitlement via Firestore listener
- [ ] App upgrade from pre-paywall version: existing users are seeded as free tier with zero counters
- [ ] Race condition: simultaneous scan requests don't exceed free cap (atomic increment)

### StoreKit Configuration File

For local Xcode testing without App Store Connect, create a StoreKit configuration file:

1. In Xcode: File > New > StoreKit Configuration File
2. Add four subscription products matching the App Store product IDs
3. Set the scheme to use this config: Edit Scheme > Run > Options > StoreKit Configuration

## Apple Small Business Program

Enroll in the Apple Small Business Program to pay 15% commission instead of 30%.

1. Go to: https://developer.apple.com/programs/small-business-program/
2. Requirement: less than $1M in proceeds in the prior calendar year
3. Apply with Apple Developer account (same as the one publishing the app)
4. Once approved, commission drops from 30% to 15% on all App Store transactions

**Net revenue after SBP 15% commission:**

| Plan | Gross | Net | Monthly Net |
|------|-------|-----|-------------|
| Pro Monthly | $4.99 | $4.24 | $4.24 |
| Pro Annual | $49.99 | $42.49 | $3.54 |
| Ultra Monthly | $9.99 | $8.49 | $8.49 |
| Ultra Annual | $99.99 | $84.99 | $7.08 |

This should be done before the first subscription goes live.

## API Cost Economics (Reference)

From commercialization playbook analysis. Per-user monthly COGS at cap-level usage:

| Feature | Pro ($4.99) | Ultra ($9.99) |
|---------|------------|---------------|
| Photo scans | $0.04 | $0.10 |
| Product shots | $0.20 | $0.78 |
| Taste test chats | $0.20 | $0.60 |
| Recipe gen | $0.06 | $0.12 |
| Recommendations | $0.01 | $0.01 |
| **Total AI COGS** | **~$0.51** | **~$1.61** |
| **Gross margin (after 15% Apple commission)** | **~88%** | **~81%** |

Break-even: ~120 paid users at blended $7/mo ARPU against ~$500/mo fixed costs.

## Files to Create

| File | Purpose |
|------|---------|
| `api/lib/checkEntitlement.js` | Server-side RevenueCat entitlement check with caching (returns `{pro, ultra}`) |
| `api/revenuecat-webhook.js` | Webhook endpoint for RC subscription events, maps product IDs to plan |
| `api/aiden-push.js` | Split from api/aiden.js: Ultra-only endpoint for pushing recipe to Fellow account |
| `src/contexts/SubscriptionContext.jsx` | Client-side subscription state provider with hasPro, hasUltra, freeUsage |
| `src/hooks/usePaywall.js` | Hook for gating AI features with context-aware promotion |
| `src/components/PaywallSheet.jsx` | Two-card paywall UI with dynamic pricing (Pro + Ultra) |

## Files to Modify

| File | Change |
|------|--------|
| `api/lib/cors-auth.js` | Add `withCorsAuthPro`, `withCorsAuthUltra`, `withCorsAuthMetered` wrappers |
| `api/claude.js` | Switch to `withCorsAuthMetered` with `{feature: 'tasteTests', freeLimit: 1}` |
| `api/gemini.js` | Switch to `withCorsAuthMetered` with `{feature: 'aiScans', freeLimit: 3}` |
| `api/openai.js` | Switch to `withCorsAuthPro` |
| `api/aiden.js` | Switch to `withCorsAuthPro` (recipe generation still Pro, push separated) |
| `api/product-shot.js` | Switch to `withCorsAuthPro` |
| `src/lib/fetchWithRetry.js` | Handle 403 `subscription_required` (with tier) and `free_tier_exhausted` |
| `src/main.jsx` | Initialize RevenueCat SDK, wrap app in `SubscriptionProvider` |
| `src/tabs/TastingTab.jsx` | Gate tasting coach behind `requireTasteQuota()` |
| `src/tabs/ChatTab.jsx` | Gate chat behind `requireTasteQuota()` |
| `src/components/AddBeanForm.jsx` | Gate bean scan behind `requireScanQuota()`, AI Fill behind `requireScanQuota()` |
| `src/components/AidenModal.jsx` | Split: recipe gen uses `requirePro()`, Push button uses `requireUltra()` |
| `src/components/HandBrewModal.jsx` | Gate behind `requirePro()` |
| `src/components/SettingsPage.jsx` | Add "Restore Purchases", "Manage Subscription", free usage display |
| `firestore.rules` | Prevent client writes to `subscription` field |
| `package.json` | Add `@revenuecat/purchases-capacitor` dependency |
| `capacitor.config.ts` | No changes needed (plugin auto-registers) |

## Implementation Order

1. **Apple setup:** App Store Connect subscription products (4 products in 1 group with levels), Small Business Program enrollment
2. **RevenueCat setup:** Dashboard config (project, app, 4 products, 2 entitlements with pro/ultra, 1 offering with all packages)
3. **Firestore schema:** Add `subscription.freeUsage` to user doc, update security rules
4. **Server-side gating:** `checkEntitlement.js`, three `withCorsAuth*` wrappers, update all 5 proxies + new aiden-push, webhook endpoint
5. **Client SDK:** Install RevenueCat plugin, `SubscriptionContext`, init in `main.jsx`
6. **Paywall UI:** `PaywallSheet.jsx` with two-card dynamic pricing, `usePaywall.js` with context-aware variants
7. **Gate AI features:** Update TastingTab, ChatTab, AddBeanForm, AidenModal (with Ultra split), HandBrewModal
8. **Settings:** Restore Purchases, Manage Subscription, free usage display
9. **Testing:** Sandbox purchases for all 4 products, webhook verification, full checklist
10. **Deploy:** Vercel (web + webhook), TestFlight build (native plugin requires new binary, not OTA)

Note: Because this adds a new Capacitor plugin (`@revenuecat/purchases-capacitor`), a TestFlight build is required. Capgo OTA alone is not sufficient for this change.
