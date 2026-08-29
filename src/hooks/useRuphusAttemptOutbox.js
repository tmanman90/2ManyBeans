import { useCallback, useEffect, useState } from 'react';

const keyFor = (uid) => uid ? `ruphus-attempt-outbox:${uid}` : null;

export function useRuphusAttemptOutbox(uid) {
  const [attempt, setAttempt] = useState(() => {
    try { const key = keyFor(uid); return key ? JSON.parse(localStorage.getItem(key) || 'null') : null; } catch { return null; }
  });
  useEffect(() => {
    const key = keyFor(uid);
    if (!key) { setAttempt(null); return; }
    try { setAttempt(JSON.parse(localStorage.getItem(key) || 'null')); } catch { setAttempt(null); }
  }, [uid]);
  const put = useCallback((value) => {
    if (!uid || !value?.id || !value?.coffeeId || !value?.snapshot) return;
    const next = { ...value, ownerUid: uid, stage: value.stage || 'brew' };
    try { localStorage.setItem(keyFor(uid), JSON.stringify(next)); } catch { /* local recovery is best-effort */ }
    setAttempt(next);
  }, [uid]);
  const update = useCallback((changes = {}) => {
    if (!uid) return;
    setAttempt(current => {
      if (!current) return current;
      const next = { ...current, ...changes, ownerUid: uid };
      try { localStorage.setItem(keyFor(uid), JSON.stringify(next)); } catch { /* best effort */ }
      return next;
    });
  }, [uid]);
  const clear = useCallback(() => {
    const key = keyFor(uid);
    try { if (key) localStorage.removeItem(key); } catch { /* best-effort */ }
    setAttempt(null);
  }, [uid]);
  return { attempt, put, update, clear };
}
