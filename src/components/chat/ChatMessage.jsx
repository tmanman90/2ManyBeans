import { ExternalLink } from 'lucide-react';
import { C, radius, shadows, type as typeScale } from '../../styles/theme';
import { RecipeCard } from './RecipeCard';

export function ChatMessage({ msg, recipeActions, onRetryErrored }) {
  const sources = msg.role === 'assistant' && Array.isArray(msg.sources) ? msg.sources.slice(0, 3) : [];

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
          <img src="/images/ruphus-avatar.png" alt="Professor Ruphus" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', border: `1px solid ${C.borderLight}`, flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }} />
        )}
        <div
          onClick={msg.errored ? () => onRetryErrored?.(msg) : undefined}
          role={msg.errored ? 'button' : undefined}
          tabIndex={msg.errored ? 0 : undefined}
          data-chat-errored={msg.errored ? 'true' : undefined}
          style={{
            maxWidth: '82%',
            background: msg.role === 'user' ? C.accent : C.cream,
            color: msg.role === 'user' ? C.cream : C.text,
            borderRadius: msg.role === 'user'
              ? `${radius.lg}px ${radius.lg}px ${radius.sm}px ${radius.lg}px`
              : `${radius.lg}px ${radius.lg}px ${radius.lg}px ${radius.sm}px`,
            padding: '12px 16px',
            ...typeScale.bodyL,
            border: msg.role === 'user' ? 'none' : `1px solid ${msg.errored ? C.accentSoft : C.hairline}`,
            boxShadow: msg.role === 'user' ? shadows.button : shadows.e1,
            whiteSpace: 'pre-wrap',
            lineHeight: 1.55,
            cursor: msg.errored ? 'pointer' : undefined,
            minHeight: msg.errored ? 44 : undefined,
          }}
        >
          {msg.content}
          {msg.errored && (
            <div style={{ ...typeScale.caption, color: C.textMuted, marginTop: 8, lineHeight: 1.3 }}>
              Didn't finish — tap to retry
            </div>
          )}
          {msg.disclaimer && !msg.errored && (
            <div style={{ ...typeScale.caption, color: C.textMuted, marginTop: 8, lineHeight: 1.3 }}>
              {msg.disclaimer}
            </div>
          )}
        </div>
      </div>
      {sources.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginLeft: 38 }}>
          <div
            data-chat-sources="true"
            style={{
              width: '82%',
              borderTop: `1px solid ${C.hairline}`,
              marginTop: 4,
            }}
          >
            {sources.map((source, idx) => (
              <button
                key={`${source.uri}-${idx}`}
                type="button"
                onClick={() => window.open(source.uri, '_blank')}
                style={{
                  width: '100%',
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: idx < sources.length - 1 ? `1px solid ${C.hairline}` : 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{
                  ...typeScale.caption,
                  color: C.textMuted,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  minWidth: 0,
                }}>
                  {source.title || source.uri}
                </span>
                <ExternalLink size={12} color={C.accent} style={{ flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>
      )}
      {msg.role === 'assistant' && msg.recipeCard && (
        <RecipeCard
          recipe={msg.recipeCard}
          brewBean={recipeActions?.getBrewBean?.(msg.recipeCard)}
          saveBean={recipeActions?.getSaveBean?.(msg.recipeCard)}
          onBrew={recipeActions?.onBrew}
          onSave={recipeActions?.onSave}
          saving={recipeActions?.savingKey === msg.recipeCard.title}
          brewing={recipeActions?.brewing}
        />
      )}
    </>
  );
}
