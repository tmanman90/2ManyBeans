import { C, radius, shadows, type as typeScale } from '../../styles/theme';

export function ChatMessage({ msg }) {
  return (
    <>
      {msg.photos && msg.photos.length > 0 && (
        <div style={{
          display: 'flex',
          gap: 6,
          marginBottom: 5,
          justifyContent: 'flex-end',
        }}>
          {msg.photos.map((url, pi) => (
            <img
              key={`${url}-${pi}`}
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
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
        {msg.role === 'assistant' && (
          <img src="/images/ruphus-avatar.png" alt="Ruphus" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', border: `1px solid ${C.borderLight}`, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }} />
        )}
        <div
          style={{
            maxWidth: '82%',
            background: msg.role === 'user' ? C.accent : C.cream,
            color: msg.role === 'user' ? C.cream : C.text,
            borderRadius: msg.role === 'user'
              ? `${radius.lg}px ${radius.lg}px ${radius.sm}px ${radius.lg}px`
              : `${radius.lg}px ${radius.lg}px ${radius.lg}px ${radius.sm}px`,
            padding: '12px 16px',
            ...typeScale.bodyL,
            border: msg.role === 'user' ? 'none' : `1px solid ${C.hairline}`,
            boxShadow: msg.role === 'user' ? shadows.button : shadows.e1,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.55,
          }}
        >
          {msg.content}
        </div>
      </div>
    </>
  );
}
