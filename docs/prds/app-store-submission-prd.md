# App Store Submission Preparation PRD

## Context

2manybeans (Coffee Hub) is live on TestFlight (build 21, marketing version 1.0) and needs to pass App Store Review for public release. This PRD covers every artifact, configuration, and metadata item required before clicking Submit. Apple rejections cost 24-48 hours per round, so the goal is to get it right on the first submission.

Bundle ID: `com.talmeltzer.coffeehub`
Production web: `https://2manybeans.vercel.app`
Stack: React 19 + Vite + Capacitor 8 + Firebase + server-side AI proxies

---

## 1. Privacy Policy (HARD BLOCKER)

Apple will reject the app immediately without a publicly accessible privacy policy. This is the single most common first-submission rejection.

### What to Disclose

| Service | Data Collected | Purpose |
|---|---|---|
| Firebase Auth (Google + Apple Sign-In) | Email, display name, profile photo URL, auth provider ID | Account creation and authentication |
| Firestore | Bean inventory, tasting notes, brew recipes, jar assignments, AI-generated stories and scores | Core app functionality, synced across devices |
| Firebase Storage | Bean product photos (user-uploaded) | Display on bean cards and share cards |
| Anthropic Claude (via `/api/claude`) | Tasting notes, chat messages (text only, no PII beyond what user types) | AI tasting coach, general chat assistant |
| OpenAI GPT-5.4 (via `/api/openai`) | Bean data, tasting descriptions | Story generation, score extraction |
| Google Gemini (via `/api/gemini`) | Bean photos, bean metadata, chat images | Photo scanning, web search enrichment, image analysis |
| RevenueCat | Apple ID, purchase history, subscription status | Subscription management and entitlement |
| Marketing email (if collected) | Email address | Product updates, optional newsletter |

All AI API calls are server-side proxies on Vercel. User content is sent to third-party AI providers for processing but is NOT stored by those providers beyond their standard API data retention policies (disclose this).

### GDPR and CCPA Requirements

Include these sections in the privacy policy:

- **Data controller**: Hallwood Media LLC (or Tal Meltzer as individual developer, pick one)
- **Lawful basis for processing**: Consent (sign-in), contract (app functionality), legitimate interest (analytics if added later)
- **Right to access**: Users can request a copy of their data
- **Right to delete**: Users can request account and data deletion. Apple REQUIRES an in-app account deletion mechanism (Settings page). Implement this before submission.
- **Right to portability**: Users can request data export
- **Data retention**: State how long data is kept (e.g., until account deletion)
- **CCPA**: "We do not sell personal information" statement. Right to know, right to delete, right to opt-out disclosures.
- **Children**: App is not directed at children under 13. No COPPA data collection.
- **Contact**: Email address for privacy inquiries

### Where to Host

Create `public/privacy-policy.html` in the project. This deploys to `https://2manybeans.vercel.app/privacy-policy.html` via Vercel.

### Link Placement (all three required)

1. **Sign-in screen footer**: Small text link below Google/Apple sign-in buttons
2. **Settings page**: Dedicated row linking to the policy
3. **Paywall/subscription screen**: Link near the subscription purchase button (Apple requirement for apps with subscriptions)

### Structure Template

```
Privacy Policy for 2manybeans
Last Updated: [date]

1. Information We Collect
   - Account Information (from Google/Apple Sign-In)
   - Coffee Data (beans, tastings, recipes you create)
   - Photos (bean images you upload)
   - Purchase Information (subscription status via RevenueCat)
   - Usage Data (interactions with AI features)

2. How We Use Your Information
   - Provide and improve the app
   - Process AI requests (tasting coach, bean scanning, brew recipes)
   - Manage your subscription

3. Third-Party Services
   - Firebase (Google) -- authentication, database, storage
   - Anthropic -- AI tasting coach and chat
   - OpenAI -- AI story generation and scoring
   - Google Gemini -- photo scanning and search enrichment
   - RevenueCat -- subscription management
   [For each: what data is shared, why, link to their privacy policy]

4. Data Security
   - All data transmitted over HTTPS
   - AI API calls processed server-side (your data is not sent directly from your device to AI providers)
   - Firebase security rules restrict access to authenticated users

5. Your Rights (GDPR/CCPA)
   - Access, correction, deletion, portability
   - Account deletion available in Settings
   - Contact: [email]

6. Children's Privacy
   - Not directed at children under 13

7. Changes to This Policy
   - We will update this page and note the date

8. Contact Us
   - [email address]
```

---

## 2. Terms of Service

### What to Include

- **Acceptance of terms**: By using the app, you agree
- **Account**: You are responsible for your account. One account per person.
- **Subscriptions**: Auto-renewal terms, how to cancel (link to Apple subscription management), refund policy (handled by Apple)
- **AI-generated content**: Disclaimer that AI outputs (tasting advice, brew recipes, stories) are for informational/entertainment purposes, not professional advice. AI may produce inaccurate information.
- **User content**: You own your data (bean entries, tasting notes, photos). You grant the app a license to process it for functionality.
- **Prohibited use**: No abuse of AI features, no reverse engineering
- **Termination**: We can terminate accounts for violations
- **Limitation of liability**: Standard disclaimer. Not liable for AI advice, coffee outcomes, equipment damage from brew recipes.
- **Governing law**: State of California (or wherever you prefer)

### Where to Host

Create `public/terms.html`. Deploys to `https://2manybeans.vercel.app/terms.html`.

Link from: Settings page, paywall screen.

---

## 3. App Store Connect Metadata

### Core Fields

| Field | Value |
|---|---|
| App Name | 2manybeans |
| Subtitle (30 chars max) | Your Specialty Coffee Tracker |
| Primary Category | Food & Drink |
| Secondary Category | Lifestyle |
| Content Rights | Does not contain third-party content requiring rights |
| Age Rating | 4+ (see Section 8) |

### Description (draft, 4000 char max)

```
Track your specialty coffee collection, log tastings, and brew better with AI.

2manybeans is a personal coffee companion for specialty coffee enthusiasts who want to remember what they drink, learn what they taste, and brew at their best.

MANAGE YOUR ROTATION
Keep up to 3 active jars in rotation. Know what's open, what's sealed, and when each bag hits peak freshness. The rotation view shows your current lineup at a glance.

SCAN YOUR BEANS
Snap a photo of any coffee bag and AI instantly extracts the roaster, origin, variety, process, and tasting notes. Web research fills in altitude, farm details, cup scores, and brewing recommendations automatically.

TASTE WITH A COACH
New to specialty coffee? The AI tasting coach walks you through every sip with structured, step-by-step prompts designed for beginners. No vague "what do you taste?" questions. Just guided exploration that builds your palate over time.

LEARN THE STORY
Every bean has a story. Professor Ruphus, your friendly coffee educator, delivers short lessons about your coffee's origin, processing method, and what flavors to expect, complete with a flavor profile spider chart.

BREW SMARTER
Get precision brew recipes tailored to your specific beans, grinder, and brewing method. Grind size, water temperature, ratio, and technique, all dialed in by AI.

CHAT ABOUT COFFEE
Ask anything. Get recommendations, learn about origins, troubleshoot a bad cup, or just geek out about extraction theory. Your AI coffee assistant knows your inventory and tasting history.

TRACK YOUR JOURNEY
Every bean and tasting is archived. Rate your coffees, build your flavor preferences, and watch your palate develop over time.

Key features:
- AI-powered bean scanning from bag photos
- Guided tasting sessions with scoring
- Personalized brew recipes
- Coffee education with flavor profiles
- Full inventory management with jar rotation
- Cloud sync across devices
- Works offline, syncs when connected
```

### Keywords (100 chars max, comma-separated)

```
coffee,specialty,tasting,brew,beans,roaster,pour over,espresso,tracker,inventory,AI,barista,journal
```

That is 97 characters. No spaces after commas (Apple counts them). Do not repeat the app name or category name.

### What's New (v1.0)

```
Welcome to 2manybeans! Your personal specialty coffee companion.

- Scan coffee bags with AI to auto-fill bean details
- Guided tasting sessions with an AI coach
- Precision brew recipes for your beans
- Coffee education with Professor Ruphus
- Manage your rotation with up to 3 active jars
- Cloud sync across devices
```

### Support URL

Use `https://2manybeans.vercel.app/support.html`. Create a simple page with:
- FAQ (how to delete account, how to cancel subscription, how AI features work)
- Contact email
- Link to privacy policy and terms

This is required by App Store Connect.

### Marketing URL (optional)

`https://2manybeans.vercel.app` -- only if you add a landing page. Otherwise leave blank for v1.0.

---

## 4. App Store Screenshots

### Required Device Sizes

| Device | Resolution | Required? |
|---|---|---|
| iPhone 16 Pro Max (6.7") | 1320 x 2868 | Yes (covers all 6.7" devices) |
| iPhone 16 Pro (6.3") | 1206 x 2622 | Yes (covers all 6.1" class) |
| iPad Pro 13" (if supporting iPad) | 2064 x 2752 | Only if you declare iPad support |

If the app is iPhone-only in App Store Connect, skip iPad screenshots.

### Recommended Screenshots (6-7, map to key flows)

| # | Screen | What to Show | Text Overlay |
|---|---|---|---|
| 1 | Rotation Tab | 3 active jars with bean cards, peak status badges | "Your coffee rotation, always fresh" |
| 2 | Bean Scan Flow | Camera capturing a bag, or the scan results screen | "Scan any bag. AI does the rest." |
| 3 | Tasting Tab | Active tasting session with coach prompts | "Learn to taste like a pro" |
| 4 | Professor Ruphus | Ruphus slide-up with spider chart | "Every bean tells a story" |
| 5 | Chat Tab | Conversation with the AI assistant | "Your personal coffee expert" |
| 6 | Inventory Tab | Full bean list with status badges | "Track every bean you own" |
| 7 | Brew Recipe (Aiden) | A brew recipe card with grind/water/time | "Precision recipes for your beans" |

### Screenshot Capture Process

1. Open Xcode, select the correct simulator device (iPhone 16 Pro Max, iPhone 16 Pro)
2. Build and run the app with realistic data (add 5-8 beans, a few tastings)
3. Navigate to each screen and use Cmd+S in the simulator to capture
4. Screenshots save to Desktop by default
5. Add text overlays and device frames using a tool like Screenshots Pro, Figma, or RocketSim
6. Export at exact required resolutions (no upscaling)

Alternative: Use the project's existing `/ios-screenshot` skill to capture all 5 tabs automatically, then manually capture the scan and Ruphus flows.

### App Preview Video (optional, recommended)

30-second video showing: open app, view rotation, tap a bean, see Ruphus story, start a tasting, chat with AI. No audio narration needed (Apple adds device frame). Record in Xcode simulator at 1290 x 2796.

---

## 5. App Icon

### Requirements

- **1024x1024 PNG** uploaded to App Store Connect (NOT in the app bundle, just the store listing)
- No alpha channel (no transparency). Apple rejects icons with alpha.
- No rounded corners. Apple applies the mask automatically.
- Must match the icon shown in the app (consistency check by reviewers)
- sRGB color space

### Current State Check

Existing icons: `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`. None of these are 1024x1024.

**Action required**: Create a 1024x1024 version from the source artwork. If you only have the 512px version, upscale from the original vector/design file (not from the PNG). If no vector exists, export at 1024 from whatever design tool created the original.

Verify no alpha channel:

```bash
sips -g hasAlpha public/icon-512.png
```

If `hasAlpha: yes`, flatten the alpha:

```bash
sips -s hasAlpha false icon-1024.png --out icon-1024.png
```

---

## 6. Privacy Nutrition Labels

Apple requires you to declare data collection categories in App Store Connect. These appear as the "App Privacy" section on your App Store listing. Getting these wrong is a common rejection reason.

### Data Types to Declare

| Data Type | Category | Linked to User? | Used for Tracking? | Purpose |
|---|---|---|---|---|
| Email Address | Contact Info | Yes | No | App Functionality (auth) |
| Name | Contact Info | Yes | No | App Functionality (display name) |
| User ID | Identifiers | Yes | No | App Functionality (Firebase UID) |
| Photos | User Content | Yes | No | App Functionality (bean photos) |
| Other User Content | User Content | Yes | No | App Functionality (tasting notes, chat messages, bean data) |
| Purchase History | Purchases | Yes | No | App Functionality (subscription via RevenueCat) |
| Product Interaction | Usage Data | Yes | No | App Functionality (which features are used, if you add analytics later) |

### What NOT to declare

- **Diagnostics/crash data**: Only if you add Crashlytics or Sentry. Not present currently.
- **Location**: App does not collect location. Do not declare.
- **Tracking**: App does not track users across other apps/websites. Answer "No" to the tracking question.
- **Advertising**: No ads. Do not declare.

### Key Distinctions

- "Linked to User" means the data is associated with their identity. Since all data requires sign-in, everything stored in Firestore is linked.
- "Used for Tracking" means cross-app/cross-site tracking (IDFA, etc.). This app does NOT do this.
- AI API calls: The user content sent to Claude/GPT/Gemini falls under "Other User Content" for App Functionality. It is NOT analytics or tracking.

---

## 7. Export Compliance

When you upload a build, Apple asks about encryption.

### Correct Answers

| Question | Answer | Reason |
|---|---|---|
| Does your app use encryption? | Yes | HTTPS, Firebase Auth |
| Does your app qualify for any exemptions? | Yes | Uses only standard OS-provided encryption (HTTPS via URLSession/NSURLConnection) |
| Is your app eligible for exemption under categories 5(b)? | Yes | Standard HTTPS, no custom cryptographic algorithms |

You do NOT need to submit an annual self-classification report (ERN) if you only use standard OS encryption (HTTPS). Capacitor apps use the system's URL loading, which is covered by Apple's blanket exemption.

### ECCN

No custom encryption. No need to file with BIS. Select "Yes" for the exemption and move on.

---

## 8. Age Rating

Apple's age rating questionnaire. Correct answers for 2manybeans:

| Category | Answer |
|---|---|
| Cartoon or Fantasy Violence | None |
| Realistic Violence | None |
| Prolonged Graphic or Sadistic Realistic Violence | None |
| Profanity or Crude Humor | None |
| Mature/Suggestive Themes | None |
| Horror/Fear Themes | None |
| Medical/Treatment Information | None |
| Alcohol, Tobacco, or Drug Use or References | None (coffee is not classified as a drug by Apple) |
| Simulated Gambling | None |
| Sexual Content or Nudity | None |
| Unrestricted Web Access | No |
| Gambling with Real Currency | No |

**Result**: 4+ rating

---

## 9. Privacy Manifest (PrivacyInfo.xcprivacy)

As of spring 2025, Apple auto-rejects apps without a privacy manifest. This is a plist file declaring what APIs the app uses and why.

### File Location

`ios/App/App/PrivacyInfo.xcprivacy`

After running `npx cap sync`, this file must exist in the Xcode project. If Capacitor does not generate it automatically, create it manually.

### Required Declarations

#### Required Reason APIs

Check if your app (or any dependency) uses these APIs. Capacitor and Firebase commonly trigger several:

| API Category | API | Likely Used By | Required Reason Code |
|---|---|---|---|
| File timestamp APIs | `NSFileCreationDate`, `NSFileModificationDate` | Capacitor Filesystem plugin, Firebase Storage | `DDA9.1` (app functionality) |
| System boot time APIs | `systemUptime` | Possibly Capacitor or Firebase internals | `35F9.1` (measure time intervals) |
| Disk space APIs | `volumeAvailableCapacityKey` | Rare, check if Firebase uses it | `E174.1` (app functionality) |
| User defaults APIs | `NSUserDefaults` | Capacitor plugins, CapacitorUpdater (Capgo), Firebase | `CA92.1` (app functionality) |
| Active keyboard APIs | N/A | Unlikely | Omit if not used |

#### Third-Party SDK Privacy Manifests

These SDKs must include their own `PrivacyInfo.xcprivacy`. Verify during build:

- **Firebase iOS SDK**: Includes privacy manifests since v10.22.0. Ensure you are on a current version.
- **CapacitorUpdater (Capgo)**: Check if the pod/SPM package includes a privacy manifest. If not, you may need to add entries to your app-level manifest.
- **RevenueCat**: Includes privacy manifests since v4.36.0. Ensure you are on a current version.
- **Capacitor core + plugins**: As of Capacitor 8, privacy manifests are included.

#### Tracking Domains

The app does not track users. Leave the `NSPrivacyTrackingDomains` array empty.

#### Tracking Declaration

Set `NSPrivacyTracking` to `false`.

### Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeName</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeUserID</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeOtherUserContent</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypePurchaseHistory</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>DDA9.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35F9.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

### Verification

After adding the manifest, build and archive in Xcode. Run:

```bash
# Generate a privacy report from the archive
xcodebuild -exportArchive ... -exportOptionsPlist ... 
```

Or in Xcode: Product > Archive > Distribute App > Generate Privacy Report. This shows all privacy manifests from all frameworks. Review for completeness.

---

## 10. Xcode Build Configuration

### iOS SDK Requirement

As of April 28, 2026, all new App Store submissions must be built with **Xcode 26** and the **iOS 26 SDK**. Verify your Xcode version:

```bash
xcodebuild -version
```

If you are on an older Xcode, update before building the final archive.

### Version Strategy

| Field | Value | Where |
|---|---|---|
| Marketing Version (CFBundleShortVersionString) | `1.0.0` | Xcode General tab, or `ios/App/App/Info.plist` |
| Build Number (CFBundleVersion) | `1` (increment each upload) | Same location |
| `package.json` version | Keep separate (Capgo uses this) | `package.json` |

For the App Store submission, set marketing version to `1.0.0` and build number to `1`. Each subsequent TestFlight or App Store upload increments the build number.

### Required Capabilities (Xcode Signing & Capabilities tab)

1. **Sign in with Apple** -- required since you offer Apple Sign-In. Apple will reject without this capability.
2. **In-App Purchase** -- required for RevenueCat subscriptions.
3. **Push Notifications** -- only if you plan to add them. Skip for v1.0 if not implemented.

### Signing

- Use an **Apple Distribution** certificate (not Development)
- Create an **App Store** provisioning profile in the Apple Developer portal for `com.talmeltzer.coffeehub`
- In Xcode: Signing & Capabilities > uncheck "Automatically manage signing" for Release, select the distribution profile
- Or leave automatic signing on and select your team (Xcode handles it for most cases)

### Build for Submission

```bash
# Clean build
npm run cap:sync
# Open Xcode
npm run cap:open
# In Xcode: Product > Archive
# Then: Distribute App > App Store Connect > Upload
```

---

## 11. Review Notes for Apple

In App Store Connect under "App Review Information", provide:

### Demo Account

Apple reviewers need to sign in to test the app. Options:

**Option A (recommended)**: Create a dedicated demo account.
- Set up a Google account specifically for review: `2manybeans.review@gmail.com` (or similar)
- Pre-populate it with 3-5 beans and a couple of tastings so the reviewer sees a non-empty state
- Provide credentials in the review notes

**Option B**: If Apple Sign-In is the primary auth, Apple reviewers can use their own Apple ID. But they will see an empty state, which risks a "not enough content to evaluate" rejection. Seed the account or provide Option A as backup.

### Review Notes Text

```
Demo Account:
Email: [demo account email]
Password: [demo account password]
Sign in with "Sign in with Google" on the login screen.

About AI Features:
This app uses AI to help users track and learn about specialty coffee:
- Bean scanning: Users photograph coffee bags and AI extracts product details
- Tasting coach: AI guides users through structured tasting sessions
- Brew recipes: AI generates brewing parameters based on bean characteristics  
- Chat: Users can ask coffee-related questions

All AI processing happens on our servers (Vercel serverless functions).
AI features require an internet connection.

About Subscriptions:
[Describe subscription tiers and what each unlocks]
Free tier includes [X]. Premium unlocks [Y].

Account Deletion:
Users can delete their account and all associated data from the Settings tab.
```

### Contact Information

Provide a phone number and email where Apple can reach you during review. They sometimes call if something is unclear. Response within 24 hours prevents automatic rejection.

---

## 12. Pre-Submission Checklist

Complete these in order. Do not submit until every item is checked.

### Legal & Policy

- [ ] Privacy policy HTML live at `https://2manybeans.vercel.app/privacy-policy.html`
- [ ] Terms of service HTML live at `https://2manybeans.vercel.app/terms.html`
- [ ] Support page HTML live at `https://2manybeans.vercel.app/support.html`
- [ ] Privacy policy linked on sign-in screen
- [ ] Privacy policy linked in Settings page
- [ ] Privacy policy linked on paywall/subscription screen
- [ ] Terms of service linked in Settings page
- [ ] Account deletion works from Settings (Apple hard requirement)

### App Store Connect Setup

- [ ] App record created in App Store Connect
- [ ] App name "2manybeans" reserved
- [ ] Bundle ID `com.talmeltzer.coffeehub` matches Xcode project
- [ ] Description, subtitle, keywords filled in
- [ ] Category set to Food & Drink
- [ ] Age rating questionnaire completed (result: 4+)
- [ ] Privacy nutrition labels filled in (see Section 6)
- [ ] Support URL set
- [ ] Privacy policy URL set in App Store Connect (separate field from the in-app link)

### Screenshots & Media

- [ ] iPhone 6.7" screenshots uploaded (minimum 3, target 6-7)
- [ ] iPhone 6.3" screenshots uploaded (minimum 3, target 6-7)
- [ ] 1024x1024 app icon uploaded (no alpha, no rounded corners)
- [ ] Screenshots show the app with realistic data (not empty states)

### Xcode & Build

- [ ] Built with Xcode 26 / iOS 26 SDK
- [ ] Marketing version set to 1.0.0
- [ ] Build number set appropriately
- [ ] "Sign in with Apple" capability added
- [ ] "In-App Purchase" capability added
- [ ] PrivacyInfo.xcprivacy present and complete
- [ ] Export compliance questionnaire answered
- [ ] App archived and uploaded to App Store Connect via Xcode
- [ ] Build appears in App Store Connect and is processing-complete

### Subscriptions (if RevenueCat is integrated)

- [ ] In-App Purchase products created in App Store Connect
- [ ] Products in "Ready to Submit" or "Approved" status
- [ ] Subscription group configured
- [ ] RevenueCat product IDs match App Store Connect IDs
- [ ] Restore purchases button works
- [ ] Subscription terms displayed before purchase

### Review Preparation

- [ ] Demo account created and seeded with data
- [ ] Review notes written in App Store Connect
- [ ] Contact phone number provided
- [ ] Contact email provided

### Final Smoke Test

- [ ] App launches on a real device (not just simulator)
- [ ] Sign in with Google works
- [ ] Sign in with Apple works
- [ ] All 5 tabs load without crashes
- [ ] Bean scanning works (take a photo, get results)
- [ ] Tasting coach session completes
- [ ] Chat responds
- [ ] Subscription purchase flow works (sandbox)
- [ ] Account deletion works
- [ ] App works offline (basic navigation, cached data)
- [ ] No placeholder text, lorem ipsum, or debug UI visible

---

## 13. Common Rejection Reasons (and How to Avoid Them)

### 1. Missing Privacy Policy
**How it manifests**: Immediate rejection with "Guideline 5.1.1"
**Prevention**: Complete Section 1 above. Verify the URL loads before submitting.

### 2. No Account Deletion Option
**How it manifests**: Rejection citing "Guideline 5.1.1(v) - Account Deletion"
**Prevention**: Add a "Delete Account" button in Settings that deletes the Firebase Auth account AND all Firestore/Storage data. Must actually work, not just hide the account.

### 3. Broken Sign in with Apple
**How it manifests**: Reviewer taps "Sign in with Apple", gets an error or crash
**Prevention**: Test Apple Sign-In on a real device (not simulator). Ensure the capability is added in Xcode AND configured in the Apple Developer portal. The App ID must have "Sign in with Apple" enabled.

### 4. Subscription Issues
**How it manifests**: "Guideline 3.1.2 - Subscriptions"
**Prevention**: 
- Clearly describe what each tier includes before the purchase button
- Include a "Restore Purchases" button accessible without a subscription
- Terms must link to Apple's standard subscription terms (auto-renewal disclosure)
- Price must be visible before purchase
- Must work in sandbox environment during review

### 5. AI Content Disclaimer Missing
**How it manifests**: "Guideline 5.6.1 - Generative AI"
**Prevention**: Include a visible notice that content is AI-generated. In the tasting coach and chat, add a small footer: "AI-generated content. May not always be accurate." In Ruphus stories, note it is AI-generated. The review notes should explicitly describe all AI features.

### 6. Incomplete or Broken Features
**How it manifests**: "Guideline 2.1 - App Completeness"
**Prevention**: Every button must do something. No "coming soon" placeholders. If a feature requires server connectivity, handle the offline/error case gracefully with user-visible messaging.

### 7. Insufficient Metadata
**How it manifests**: "Metadata Rejected" (not a code rejection, faster to fix)
**Prevention**: Fill in every field. Do not leave the description as placeholder text. Screenshots must show actual app content.

### 8. Privacy Manifest Missing or Incomplete
**How it manifests**: Warning email during build processing, or rejection
**Prevention**: Complete Section 9. Run the privacy report in Xcode to verify.

### 9. Camera Permission Without Clear Purpose String
**How it manifests**: "Guideline 5.1.1 - Data Collection and Storage"
**Prevention**: The `NSCameraUsageDescription` in Info.plist must clearly explain why: "2manybeans uses your camera to photograph coffee bags for AI scanning." Not just "Camera access needed." Check that Capacitor's Camera plugin sets an appropriate string.

### 10. App Requires Internet but Doesn't Handle Offline
**How it manifests**: App crashes or shows blank screen when reviewer tests in airplane mode
**Prevention**: Firebase offline persistence helps here. Ensure the app shows cached data offline and displays a clear "No internet connection" message when AI features are unavailable. Do not crash.

### 11. Login Required but Demo Account Doesn't Work
**How it manifests**: Reviewer cannot get past the sign-in screen
**Prevention**: Test the demo account credentials yourself 24 hours before submission. Ensure the Google account does not have 2FA enabled (or provide the 2FA code). Better yet, ensure Apple Sign-In works so the reviewer can use their own Apple ID.

---

## Implementation Priority

1. **Privacy policy + terms + support pages** (hard blockers, do first)
2. **Account deletion** (hard blocker)
3. **PrivacyInfo.xcprivacy** (hard blocker)
4. **AI content disclaimers** (soft blocker, easy to add)
5. **1024x1024 app icon** (5 minutes if you have the source)
6. **App Store Connect metadata** (description, keywords, screenshots)
7. **Demo account setup**
8. **Xcode capabilities** (Sign in with Apple, IAP)
9. **Screenshots** (time-consuming but not technically complex)
10. **Final smoke test and submit**
