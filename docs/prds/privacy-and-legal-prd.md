# Privacy Policy & Terms of Service PRD

**Feature**: Legal pages for 2manybeans (Coffee Hub)
**Status**: Draft
**Date**: 2026-04-09

---

## Overview

Apple requires a Privacy Policy URL and Terms of Service URL for App Store listing. These pages also satisfy GDPR and CCPA requirements. Both documents live as static HTML in `public/` and are linked from sign-in, settings, and paywall screens.

---

## Implementation Plan

### Files to Create

1. **`public/privacy-policy.html`** -- standalone HTML page, no framework dependencies
2. **`public/terms.html`** -- standalone HTML page, same styling

### Where to Link

| Location | Link text | Notes |
|---|---|---|
| Sign-in screen footer | "Privacy Policy" and "Terms of Service" | Required for Apple review |
| Settings page | "Privacy Policy" and "Terms of Service" | Standard practice |
| Paywall / subscription screen | "Terms of Service" and "Privacy Policy" | Required by Apple for in-app purchases |
| App Store Connect | Privacy Policy URL field | `https://2manybeans.vercel.app/privacy-policy.html` |
| App Store Connect | Terms of Service URL field (under App Information) | `https://2manybeans.vercel.app/terms.html` |

### Shared HTML Style

Both pages should use the same minimal, clean styling:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[Page Title] - 2manybeans</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #2c2c2c;
      background: #faf9f7;
      line-height: 1.7;
      padding: 2rem 1.5rem;
      max-width: 720px;
      margin: 0 auto;
    }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; color: #1a1a1a; }
    h2 { font-size: 1.2rem; margin-top: 2rem; margin-bottom: 0.5rem; color: #1a1a1a; }
    p, li { font-size: 0.95rem; margin-bottom: 0.75rem; }
    ul { padding-left: 1.25rem; }
    a { color: #8B5E3C; }
    .subtitle { color: #666; font-size: 0.9rem; margin-bottom: 2rem; }
    .back-link { display: inline-block; margin-bottom: 1.5rem; font-size: 0.9rem; }
  </style>
</head>
```

---

## Privacy Policy (Draft)

**Effective Date**: [DATE]

**Last Updated**: [DATE]

### Introduction

2manybeans ("Coffee Hub," "the App," "we," "us," or "our") is a specialty coffee inventory and tasting tracker developed by Tal Meltzer. This Privacy Policy explains how we collect, use, store, and protect your information when you use the 2manybeans mobile app and web application at https://2manybeans.vercel.app.

By using 2manybeans, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the App.

### Information We Collect

**Account Information**

When you sign in with Google or Apple, we receive and store:
- Your email address
- Your display name
- Your profile photo URL
- A unique user identifier (Firebase UID)

We use Firebase Authentication to manage sign-in. We do not store your Google or Apple password.

**Content You Create**

Everything you add to the App is stored in your account:
- Coffee bean entries (roaster name, origin, variety, process method, roast date, tasting notes, ratings, and scores)
- Bean photos you upload or capture with your camera
- AI-generated product images of your beans
- Share card images you create
- Your preferences (grinder model, brew method, canister count)
- Chat messages with AI features
- Marketing email consent preference

**Automatically Collected Information**

- Device information and app version (collected by our update service, Capgo, to deliver over-the-air updates)
- Subscription status and purchase history (collected by RevenueCat for managing in-app subscriptions)

**Information Processed by AI Services**

When you use AI-powered features (tasting coach, brew recipes, bean scanning, chat), relevant data from your request is sent to our server-side AI providers for processing:
- Anthropic (Claude): tasting notes, bean details, chat messages
- OpenAI (GPT): brew recipe generation, tasting score extraction, story content
- Google (Gemini): bean photo analysis, web search enrichment for bean information, image analysis in chat

This data is sent through our secure server-side proxies hosted on Vercel. We do not send your full account data to these services, only the specific information needed to process your request.

### How We Use Your Information

We use your information to:
- Provide and maintain the App's core features (inventory tracking, tasting notes, AI recommendations)
- Authenticate your identity and secure your account
- Process your subscription and manage billing through Apple and RevenueCat
- Deliver over-the-air app updates
- Send marketing emails (only if you have opted in)
- Improve the App based on usage patterns

### How We Store and Protect Your Data

- Account data and content are stored in Google Firebase (Firestore database and Firebase Storage), hosted in the United States
- All data transmission uses HTTPS/TLS encryption
- AI requests are routed through server-side proxies on Vercel, so your API keys and sensitive credentials are never exposed on-device
- Access to production systems is restricted to the developer

We take reasonable measures to protect your data, but no method of electronic storage or transmission is 100% secure.

### Third-Party Services

We use the following third-party services, each with their own privacy policies:

| Service | Purpose | Data Shared | Privacy Policy |
|---|---|---|---|
| Google Firebase (Authentication, Firestore, Storage) | Account management, data storage, file storage | Account info, all user content | https://firebase.google.com/support/privacy |
| Anthropic | AI tasting coach, chat | Tasting notes, bean details, chat messages | https://www.anthropic.com/privacy |
| OpenAI | AI brew recipes, scores, stories | Bean details, tasting data | https://openai.com/privacy |
| Google Gemini | Bean photo scanning, search enrichment, image analysis | Bean photos, bean names, chat images | https://ai.google.dev/terms |
| RevenueCat | Subscription management | Firebase UID, purchase receipts | https://www.revenuecat.com/privacy |
| Capgo | Over-the-air app updates | Device info, app version, platform | https://capgo.app/privacy |
| Vercel | Web hosting, server-side API proxies | HTTP request data | https://vercel.com/legal/privacy-policy |
| Apple (Sign in with Apple, App Store) | Authentication, subscription billing | Apple ID, purchase info | https://www.apple.com/legal/privacy |
| Google (Sign-In) | Authentication | Google account info | https://policies.google.com/privacy |

We do not sell your data to any third party. We do not use advertising SDKs or tracking pixels.

### Data Retention

- **Account data and content**: Retained as long as your account is active. If you delete your account, we will delete your data within 30 days.
- **AI processing**: Data sent to AI providers is subject to their respective retention policies. We do not maintain separate logs of AI requests beyond what is needed for error handling.
- **Subscription records**: Retained by RevenueCat and Apple per their policies. We retain subscription status for the duration of your account.
- **Update delivery data**: Capgo retains device information per their retention policy.

### Your Rights

**All Users**

You have the right to:
- **Access** your data: all your content is visible within the App at any time
- **Export** your data: contact us to request a full export of your account data
- **Delete** your data: contact us to request account and data deletion
- **Opt out of marketing**: toggle marketing email consent off in the App's settings, or contact us

**European Economic Area (GDPR)**

If you are located in the EEA, you have additional rights under the General Data Protection Regulation:
- **Right to access**: request a copy of all personal data we hold about you
- **Right to rectification**: request correction of inaccurate personal data
- **Right to erasure** ("right to be forgotten"): request deletion of your personal data
- **Right to data portability**: receive your data in a structured, machine-readable format
- **Right to restrict processing**: request that we limit how we use your data
- **Right to object**: object to our processing of your personal data
- **Right to withdraw consent**: withdraw consent for any processing based on consent at any time

Our legal basis for processing your data is: (a) performance of a contract (providing the App's services), (b) your consent (marketing emails), and (c) legitimate interests (improving the App, security).

To exercise any GDPR right, contact us at the email below. We will respond within 30 days.

**California Residents (CCPA)**

If you are a California resident, the California Consumer Privacy Act provides you with specific rights:
- **Right to know**: request disclosure of what personal information we collect, use, and share
- **Right to delete**: request deletion of your personal information
- **Right to opt-out of sale**: we do NOT sell your personal information to third parties
- **Right to non-discrimination**: we will not discriminate against you for exercising your CCPA rights

To exercise any CCPA right, contact us at the email below.

### Children's Privacy

2manybeans is not directed at children under the age of 13 (or 16 in the EEA). We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, please contact us and we will delete it promptly.

### Changes to This Policy

We may update this Privacy Policy from time to time. When we make changes, we will update the "Last Updated" date at the top of this page. For significant changes, we will notify you through the App or via email if you have opted in to marketing communications.

Your continued use of the App after changes are posted constitutes your acceptance of the updated policy.

### Contact Us

If you have questions about this Privacy Policy, want to exercise your data rights, or need to request data deletion:

**Email**: tal@2manybeans.com

---

## Terms of Service (Draft)

**Effective Date**: [DATE]

**Last Updated**: [DATE]

### 1. Acceptance of Terms

By downloading, installing, or using the 2manybeans app ("Coffee Hub," "the App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the App.

These Terms constitute a legal agreement between you and Tal Meltzer ("we," "us," or "our"), the developer of 2manybeans.

### 2. Description of Service

2manybeans is a specialty coffee inventory and tasting tracker. The App allows you to catalog coffee beans, record tasting notes, receive AI-powered brewing recommendations, and track your coffee journey. The App is available as a web application and an iOS app.

### 3. Account Registration

To use 2manybeans, you must sign in with a Google account or Apple ID. You are responsible for:
- Maintaining the security of your account credentials
- All activity that occurs under your account
- Notifying us promptly if you suspect unauthorized access

We reserve the right to suspend or terminate accounts that violate these Terms.

### 4. Subscriptions and Payments

**Subscription Plans**

2manybeans may offer premium features through paid subscription plans. Subscriptions are billed through Apple's App Store.

**Auto-Renewal**

Subscriptions automatically renew at the end of each billing period unless you cancel at least 24 hours before the renewal date.

**Cancellation**

You can cancel your subscription at any time through your Apple ID account settings (Settings > [your name] > Subscriptions). Cancellation takes effect at the end of the current billing period. You will retain access to premium features until then.

**Refunds**

All purchases are processed by Apple. Refund requests must be submitted to Apple directly through their support channels. We do not process refunds ourselves.

**Price Changes**

We may change subscription prices. Apple will notify you of any price increase before your next renewal. You can choose to accept the new price or cancel.

### 5. Acceptable Use

You agree not to:
- Use the App for any unlawful purpose
- Attempt to reverse engineer, decompile, or disassemble the App
- Scrape, harvest, or extract data from the App through automated means
- Abuse AI features (e.g., submitting excessive requests, using them for purposes unrelated to coffee, or attempting to extract harmful content)
- Interfere with or disrupt the App's servers or infrastructure
- Impersonate another person or misrepresent your affiliation
- Share your account access with others
- Use the App to transmit malicious software or spam

We reserve the right to suspend or terminate access for any user who violates these terms.

### 6. Intellectual Property

**Your Content**

You retain ownership of all content you create in the App, including your bean entries, tasting notes, photos, and other user-generated content. By using the App, you grant us a limited license to store, process, and display your content solely to provide the App's services to you.

**Our Content**

The App itself, including its design, code, branding, graphics, AI prompts, and all related intellectual property, is owned by Tal Meltzer. You may not copy, modify, distribute, or create derivative works from the App or its content without prior written permission.

**AI-Generated Content**

Content generated by AI features (brew recipes, tasting guidance, bean descriptions, stories, product images) is provided for your personal use within the App. You may share AI-generated content (e.g., share cards) for personal, non-commercial purposes.

### 7. AI-Generated Content Disclaimer

The App uses artificial intelligence to provide tasting guidance, brew recipes, bean information, and other recommendations. This content is:
- **Informational only**, not professional food safety, health, or dietary advice
- **Generated by AI models** that may produce inaccurate, incomplete, or outdated information
- **Not a substitute** for professional advice regarding allergies, dietary restrictions, or health conditions

We do not guarantee the accuracy, completeness, or reliability of AI-generated content. Use it at your own discretion.

Bean information obtained through AI scanning and web search enrichment (origin, altitude, cup score, etc.) is sourced from publicly available data and may contain errors. Always verify important details with the roaster or retailer.

### 8. Limitation of Liability

To the maximum extent permitted by applicable law:

- The App is provided "AS IS" and "AS AVAILABLE" without warranties of any kind, whether express or implied, including warranties of merchantability, fitness for a particular purpose, and non-infringement.
- We are not liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App, including but not limited to loss of data, loss of profits, or interruption of service.
- Our total liability for any claim related to the App shall not exceed the amount you paid for the App in the 12 months preceding the claim, or $50 USD, whichever is greater.
- We are not responsible for any actions taken based on AI-generated content, including brew recipes or tasting recommendations.

### 9. Indemnification

You agree to indemnify and hold harmless Tal Meltzer from any claims, damages, losses, or expenses (including reasonable legal fees) arising from your use of the App or violation of these Terms.

### 10. Termination

- **By you**: You may stop using the App at any time. To delete your account and data, contact us at the email below.
- **By us**: We may suspend or terminate your access at any time, with or without cause, with or without notice. Reasons for termination include violation of these Terms, abuse of the service, or extended inactivity.
- **Effect of termination**: Upon termination, your right to use the App ceases. We may delete your data in accordance with our Privacy Policy.

### 11. Governing Law and Dispute Resolution

These Terms are governed by the laws of the State of California, United States, without regard to conflict of law principles.

Any dispute arising from these Terms or your use of the App shall be resolved in the state or federal courts located in Los Angeles County, California.

### 12. Modifications to Terms

We may update these Terms from time to time. When we make changes, we will update the "Last Updated" date at the top. For material changes, we will provide notice through the App.

Your continued use of the App after changes are posted constitutes your acceptance of the updated Terms. If you do not agree with the changes, you should stop using the App.

### 13. Miscellaneous

- **Severability**: If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in effect.
- **Entire Agreement**: These Terms, together with our Privacy Policy, constitute the entire agreement between you and us regarding the App.
- **Waiver**: Our failure to enforce any right or provision of these Terms does not constitute a waiver of that right or provision.
- **Assignment**: You may not assign your rights under these Terms. We may assign our rights without restriction.

### 14. Contact Us

If you have questions about these Terms of Service:

**Email**: tal@2manybeans.com

---

## Implementation Checklist

- [ ] Replace `[DATE]` placeholders with the actual effective date before publishing
- [ ] Confirm contact email (`tal@2manybeans.com` or substitute preferred address)
- [ ] Create `public/privacy-policy.html` using the Privacy Policy draft above with the shared HTML styling
- [ ] Create `public/terms.html` using the Terms of Service draft above with the shared HTML styling
- [ ] Add footer links on the sign-in screen: "Privacy Policy" and "Terms of Service"
- [ ] Add links in the Settings page
- [ ] Add links on the paywall/subscription screen
- [ ] In App Store Connect, set Privacy Policy URL to `https://2manybeans.vercel.app/privacy-policy.html`
- [ ] In App Store Connect, set Terms of Service URL to `https://2manybeans.vercel.app/terms.html`
- [ ] Complete the App Privacy section in App Store Connect (Data Types collected: Contact Info/email, Identifiers/user ID, Usage Data/product interaction, Photos)
- [ ] Consider having a lawyer review before final publication
