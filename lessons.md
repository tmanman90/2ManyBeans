# Coffee Hub — Lessons

Lessons learned during development. Review at the start of each session.

Format: `- **[Topic]**: [What went wrong] → [What to do instead]`

- **[Capacitor Firebase Auth]**: `onAuthStateChanged` can hang indefinitely in WKWebView, leaving app stuck on loading screen → Add a 3s safety timeout that forces `loading=false`
- **[Capacitor Firestore]**: `persistentLocalCache` with `persistentSingleTabManager` hangs in WKWebView IndexedDB → Skip persistent cache on native, use default Firestore init
- **[Capacitor Auth Redirect]**: `getRedirectResult(auth)` hangs in Capacitor WKWebView → Skip it on native with `Capacitor.isNativePlatform()` check
- **[Xcode DerivedData]**: Never delete DerivedData to "fix" issues, it wipes SPM packages and causes "No such module" build failures → Use `Product > Clean Build Folder` (Cmd+Shift+K) instead
- **[Capacitor Node Version]**: Capacitor 8 requires Node 22+. Use `nvm use 22` before any `cap` commands
- **[Google Sign-In Simulator]**: Google Sign-In does not work in iOS Simulator (no Google account). Must test on a real device or via TestFlight

---

- **Vite scaffold in non-empty dir**: `npm create vite@latest .` fails if dir has files → use temp dir approach (scaffold elsewhere, copy files over)
- **Trailing space in dir name**: The project folder has a trailing space in its name. This breaks many shell commands when paths aren't properly quoted. Always wrap paths in double quotes.
- **PRD vs Prototype scoring**: PRD recommendation scoring is wrong. Prototype scoring is the source of truth — uses different values, prefers smaller bags, checks origin/process (not roaster), and penalizes degassing.
- **React 19 from Vite**: Vite's latest React template uses React 19, not 18. This is fine and works with Firebase SDK v12.
- **Firebase SDK v12 persistence**: Uses `initializeFirestore()` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`. NOT the old `enableMultiTabIndexedDbPersistence()`.
- **Use `vercel dev` for local dev**: The serverless proxy (`api/claude.js`) only works via Vercel's dev server, not plain `npm run dev`.
- **Vercel env vars with `echo`**: `echo "value" | vercel env add` appends a trailing newline (`%0A` in URLs). Use `printf` instead: `printf '%s' "value" | vercel env add VAR production`.
- **iOS standalone PWA sign-in**: `signInWithRedirect` does NOT work in iOS standalone PWAs — the redirect completes in a separate browser context that can't pass auth state back to the standalone app. Use `signInWithPopup` instead — on iOS 16.4+ it opens an in-app browser sheet that properly returns the auth result to the calling app.
- **NEVER delete user data as a workaround**: When Fellow device was full (14 profiles), the code deleted the user's last profile to make room. This destroys profiles the user is actively using. Always fail gracefully with a clear error message instead of taking destructive shortcuts.
- **NEVER auto-run destructive database operations**: Wrote a dedup function that deleted Firestore documents automatically on app load — it kept arbitrary copies and wiped out all of the user's manual edits (grind sizes, added beans, status changes). Destructive ops must NEVER run automatically. Always: (1) require explicit user action, (2) show a preview of what will be deleted, (3) confirm before executing. Prevent duplicates at the source (idempotent writes, disabled buttons) rather than cleaning up after.
- **When deduplicating, keep the most-edited copy**: The dedup kept whichever doc had the alphabetically-first Firestore ID, not the one with actual user edits. If dedup is ever needed, compare `updatedAt` timestamps and keep the most recently modified document.
- **Proxy swallowing API errors**: The `/api/claude` proxy caught all errors and returned a generic `500` with "Failed to call Claude API" — made debugging impossible. The real error was `529 Overloaded`. → Always forward the actual status code and error message from upstream APIs. Don't mask errors behind generic responses.
- **No model fallback = total outage**: When `claude-sonnet-4-20250514` was overloaded (529), every AI feature failed with no recourse. → Add a fallback model (Haiku) for 429/529 errors so the app degrades gracefully instead of breaking completely.
- **Test the deployed proxy, not just the code**: Spent time reading code looking for bugs when a simple `curl` to the production endpoint would have revealed the real error immediately. → When debugging API errors, hit the actual endpoint first to see the real error before diving into code.
