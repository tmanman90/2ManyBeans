---
title: 2manybeans Go-to-Market Plan - App Store Launch
type: plan
status: active
date: 2026-04-09
---

# 2manybeans: App Store Launch Plan

Ship the app from current state (TestFlight build 21) to live on the App Store with paid subscriptions.

---

## Current State

### What's Done

All core product features are built and working on TestFlight:

| Area | Status | Details |
|------|--------|---------|
| Auth | DONE | Google + Apple Sign-In, sign-out, multi-provider linking |
| Onboarding | DONE | Wizard: name, grinder, brew method, marketing consent |
| User Profiles | DONE | Firestore `users/{uid}`, preferences, profile editing |
| Settings | DONE | Grinder, brew method, grind display, canister count, Fellow connection |
| 5 Tabs | DONE | Rotation, Inventory, Tasting, Chat, Archive |
| AI Tasting Coach | DONE | Claude Sonnet 4.6, multi-turn guided coaching |
| Bean Scanning | DONE | Gemini 2.5 Flash vision + search grounding enrichment |
| Chat Assistant | DONE | Full inventory context, image analysis |
| Hand Brew Recipes | DONE | 7 grinders, 7 cup families, 2 techniques (Hoffmann, Kasuya) |
| Aiden Integration | DONE | Recipe generation + direct push to Fellow device |
| Product Shots | DONE | AI-generated product photos for bean cards |
| Share Cards | DONE | Apothecary recipe cards |
| Grind Intelligence | DONE | Per-grinder ranges, micron display toggle |
| iOS Build | DONE | Capacitor 8, TestFlight build 21, Capgo OTA |
| API Security | DONE | Firebase token verification, CORS whitelist, model allowlists |
| Firestore Rules | DONE | Field-level validation, UID-scoped access |

### What's NOT Done (Launch Blockers)

| Area | Blocker? | PRD |
|------|----------|-----|
| Subscription infrastructure (RevenueCat) | YES | [subscription-paywall-prd.md](../prds/subscription-paywall-prd.md) |
| Server-side entitlement gating | YES | [subscription-paywall-prd.md](../prds/subscription-paywall-prd.md) |
| Paywall UI | YES | [subscription-paywall-prd.md](../prds/subscription-paywall-prd.md) |
| Privacy Policy | YES | [privacy-and-legal-prd.md](../prds/privacy-and-legal-prd.md) |
| Terms of Service | YES | [privacy-and-legal-prd.md](../prds/privacy-and-legal-prd.md) |
| App Store Connect setup | YES | [app-store-submission-prd.md](../prds/app-store-submission-prd.md) |
| App Store screenshots | YES | [app-store-submission-prd.md](../prds/app-store-submission-prd.md) |
| Privacy nutrition labels | YES | [app-store-submission-prd.md](../prds/app-store-submission-prd.md) |
| Privacy manifest (PrivacyInfo.xcprivacy) | YES | [app-store-submission-prd.md](../prds/app-store-submission-prd.md) |
| Export compliance | YES | [app-store-submission-prd.md](../prds/app-store-submission-prd.md) |

### What's Optional (Post-Launch)

| Area | Priority | Notes |
|------|----------|-------|
| Push notifications | Medium | "Bean entering peak window" alerts. Retention driver, not a launch gate. |
| Analytics & crash reporting | Medium | Firebase Analytics + Crashlytics. Flying blind without it, but not blocking. |
| Rate limiting on API proxies | Low | Auth checks exist, but no per-user throttling. Risk of API key abuse. |

---

## Business Model

### Why Subscriptions from Day 1

Every AI feature costs real money per API call:
- Claude Sonnet 4.6: ~$0.01-0.05 per tasting coach interaction
- GPT-5.4: ~$0.01-0.03 per brew recipe
- Gemini 2.5 Flash: ~$0.005-0.02 per bean scan + search grounding
- Product shots, chat, score extraction all add up

Giving away free API access means paying for every user's usage with no revenue. Subscription gates AI features behind payment, making the unit economics work from day one.

### Tier Structure (3-Tier Model)

Based on commercialization playbook analysis + 2026 research. Free tier demos AI value at negligible cost (~$0.01/user lifetime). Pro is the main revenue driver. Ultra captures high-value Fellow Aiden prosumers.

| Tier | Monthly | Annual | Trial | Free Caps / Includes |
|------|---------|--------|-------|---------------------|
| **Free** | $0 | $0 | n/a | 5 beans inventory max, 3 AI scans lifetime, 1 taste test lifetime |
| **Pro** | $4.99 | $49.99 (17% off) | 3 days | Unlimited beans, 20 scans/mo, 10 taste tests/mo, 5 product shots/mo, unlimited recipes |
| **Ultra** | $9.99 | $99.99 (17% off) | 3 days | Unlimited everything + Push to Fellow Aiden + Multi-brewer support |

### Why This Model

1. **Free tier is a demo, not free API access.** 3 bean scans + 1 taste test = ~$0.01 in API costs per user lifetime. Essentially free to serve, but it lets users experience the AI magic before committing. Research confirms soft paywalls convert significantly better than hard paywalls for niche prosumer apps.

2. **Ultra captures Tier 1 prosumers.** Fellow Aiden owners already spent $335 on hardware. They gladly pay $9.99/mo for the AI assistant that pushes recipes directly to their brewer. Multi-brewer support (V60, Chemex, AeroPress) is the other major Ultra draw.

3. **Two-tier anchoring.** Ultra makes Pro look like the reasonable choice. Classic pricing psychology that increases Pro conversions.

4. **17% annual discount** is 2026 industry standard. Down from our original 33% (which would have left money on the table).

5. **3-day trial** matches 2026 market trend (shorter trials, faster commitment, less trial abuse). Forces decision while user's attention is fresh.

### Free Tier Value Proposition

Free users still get a genuinely useful app even after exhausting AI credits:
- Add up to 5 beans manually (name, roaster, origin, roast date)
- Track peak freshness windows
- Manage jar rotation (1-6 canisters)
- Log tastings with manual notes and ratings
- View archive of finished beans
- Full settings (grinder, brew method, canister count)

The paywall appears when they hit a cap (scan cap, taste test cap) or tap a Pro+ feature (Aiden recipe, product shot, Professor Ruphus, etc).

### Unit Economics

Per-user monthly COGS at full cap usage:

| Feature | Pro COGS | Ultra COGS |
|---------|---------|------------|
| Photo scans | $0.04 | $0.10 |
| Product shots | $0.20 | $0.78 |
| Taste test chats | $0.20 | $0.60 |
| Recipe generation | $0.06 | $0.12 |
| Recommendations | $0.01 | $0.01 |
| **Total AI COGS** | **~$0.51** | **~$1.61** |
| **Gross margin (after 15% Apple SBP)** | **~88%** | **~81%** |

Break-even: ~120 paid users at blended $7/mo ARPU. Achievable within 2-3 months with proper marketing.

### Apple Commission

Enroll in Apple Small Business Program before first sale: **15% commission** (vs 30%) on all subscription revenue. You qualify automatically (under $1M in proceeds).

---

## Launch Phases

### Phase 1: Subscription Infrastructure (3-4 days)
> PRD: [subscription-paywall-prd.md](../prds/subscription-paywall-prd.md)

**Goal:** Users can subscribe, and AI features are gated behind active subscription on both client and server.

#### 1A: RevenueCat + App Store Connect Setup (Day 1)

External setup (no code):

1. Create RevenueCat account at app.revenuecat.com
2. Add Apple App Store app with bundle ID `com.talmeltzer.coffeehub`
3. In App Store Connect > Your App > Subscriptions:
   - Create subscription group: "Coffee Hub" (single group, contains all 4 products)
   - Set subscription levels (Level 1 = Ultra, Level 2 = Pro) for correct upgrade/downgrade handling
   - Add 4 products:
     - `com.talmeltzer.coffeehub.pro.monthly` — $4.99/mo, **3-day trial**
     - `com.talmeltzer.coffeehub.pro.annual` — $49.99/yr, **3-day trial**
     - `com.talmeltzer.coffeehub.ultra.monthly` — $9.99/mo, **3-day trial**
     - `com.talmeltzer.coffeehub.ultra.annual` — $99.99/yr, **3-day trial**
   - Add localization for each (display name + description)
4. Copy App Store Connect App-Specific Shared Secret, paste in RevenueCat
5. In RevenueCat:
   - Create 2 entitlements: `pro` and `ultra`
   - Attach `pro_monthly` + `pro_annual` to `pro` entitlement
   - Attach `ultra_monthly` + `ultra_annual` to `ultra` entitlement (Ultra is a strict superset of Pro — checked server-side)
   - Create offering: `default` with all 4 packages (Pro Monthly, Pro Annual, Ultra Monthly, Ultra Annual)
   - Copy public API key (`appl_...`) for client
   - Create secret API key (`sk_...`) for server
6. Add `REVENUECAT_API_KEY` and `REVENUECAT_WEBHOOK_AUTH_KEY` to Vercel env vars
7. Enroll in Apple Small Business Program (developer.apple.com) — 15% commission instead of 30%

#### 1B: Client-Side Integration (Day 2)

Install and wire up RevenueCat in the app:

**Install:**
```
npm install @revenuecat/purchases-capacitor @revenuecat/purchases-capacitor-ui
npx cap sync
```

**Xcode:** Add "In-App Purchase" capability (Signing & Capabilities)

**New files to create:**

| File | Purpose |
|------|---------|
| `src/lib/revenuecat.js` | SDK init, `hasProAccess()`, purchase/restore helpers |
| `src/contexts/SubscriptionContext.jsx` | React context providing subscription state app-wide |
| `src/components/PaywallScreen.jsx` | Subscription screen (or use RevenueCat native paywall) |

**Files to modify:**

| File | Change |
|------|--------|
| `src/hooks/useAuth.js` | Call `initRevenueCat(user.uid)` after successful sign-in |
| `src/main.jsx` | Wrap app in `<SubscriptionProvider>` |
| `src/components/SettingsPage.jsx` | Add "Manage Subscription" + "Restore Purchases" buttons |
| All AI feature entry points | Check `isPro` before calling API, show paywall if false |

**AI feature entry points to gate:**

| Feature | File(s) | Trigger |
|---------|---------|---------|
| Tasting Coach | `src/tabs/TastingTab.jsx` | "Start Guided Tasting" button |
| Bean Scan | `src/components/AddBeanForm.jsx` | Camera/photo button for AI scan |
| AI Fill | `src/components/AddBeanForm.jsx` | "AI Fill" button on manual entry |
| Chat | `src/tabs/ChatTab.jsx` | Send message button |
| Hand Brew Recipe | `src/components/HandBrewModal.jsx` | Generate recipe |
| Aiden Recipe | `src/components/AidenModal.jsx` | Generate/push recipe |
| Product Shot | Bean card | Generate product shot button |
| Recommendations | `src/tabs/RotationTab.jsx` | AI recommendation section |

#### 1C: Server-Side Entitlement Gating (Day 3)

**New file:** `api/_checkEntitlement.js`
- Calls RevenueCat REST API v1: `GET /v1/subscribers/{uid}`
- Uses `REVENUECAT_SECRET_KEY` (sk_ key from Vercel env)
- Returns boolean: does user have active `pro` entitlement?
- Cache result in memory for 5 minutes per user to avoid per-request latency

**Modify all 5 API proxies:**

| File | Change |
|------|--------|
| `api/claude.js` | Add entitlement check before AI call, return 403 if not pro |
| `api/gemini.js` | Same |
| `api/openai.js` | Same |
| `api/aiden.js` | Same |
| `api/product-shot.js` | Same |

**403 response format:**
```json
{ "error": "subscription_required", "message": "Upgrade to Pro for unlimited AI features" }
```

**Client handling:** When `fetchWithRetry` receives 403 with `error: "subscription_required"`, surface the paywall instead of showing a generic error.

#### 1D: Testing (Day 4)

- Create Sandbox Apple ID in App Store Connect > Users and Access > Sandbox
- Test on real device (simulator can't do StoreKit purchases reliably)
- Full checklist:
  - [ ] Purchase monthly completes and unlocks AI features
  - [ ] Purchase annual completes and unlocks AI features
  - [ ] Free trial starts and provides access during trial
  - [ ] Paywall appears when free user taps any AI feature
  - [ ] Restore Purchases works on fresh install (same Apple ID)
  - [ ] Server-side check passes (API proxy allows request after purchase)
  - [ ] Server-side check blocks (API proxy returns 403 for non-subscriber)
  - [ ] Expired subscription removes access (sandbox renews every 5 min for monthly)
  - [ ] Settings shows "Manage Subscription" and "Restore Purchases"
  - [ ] Paywall shows correct prices, trial terms, legal links
  - [ ] "Already subscribed" state hides paywall, shows management options

---

### Phase 2: Legal, Privacy & Account Deletion (2-3 days)
> PRDs: [privacy-and-legal-prd.md](../prds/privacy-and-legal-prd.md), [account-deletion-prd.md](../prds/account-deletion-prd.md)

**Goal:** Privacy Policy and Terms of Service published, account deletion working, all linked in-app.

#### 2A: Create Legal Documents (Day 5)

**New files:**

| File | Purpose |
|------|---------|
| `public/privacy-policy.html` | Hosted at 2manybeans.vercel.app/privacy-policy.html |
| `public/terms.html` | Hosted at 2manybeans.vercel.app/terms.html |

**Privacy Policy must disclose:**
- Firebase Auth: email, name, photo (Google/Apple)
- Firestore: bean data, tasting notes, preferences
- Firebase Storage: bean photos, product shots
- AI APIs (Anthropic, OpenAI, Google): user content sent for processing via server proxies
- RevenueCat: purchase history, subscription status
- Capgo: device info, app version
- Marketing emails: opt-in only, stored in `emailList/{uid}`
- No advertising, no tracking, no data sales

**Terms of Service must cover:**
- Subscription auto-renewal terms
- AI content disclaimer (informational, not professional advice)
- User owns their content
- Acceptable use
- California governing law

#### 2B: Account Deletion (Day 5-6)
> PRD: [account-deletion-prd.md](../prds/account-deletion-prd.md)

Apple hard requirement (Guideline 5.1.1(v)). Must actually delete all data, not just deactivate.

**New file:** `api/delete-account.js`
- Server-side endpoint (Admin SDK bypasses security rules, handles subcollections)
- Deletes in order: RevenueCat subscriber, Storage files, Firestore subcollections (tastings, beans, secrets), top-level docs (emailList, user profile), Firebase Auth record
- Auth last (so user can retry if something fails mid-way)
- Idempotent (safe to call twice)

**UI in SettingsPage.jsx:**
- "Delete Account" button (red, destructive) in Account section below Sign Out
- Two-step confirmation: dialog with warning, then type "DELETE" to confirm
- If active subscription: extra warning + "Manage Subscription" link before proceeding
- On success: clear localStorage, sign out, show toast

**Data deleted:**

| Location | Path |
|----------|------|
| Firestore | `users/{uid}` (profile) |
| Firestore | `users/{uid}/beans/*` (all beans) |
| Firestore | `users/{uid}/tastings/*` (all tastings) |
| Firestore | `users/{uid}/secrets/fellow` (encrypted creds) |
| Firestore | `emailList/{uid}` (marketing consent) |
| Storage | `users/{uid}/bean-photos/*` (all photos) |
| Auth | Firebase Auth user record |
| RevenueCat | Subscriber record |
| Device | All `tmb_*_{uid}` localStorage keys |

#### 2C: Link Documents in App (Day 6)

| Location | What to add |
|----------|-------------|
| `src/components/SignInScreen.jsx` | Footer: "By signing in, you agree to our Terms and Privacy Policy" with links |
| `src/components/SettingsPage.jsx` | New "Legal" section with Privacy Policy + Terms links |
| `src/components/PaywallScreen.jsx` | Footer links to Terms + Privacy Policy (required by Apple for subscriptions) |
| `src/components/OnboardingWizard.jsx` | Marketing consent text links to Privacy Policy |

---

### Phase 3: App Store Connect Setup (1-2 days)
> PRD: [app-store-submission-prd.md](../prds/app-store-submission-prd.md)

**Goal:** All metadata, screenshots, and compliance forms completed in App Store Connect.

#### 3A: Metadata (Day 6)

| Field | Value |
|-------|-------|
| App Name | 2manybeans |
| Subtitle | Specialty Coffee Tracker |
| Category | Food & Drink |
| Description | (draft in PRD, ~300 words covering: what it does, who it's for, AI features, equipment support) |
| Keywords | `specialty coffee,bean tracker,peak window,tasting notes,roaster,brew recipe,coffee inventory,pour over,fellow aiden` |
| Support URL | https://2manybeans.vercel.app/support (create simple contact page) |
| Privacy Policy URL | https://2manybeans.vercel.app/privacy-policy.html |
| What's New | "Initial release of 2manybeans: track your specialty coffee rotation, get AI-guided tastings, and generate personalized brew recipes." |

#### 3B: Screenshots (Day 6-7)

Capture 6-7 screenshots on iPhone 15 Pro Max (6.7" display, 1290x2796):

| # | Screen | Text Overlay |
|---|--------|-------------|
| 1 | Rotation Tab (jars with peak status) | "Track peak freshness for every bean" |
| 2 | Add Bean scan (Gemini analyzing photo) | "Scan any bag, AI fills the details" |
| 3 | Tasting Tab (guided coaching session) | "AI-guided tasting coaching" |
| 4 | Hand Brew recipe (step timeline) | "Personalized recipes for your grinder" |
| 5 | Chat Tab (conversation with assistant) | "Your specialty coffee companion" |
| 6 | Inventory Tab (bean cards with product shots) | "Beautiful inventory at a glance" |
| 7 | Paywall screen (subscription options) | "Unlock the full experience" |

**Process:**
1. Use `/ios-screenshot` to capture all tabs on simulator
2. Add text overlays (Figma, Canva, or similar)
3. Export at 1290x2796 for 6.7", 1179x2556 for 6.1"

#### 3C: App Icon

- Need 1024x1024 PNG for App Store Connect (no alpha, no rounded corners)
- Check if existing icon meets spec, resize if needed

#### 3D: Privacy Nutrition Labels (Day 7)

Declare in App Store Connect:

| Category | Data Type | Linked to User? | Used for Tracking? |
|----------|-----------|-----------------|-------------------|
| Contact Info | Email, Name | Yes | No |
| Identifiers | User ID | Yes | No |
| User Content | Photos, Other (tasting notes, bean data) | Yes | No |
| Purchases | Purchase History | Yes | No |
| Diagnostics | Crash Data (if Crashlytics added) | No | No |

#### 3E: Compliance (Day 7)

**Export Compliance:**
- "Does your app use encryption?" YES (HTTPS, Firebase Auth)
- "Is it exempt under EAR?" YES (standard HTTPS/TLS, qualifies for exemption)

**Age Rating:**
- No violence, no adult content, no gambling, no drugs
- Result: Rated 4+ (all ages)

**Privacy Manifest (PrivacyInfo.xcprivacy):**
- Required in 2026, auto-rejected without it
- Declare required reason APIs used by Capacitor, Firebase, RevenueCat SDKs
- Place in `ios/App/App/` directory
- Verify each SDK ships its own privacy manifest (check after `cap sync`)

#### 3F: Review Notes

- Provide demo account credentials (create a test Google account, or explain Apple Sign-In works)
- Note: "App requires sign-in to sync data. Free tier includes limited AI trial (3 bean scans, 1 tasting coach session). Pro ($4.99/mo) and Ultra ($9.99/mo) subscriptions include a 3-day free trial. Ultra additionally integrates with Fellow Aiden brewers."

---

### Phase 4: Final Build & Submit (1-2 days)

**Goal:** Archive, upload, submit for review.

#### 4A: Version Bump (Day 8)

| File | Change |
|------|--------|
| `package.json` | version: "1.0.0" |
| Xcode project | Marketing Version: 1.0.0, Build: 1 |
| `capacitor.config.ts` | Verify appId, appName match App Store Connect |

#### 4B: Pre-Submission Build Checklist

- [ ] All AI features gated behind subscription (client + server)
- [ ] Privacy Policy live at production URL
- [ ] Terms of Service live at production URL
- [ ] Legal links present on: sign-in screen, paywall, settings
- [ ] "Restore Purchases" button visible on paywall and settings
- [ ] Paywall shows correct prices with trial terms
- [ ] Apple Sign-In works end-to-end
- [ ] Google Sign-In works end-to-end
- [ ] All 5 tabs load without crashes
- [ ] Bean scan works (camera + photo library)
- [ ] Tasting coach works for subscribers
- [ ] Chat works for subscribers
- [ ] Hand brew recipe generates for subscribers
- [ ] Free user sees paywall when tapping AI features
- [ ] Free user can still add/edit/delete beans manually
- [ ] Free user can still log manual tastings
- [ ] Settings page saves all preferences
- [ ] Sign out works
- [ ] Delete Account works (two-step confirm, all data purged, lands on sign-in screen)
- [ ] Re-sign-in after deletion creates fresh account with onboarding
- [ ] Fresh install shows onboarding wizard
- [ ] No placeholder text, no "TODO", no debug logs in production
- [ ] Privacy manifest present in iOS project
- [ ] In-App Purchase capability enabled in Xcode
- [ ] Xcode 26 / iOS 26 SDK (required after April 28, 2026)

#### 4C: Build & Upload (Day 8)

```bash
# Build for iOS (no service worker)
npm run build:ios

# Sync to Capacitor
npx cap sync

# Open Xcode
npx cap open ios
```

In Xcode:
1. Select "Any iOS Device" as destination
2. Product > Archive
3. Distribute App > App Store Connect > Upload
4. Wait for processing (~15 min)

#### 4D: Submit for Review (Day 8)

In App Store Connect:
1. Select the uploaded build
2. Attach screenshots to each device size
3. Fill all metadata fields
4. Add subscription screenshot for review
5. Fill review notes with demo instructions
6. Submit for Review

---

### Phase 5: Review & Launch (3-7 days)

#### 5A: Apple Review (Days 9-14)

- Typical review: 24-48 hours
- Subscription apps may take longer (Apple manually reviews paywall)
- With the 84% surge in submissions (Q1 2026), expect possible delays

**If rejected:**
- Read the specific guideline cited
- Most common for this app type:
  - Broken privacy policy link
  - Paywall missing price/renewal terms
  - "Restore Purchases" not visible enough
  - App crashes on reviewer's device
  - Missing privacy manifest
- Fix, rebuild, resubmit (each resubmission resets the queue)

#### 5B: Launch Day

1. **Approve release** in App Store Connect (or set to auto-release on approval)
2. **Upload Capgo OTA bundle** to keep iOS live update channel in sync
3. **Verify** the live app works: download from App Store, sign in, subscribe, use AI features
4. **Deploy web** via Vercel (should already be current)

#### 5C: Post-Launch Monitoring (Week 2+)

- Watch RevenueCat dashboard for subscription metrics (trials started, conversions, churn)
- Monitor Vercel function logs for API errors
- Check App Store Connect for crash reports
- Respond to any App Store reviews

---

## Timeline Summary

| Phase | Days | Calendar (starting Apr 10) |
|-------|------|---------------------------|
| Phase 1: Subscription infrastructure | 4 days | Apr 10-13 |
| Phase 2: Legal & privacy | 1-2 days | Apr 14-15 |
| Phase 3: App Store Connect setup | 1-2 days | Apr 15-16 |
| Phase 4: Final build & submit | 1-2 days | Apr 17 |
| Phase 5: Review & launch | 3-7 days | Apr 18-24 |
| **Total: Live on App Store** | **~2 weeks** | **~Apr 24** |

Phases 2 and 3 can overlap (legal docs and App Store metadata are independent work streams).

---

## Post-Launch Roadmap (Not Launch Blockers)

| Priority | Feature | Effort | Why |
|----------|---------|--------|-----|
| High | Firebase Analytics + event tracking | 2-3 days | Understand user behavior, funnel drop-off, feature usage |
| High | Firebase Crashlytics | 1 day | Catch native crashes before users report them |
| Medium | Push notifications (peak window alerts) | 3-4 days | Retention driver: "Your Ethiopia Gesha just entered peak!" |
| Medium | API rate limiting per user | 1 day | Prevent subscription holders from abusing API keys |
| Low | RevenueCat webhooks to Firestore | 1 day | Real-time subscription status sync (optimization over polling) |
| Low | Promotional offers / discounts | 0.5 day | App Store Connect promo codes for launch marketing |

---

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Apple rejects for paywall language | High | Follow Apple's exact subscription disclosure requirements (price, duration, auto-renewal, cancel terms). Include all in paywall footer. |
| Apple rejects for missing privacy manifest | High | Verify all SDKs (Capacitor, Firebase, RevenueCat) ship privacy manifests after `cap sync`. Add app-level PrivacyInfo.xcprivacy. |
| Xcode 26 SDK requirement (Apr 28) | High | Must use Xcode 26 for the archive build. If current Xcode is older, update before Phase 4. |
| RevenueCat server-side check adds latency | Medium | Cache entitlement status in memory (5-min TTL). First check adds ~150ms, subsequent requests are instant. |
| Users subscribe then immediately cancel trial | Low | Apple handles trial lifecycle. You still get 7 days of usage. Optimize onboarding to demonstrate value fast. |
| Subscription revenue doesn't cover API costs | Medium | Monitor per-user API spend vs subscription revenue. Adjust pricing or add usage caps if economics don't work. |

---

## Files Created / Modified (Full List)

### New Files

| File | Phase | Purpose |
|------|-------|---------|
| `src/lib/revenuecat.js` | 1B | RevenueCat SDK init, entitlement checks, purchase helpers |
| `src/contexts/SubscriptionContext.jsx` | 1B | React context for subscription state |
| `src/components/PaywallScreen.jsx` | 1B | Subscription paywall UI |
| `api/_checkEntitlement.js` | 1C | Server-side RevenueCat entitlement check |
| `api/delete-account.js` | 2B | Server-side account deletion (all user data) |
| `public/privacy-policy.html` | 2A | Privacy Policy page |
| `public/terms.html` | 2A | Terms of Service page |
| `public/support.html` | 3A | Simple support/contact page |
| `ios/App/App/PrivacyInfo.xcprivacy` | 3E | Apple privacy manifest |

### Modified Files

| File | Phase | Change |
|------|-------|--------|
| `package.json` | 1B, 4A | Add RevenueCat deps, bump version to 1.0.0 |
| `src/hooks/useAuth.js` | 1B | Init RevenueCat after sign-in |
| `src/main.jsx` | 1B | Wrap in SubscriptionProvider |
| `src/components/SettingsPage.jsx` | 1B, 2B | Manage Subscription, Restore Purchases, Legal section, Delete Account button |
| `src/tabs/TastingTab.jsx` | 1B | Gate tasting coach behind subscription |
| `src/tabs/ChatTab.jsx` | 1B | Gate chat behind subscription |
| `src/components/AddBeanForm.jsx` | 1B | Gate bean scan + AI Fill behind subscription |
| `src/components/HandBrewModal.jsx` | 1B | Gate recipe generation behind subscription |
| `src/components/AidenModal.jsx` | 1B | Gate Aiden recipes behind subscription |
| `src/tabs/RotationTab.jsx` | 1B | Gate AI recommendations behind subscription |
| `src/lib/fetchWithRetry.js` | 1C | Handle 403 subscription_required response |
| `api/claude.js` | 1C | Add entitlement check |
| `api/gemini.js` | 1C | Add entitlement check |
| `api/openai.js` | 1C | Add entitlement check |
| `api/aiden.js` | 1C | Add entitlement check |
| `api/product-shot.js` | 1C | Add entitlement check |
| `src/components/SignInScreen.jsx` | 2B | Add legal links footer |
| `src/components/OnboardingWizard.jsx` | 2B | Link Privacy Policy from marketing consent |
| `capacitor.config.ts` | 4A | Verify config matches App Store Connect |

---

## Reference PRDs

| PRD | Covers |
|-----|--------|
| [subscription-paywall-prd.md](../prds/subscription-paywall-prd.md) | RevenueCat setup, paywall UI, server-side gating, entitlement flow, testing |
| [app-store-submission-prd.md](../prds/app-store-submission-prd.md) | Metadata, screenshots, privacy labels, compliance, privacy manifest, review prep |
| [privacy-and-legal-prd.md](../prds/privacy-and-legal-prd.md) | Privacy Policy draft, Terms of Service draft, GDPR/CCPA compliance, implementation |
| [account-deletion-prd.md](../prds/account-deletion-prd.md) | Server-side deletion endpoint, UI flow, data map, idempotency, Apple Guideline 5.1.1(v) |
| [consumer-launch-master-plan](./2026-04-04-005-feat-consumer-launch-master-plan.md) | Auth, onboarding, settings, hand brew (ALL COMPLETE) |

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| No free AI calls | API costs are real. Free tier is Firestore-only (zero cost). Clean value prop. | 2026-04-09 |
| RevenueCat over native StoreKit 2 | Handles receipt validation, renewal management, server-side API. One SDK vs building it all. Free up to $2.5M. | 2026-04-09 |
| Pro $4.99/$49.99, Ultra $9.99/$99.99 | Playbook analysis + 2026 research. Two-tier model captures both enthusiasts (Pro) and Fellow Aiden prosumers (Ultra). 17% annual discount is 2026 standard. | 2026-04-11 |
| 3-day free trial (not 7) | 2026 trend: shorter trials, faster commitment, reduces trial abuse exposure. Every free trial = real API cost for AI apps. | 2026-04-11 |
| Metered free tier (3 scans, 1 taste test lifetime) | Playbook model: demo the AI magic at ~$0.01/user lifetime cost. Soft paywall converts significantly better than hard paywall for niche apps. Lifetime (not monthly) prevents abuse. | 2026-04-11 |
| Two-card paywall (no toggle) | Apple mass-rejected toggle paywalls in Jan 2026 under Guideline 3.1.2. Side-by-side card layout is the 2026 compliant pattern. | 2026-04-11 |
| Dynamic pricing from RevenueCat | Apple rejects apps where paywall price doesn't exactly match ASC (including currency formatting). Pull prices via package.product.priceString. | 2026-04-11 |
| Server-side entitlement check | Client-side only is bypassable. All 5 API proxies must verify subscription. | 2026-04-09 |
| Apple Small Business Program | 15% commission vs 30%. No reason not to enroll. | 2026-04-09 |
| Food & Drink category | Better fit than Lifestyle. Users searching for coffee apps will find it. | 2026-04-09 |
