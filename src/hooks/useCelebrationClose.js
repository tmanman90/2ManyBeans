import { useCallback, useEffect, useRef } from 'react';
import { celebrationCloseAt } from '../lib/celebrationTiming';

// Closes a celebration sheet on its clip's clock: `afterPlayMs` after the clip
// starts playing, and never later than `maxMs` after the sheet opened, so a
// slow or failed clip cannot leave it stuck. Each opening gets its own clock,
// created when `active` turns true and thrown away when it turns false, so a
// reopened sheet never inherits the last one's timer. Returns the clip's
// onPlay handler.
export function useCelebrationClose({ active, afterPlayMs, maxMs, onDone }) {
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; });
  const sessionRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;
    const session = { shownAt: Date.now(), playedAt: null, timer: null };
    session.arm = () => {
      clearTimeout(session.timer);
      const delay = Math.max(0, celebrationCloseAt(session, { afterPlayMs, maxMs }) - Date.now());
      session.timer = setTimeout(() => onDoneRef.current(), delay);
    };
    sessionRef.current = session;
    session.arm();
    return () => {
      clearTimeout(session.timer);
      if (sessionRef.current === session) sessionRef.current = null;
    };
  }, [active, afterPlayMs, maxMs]);

  return useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.playedAt !== null) return;
    session.playedAt = Date.now();
    session.arm();
  }, []);
}
