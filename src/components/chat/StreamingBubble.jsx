import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { C, radius, shadows, type as typeScale } from '../../styles/theme';
import { holdBackScan } from '../../lib/streamChat';
import { stripMarkdown } from '../../lib/textFormat';

export const StreamingBubble = forwardRef(function StreamingBubble({ onFlush }, ref) {
  const textRef = useRef('');
  const rafRef = useRef(0);
  const [display, setDisplay] = useState('');

  const flush = useCallback(() => {
    rafRef.current = 0;
    const next = stripMarkdown(holdBackScan(textRef.current).display);
    setDisplay(next);
    onFlush?.();
  }, [onFlush]);

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(flush);
  }, [flush]);

  useImperativeHandle(ref, () => ({
    append(delta) {
      textRef.current += delta || '';
      schedule();
    },
    getText() {
      return textRef.current;
    },
  }), [schedule]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      className="chat-bubble-in"
      data-streaming-bubble="true"
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: 'flex-start' }}
    >
      <img
        src="/images/ruphus-avatar.png"
        alt="Professor Ruphus"
        style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', border: `1px solid ${C.borderLight}`, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}
      />
      <div
        className="chat-streaming-text"
        style={{
          maxWidth: '82%',
          background: C.cream,
          color: C.text,
          borderRadius: `${radius.lg}px ${radius.lg}px ${radius.lg}px ${radius.sm}px`,
          padding: '12px 16px',
          ...typeScale.bodyL,
          border: `1px solid ${C.hairline}`,
          boxShadow: shadows.e1,
          whiteSpace: 'pre-wrap',
          lineHeight: 1.55,
          '--chat-caret-color': C.accent,
        }}
      >
        {display}
      </div>
    </div>
  );
});
