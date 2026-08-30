import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cacheRead, cacheWrite, chatKey } from '../lib/offlineCache';
import { resolveTerminal } from '../lib/streamChat';
import { parseBeanScan, parseRecipeCard } from '../lib/chatParse';
import { recipeSummary } from '../components/chat/RecipeCard';
import { normalizeAgentSession, inflateAgentSession, startNewChat } from '../lib/ruphus/session.js';

const MAX_MESSAGES = 50;
const MAX_TEXT = 2000;
const AGENT_PROTOCOL_VERSION = 1;

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
      ...(message.turnId ? { turnId: textValue(message.turnId).slice(0, 180) } : {}),
      ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}),
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
      ...(message.turnId ? { turnId: textValue(message.turnId).slice(0, 180) } : {}),
      ...(Array.isArray(message.artifacts) ? { artifacts: message.artifacts.slice() } : {}),
    }))
    .slice(-MAX_MESSAGES);
}

export { normalizeAgentSession, inflateAgentSession };

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
    async loadRemoteArtifacts(session) {
      const sessionId = session?.contextRef?.sessionId;
      if (!sessionId) return [];
      const records = await getDocs(query(collection(db, 'users', uid, 'proposals'), where('sessionId', '==', sessionId)));
      return records.docs.map(item => ({ id: item.id, ...item.data() }));
    },
    loadLocal() {
      return cacheRead(key);
    },
    saveLocal(session) {
      cacheWrite(key, session);
      return Promise.resolve();
    },
  };
}

export function useChatSession({ uid, isDemo, adapter } = {}) {
  const [hydratedMessages, setHydratedMessages] = useState([]);
  const [hydratedContext, setHydratedContext] = useState(null);
  const [hydratedArtifacts, setHydratedArtifacts] = useState([]);
  const [hydratedSession, setHydratedSession] = useState(null);
  const [hydrationState, setHydrationState] = useState(isDemo || !uid ? 'idle' : 'loading');
  const adapterRef = useRef(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (isDemo || !uid) {
      adapterRef.current = null;
      hydratedRef.current = false;
      setHydratedMessages([]);
      setHydratedContext(null);
      setHydratedArtifacts([]);
      setHydratedSession(null);
      setHydrationState('idle');
      return undefined;
    }

    const storage = adapter || createDefaultAdapter(uid);
    adapterRef.current = storage;
    hydratedRef.current = false;
    setHydratedMessages([]);
    setHydratedContext(null);
    setHydratedArtifacts([]);
    setHydratedSession(null);
    setHydrationState('loading');
    let cancelled = false;
    const timers = [];

    Promise.resolve(storage.loadLocal?.()).then(local => {
      if (cancelled || !local?.messages) return;
      if (local.protocolVersion === AGENT_PROTOCOL_VERSION) {
        const session = inflateAgentSession(local);
        setHydratedSession(session);
        setHydratedMessages(session.messages);
        setHydratedContext(session.contextRef || null);
        setHydratedArtifacts(Array.isArray(local.artifacts) ? local.artifacts : []);
      } else {
        setHydratedSession(null);
        setHydratedMessages(inflateMessages(local.messages));
      }
      setHydrationState('local');
    }).catch(err => console.warn('[ChatSession] Local hydrate failed:', err));

    const loadRemote = (attempt = 1) => {
      Promise.resolve(storage.loadRemote?.()).then(remote => {
        if (cancelled) return;
        hydratedRef.current = true;
        const session = remote?.protocolVersion === AGENT_PROTOCOL_VERSION ? inflateAgentSession(remote) : null;
        setHydratedSession(session);
        setHydratedMessages(session ? session.messages : inflateMessages(remote?.messages || []));
        setHydratedContext(session?.contextRef || null);
        setHydratedArtifacts([]);
        if (remote?.protocolVersion === AGENT_PROTOCOL_VERSION && storage.loadRemoteArtifacts) {
          Promise.resolve(storage.loadRemoteArtifacts(remote)).then(records => {
            if (!cancelled) setHydratedArtifacts(Array.isArray(records) ? records : []);
          }).catch(err => console.warn('[ChatSession] Agent artifact reconcile failed:', err));
        }
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

  const persist = useCallback((messages, metadata = {}) => {
    if (isDemo || !uid || !adapterRef.current) return;
    const session = metadata.protocolVersion === AGENT_PROTOCOL_VERSION
      ? normalizeAgentSession({ ...metadata, messages })
      : {
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
    const now = Date.now();
    const next = startNewChat({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      messages: hydratedMessages,
      contextRef: hydratedContext,
      lastActivityAt: now,
      updatedAt: now,
    }, { now });
    hydratedRef.current = true;
    const inflated = inflateAgentSession(next);
    setHydratedSession(inflated);
    setHydratedMessages(inflated.messages);
    setHydratedContext(next.contextRef || null);
    setHydratedArtifacts([]);
    setHydrationState('hydrated');
    Promise.resolve(adapterRef.current.saveLocal?.(next))
      .catch(err => console.warn('[ChatSession] Local boundary persist failed:', err));
    Promise.resolve(adapterRef.current.saveRemote?.(next))
      .catch(err => console.warn('[ChatSession] Remote boundary persist failed:', err));
  }, [hydratedContext, hydratedMessages, isDemo, uid]);

  return { hydratedMessages, hydratedContext, hydratedArtifacts, hydratedSession, hydrationState, persist, clear };
}
