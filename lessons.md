# Coffee Hub — Lessons

Lessons learned during development. Review at the start of each session.

Format: `- **[Topic]**: [What went wrong] → [What to do instead]`

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
