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
