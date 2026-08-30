import { useEffect, useRef, useState } from 'react';
import { ruphusCaption } from '../../lib/ruphus/captions';

const CAPTION_INTERVAL_MS = 2000;

export function RuphusLifecycleCaption({ frame }) {
  const [caption, setCaption] = useState(() => ruphusCaption(frame));
  const lastShownAt = useRef(0);
  useEffect(() => {
    const next = ruphusCaption(frame);
    const now = Date.now();
    const delay = lastShownAt.current ? CAPTION_INTERVAL_MS - (now - lastShownAt.current) : 0;
    if (delay <= 0) {
      lastShownAt.current = now;
      setCaption(next);
      return undefined;
    }
    const timer = setTimeout(() => {
      lastShownAt.current = Date.now();
      setCaption(next);
    }, delay);
    return () => clearTimeout(timer);
  }, [frame]);
  return <div role="status" data-ruphus-lifecycle-caption="true">{caption}</div>;
}
