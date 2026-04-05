// Chat tab -- with photo scanning, Aiden brew, and save-to-inventory
import { useState, useEffect, useRef } from 'react';
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
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';

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

export const ChatTab = ({ beans, tastings, addBean, updateBean, addTasting, updateTasting }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey! Ask me anything about your rotation, inventory, or what to brew next. You can also send photos of coffee bags and I'll scan them for you." },
  ]);
  // apiMessages stores the raw messages sent to the API (with base64 images)
  const apiMessages = useRef([
    { role: 'assistant', content: messages[0].content },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [photos, setPhotos] = useState([]); // { base64, mediaType, previewUrl }
  const [scannedBean, setScannedBean] = useState(null);
  const [toast, setToast] = useState(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const blobUrlsRef = useRef([]); // Track all created blob URLs for cleanup

  // Track keyboard open/close on iOS native
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cleanup;
    import('@capacitor/keyboard').then(({ Keyboard }) => {
      const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
        setKeyboardHeight(info.keyboardHeight);
        // Hide tab bar when keyboard is open
        const tabBar = document.querySelector('.app-tab-bar');
        if (tabBar) tabBar.style.display = 'none';
        setTimeout(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      });
      const hideListener = Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardHeight(0);
        // Show tab bar again
        const tabBar = document.querySelector('.app-tab-bar');
        if (tabBar) tabBar.style.display = 'flex';
      });
      cleanup = () => {
        showListener.then(h => h.remove());
        hideListener.then(h => h.remove());
      };
    });
    return () => { if (cleanup) cleanup(); };
  }, []);

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
      blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
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
      blobUrlsRef.current.push(previewUrl);
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
      // Revoke blob URL for the removed photo
      if (prev[idx]?.previewUrl) URL.revokeObjectURL(prev[idx].previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSend = async () => {
    if ((!input.trim() && photos.length === 0) || loading) return;

    const text = input.trim();
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

    setInput('');
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
      const errMsg = { role: 'assistant', content: "Couldn't reach the AI. Try again in a sec." };
      setMessages(prev => [...prev, errMsg]);
      apiMessages.current = [...apiMessages.current, errMsg];
    }
    setLoading(false);
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
        status: 'SEALED',
        atmosSlot: null,
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
    setInput(prompt);
    setScannedBean(null);
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
                onClick={() => removePhoto(i)}
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

      {/* Input bar - fixed above tab bar, moves up with keyboard */}
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
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handlePhotoSelect}
          style={{ display: 'none' }}
        />
        <button
          onClick={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
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
          onKeyDown={e => { if (e.key === 'Enter') { handleSend(); inputRef.current?.blur(); } }}
          placeholder={photos.length > 0 ? 'Add a note or just send...' : 'What should I open next?'}
          enterKeyHint="send"
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            fontFamily: fonts.body,
            fontSize: 16,
            background: C.card,
            color: C.text,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
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

      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
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
