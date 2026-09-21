# Timer vibration OTA release

The timer alert fix is merged into main via PR #3, merge commit 3c01e9c275a7f4080243e4cc1b6980d0c743d340.

Production was already ahead of main. To preserve deployed features, this release uses the existing 740da3f source baseline plus the timer alert changes and version 1.1.249. Release source: cd97185. The source-confirmation control also suppresses duplicate feedback in this newer timer shell.

Verified Capgo channel pointers:
- com.talmeltzer.coffeehub.dev / dev: 1.1.251-devapp.d20260921.t213541
- com.talmeltzer.coffeehub / production: 1.1.249

Both guarded ship commands passed native compatibility and verified their channel pointers. Dev bundle scan confirmed isolated Dev Firebase and the existing Dev preview backend. Production scan confirmed production Firebase, absence of Dev Firebase/backend, version 1.1.249, and the alert code.

Validation passed: 16 alert assertions; all four brew timing memory scripts; Dev and production ship guard tests; 10 shared timer tests; 6 source timer tests; 5 source timer UI contract tests; main and release production builds. Existing bundler warnings remain. These are source/build checks, not physical haptic evidence.

Covers automatic step transitions and countdown-to-ready source checkpoints in the shared timer screen. Manual controls retain their own feedback. No sound or background notification scheduling was added. Physical iPhone vibration and OTA activation are unverified.

Capgo only: no Vercel deployment, native build, or TestFlight submission. Prior production rollback bundle: 1.1.248.
