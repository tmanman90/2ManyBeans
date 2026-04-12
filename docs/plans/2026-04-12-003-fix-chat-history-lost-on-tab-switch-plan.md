---
title: "fix: Chat history lost on tab switch"
type: fix
status: completed
date: 2026-04-12
---

# fix: Chat history lost on tab switch

## Enhancement Summary

**Deepened on:** 2026-04-12
**Sections enhanced:** 5
**Research agents used:** best-practices-researcher (React tab persistence), performance-oracle, architecture-strategist, security-sentinel, learnings-researcher

### Key Improvements
1. Critical fix: disable `useNativeKeyboard` when ChatTab is hidden (prevents double-counting keyboard events and tab bar corruption)
2. Blob URL lifecycle fully mapped: stop revoking sent photo blob URLs, rely on session-end cleanup
3. Scroll restoration strategy hardened for WebKit's known `display:none` scroll-reset edge case
4. Display messages array capped at 50 to prevent unbounded DOM growth in long sessions

### New Considerations Discovered
- The `onClick` handler at ChatTab.jsx line 482 references `inputRef` scoped inside `ChatInputBar`, making it dead code. Pre-existing bug, not caused by this change, but worth noting.
- React `<Activity>` API is still experimental in React 19.2 stable. Not suitable for production. `display: none` is the correct approach.

---

## Overview

Navigating away from the Chat tab (e.g. accidentally tapping Tasting) and then returning destroys the entire conversation. The user sees only the initial "Hey, I'm Professor Ruphus!" greeting. All messages, photos, and in-flight state are gone.

## Problem Statement

ChatTab stores all state in local `useState` and `useRef` hooks. App.jsx renders tabs conditionally:

```jsx
// src/App.jsx:188-199
{tab === 'chat' && (
  <Suspense fallback={<TabFallback />}>
    <ChatTab ... />
  </Suspense>
)}
```

This fully unmounts ChatTab when the user switches tabs, destroying all React state. There is no persistence layer (no localStorage, no sessionStorage, no Firestore) for chat messages.

Additionally, sent photo preview blob URLs are revoked immediately after sending (`ChatTab.jsx:367`), which is a latent bug that becomes visible once messages persist across tab switches.

## Proposed Solution

Keep ChatTab mounted but hidden via `display: none` after its first visit. This preserves all in-memory state (messages, apiMessages ref, photos, scannedBean, loading, scroll position) without serialization overhead or blob URL lifecycle issues.

### Research Insights: Why display:none Over Alternatives

| Approach | Verdict | Why |
|---|---|---|
| `display: none` | **Chosen** | Simple, well-supported in WKWebView, removes from layout/paint entirely. Works with React.lazy + Suspense via "mount on first visit" pattern. |
| `visibility: hidden` / `opacity: 0` | Rejected | Elements still participate in layout. `opacity: 0` remains interactive (phantom taps on mobile). Worse than display:none in every way. |
| React `<Activity>` | Rejected | Still experimental in React 19.2 stable (not in the non-experimental build). Would require switching to `react@experimental`. Not production-ready for a Capacitor app. Revisit if it ships stable in React 20+. |
| sessionStorage / IndexedDB | Rejected | Cannot store blob URLs. IndexedDB unreliable in WKWebView (lessons.md:7). Serialization overhead for messages with images. |
| Zustand / external store | Rejected | High refactor cost. Refs (scrollRef, fileRef, sendingRef) are DOM-coupled and cannot live in a store. Doesn't solve scroll restoration or DOM preservation. Over-engineered for tab persistence. |

### Implementation

#### 1. Track visited tabs in App.jsx

```jsx
// src/App.jsx
const [visitedTabs, setVisitedTabs] = useState(new Set());

useEffect(() => {
  setVisitedTabs(prev => {
    if (prev.has(tab)) return prev;
    const next = new Set(prev);
    next.add(tab);
    return next;
  });
}, [tab]);
```

#### 2. Render ChatTab with display:none when inactive

Replace the conditional `{tab === 'chat' && ...}` pattern for ChatTab only:

```jsx
// src/App.jsx -- ChatTab gets special treatment (see comment below)
//
// ChatTab keeps ephemeral conversation state (messages, API history,
// blob URLs for photos). Unlike other tabs whose data comes from
// Firestore props, chat state only exists in-component. We mount it
// on first visit and keep it alive with display:none so tab switches
// don't destroy the conversation.
{visitedTabs.has('chat') && (
  <div style={{ display: tab === 'chat' ? 'contents' : 'none' }}>
    <Suspense fallback={<TabFallback />}>
      <ChatTab
        beans={beans}
        tastings={tastings}
        addBean={addBean}
        updateBean={updateBean}
        addTasting={addTasting}
        updateTasting={updateTasting}
        isActive={tab === 'chat'}
      />
    </Suspense>
  </div>
)}
```

- `display: 'contents'` when active so the wrapper div doesn't interfere with layout. Safe in WKWebView Safari 16+ and all modern browsers. No accessibility or event propagation concerns for a non-ARIA wrapper.
- `display: 'none'` when inactive so ChatTab stays mounted but hidden. Removes from layout AND paint (zero rendering cost while hidden).
- `React.lazy` still works: the chunk loads on first visit, then ChatTab stays alive
- Other tabs remain conditionally rendered (no changes needed)
- `isActive` prop controls keyboard hook and scroll behavior (see below)

**Why only ChatTab?** Rotation, Inventory, and Archive derive all state from Firestore props. Mounting them permanently adds hidden re-render cost with no user-facing benefit. TastingTab has guided tasting chat sessions that could benefit, but extend the pattern only if user feedback indicates it's needed.

#### 3. Disable useNativeKeyboard when hidden (CRITICAL)

The Capacitor Keyboard plugin fires `keyboardWillShow`/`keyboardWillHide` events globally. Without this fix, the hidden ChatTab's keyboard hook would:
1. Set `keyboardHeight` state, causing a wasted hidden re-render
2. Increment the shared `tabBarHideCount` module-level counter, corrupting the tab bar show/hide balance
3. Trigger the scroll-to-bottom effect for nothing

The hook already supports an `enabled` parameter (TastingTab uses `enabled: mode === 'chat'`). Wire it:

```jsx
// src/tabs/ChatTab.jsx -- use isActive prop to control keyboard hook
export const ChatTab = ({ beans, tastings, addBean, updateBean, addTasting, updateTasting, isActive }) => {
  // ...
  const keyboardHeight = useNativeKeyboard({ enabled: isActive });
  // ...
};
```

#### 4. Fix blob URL lifecycle in ChatTab.jsx

The current code revokes sent photo blob URLs immediately after sending (line 367), but those same URLs are stored in `displayMsg.photos` for rendering sent message thumbnails (lines 487-503). With persistence, the user sees broken images for previously sent photos.

Two photo paths exist:
- **Native camera** (line 269-278): Returns DataURL strings. `safeRevokeBlobUrl` is a no-op for data: URLs. No issue.
- **Web file input** (line 294-295): `compressImage` returns blob URLs tracked in `blobUrlsRef`. These are revoked on send (line 367), breaking the display.

**Fix: Stop revoking blob URLs for sent photos.**

```jsx
// src/tabs/ChatTab.jsx -- in handleSend, REPLACE lines 367-368:

// OLD (breaks sent photo display when component persists):
// currentPhotos.forEach(p => safeRevokeBlobUrl(p.previewUrl));
// setPhotos([]);

// NEW: Clear the input bar photos without revoking URLs.
// Sent photo URLs are still referenced by messages in the display list.
// They'll be cleaned up when the component truly unmounts (session end).
setPhotos([]);
```

The unmount cleanup (line 253-257) still revokes all tracked blob URLs on full page unload. This is the safety net.

**Memory impact**: Each web-path blob URL holds a reference to a compressed JPEG blob (~150-300KB). With MAX_API_MESSAGES = 20 and images only in the last 6, worst case is ~6 blob URLs (~1.8MB). Against WKWebView's ~1.4GB limit, this is 0.13%. Acceptable.

#### 5. Scroll-to-bottom on tab return

WebKit has a known edge case (WebKit bug 72852) where `display:none` elements can lose scroll position. The existing `useEffect` that scrolls to bottom on `messages` change (line 249) won't fire on tab return since messages didn't change.

```jsx
// src/tabs/ChatTab.jsx -- scroll to bottom when tab becomes visible
useEffect(() => {
  if (isActive && scrollRef.current) {
    // Use requestAnimationFrame to ensure layout has settled after display change
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }
}, [isActive]);
```

#### 6. Cap display messages (unbounded growth prevention)

The `apiMessages` ref is capped at 20, but the display `messages` array has no cap. With persistence, a long session could accumulate hundreds of messages with inline photo thumbnails.

```jsx
// src/tabs/ChatTab.jsx -- after appending assistant response (around line 381)
const MAX_DISPLAY_MESSAGES = 50;
setMessages(prev => {
  const updated = [...prev, assistantMsg];
  if (updated.length > MAX_DISPLAY_MESSAGES) {
    // Revoke blob URLs from pruned messages before discarding
    const pruned = updated.slice(0, updated.length - MAX_DISPLAY_MESSAGES);
    pruned.forEach(m => m.photos?.forEach(url => safeRevokeBlobUrl(url)));
    return updated.slice(-MAX_DISPLAY_MESSAGES);
  }
  return updated;
});
```

### Files Changed

| File | Change |
|------|--------|
| `src/App.jsx` | `visitedTabs` state, ChatTab always-mounted wrapper with `isActive` prop, explanatory comment |
| `src/tabs/ChatTab.jsx` | Accept `isActive` prop, wire to `useNativeKeyboard({ enabled: isActive })`, stop revoking sent photo blob URLs, add scroll-on-visible effect, cap display messages at 50 |

## Acceptance Criteria

- [ ] User can switch away from Chat and return with full conversation intact
- [ ] Photos sent in chat display correctly after tab switch (no broken images)
- [ ] Chat scrolls to bottom when returning to the tab
- [ ] ChatTab JS chunk still lazy-loads on first visit (not eagerly loaded)
- [ ] Mid-request tab switch: response lands correctly when user returns
- [ ] Other tabs (Rotation, Inventory, Tasting, Archive) are unaffected
- [ ] No memory regression: blob URLs still cleaned up on full page unload
- [ ] Works on both web and iOS native (WKWebView)
- [ ] Keyboard events on other tabs do NOT trigger ChatTab re-renders
- [ ] Tab bar show/hide counter stays balanced (no corruption from hidden keyboard hook)
- [ ] Long sessions (50+ messages) don't cause unbounded DOM growth

## Performance Analysis

| Concern | Assessment |
|---|---|
| Memory (messages + apiMessages + blobs) | ~2-3MB worst case. 0.2% of WKWebView limit. Safe. |
| Hidden re-renders (beans/tastings props change) | Sub-millisecond. Flat message list diff, ChatInputBar is memo-ized. Acceptable. |
| display:none rendering cost | Zero. Removed from layout and paint entirely. |
| Keyboard hook (if not disabled) | **Bug**: double-counts keyboard events, corrupts tab bar. Fixed by `enabled: isActive`. |
| Fixed-position ChatInputBar | Correctly removed from fixed stacking context by display:none. Re-positions correctly on show. |

## Security Assessment

No security concerns. Chat messages contain user text and AI responses (no API keys or tokens). Base64 image data in apiMessages is already trimmed to last 6 messages. All data stays in the user's own browser memory space.

## Context

### Documented learnings applied
- `React.lazy()` must stay at module scope (docs/solutions/runtime-errors/react-lazy-inside-render-destroys-state.md)
- IndexedDB unreliable in WKWebView (lessons.md:7), ruled out as persistence option
- Stabilize context references with useRef + deep compare (lessons.md:45)
- Async side effects must use useRef guards (docs/solutions/runtime-errors/async-side-effect-during-react-render.md)

### What this does NOT do
- No Firestore persistence of chat history (chat is ephemeral per session, by design)
- No change to `MAX_API_MESSAGES` (20) or API message trimming
- No change to other tabs' mounting behavior
- No React `<Activity>` API (experimental, not in stable React 19.2)
