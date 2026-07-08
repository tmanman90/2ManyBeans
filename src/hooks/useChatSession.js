import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cacheRead, cacheWrite, chatKey } from '../lib/offlineCache';
import { resolveTerminal } from '../lib/streamChat';
import { parseBeanScan, parseRecipeCard } from '../lib/chatParse';
import { recipeSummary } from '../components/chat/RecipeCard';

const MAX_MESSAGES = 50;
const MAX_TEXT = 2000;

const textValue = (value) => String(value || '').trim();

function persistedText(message) {
  if (message?.photos?.length) return '[photo]';

  const terminal = resolveTerminal(textValue(message?.content));
  const scan = parseBeanScan(terminal.text);
  const recipe = parseRecipeCard(scan.cleanText);
  const parts = [recipe.cleanText];
  if (message?.recipeCard) parts.push(recipeSummary(message.recipeCard));
  else if (recipe.recipeCard) parts.push(recipeSummary(recipe.recipeCard));
  return parts.filter(Boolean).join('\n\n').slice(0, MAX_TEXT);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant') && !message.errored)
    .map(message => ({
      id: textValue(message.id) || crypto.randomUUID(),
      role: message.role,
      text: persistedText(message),
      createdAt: Number(message.createdAt) || Date.now(),
    }))
    .filter(message => message.text)
    .slice(-MAX_MESSAGES);
}

function inflateMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && (message.role === 'user' || message.role === 'assistant') && textValue(message.text))
    .map(message => ({
      id: textValue(message.id) || crypto.randomUUID(),
      role: message.role,
      content: textValue(message.text).slice(0, MAX_TEXT),
      createdAt: Number(message.createdAt) || Date.now(),
    }))
    .slice(-MAX_MESSAGES);
}

function createDefaultAdapter(uid) {
  const ref = doc(db, 'users', uid, 'chatSessions', 'active');
  const key = chatKey(uid);
  return {
    async loadRemote() {
      const snap = await getDoc(ref);
      return snap.exists() ? snap.data() : null;
    },
    saveRemote(session) {
      return setDoc(ref, session);
    },
    deleteRemote() {
      return deleteDoc(ref);
    },
    loadLocal() {
      return cacheRead(key);
    },
    saveLocal(session) {
      cacheWrite(key, session);
      return Promise.resolve();
    },
    deleteLocal() {
      cacheWrite(key, null);
      return Promise.resolve();
    },
  };
}

export function useChatSession({ uid, isDemo, adapter } = {}) {
  const [hydratedMessages, setHydratedMessages] = useState([]);
  const [hydrationState, setHydrationState] = useState(isDemo || !uid ? 'idle' : 'loading');
  const adapterRef = useRef(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (isDemo || !uid) {
      adapterRef.current = null;
      hydratedRef.current = false;
      setHydratedMessages([]);
      setHydrationState('idle');
      return undefined;
    }

    const storage = adapter || createDefaultAdapter(uid);
    adapterRef.current = storage;
    hydratedRef.current = false;
    setHydratedMessages([]);
    setHydrationState('loading');
    let cancelled = false;
    const timers = [];

    Promise.resolve(storage.loadLocal?.()).then(local => {
      if (cancelled || !local?.messages) return;
      setHydratedMessages(inflateMessages(local.messages));
      setHydrationState('local');
    }).catch(err => console.warn('[ChatSession] Local hydrate failed:', err));

    const loadRemote = (attempt = 1) => {
      Promise.resolve(storage.loadRemote?.()).then(remote => {
        if (cancelled) return;
        hydratedRef.current = true;
        setHydratedMessages(inflateMessages(remote?.messages || []));
        setHydrationState('hydrated');
      }).catch(err => {
        if (cancelled) return;
        console.warn(`[ChatSession] Remote hydrate attempt ${attempt} failed:`, err);
        hydratedRef.current = false;
        setHydrationState('error');
        if (attempt < 3) {
          const timer = setTimeout(() => loadRemote(attempt + 1), 1000 * attempt);
          timers.push(timer);
        }
      });
    };
    loadRemote();

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [adapter, isDemo, uid]);

  const persist = useCallback((messages) => {
    if (isDemo || !uid || !adapterRef.current) return;
    const session = {
      messages: normalizeMessages(messages),
      updatedAt: Date.now(),
    };
    Promise.resolve(adapterRef.current.saveLocal?.(session))
      .catch(err => console.warn('[ChatSession] Local persist failed:', err));
    if (!hydratedRef.current) return;
    Promise.resolve(adapterRef.current.saveRemote?.(session))
      .catch(err => console.warn('[ChatSession] Remote persist failed:', err));
  }, [isDemo, uid]);

  const clear = useCallback(() => {
    if (isDemo || !uid || !adapterRef.current) return;
    hydratedRef.current = true;
    setHydratedMessages([]);
    setHydrationState('hydrated');
    Promise.resolve(adapterRef.current.deleteRemote?.())
      .catch(err => console.warn('[ChatSession] Remote clear failed:', err));
    Promise.resolve(adapterRef.current.deleteLocal?.())
      .catch(err => console.warn('[ChatSession] Local clear failed:', err));
  }, [isDemo, uid]);

  return { hydratedMessages, hydrationState, persist, clear };
}
