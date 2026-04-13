# 2manybeans — App Store Connect Listing

Draft copy and compliance answers for the App Store submission. Copy-paste into App Store Connect when prompted.

---

## Phase 3A: Metadata

### App Name
`2manybeans`

### Subtitle (30 char max)
`AI Coffee Coach & Journal`

Backup options if Apple rejects the primary:
- `Specialty Coffee Journal & Coach`
- `Track, Taste, Brew Better Coffee`
- `Your Specialty Coffee Companion`

### Promotional Text (170 char max, updatable anytime without review)
`Scan any coffee bag, get a personalized brew recipe, and have an AI tasting coach walk you through your first real cupping. Built for specialty coffee nerds.`

### Description (4000 char max)

```
2manybeans is the specialty coffee journal that actually coaches you.

Most coffee apps are passive logbooks. 2manybeans is different. It scans your bean bag, researches the farm and roaster, and writes you a brew recipe tuned to your grinder and your brewer. Then it walks you through tasting the cup step by step, asking the kind of questions a cupping-room mentor would ask, so you actually learn what you are drinking.

WHAT YOU CAN DO

Scan any bag
Point your camera at a coffee bag and 2manybeans reads the label, pulls origin, process, roast date, and notes, then enriches it with information about the roaster and the farm. No typing.

Track peak freshness
Every bean gets a peak drinking window based on roast date and style. Your rotation view shows which jars are hitting their stride and which are about to fade. Waste less coffee.

Get personalized hand brew recipes
Tell the app what grinder and brewer you own. It writes you a recipe grounded in real research, down to the right grind setting for your Ode or Opus, the ratio, the pour schedule, and why each choice matters.

Push recipes to Fellow Aiden
Own a Fellow Aiden? 2manybeans builds the profile and pushes it straight to the brewer. Walk up, press brew, done.

AI tasting coach
Open the tasting tab and the coach takes it from there. It asks about aroma, acidity, body, and finish in plain language, scaffolds the conversation so you are never stuck, and translates your answers into a real SCA-style score.

Coffee chat
Ask the built-in assistant anything. Why is this Ethiopian floral. What does washed process mean. Why does my V60 taste sour. It answers using a library that includes the World Atlas of Coffee and a curated archive of specialty coffee writing.

Share cards
Turn any bean into a beautiful apothecary-style share card and post it.

WHO THIS IS FOR

Specialty coffee enthusiasts who own a burr grinder, care about origin, and want to taste more intentionally. Works great for light roast fans, pour-over nerds, cupping beginners, and anyone tired of logging brews into a spreadsheet.

FREE TIER

Add beans, track your rotation, and log manual tastings for free. A few trial bean scans and one AI tasting coach session are included so you can try the good stuff before subscribing.

PRO ($4.99 / month or $49.99 / year)
Unlimited bean scans, unlimited AI tasting coach, unlimited personalized hand brew recipes, and unlimited coffee chat.

ULTRA ($9.99 / month or $99.99 / year)
Everything in Pro, plus direct push to Fellow Aiden, multi-brewer support (V60, Chemex, AeroPress, Kalita), priority model routing, and early access to new features.

Both tiers start with a 3-day free trial. Cancel anytime from the App Store subscription settings.

Built by a home brewer who got tired of apps that treat coffee like a to-do list.
```

### Keywords (100 char max, comma-separated)
```
specialty coffee,tasting,pour over,v60,fellow aiden,cupping,roast date,bean tracker,brew recipe,ode
```

### Support URL
`https://2manybeans.vercel.app/support.html`

_Status: needs a simple static page — see Support Page Stub below._

### Marketing URL (optional)
`https://2manybeans.vercel.app`

### Privacy Policy URL
`https://2manybeans.vercel.app/privacy-policy.html`

### Category
- Primary: **Food & Drink**
- Secondary: **Lifestyle**

### What's New in This Version
```
Welcome to 2manybeans. Scan any bean bag, track peak freshness, and get an AI coach to walk you through your first real cupping. Fellow Aiden owners can push recipes straight to the brewer.
```

---

## Phase 3C: App Icon

- 1024×1024 PNG, no alpha channel, no rounded corners (Apple adds them)
- Source: `public/icon-512.png` (needs upscale to 1024 or regenerate from the master art)
- Verify: no transparency, RGB color space, no text cut off at corners

---

## Phase 3D: Privacy Nutrition Labels

Answer these exactly in App Store Connect → App Privacy:

| Category | Data Type | Linked to Identity? | Used for Tracking? | Purpose |
|---|---|---|---|---|
| Contact Info | Email Address | Yes | No | App Functionality, Account |
| Contact Info | Name | Yes | No | App Functionality, Account |
| Identifiers | User ID | Yes | No | App Functionality, Analytics |
| User Content | Photos or Videos | Yes | No | App Functionality (bean scans, product shots) |
| User Content | Other User Content | Yes | No | App Functionality (tasting notes, bean data, brew profiles) |
| Purchases | Purchase History | Yes | No | App Functionality (subscription status) |
| Usage Data | Product Interaction | No | No | Analytics (RevenueCat SDK) |

**NOT collected:**
- Health & Fitness
- Financial Info (RevenueCat handles purchase history, we do not store card data)
- Location
- Sensitive Info
- Contacts
- Search History
- Browsing History
- Audio Data
- Gameplay Content
- Customer Support
- Environment Scanning
- Surroundings
- Body
- Other Data

**Tracking:** No. The app does not track users across apps or websites owned by other companies. No IDFA prompt needed.

---

## Phase 3E: Compliance

### Export Compliance
- **Does your app use encryption?** YES
- **Does your app qualify for the exemption?** YES
- **Reason:** Uses only standard encryption (HTTPS / TLS for Firebase, RevenueCat, AI proxy calls). Falls under 5D002 exemption per U.S. Bureau of Industry and Security category for mass-market software using standard encryption protocols.
- **Upload annual self-classification report to BIS:** Not required because the exemption applies.

### Age Rating
Answer this way in App Store Connect → Age Rating:

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Sexual Content or Nudity | None |
| Profanity or Crude Humor | None |
| Alcohol, Tobacco, or Drug Use or References | None |
| Simulated Gambling | None |
| Horror/Fear Themes | None |
| Mature/Suggestive Themes | None |
| Medical/Treatment Information | None |
| Unrestricted Web Access | No |
| Gambling and Contests | No |
| User Generated Content | No (content is private per-user, not shared with other users) |
| Social Networking | No |

**Result:** Rated **4+** (all ages).

### Privacy Manifest (PrivacyInfo.xcprivacy)
- Required by Apple as of 2026. Auto-rejection without it.
- Verify each SDK ships its own: Capacitor, Firebase, RevenueCat, Fellow Aiden HTTP wrapper.
- After `npm run cap:sync`, check:
  ```bash
  find ios/App/Pods -name "PrivacyInfo.xcprivacy" -type f
  ```
- App-level manifest at `ios/App/App/PrivacyInfo.xcprivacy` declaring required reason APIs used directly by our code (NSUserDefaults, file timestamp, disk space, system boot time if any).

---

## Phase 3F: Review Notes (to App Review team)

### Sign-in Information
```
The app supports both Google Sign-In and Sign in with Apple. For review, either method works. No demo account required.

If you prefer a demo account, use:
The app supports Sign in with Apple and Google Sign-In. No demo account is needed. The reviewer can create an account using Sign in with Apple.
```

### Notes to Reviewer
```
2manybeans is a specialty coffee tracking and AI coaching app.

KEY USER FLOWS TO TEST

1. Sign in with Apple or Google (both supported).
2. Rotation tab shows jars with peak freshness status — tap a jar to see the bean detail.
3. Inventory tab lists all beans. Tap "+" to add a new bean.
4. To test bean scanning: tap "+" → "Scan a bag" → take a photo of any coffee bag (or use Photo Library). The app will extract origin, roaster, and notes using Google Gemini and return to the form prefilled.
5. Tasting tab starts an AI-guided tasting session. The coach walks you through aroma, acidity, body, and finish, then converts your answers to a score.
6. Chat tab is a coffee expert assistant powered by Anthropic Claude.
7. Hand brew recipes: open any active bean → tap "Get a recipe" → the app asks what grinder and brewer you own, then generates a pour schedule.

SUBSCRIPTIONS

All AI features (scan, tasting coach, brew recipes, chat) are gated behind Pro or Ultra after a free trial.

- Pro Monthly ($4.99) / Pro Annual ($49.99): unlimited AI features on one brewer
- Ultra Monthly ($9.99) / Ultra Annual ($99.99): adds Fellow Aiden direct push and multi-brewer support

Both tiers include a 3-day free trial via StoreKit introductory offer.

Free users can still manually add beans, log manual tastings, and track their rotation without any AI. Free tier limits: 3 bean scans and 1 AI tasting coach session.

FELLOW AIDEN INTEGRATION

Ultra tier unlocks direct push to a Fellow Aiden brewer. This requires the reviewer to own a Fellow Aiden and be signed in to their Fellow account. It is NOT required to test the core app — you can verify Pro tier without it.

ACCOUNT DELETION

Settings → Delete Account. Two-step confirmation, removes all user data within seconds, ends the Firebase session.

THIRD-PARTY SDKs
- Firebase (Auth + Firestore)
- RevenueCat (subscription management)
- Anthropic Claude, OpenAI GPT, Google Gemini (all via our own server proxy, not direct SDK)
- @codetrix-studio/capacitor-google-auth (Google Sign-In on iOS)
```

### Contact Info (App Review Contact)
- First Name: Tal
- Last Name: Meltzer
- Phone: (Tal fills)
- Email: (Tal fills, same as Apple ID recommended)

---

## Support Page Stub (create before submitting)

Add `public/support.html` as a simple static page. Content:

```
Support for 2manybeans

Questions, bug reports, or feature requests? Email support@2manybeans.app and we will get back to you within 48 hours.

Common issues:
- Subscription not unlocking: Settings → Restore Purchases
- Bean scan failing: make sure the bag is well-lit and the label is in focus
- Delete your account: Settings → Delete Account (removes all data immediately)

Privacy Policy: https://2manybeans.vercel.app/privacy-policy.html
Terms of Service: https://2manybeans.vercel.app/terms.html
```

_Needs: domain email `support@2manybeans.app` to route to Tal, OR switch to a Gmail forwarder and reference that address in the support page._

---

## Screenshots

See `docs/launch/screenshots-plan.md` (generated by app-store-screenshots skill).

Summary of what to capture on an iPhone 16 simulator (6.1"):

| # | Screen | Headline (for ad overlay) |
|---|---|---|
| 1 | Rotation tab — 3 jars with peak status lit up | Know when your beans peak |
| 2 | Bean detail — with product shot, altitude, origin, farm | Every bean, properly researched |
| 3 | Scan flow mid-capture — camera view on a bag | Scan any bag. AI fills the rest |
| 4 | Tasting coach mid-session — Claude asking about aroma | A tasting coach in your pocket |
| 5 | Hand brew recipe — pour schedule with timer | Recipes tuned to your gear |
| 6 | Chat tab — conversation about Ethiopian floral notes | Ask any coffee question |
| 7 | Fellow Aiden push confirmation (Ultra only) | Push recipes straight to Aiden |

---

## Submission Checklist (final gate before tapping Submit)

- [ ] App name reserved in ASC as `2manybeans`
- [ ] Bundle ID matches Xcode: `com.talmeltzer.coffeehub`
- [ ] Build uploaded via Xcode archive (Product → Archive → Distribute App → App Store Connect)
- [ ] Build processing complete (20-60 min after upload)
- [ ] Subscriptions attached to version 1.0 (done 2026-04-11)
- [ ] 4 subscriptions in "Ready to Submit" state (done)
- [ ] Subscription review screenshot uploaded (1242x2688, done)
- [ ] Group localization + sub localizations present (done)
- [ ] Paywall loads on device with real prices (confirmed 2026-04-11)
- [ ] Description, keywords, subtitle pasted into ASC
- [ ] App icon 1024x1024 uploaded
- [ ] Screenshots uploaded for at least 6.5" display (iPhone 15 Pro Max or similar)
- [ ] Privacy nutrition labels declared
- [ ] Export compliance YES + exempt YES
- [ ] Age rating filled (4+)
- [ ] Review notes + sign-in info pasted
- [ ] Privacy Policy URL live
- [ ] Terms URL live
- [ ] Support URL live (create support.html)
- [ ] Submit for Review
