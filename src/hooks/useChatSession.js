import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, runTransaction, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { cacheRead, cacheWrite, chatKey } from '../lib/offlineCache';
import { resolveTerminal } from '../lib/streamChat';
import { parseBeanScan, parseRecipeCard } from '../lib/chatParse';
import { recipeSummary } from '../components/chat/RecipeCard';
import { normalizeAgentSession, inflateAgentSession, startNewChat, clientSessionWrite, reconcileChatSession } from '../lib/ruphus/session.js';
import { reconcileProposalArtifacts } from '../lib/ruphus/proposalArtifacts.js';

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
    saveRemote(session, options) {
      if (session.protocolVersion === AGENT_PROTOCOL_VERSION) {
        return runTransaction(db, async transaction => {
          const snapshot = await transaction.get(ref);
          const write = clientSessionWrite(session, { ...options, remoteSession: snapshot.exists() ? snapshot.data() : null });
          transaction.set(ref, write.data, { merge: write.merge });
        });
      }
      const write = clientSessionWrite(session, options);
      return setDoc(ref, write.data, { merge: write.merge });
    },
    async loadRemoteArtifacts(session) {
      const proposals = collection(db, 'users', uid, 'proposals');
      // Older cards were written before the proposal session identity was
      // copied into the artifact. Reconcile their exact owner-scoped records
      // by ID so relaunch can recover the server-issued session binding.
      return reconcileProposalArtifacts({
        session,
        loadBySession: async (sessionId) => {
          const records = await getDocs(query(proposals, where('sessionId', '==', sessionId)));
          return records.docs.map(item => ({ id: item.id, ...item.data() }));
        },
        loadById: async (proposalId) => {
          const item = await getDoc(doc(proposals, proposalId));
          return item.exists() ? { id: item.id, ...item.data() } : null;
        },
      });
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

    const localLoad = Promise.resolve().then(() => storage.loadLocal?.()).catch(err => {
      console.warn('[ChatSession] Local hydrate failed:', err);
      return null;
    });
    localLoad.then(local => {
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
      Promise.all([localLoad, Promise.resolve().then(() => storage.loadRemote?.())]).then(([local, loadedRemote]) => {
        if (cancelled) return;
        const remote = reconcileChatSession(local, loadedRemote);
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

  const persist = useCallback((messages, metadata = {}, options = {}) => {
    if (isDemo || !uid || !adapterRef.current) return;
    const session = metadata.protocolVersion === AGENT_PROTOCOL_VERSION
      ? normalizeAgentSession({ ...metadata, messages })
      : {
      messages: normalizeMessages(messages),
      updatedAt: Date.now(),
      };
    const localSession = session.protocolVersion === AGENT_PROTOCOL_VERSION
      ? { ...session, ...clientSessionWrite(session, { ...options, remoteSession: hydratedSession }).data, boundaryIndex: options.resetContext ? session.boundaryIndex : hydratedSession?.boundaryIndex || 0 }
      : session;
    Promise.resolve(adapterRef.current.saveLocal?.(localSession))
      .catch(err => console.warn('[ChatSession] Local persist failed:', err));
    if (!hydratedRef.current) return;
    Promise.resolve(adapterRef.current.saveRemote?.(session, options))
      .catch(err => console.warn('[ChatSession] Remote persist failed:', err));
  }, [hydratedSession, isDemo, uid]);

  const clear = useCallback((currentMessages = hydratedMessages.slice(hydratedSession?.boundaryIndex || 0), currentContext = hydratedContext) => {
    if (isDemo || !uid || !adapterRef.current) return;
    const now = Date.now();
    const next = startNewChat({
      protocolVersion: AGENT_PROTOCOL_VERSION,
      messages: currentMessages,
      contextRef: currentContext,
      lastActivityAt: now,
      updatedAt: now,
    }, { now });
    hydratedRef.current = true;
    const localNext = clientSessionWrite(next, { resetContext: true, archiveActive: true, remoteSession: hydratedSession }).data;
    const inflated = inflateAgentSession(localNext);
    setHydratedSession(inflated);
    setHydratedMessages(inflated.messages);
    setHydratedContext(next.contextRef || null);
    setHydratedArtifacts([]);
    setHydrationState('hydrated');
    Promise.resolve(adapterRef.current.saveLocal?.(localNext))
      .catch(err => console.warn('[ChatSession] Local boundary persist failed:', err));
    Promise.resolve(adapterRef.current.saveRemote?.(next, { resetContext: true, archiveActive: true }))
      .catch(err => console.warn('[ChatSession] Remote boundary persist failed:', err));
  }, [hydratedContext, hydratedMessages, hydratedSession, isDemo, uid]);

  return { hydratedMessages, hydratedContext, hydratedArtifacts, hydratedSession, hydrationState, persist, clear };
}
