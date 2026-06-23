// Chat tab -- with photo scanning, Aiden brew, and save-to-inventory
import { useState, useEffect, useRef, memo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Send, Camera, X, Coffee, BookOpen, Save } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { C, fonts, glass, shadows, radius, type as typeScale, motion as motionTokens } from '../styles/theme';
import { m, spring, fadeUp, popIn } from '../lib/motion';
import { buildChatContext, sendChatMessage, compressImage } from '../lib/claude';
import { AidenModal } from '../components/AidenModal';
import { HandBrewModal } from '../components/HandBrewModal';
import { Toast } from '../components/Toast';
import { Btn } from '../components/Btn';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useNativeKeyboard } from '../hooks/useNativeKeyboard';
import { getBrewMethod } from '../lib/brewMethods';
import { buildNewBeanData } from '../lib/beanBuilder';
import { buildSourceContextHash, normalizeSourceInsights } from '../lib/sourceInsights';
import { usePreferences } from '../hooks/useUserProfile';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';

// Parse ---BEAN_SCAN---{json}---END_SCAN--- from assistant text
function parseBeanScan(text) {
  const match = text.match(/---BEAN_SCAN---([\s\S]*?)---END_SCAN---/);
  if (!match) return { cleanText: text, scannedBean: null };
  try {
    const json = match[1].trim();
    const scannedBean = JSON.parse(json);
    scannedBean.sourceInsights = normalizeSourceInsights(scannedBean.sourceInsights);
    const sourceContextHash = buildSourceContextHash(scannedBean);
    if (sourceContextHash) scannedBean.sourceContextHash = sourceContextHash;
    const cleanText = text.replace(/---BEAN_SCAN---[\s\S]*?---END_SCAN---/, '').trim();
    return { cleanText, scannedBean };
  } catch {
    return { cleanText: text, scannedBean: null };
  }
}

// Strip base64 image data from older API messages to prevent memory bloat
function trimApiMessages(messages, keepRecent = 6) {
  if (messages.length <= keepRecent) return messages;
  return messages.map((msg, i) => {
    if (i >= messages.length - keepRecent) return msg;
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(block =>
          block.type === 'image' ? { type: 'text', text: '[image]' } : block
        ),
      };
    }
    return msg;
  });
}

const MAX_API_MESSAGES = 20;
const MAX_DISPLAY_MESSAGES = 50;

// Animated typing indicator — three bouncing dots
const TypingIndicator = () => (
  <m.div
    {...fadeUp}
    style={{
      alignSelf: 'flex-start',
      background: C.cream,
      border: `1px solid ${C.hairline}`,
      borderRadius: `${radius.lg}px ${radius.lg}px ${radius.lg}px ${radius.sm}px`,
      boxShadow: shadows.e1,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 5,
    }}
  >
    {[0, 1, 2].map(i => (
      <span
        key={i}
        style={{
          display: 'block',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: C.accentLight,
          animation: `chatDot 1.2s ease-in-out ${i * 0.2}s infinite`,
        }}
      />
    ))}
    <style>{`
      @keyframes chatDot {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
    `}</style>
  </m.div>
);

// Isolated input bar -- owns its own `input` state so keystrokes never
// re-render the parent ChatTab (which re-renders the full message list).
// Memoized on its props so even parent re-renders don't cascade here unless
// something relevant (photos list, loading flag, keyboard) actually changed.
const ChatInputBar = memo(function ChatInputBar({
  loading,
  photos,
  keyboardHeight,
  onSend,
  onPickPhoto,
  onRemovePhoto,
  fileInputRef,
  inputRef,
  onFileSelect,
}) {
  const [input, setInput] = useState('');

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed && photos.length === 0) return;
    onSend(trimmed);
    setInput('');
    // Let the input keep focus so the keyboard stays up for multi-turn chat,
    // but blur on Enter so iOS dismisses after explicit send.
  };

  const canSend = !loading && (input.trim().length > 0 || photos.length > 0);

  return (
    <>
      {/* Photo preview strip */}
      {photos.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 8,
          padding: '6px 16px',
          position: 'fixed',
          bottom: keyboardHeight > 0
            ? keyboardHeight + 64
            : `calc(80px + env(safe-area-inset-bottom, 0px) + 64px)`,
          left: 0,
          right: 0,
          zIndex: 49,
        }}>
          <AnimatePresence>
            {photos.map((p, i) => (
              <m.div
                key={i}
                {...popIn}
                style={{ position: 'relative' }}
              >
                <img
                  src={p.previewUrl}
                  alt="Preview"
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: radius.sm,
                    objectFit: 'cover',
                    border: `1px solid ${C.hairline}`,
                    boxShadow: shadows.e1,
                  }}
                />
                <button
                  onClick={() => onRemovePhoto(i)}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: C.accent,
                    color: C.cream,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    boxShadow: shadows.button,
                  }}
                >
                  <X size={11} />
                </button>
              </m.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <div
        data-tour="chat-input"
        style={{
          position: 'fixed',
          bottom: keyboardHeight > 0 ? keyboardHeight : `calc(80px + env(safe-area-inset-bottom, 0px))`,
          left: 0,
          right: 0,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          padding: '10px 16px',
          background: glass.chrome,
          backdropFilter: glass.blur,
          WebkitBackdropFilter: glass.blur,
          borderTop: `1px solid ${glass.chromeBorder}`,
          zIndex: 50,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />

        {/* Camera button */}
        <button
          onClick={onPickPhoto}
          disabled={photos.length >= 3}
          style={{
            background: C.cardMuted,
            border: `1px solid ${C.hairline}`,
            borderRadius: radius.sm,
            width: 44,
            height: 44,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: photos.length >= 3 ? 0.35 : 1,
            flexShrink: 0,
            transition: `opacity 0.15s ease`,
          }}
        >
          <Camera size={20} color={C.accent} />
        </button>

        {/* Text input — pill shape */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { send(); inputRef.current?.blur(); } }}
          placeholder={photos.length > 0 ? 'Add a note or just send...' : 'Ask Professor Ruphus...'}
          enterKeyHint="send"
          style={{
            flex: 1,
            minWidth: 0,
            padding: '11px 16px',
            borderRadius: radius.pill,
            border: `1px solid ${C.border}`,
            fontFamily: fonts.body,
            fontSize: 16,
            lineHeight: 1.4,
            background: C.cream,
            color: C.text,
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: shadows.e1,
          }}
        />

        {/* Send button — caramel circle */}
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            background: canSend
              ? `linear-gradient(145deg, ${C.accent}, ${C.accentDark})`
              : C.cardMuted,
            color: C.cream,
            border: 'none',
            borderRadius: '50%',
            width: 44,
            height: 44,
            cursor: canSend ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: canSend ? shadows.navActive : 'none',
            transition: `background 0.18s ease, box-shadow 0.18s ease`,
          }}
        >
          <Send size={17} />
        </button>
      </div>
    </>
  );
});

export const ChatTab = ({ beans, tastings, addBean, updateBean, addTasting, updateTasting, isActive, onStartTastingSession, isDemo, onDemoAction }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey, I'm Professor Ruphus! Ask me anything about your rotation, what to brew, or send photos of coffee bags and I'll scan them for you." },
  ]);
  // apiMessages stores the raw messages sent to the API (with base64 images)
  const apiMessages = useRef([
    { role: 'assistant', content: messages[0].content },
  ]);
  // Input state lives in the ChatInputBar child so keystrokes don't
  // re-render the parent's message list on every character.
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState([]); // { base64, mediaType, previewUrl }
  const [scannedBean, setScannedBean] = useState(null);
  const [toast, setToast] = useState(null);
  // Disable keyboard hook when tab is hidden to prevent double-counting
  // keyboard events and corrupting the shared tab bar hide counter.
  const keyboardHeight = useNativeKeyboard({ enabled: isActive });
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  // Synchronous guard against double-send. `loading` state is async and both
  // calls can slip past it on rapid Enter+Send. This ref blocks the second
  // call immediately in the same event loop tick.
  const sendingRef = useRef(false);
  // Blob URLs only (never DataURL strings). DataURL strings don't need
  // revoking and pushing them here would pin huge base64 payloads for the
  // entire session, which is a real memory leak on native.
  const blobUrlsRef = useRef([]);

  // Revokes a URL if it's a blob: URL. No-op for data: URLs and anything else.
  const safeRevokeBlobUrl = (url) => {
    if (typeof url === 'string' && url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  };

  // Scroll chat to bottom when the keyboard opens. Tab-bar hiding is now
  // handled centrally by useNativeKeyboard so ChatTab + TastingTab can't
  // race to toggle .app-tab-bar.style.display.
  useEffect(() => {
    if (keyboardHeight > 0 && scrollRef.current) {
      setTimeout(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }, [keyboardHeight]);

  // No-op updateBean wrapper for ephemeral beans (no id to persist to)
  const ephemeralUpdateBean = async (beanId, updates) => {
    if (!beanId) return;
    await updateBean(beanId, updates);
  };
  const isHandBrew = preferences.brewMethod !== 'aiden';
  const aiden = useAidenBrew(ephemeralUpdateBean);
  const handBrew = useHandBrew(ephemeralUpdateBean);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Scroll to bottom when tab becomes visible again. display:none elements
  // can lose scroll position in WebKit (bug 72852). requestAnimationFrame
  // ensures layout has settled after the display toggle.
  useEffect(() => {
    if (isActive && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [isActive]);

  // Cleanup all tracked blob URLs on unmount
  useEffect(() => {
    const trackedBlobUrls = blobUrlsRef.current;
    return () => {
      trackedBlobUrls.forEach(safeRevokeBlobUrl);
    };
  }, []);

  const takeNativePhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted' || perms.photos !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (requested.camera === 'denied') return;
      }
      const image = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        width: 1200,
        height: 1200,
      });
      const mediaType = 'image/jpeg';
      const base64 = image.dataUrl.split(',')[1];
      const previewUrl = image.dataUrl;
      // DataURL strings are not blob URLs; don't push them into blobUrlsRef
      // (would pin ~500KB of base64 per photo for the whole session).
      setPhotos(prev => [...prev, { base64, mediaType, previewUrl }].slice(0, 3));
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Camera error:', err);
      }
    }
  };

  const handlePhotoSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 3 - photos.length;
    const toProcess = files.slice(0, remaining);

    try {
      const compressed = await Promise.all(toProcess.map(f => compressImage(f)));
      compressed.forEach(c => { if (c.previewUrl) blobUrlsRef.current.push(c.previewUrl); });
      setPhotos(prev => [...prev, ...compressed].slice(0, 3));
    } catch (err) {
      console.error('Photo compression failed:', err);
    }
    // Reset file input so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      // Revoke blob URL for the removed photo (no-op for data: URLs).
      if (prev[idx]?.previewUrl) safeRevokeBlobUrl(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // Text comes from ChatInputBar (child owns the input state).
  const handleSend = async (text) => {
    if (sendingRef.current) return;
    if (!text && photos.length === 0) return;

    if (isDemo) { onDemoAction?.(); return; }

    if (!hasPro) {
      openPaywall({ feature: 'generic', promote: 'pro' });
      return;
    }

    sendingRef.current = true;

    const currentPhotos = [...photos];

    // Build display message
    const displayMsg = {
      role: 'user',
      content: text,
      photos: currentPhotos.map(p => p.previewUrl),
    };
    setMessages(prev => [...prev, displayMsg]);

    // Build API message with base64 images
    let apiContent;
    if (currentPhotos.length > 0) {
      apiContent = [
        ...currentPhotos.map(p => ({
          type: 'image',
          source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
        })),
        { type: 'text', text: text || 'What can you tell me about this coffee?' },
      ];
      // Clear scanned bean when sending new photos
      setScannedBean(null);
    } else {
      apiContent = text;
    }

    const apiMsg = { role: 'user', content: apiContent };
    apiMessages.current = [...apiMessages.current, apiMsg];

    // NOTE: input state lives in ChatInputBar child; it clears its own field
    // after onSend(text) resolves, so no setInput call here.
    // Clear pending photos from the input bar. Do NOT revoke blob URLs here:
    // sent photo preview URLs are still referenced by messages in the display
    // list (displayMsg.photos). Revoking them would cause broken image
    // thumbnails. Blob URLs are cleaned up on full page unload via the
    // unmount effect (blobUrlsRef). Data URLs (native camera) need no cleanup.
    setPhotos([]);
    setLoading(true);

    try {
      const systemPrompt = buildChatContext(beans, tastings, preferences);
      const history = apiMessages.current.filter(m => m.role !== 'system');
      const rawText = await sendChatMessage(systemPrompt, history);

      // Parse scan markers
      const { cleanText, scannedBean: parsed } = parseBeanScan(rawText);
      if (parsed) setScannedBean(parsed);

      const assistantMsg = { role: 'assistant', content: cleanText };
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
      apiMessages.current = [...apiMessages.current, { role: 'assistant', content: rawText }];

      // Cap and trim apiMessages to prevent unbounded memory growth
      if (apiMessages.current.length > MAX_API_MESSAGES) {
        apiMessages.current = apiMessages.current.slice(-MAX_API_MESSAGES);
      }
      apiMessages.current = trimApiMessages(apiMessages.current);
    } catch (err) {
      // Server-side gate: chat is Pro-only. If a free user somehow bypassed
      // the local check (race, stale context), surface the paywall and
      // strip the optimistic user message.
      if (err?.code === 'subscription_required' || err?.code === 'free_tier_exhausted') {
        setMessages(prev => prev.slice(0, -1));
        apiMessages.current = apiMessages.current.slice(0, -1);
        openPaywall({
          feature: 'generic',
          promote: err.tier === 'ultra' ? 'ultra' : 'pro',
        });
        setLoading(false);
        sendingRef.current = false;
        return;
      }
      // Error bubbles are for the user only. Do NOT inject them into
      // apiMessages.current -- otherwise the model reads "Couldn't reach the AI..."
      // as canonical assistant history on the next retry, which mangles context.
      const errMsg = { role: 'assistant', content: "Couldn't reach the AI. Try again in a sec." };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
    sendingRef.current = false;
  };

  const handleBrewScanned = () => {
    if (!scannedBean) return;
    const ephemeralBean = { ...scannedBean, status: 'SEALED' };
    if (isHandBrew) {
      handBrew.handleBrewHandBrew(ephemeralBean);
    } else {
      aiden.handleBrewWithAiden(ephemeralBean);
    }
  };

  const handleSaveToInventory = async () => {
    if (!scannedBean) return;
    try {
      const beanData = buildNewBeanData({
        name: scannedBean.name || 'Unknown',
        roaster: scannedBean.roaster || 'Unknown',
        origin: scannedBean.origin || '',
        variety: scannedBean.variety || '',
        process: scannedBean.process || '',
        roastDate: scannedBean.roastDate || '',
        bagSize: scannedBean.bagSize || 100,
        bagNotes: scannedBean.bagNotes || '',
        producer: scannedBean.producer || '',
        region: scannedBean.region || '',
        altitude: scannedBean.altitude || '',
        farm: scannedBean.farm || '',
        roastLevel: scannedBean.roastLevel || '',
        cupScore: scannedBean.cupScore || '',
        brewingRec: scannedBean.brewingRec || '',
        sourcedBy: scannedBean.sourcedBy || '',
        roastedIn: scannedBean.roastedIn || '',
        sourceInsights: scannedBean.sourceInsights || null,
      });
      await addBean(beanData);
      setToast(`${scannedBean.name || 'Bean'} saved to inventory!`);
      setScannedBean(null);
    } catch (err) {
      console.error('Save to inventory failed:', err);
      setToast('Failed to save. Try again.');
    }
  };

  const handleGuidedTasting = () => {
    if (!scannedBean) return;
    const beanName = scannedBean.name || 'this coffee';
    const prompt = `Let's do a guided tasting of ${beanName} by ${scannedBean.roaster || 'the roaster'}. Walk me through it step by step.`;
    setScannedBean(null);
    // Send the prompt directly instead of pre-filling the input box.
    handleSend(prompt);
  };

  // Is this the intro/empty state (only the first assistant message, no user turns)?
  const isIntroState = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Editorial page header */}
      <div style={{ marginBottom: 4 }}>
        <div style={{
          ...typeScale.label,
          color: C.textLight,
          marginBottom: 6,
        }}>
          AI Chat
        </div>
        <div style={{
          ...typeScale.h1,
          color: C.text,
          marginBottom: 6,
        }}>
          Coffee Chat
        </div>
        <div style={{
          width: 32,
          height: 2,
          background: `linear-gradient(90deg, ${C.accent}, ${C.accentLight})`,
          borderRadius: radius.pill,
          marginBottom: 8,
        }} />
        <div style={{
          ...typeScale.body,
          color: C.textMuted,
          marginBottom: 12,
        }}>
          Your rotation, your taste, your questions.
        </div>
      </div>

      <div
        ref={scrollRef}
        onClick={() => { if (inputRef.current) inputRef.current.blur(); }}
        style={{
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingBottom: keyboardHeight > 0 ? 80 : 140,
          height: keyboardHeight > 0
            ? `calc(100dvh - ${keyboardHeight + 200}px)`
            : 'calc(100dvh - 340px)',
        }}
      >
        {/* Intro / empty state — shown only when no user turns yet */}
        {isIntroState && (
          <m.div
            {...fadeUp}
            style={{
              margin: '8px 0 4px',
              background: C.cream,
              border: `1px solid ${C.hairline}`,
              borderRadius: radius.xl,
              boxShadow: shadows.e2,
              padding: '28px 24px 24px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 10,
            }}
          >
            {/* Avatar ring */}
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: `linear-gradient(145deg, ${C.accentSoft}, ${C.accentLight})`,
              border: `2px solid ${C.accentLight}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
              boxShadow: shadows.navActive,
            }}>
              <Coffee size={26} color={C.accent} />
            </div>
            <div style={{
              ...typeScale.h3,
              color: C.text,
            }}>
              Professor Ruphus
            </div>
            <div style={{
              ...typeScale.bodyL,
              color: C.textMuted,
              lineHeight: 1.55,
            }}>
              {messages[0].content}
            </div>
            {/* Hint chips */}
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 7,
              marginTop: 4,
            }}>
              {['What should I brew today?', 'Scan a bag', 'Coach my tasting'].map(hint => (
                <div
                  key={hint}
                  style={{
                    background: C.accentSoft,
                    border: `1px solid ${C.accentLight}`,
                    borderRadius: radius.pill,
                    padding: '5px 13px',
                    ...typeScale.caption,
                    color: C.accent,
                    cursor: 'default',
                  }}
                >
                  {hint}
                </div>
              ))}
            </div>
          </m.div>
        )}

        {/* Message bubbles — skip the first assistant message when showing intro card */}
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (isIntroState && i === 0) return null;
            return (
              <m.div key={i} {...fadeUp} transition={{ duration: motionTokens.dur.base, ease: motionTokens.ease.out, delay: 0 }}>
                {/* Photo thumbnails for user messages */}
                {msg.photos && msg.photos.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: 6,
                    marginBottom: 5,
                    justifyContent: 'flex-end',
                  }}>
                    {msg.photos.map((url, pi) => (
                      <img
                        key={pi}
                        src={url}
                        alt="Uploaded"
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: radius.sm,
                          objectFit: 'cover',
                          border: `1px solid ${C.hairline}`,
                          boxShadow: shadows.e1,
                        }}
                      />
                    ))}
                  </div>
                )}
                <div
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    // User: caramel gradient, right-aligned
                    // Assistant: near-white cream card with elevation + hairline
                    background: msg.role === 'user'
                      ? `linear-gradient(145deg, ${C.accent}, ${C.accentDark})`
                      : C.cream,
                    color: msg.role === 'user' ? C.cream : C.text,
                    // Asymmetric corner: user tails bottom-right, assistant tails bottom-left
                    borderRadius: msg.role === 'user'
                      ? `${radius.lg}px ${radius.lg}px ${radius.sm}px ${radius.lg}px`
                      : `${radius.lg}px ${radius.lg}px ${radius.lg}px ${radius.sm}px`,
                    padding: '12px 16px',
                    ...typeScale.bodyL,
                    border: msg.role === 'user' ? 'none' : `1px solid ${C.hairline}`,
                    boxShadow: msg.role === 'user' ? shadows.button : shadows.e1,
                    whiteSpace: 'pre-wrap',
                    marginLeft: msg.role === 'user' ? 'auto' : undefined,
                    lineHeight: 1.55,
                  }}
                >
                  {msg.content}
                </div>
              </m.div>
            );
          })}
        </AnimatePresence>

        {/* Typing / loading indicator */}
        {loading && <TypingIndicator />}
      </div>

      {/* Scanned bean action buttons */}
      {scannedBean && !loading && (
        <m.div
          {...fadeUp}
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            padding: '10px 0',
            borderTop: `1px solid ${C.hairline}`,
            marginBottom: 8,
          }}
        >
          <Btn variant="small" onClick={handleBrewScanned}>
            <Coffee size={12} /> {brewMethod.label}
          </Btn>
          <Btn variant="small" onClick={handleGuidedTasting}>
            <BookOpen size={12} /> Guided Tasting
          </Btn>
          <Btn variant="small" onClick={handleSaveToInventory}>
            <Save size={12} /> Save to Inventory
          </Btn>
        </m.div>
      )}

      <ChatInputBar
        loading={loading}
        photos={photos}
        keyboardHeight={keyboardHeight}
        onSend={handleSend}
        onPickPhoto={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
        onRemovePhoto={removePhoto}
        fileInputRef={fileRef}
        inputRef={inputRef}
        onFileSelect={handlePhotoSelect}
      />

      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        bean={aiden.aidenBean}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
        onRegenerate={aiden.onRegenerate}
        onPushCached={aiden.onPushCached}
        icedResult={aiden.icedResult}
        icedLoading={aiden.icedLoading}
        icedError={aiden.icedError}
        onPushIced={aiden.onPushIced}
        onRetryIcedPush={aiden.onRetryIcedPush}
      />
      <HandBrewModal
        open={handBrew.handBrewModal}
        onClose={handBrew.closeHandBrewModal}
        recipe={handBrew.handBrewRecipe}
        loading={handBrew.handBrewLoading}
        error={handBrew.handBrewError}
        phase={handBrew.handBrewPhase}
        onRetry={handBrew.onRetry}
        onRegenerate={handBrew.onRegenerate}
        bean={handBrew.handBrewBean}
        onStartTasting={onStartTastingSession}
        userCoffeeGrams={handBrew.userCoffeeGrams}
        onCoffeeGramsChange={handBrew.setUserCoffeeGrams}
        onPersistDose={handBrew.persistDose}
      />
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
    </div>
  );
};
