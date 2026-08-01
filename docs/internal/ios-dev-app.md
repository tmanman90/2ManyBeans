# iOS dev app

Use the dev iOS variant when you want a TestFlight or local build that installs next to the App Store app instead of replacing it.

## Variants

- Production: `2manybeans`, bundle id `com.talmeltzer.coffeehub`, Capgo production channel.
- Development: `2manybeans Dev`, bundle id `com.talmeltzer.coffeehub.dev`, Capgo `dev` channel.
- Firebase production iOS app: `1:902243550931:ios:7e17f3fd15b9be70e3b626`.
- Firebase dev iOS app: `1:902243550931:ios:4615fbb41e6363f9e3b626`.

## Local commands

```sh
npm run cap:copy:dev
```

This builds the web app with the dev Capacitor config, copies it into iOS, and patches the native bundle id/display name.
It also swaps in the dev `GoogleService-Info.plist` and Google URL scheme so native Apple/Google auth tokens are accepted for the `.dev` bundle id.

```sh
npm run cap:copy
```

This restores the native wrapper to production settings after dev testing.

For a full plugin sync, use `npm run cap:sync:dev` or `npm run cap:sync` instead.

## Dev OTA deployment

From this checkout, use the guarded command below for a Capgo dev upload:

```sh
npm run ship:dev:ios
```

The command is intentionally locked to `com.talmeltzer.coffeehub.dev` / `dev`,
applies the social-login native metadata patch before building, generates a
unique `-devapp.<timestamp>` bundle label, passes `--fail-on-incompatible`, and
verifies that Capgo's channel pointer moved to the exact uploaded bundle. Do
not substitute the production app id (`com.talmeltzer.coffeehub`) for this
command. Capgo push notifications are disabled for this app, so a successful
upload is verified by the channel pointer rather than a notification response.

## Physical device install

The first physical-device build may need Xcode to create an explicit provisioning profile for `com.talmeltzer.coffeehub.dev`, because wildcard profiles cannot include Sign in with Apple.

```sh
npm run cap:copy:dev
xcodebuild -allowProvisioningUpdates \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'id=<DEVICE_UDID>' \
  -derivedDataPath ios/DerivedData \
  build
```

After testing, restore the generated native files to production:

```sh
npm run cap:copy
```

## App Store Connect and Firebase

The dev bundle id can be built and installed on a simulator locally. Physical-device TestFlight distribution requires the dev bundle id to exist in Apple Developer/App Store Connect, with matching signing.
