// Chat tab -- with photo scanning, Aiden brew, and save-to-inventory
import { useState, useEffect, useRef, memo } from 'react';
import { Capacitor } from '@capacitor/core';
import { Send, Camera, X, Coffee, BookOpen, Save } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { buildChatContext, sendChatMessage, compressImage } from '../lib/claude';
import { AidenModal } from '../components/AidenModal';
import { HandBrewModal } from '../components/HandBrewModal';
import { Toast } from '../components/Toast';
import { Btn } from '../components/Btn';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useNativeKeyboard } from '../hooks/useNativeKeyboard';
import { getBrewMethod } from '../lib/brewMethods';
import { getProfileForRoaster } from '../lib/roasterProfiles';
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
  onFileSelect,
}) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  const send = () => {
    const trimmed = input.trim();
    if (!trimmed && photos.length === 0) return;
    onSend(trimmed);
    setInput('');
    // Let the input keep focus so the keyboard stays up for multi-turn chat,
    // but blur on Enter so iOS dismisses after explicit send.
  };

  return (
    <>
      {/* Photo preview strip */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          {photos.map((p, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={p.previewUrl}
                alt="Preview"
                style={{
                  width: 52, height: 52, borderRadius: 8,
                  objectFit: 'cover', border: `1px solid ${C.borderLight}`,
                }}
              />
              <button
                onClick={() => onRemovePhoto(i)}
                style={{
                  position: 'absolute', top: -10, right: -10,
                  width: 28, height: 28, borderRadius: '50%',
                  background: C.accent, color: C.card, border: 'none',
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, padding: 8,
                }}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{
        position: 'fixed',
        bottom: keyboardHeight > 0 ? keyboardHeight : `calc(80px + env(safe-area-inset-bottom, 0px))`,
        left: 0, right: 0,
        display: 'flex', gap: 8, alignItems: 'center',
        padding: '8px 20px',
        paddingBottom: keyboardHeight > 0 ? 8 : 8,
        background: C.bg,
        borderTop: `1px solid ${C.borderLight}`,
        zIndex: 50,
      }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={onFileSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={onPickPhoto}
          disabled={photos.length >= 3}
          style={{
            background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 12, width: 44, height: 44, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: photos.length >= 3 ? 0.4 : 1,
            flexShrink: 0,
          }}
        >
          <Camera size={20} color={C.accent} />
        </button>
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
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            fontFamily: fonts.body,
            fontSize: 16,
            background: C.card,
            color: C.text,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          onClick={send}
          disabled={loading || (!input.trim() && photos.length === 0)}
          style={{
            background: C.accent,
            color: C.card,
            border: 'none',
            borderRadius: 12,
            width: 44,
            height: 44,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loading || (!input.trim() && photos.length === 0) ? 0.5 : 1,
            flexShrink: 0,
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </>
  );
});

export const ChatTab = ({ beans, tastings, addBean, updateBean, addTasting, updateTasting }) => {
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
  const keyboardHeight = useNativeKeyboard();
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
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
  const isHandBrew = preferences.brewMethod === 'handbrew';
  const aiden = useAidenBrew(ephemeralUpdateBean);
  const handBrew = useHandBrew(ephemeralUpdateBean);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Cleanup all tracked blob URLs on unmount
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(safeRevokeBlobUrl);
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
    // Synchronous guard: blocks the second call in the same event loop tick
    // before React has flushed `loading` state. Without this, a fast Enter+Send
    // double-press can slip both calls through, each appending to
    // apiMessages.current with stale snapshots and interleaving transcripts.
    if (sendingRef.current) return;
    if (!text && photos.length === 0) return;

    // Subscription gate: chat is the same metered feature as tasting coach
    // (both route through /api/claude). Free tier gets 1 lifetime session.
    // The server side also enforces this; the client-side check just avoids
    // wasting a round-trip and gives instant paywall feedback.
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= 1) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
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
    // Clearing `photos` state drops the display thumbnails, but the preview URLs
    // for sent photos stay referenced via the message log. Revoke the blob URLs
    // explicitly: the thumbnails are already persisted into displayMsg.photos
    // above, so revocation doesn't affect rendering. (Data URLs skip safely.)
    currentPhotos.forEach(p => safeRevokeBlobUrl(p.previewUrl));
    setPhotos([]);
    setLoading(true);

    try {
      const systemPrompt = buildChatContext(beans, tastings);
      const history = apiMessages.current.filter(m => m.role !== 'system');
      const rawText = await sendChatMessage(systemPrompt, history);

      // Parse scan markers
      const { cleanText, scannedBean: parsed } = parseBeanScan(rawText);
      if (parsed) setScannedBean(parsed);

      const assistantMsg = { role: 'assistant', content: cleanText };
      setMessages(prev => [...prev, assistantMsg]);
      apiMessages.current = [...apiMessages.current, { role: 'assistant', content: rawText }];

      // Cap and trim apiMessages to prevent unbounded memory growth
      if (apiMessages.current.length > MAX_API_MESSAGES) {
        apiMessages.current = apiMessages.current.slice(-MAX_API_MESSAGES);
      }
      apiMessages.current = trimApiMessages(apiMessages.current);
    } catch {
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
      const profile = getProfileForRoaster(scannedBean.roaster);
      await addBean({
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
        degasMin: profile.degasMin,
        degasMax: profile.degasMax,
        peakStart: profile.peakStart,
        peakEnd: profile.peakEnd,
        guidance: profile.guidance,
        status: 'SEALED',
        jarSlot: null,
      });
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

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text, marginBottom: 4 }}>Coffee Chat</div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>AI with your real inventory data</div>

      <div
        ref={scrollRef}
        onClick={() => { if (inputRef.current) inputRef.current.blur(); }}
        style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: keyboardHeight > 0 ? 80 : 140, height: keyboardHeight > 0 ? `calc(100dvh - ${keyboardHeight + 200}px)` : 'calc(100dvh - 340px)' }}>
        {messages.map((m, i) => (
          <div key={i}>
            {/* Photo thumbnails for user messages */}
            {m.photos && m.photos.length > 0 && (
              <div style={{
                display: 'flex', gap: 6, marginBottom: 4,
                justifyContent: 'flex-end',
              }}>
                {m.photos.map((url, pi) => (
                  <img
                    key={pi}
                    src={url}
                    alt="Uploaded"
                    style={{
                      width: 60, height: 60, borderRadius: 10,
                      objectFit: 'cover', border: `1px solid ${C.borderLight}`,
                    }}
                  />
                ))}
              </div>
            )}
            <div
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                background: m.role === 'user' ? C.accent : C.cream,
                color: m.role === 'user' ? C.card : C.text,
                borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '10px 14px',
                fontSize: 14,
                lineHeight: 1.5,
                border: m.role === 'user' ? 'none' : `1px solid ${C.borderLight}`,
                whiteSpace: 'pre-wrap',
                marginLeft: m.role === 'user' ? 'auto' : undefined,
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            background: C.cream,
            border: `1px solid ${C.borderLight}`,
            borderRadius: '16px 16px 16px 4px',
            padding: '10px 14px',
            fontSize: 14,
            color: C.textMuted,
          }}>
            Thinking...
          </div>
        )}
      </div>

      {/* Scanned bean action buttons */}
      {scannedBean && !loading && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          padding: '8px 0', borderTop: `1px solid ${C.borderLight}`,
          marginBottom: 8,
        }}>
          <Btn variant="small" onClick={handleBrewScanned}>
            <Coffee size={12} /> {brewMethod.label}
          </Btn>
          <Btn variant="small" onClick={handleGuidedTasting}>
            <BookOpen size={12} /> Guided Tasting
          </Btn>
          <Btn variant="small" onClick={handleSaveToInventory}>
            <Save size={12} /> Save to Inventory
          </Btn>
        </div>
      )}

      <ChatInputBar
        loading={loading}
        photos={photos}
        keyboardHeight={keyboardHeight}
        onSend={handleSend}
        onPickPhoto={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
        onRemovePhoto={removePhoto}
        fileInputRef={fileRef}
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
      />
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
    </div>
  );
};
