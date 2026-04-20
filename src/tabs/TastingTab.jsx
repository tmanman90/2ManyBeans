// Tasting tab — ported from prototype lines 500-789
// 3 modes: list, form, chat
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, Plus, Check, Send, Pencil, Trash2, Share2 } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { today } from '../lib/peakStatus';
import { buildTastingSystemPrompt, sendTastingMessage } from '../lib/claude';
import { convertTastingScores } from '../lib/professorRuphus';
import { StarRating } from '../components/StarRating';
import { Btn } from '../components/Btn';
import { Toast } from '../components/Toast';
import { scrollOnFocus } from '../lib/formHelpers';
import { useNativeKeyboard } from '../hooks/useNativeKeyboard';
import { useErrorToast } from '../hooks/useErrorToast';
import { TastingForm } from '../components/TastingForm';
import { Modal } from '../components/Modal';
import { TastingShareCard, captureShareCard, offScreenStyle } from '../components/ShareCard';
import { shareImage } from '../lib/share';
import { stripMarkdown } from '../lib/textFormat';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { FREE_LIMITS } from '../lib/subscriptionConfig';
import { TASTING_GLOSSARY, parseTermMarkers, autoLinkTerms, scanScorecard, parseStepMarker, STEP_KEY_TO_INDEX } from '../lib/tastingGlossary';

// Six-step tasting spine shown in the coach header.
const TASTING_STEPS = ['Smell', 'First Sip', 'Acidity', 'Sweetness', 'Body', 'Finish'];

// ─────────────────────────────────────────────────────────────
// List-mode helpers (added for redesign)
// ─────────────────────────────────────────────────────────────

// "Today" / "Yesterday" / "3 days ago" / "Apr 12" — gentler than raw ISO
// in the tasting journal card header.
const formatDateRelative = (iso) => {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  const now = new Date();
  const days = Math.round((now - d) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Split a free-form aroma string on commas / slashes / middots and render as
// up to 3 italic pill chips. Returns null for empty input.
const AromaChips = ({ aroma }) => {
  if (!aroma) return null;
  const parts = String(aroma).split(/[,·/]/).map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (parts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
      {parts.map((p, i) => (
        <span key={i} style={{
          fontSize: 10.5, color: C.textMuted, fontStyle: 'italic',
          background: C.bg, border: `1px solid ${C.border}`,
          padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
          fontFamily: fonts.body,
        }}>{p}</span>
      ))}
    </div>
  );
};

// Drag-down-to-dismiss handle for bottom sheets. Tap also closes. Touch
// handlers are scoped to the handle so the sheet's inner scroll container
// isn't hijacked when the user scrolls content.
const SwipeDownHandle = ({ onClose }) => {
  const startY = useRef(null);
  const [dy, setDy] = useState(0);
  return (
    <div
      onClick={onClose}
      onTouchStart={e => { startY.current = e.touches[0].clientY; setDy(0); }}
      onTouchMove={e => {
        if (startY.current == null) return;
        const delta = e.touches[0].clientY - startY.current;
        if (delta > 0) setDy(Math.min(delta, 200));
      }}
      onTouchEnd={() => {
        if (dy > 70) onClose();
        else setDy(0);
        startY.current = null;
      }}
      style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '8px 0 6px', cursor: 'pointer',
        // Expand the hit area for easier grabbing without visually changing layout.
        touchAction: 'none',
      }}
    >
      <div style={{
        width: 40, height: 4, borderRadius: 2, background: '#D9CBB8',
        transform: dy ? `translateY(${dy * 0.25}px)` : 'none',
        transition: dy ? 'none' : 'transform 0.18s',
      }} />
    </div>
  );
};

// Map a step name to the scorecard axis it's exploring. "Smell" and "First
// Sip" both feed aroma — the rest map 1:1.
const STEP_TO_AXIS = {
  'Smell': 'aroma',
  'First Sip': 'aroma',
  'Acidity': 'acidity',
  'Sweetness': 'sweet',
  'Body': 'body',
  'Finish': 'finish',
};

// Render one Ruphus message body with {{term:key}} markers parsed into
// tappable underlined spans. Falls back to auto-linking known terms when
// Ruphus forgets the markers.
const RuphusContent = ({ text, onTerm }) => {
  const primary = parseTermMarkers(text);
  // If the parser found no terms, try the fallback auto-linker.
  const hasTerm = primary.some(p => p.type === 'term');
  const parts = hasTerm ? primary : autoLinkTerms(text);
  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'term') {
          return (
            <span
              key={i}
              onClick={() => onTerm(p.termKey)}
              style={{
                color: C.accent, fontWeight: 600, cursor: 'pointer',
                textDecoration: 'underline', textDecorationStyle: 'dotted',
                textDecorationColor: C.accent, textUnderlineOffset: '3px',
              }}
            >{p.text}</span>
          );
        }
        // stripMarkdown belt-and-suspenders in case Ruphus leaks ** or * despite prompt rules.
        return <span key={i}>{stripMarkdown(p.text)}</span>;
      })}
    </>
  );
};

const RuphusJournalCard = ({ step, stepName, content, onTerm }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.textMuted, textTransform: 'uppercase',
      marginBottom: 6, paddingLeft: 2,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: '50%', background: C.accent, color: C.cream,
        fontFamily: fonts.heading, fontSize: 11, fontWeight: 600, letterSpacing: 0,
      }}>{step}</span>
      Step {step} · {stepName}
    </div>
    <div style={{
      background: C.card, borderRadius: 12,
      border: `1px solid ${C.border}`, padding: '12px 14px',
      fontSize: 14, lineHeight: 1.55, color: C.text,
      boxShadow: '0 1px 2px rgba(92,61,46,0.04)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      <RuphusContent text={content} onTerm={onTerm} />
    </div>
  </div>
);

const UserHandwrittenBubble = ({ children }) => (
  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
    <div style={{
      maxWidth: '78%',
      background: '#EFE2CC', color: C.text,
      borderRadius: '14px 14px 2px 14px',
      padding: '10px 13px',
      fontFamily: fonts.title, fontSize: 18, lineHeight: 1.25,
      boxShadow: '0 1px 2px rgba(92,61,46,0.06)',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {children}
    </div>
  </div>
);

const RuphusTyping = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 8px', color: C.textMuted, fontSize: 12 }}>
    <span style={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>Ruphus is writing</span>
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 4, height: 4, borderRadius: '50%', background: C.textMuted,
            opacity: 0.7, animation: `tchat-dot 1.2s ${i * 0.15}s infinite ease-in-out`,
          }}
        />
      ))}
    </span>
    <style>{`@keyframes tchat-dot { 0%, 80%, 100% { opacity: 0.2 } 40% { opacity: 0.9 } }`}</style>
  </div>
);

const ScorecardPeekLine = ({ scorecard, stepName }) => {
  const axes = [
    { key: 'aroma', label: 'aroma' },
    { key: 'acidity', label: 'acidity' },
    { key: 'sweet', label: 'sweetness' },
    { key: 'body', label: 'body' },
    { key: 'finish', label: 'finish' },
  ];
  const activeKey = STEP_TO_AXIS[stepName];
  const filled = axes.filter(a => scorecard[a.key]);
  const active = axes.find(a => a.key === activeKey && !scorecard[a.key]);
  if (filled.length === 0 && !active) {
    return <span style={{ color: C.textLight }}>smell it first, then tap here to see the portrait build.</span>;
  }
  const bits = [];
  filled.slice(0, 2).forEach(a => {
    bits.push(
      <span key={a.key}>
        <span style={{ color: C.green }}>● </span>
        {a.label}: {scorecard[a.key]}
      </span>
    );
  });
  if (active) {
    bits.push(
      <span key={active.key} style={{ color: C.textLight }}>
        {active.label}: tasting now…
      </span>
    );
  }
  return (
    <>
      {bits.map((b, i) => (
        <span key={i}>
          {b}
          {i < bits.length - 1 && <span style={{ color: C.textLight }}> · </span>}
        </span>
      ))}
    </>
  );
};

const TeachSheet = ({ entry, onClose }) => (
  <div
    onClick={onClose}
    style={{
      // Fixed to viewport (not absolute) so the backdrop covers the bottom
      // tab bar too. zIndex > 100 beats the tab bar's stacking context.
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(59,36,23,0.35)',
      display: 'flex', alignItems: 'flex-end',
      animation: 'tchat-fade-in 180ms ease-out',
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%',
        background: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: `10px 18px calc(28px + env(safe-area-inset-bottom, 0px))`,
        boxShadow: '0 -8px 28px rgba(59,36,23,0.18)',
        animation: 'tchat-slide-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      }}
    >
      <SwipeDownHandle onClose={onClose} />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, marginTop: 4 }}>
        <img
          src="/images/ruphus-portrait.png"
          alt="Professor Ruphus"
          style={{
            width: 62, height: 72, borderRadius: 14,
            objectFit: 'cover', objectPosition: 'center top',
            background: C.cream, flexShrink: 0,
            border: `1px solid ${C.border}`,
            boxShadow: '0 2px 6px rgba(92,61,46,0.08)',
          }}
        />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: C.accent, textTransform: 'uppercase', marginBottom: 2 }}>
            Prof. Ruphus · Teach me
          </div>
          <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.text, lineHeight: 1.1, marginBottom: 4 }}>{entry.title}</div>
          <div style={{ fontFamily: fonts.title, fontSize: 18, color: C.accentDark, lineHeight: 1.2 }}>{entry.tagline}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: C.text, marginBottom: 14 }}>{entry.body}</div>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.textMuted, textTransform: 'uppercase', marginBottom: 8 }}>
        Try these words
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {(entry.examples || []).map(e => (
          <span
            key={e}
            style={{
              background: C.cream, border: `1px solid ${C.border}`, borderRadius: 999,
              padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.text,
            }}
          >{e}</span>
        ))}
      </div>
      <button
        onClick={onClose}
        style={{
          width: '100%', padding: 12, borderRadius: 14, border: 'none',
          background: 'linear-gradient(180deg, #BC8149 0%, #A66B38 100%)',
          color: C.cream, fontFamily: fonts.body, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 2px 6px rgba(92,61,46,0.18)',
        }}
      >Got it</button>
    </div>
  </div>
);

const CupSheet = ({ scorecard, currentStep, stepCount, bean, onClose }) => {
  const activeAxisKey = STEP_TO_AXIS[TASTING_STEPS[currentStep] || 'Finish'];
  const axes = [
    { key: 'aroma', label: 'Aroma' },
    { key: 'acidity', label: 'Acidity' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'body', label: 'Body' },
    { key: 'finish', label: 'Finish' },
  ].map(a => ({
    ...a,
    value: scorecard[a.key] ? 0.65 : 0,
    status: scorecard[a.key] || (a.key === activeAxisKey ? 'tasting now…' : '—'),
    color: scorecard[a.key] ? C.green : a.key === activeAxisKey ? C.accent : C.textLight,
    active: a.key === activeAxisKey && !scorecard[a.key],
  }));

  const cx = 110, cy = 110, r = 72, n = axes.length;
  const toXY = (i, val) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      x: cx + Math.cos(angle) * r * val,
      y: cy + Math.sin(angle) * r * val,
      lx: cx + Math.cos(angle) * (r + 20),
      ly: cy + Math.sin(angle) * (r + 20),
    };
  };
  const pts = axes.map((a, i) => toXY(i, Math.max(a.value, 0.02)));
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div
      onClick={onClose}
      style={{
        // Fixed to viewport so the backdrop covers the bottom tab bar too.
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(59,36,23,0.35)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'tchat-fade-in 180ms ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: C.card, borderTopLeftRadius: 22, borderTopRightRadius: 22,
          boxShadow: '0 -8px 28px rgba(59,36,23,0.18)',
          animation: 'tchat-slide-up 240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          maxHeight: 'min(80vh, 620px)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <SwipeDownHandle onClose={onClose} />
        <div style={{
          padding: `0 18px calc(24px + env(safe-area-inset-bottom, 0px))`,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          flex: 1,
        }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2, marginTop: 4 }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 22, color: C.text, lineHeight: 1.1 }}>Your cup so far</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.2, color: C.textMuted, textTransform: 'uppercase' }}>
            Step {Math.min(currentStep + 1, stepCount)} / {stepCount}
          </div>
        </div>
        <div style={{ fontFamily: fonts.title, fontSize: 17, color: C.accentDark, marginBottom: 10 }}>
          {bean?.name || 'your coffee'} · a portrait in progress
        </div>

        <svg width="100%" height="240" viewBox="0 0 220 220" style={{ display: 'block', margin: '0 auto 10px' }}>
          {[0.33, 0.66, 1].map((ff, i) => (
            <polygon
              key={i}
              points={axes.map((_, j) => {
                const { x, y } = toXY(j, ff);
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#EADFD0"
              strokeWidth="1"
              strokeDasharray={i === 2 ? 'none' : '2,3'}
            />
          ))}
          {axes.map((_, i) => {
            const { lx, ly } = toXY(i, 1);
            return (
              <line
                key={i}
                x1={cx} y1={cy}
                x2={lx - (lx - cx) * 0.15}
                y2={ly - (ly - cy) * 0.15}
                stroke="#EADFD0"
                strokeWidth="1"
              />
            );
          })}
          <polygon
            points={poly}
            fill="rgba(176,117,64,0.18)"
            stroke={C.accent}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          {pts.map((p, i) => axes[i].value > 0 ? (
            <circle key={i} cx={p.x} cy={p.y} r="4" fill={axes[i].color} stroke={C.card} strokeWidth="2" />
          ) : null)}
          {axes.map((a, i) => {
            const { lx, ly } = toXY(i, 1);
            const filled = a.value > 0;
            return (
              <text
                key={a.key}
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontFamily={fonts.body}
                fontSize="11"
                fontWeight={filled ? 700 : 500}
                fill={filled ? C.text : C.textLight}
              >{a.label}</text>
            );
          })}
        </svg>

        <div style={{ borderTop: `1px solid ${C.border}` }}>
          {axes.map(a => (
            <div
              key={a.key}
              style={{
                padding: '10px 0', borderBottom: `1px solid ${C.borderLight}`,
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: a.value > 0 ? a.color : '#E2D5C1', flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: a.value > 0 ? C.text : C.textLight }}>{a.label}</div>
                <div style={{
                  color: a.value > 0 ? C.textMuted : C.textLight,
                  fontFamily: a.active ? fonts.title : fonts.body,
                  fontSize: a.active ? 15 : 12,
                  fontStyle: a.active ? 'italic' : 'normal',
                  lineHeight: 1.2,
                }}>{a.status}</div>
              </div>
              {a.active && (
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: C.accent, textTransform: 'uppercase' }}>Now</span>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 14, padding: 12, borderRadius: 14, border: `1px solid ${C.border}`,
            background: C.cream, color: C.text, fontFamily: fonts.body, fontSize: 13, fontWeight: 700,
            cursor: 'pointer',
          }}
        >Keep tasting</button>
        </div>
      </div>
    </div>
  );
};

export const TastingTab = ({ beans, tastings, onAddTasting, onUpdateTasting, onDeleteTasting, pendingTastingBeanId, onPendingTastingConsumed }) => {
  const active = beans.filter(b => b.status === 'ACTIVE');
  const sealed = beans.filter(b => b.status === 'SEALED');
  // Tasting picker shows all non-finished beans. Active (in-jar) beans get
  // priority — they're listed first AND the dropdown defaults to one of them
  // — but a user with no jars filled can still pick a sealed bean to taste.
  const tastable = [...active, ...sealed];
  const [sel, setSel] = useState(active[0]?.id || sealed[0]?.id || '');
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();
  const { errorMsg, showError, hideError } = useErrorToast();
  // Background tasting score conversion for spider chart overlay
  const convertScoresInBackground = (tastingId, tastingData) => {
    const bean = beans.find(b => b.id === tastingData.beanId);
    if (!bean) return;
    // Only convert if there's meaningful text to convert
    const hasText = tastingData.aroma || tastingData.acidity || tastingData.sweetness ||
      tastingData.body || tastingData.firstSip || tastingData.finish;
    if (!hasText) return;
    convertTastingScores(tastingData, bean)
      .then(scores => { onUpdateTasting(tastingId, { tastingScores: scores }); })
      .catch(err => console.log('Score conversion skipped:', err.message));
  };
  const [mode, setMode] = useState('list');
  const [sortBy, setSortBy] = useState('date');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Chat tasting state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatExtracted, setChatExtracted] = useState(null);
  const chatScrollRef = useRef(null);
  const chatInputRef = useRef(null);

  // Coach UI state: teach-me sheet (glossary key) and expanded scorecard sheet.
  const [teachKey, setTeachKey] = useState(null);
  const [cupOpen, setCupOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  // Only track keyboard when we're in chat mode, so form/edit mode keyboards
  // don't hide the global tab bar unexpectedly. useNativeKeyboard centralizes
  // the listener and ref-counts tab-bar visibility across ChatTab/TastingTab.
  const keyboardHeight = useNativeKeyboard({ enabled: mode === 'chat' });

  // Scroll chat to bottom when the keyboard opens.
  useEffect(() => {
    if (keyboardHeight > 0 && chatScrollRef.current) {
      setTimeout(() => {
        const el = chatScrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      }, 50);
    }
  }, [keyboardHeight]);

  // Auto-grow the textarea as the user types. Caps at 5 lines then scrolls.
  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [chatInput]);

  const tastingFields = {
    aroma: 'Aroma', firstSip: 'First sip', acidity: 'Acidity', sweetness: 'Sweetness',
    body: 'Body', finish: 'Finish', oneWord: 'One-word score', notes: 'Notes', changeTomorrow: 'Change tomorrow?',
  };
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const getBeanName = (id) => {
    const b = beans.find(x => x.id === id);
    return b ? `${b.name} (${b.roaster})` : 'Unknown';
  };

  const handleFormSubmit = async (formData) => {
    const tastingData = { date: today(), ...formData };
    try {
      const tastingId = await onAddTasting(tastingData);
      if (tastingId) convertScoresInBackground(tastingId, tastingData);
      setMode('list');
    } catch (err) {
      showError("Couldn't save tasting. Check your connection and try again.");
    }
  };

  const sorted = [...tastings].sort((a, b) => {
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return b.date > a.date ? 1 : -1;
  });

  const updateRating = async (id, rating) => {
    try { await onUpdateTasting(id, { rating }); }
    catch { showError("Couldn't update rating. Check your connection."); }
  };

  const startEdit = (t) => { setEditingId(t.id); setEditForm({ ...t }); };
  const saveEdit = async () => {
    if (!editForm) return;
    const { id, createdAt, updatedAt, ...fields } = editForm;
    try {
      await onUpdateTasting(editingId, fields);
      setEditingId(null);
      setEditForm(null);
    } catch {
      showError("Couldn't save changes. Check your connection and try again.");
    }
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  // Build the tasting chat opening message for a given bean
  const buildOpeningMessage = (bean) => {
    const beanName = bean ? `${bean.name} (${bean.roaster})` : 'your coffee';
    const beanContext = bean ? [bean.process, bean.origin].filter(Boolean) : [];
    const contextLine = beanContext.length > 0
      ? ` This is a ${beanContext.join(' coffee from ')}.`
      : '';
    return `Let's taste ${beanName}!${contextLine}\n\nStep 1: Smell it first. Bring the cup to your nose and breathe in slowly. What do you get?\n\n- Fruity (berries, citrus, tropical)?\n- Floral (jasmine, rose, tea-like)?\n- Sweet (chocolate, caramel, honey)?\n- Nutty or earthy?\n- Funky or fermented?\n\nOr just describe it in your own words.`;
  };

  // Chat tasting flow
  const startChat = () => {
    // Free users get FREE_LIMITS.tasteTests lifetime tasting coach sessions.
    // Server enforces this atomically when the FIRST message is sent (the
    // sendTastingMessage call passes firstMessage:true to opt into metering).
    // This local check skips the round-trip and shows the paywall instantly.
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= FREE_LIMITS.tasteTests) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
      return;
    }
    const bean = beans.find(b => b.id === sel);
    setMode('chat');
    setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean), stepKey: 'smell' }]);
    setChatExtracted(null);
  };

  // Reset chat when bean changes mid-session
  useEffect(() => {
    if (mode === 'chat' && sel && chatMessages.length > 0) {
      const bean = beans.find(b => b.id === sel);
      setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean), stepKey: 'smell' }]);
      setChatExtracted(null);
    }
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only resets on selection change, not data changes

  // Cross-tab bridge: BrewTimer completion sets pendingTastingBeanId in App.
  // Here we consume it — pre-select the bean, open chat mode, and clear the
  // flag. The effect re-runs whenever beans updates, so if the pending bean
  // isn't in the list yet (e.g. a Firestore round-trip is pending), we keep
  // the flag set and retry on the next beans update. The paywall path still
  // clears the flag since that's a terminal outcome.
  useEffect(() => {
    if (!pendingTastingBeanId) return;
    const bean = beans.find(b => b.id === pendingTastingBeanId);
    if (!bean) {
      // Don't clear — wait for beans to include this id on a future render.
      return;
    }
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= FREE_LIMITS.tasteTests) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
      onPendingTastingConsumed?.();
      return;
    }
    setSel(pendingTastingBeanId);
    setMode('chat');
    setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean), stepKey: 'smell' }]);
    setChatExtracted(null);
    onPendingTastingConsumed?.();
  }, [pendingTastingBeanId, beans, hasPro, freeUsage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    // Bind this send to the bean that was selected at call time. If the user
    // switches the bean dropdown mid-flight, we drop the response instead of
    // appending it to the new bean's transcript.
    const beanIdAtSend = sel;
    const userMsg = { role: 'user', content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const selectedBean = beans.find(b => b.id === beanIdAtSend);
      const beanName = beanIdAtSend ? getBeanName(beanIdAtSend) : 'unknown bean';
      const systemPrompt = buildTastingSystemPrompt(beanName, beans, selectedBean, tastings);
      const history = [...chatMessages.filter(m => m.role !== 'system'), userMsg];
      // Only the FIRST user message in a session burns a free credit.
      // chatMessages starts with one assistant opening message, so the
      // first user turn means there's exactly 1 prior message in state.
      const isFirstUserMessage = chatMessages.length === 1;
      const text = await sendTastingMessage(systemPrompt, history, { firstMessage: isFirstUserMessage });

      // If the user switched beans while we were waiting, silently drop this
      // response. The new bean's opening message is already rendered by the
      // `sel` reset effect; appending here would splice two conversations.
      if (sel !== beanIdAtSend) {
        setChatLoading(false);
        return;
      }

      // Strip {{step:KEY}} at receive time and stash the parsed key on the
      // message object. Storing clean text keeps scanScorecard and RuphusContent
      // simple (they never see raw markers) and lets stepWalk read m.stepKey
      // directly without re-parsing every render.
      const appendAssistant = (rawText, fallback = "Couldn't reach the AI. Try again.") => {
        const { stepKey, strippedText } = parseStepMarker(rawText);
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: strippedText || fallback,
          stepKey,
        }]);
      };

      const extractMatch = text.match(/---EXTRACT---\s*([\s\S]*?)\s*---END---/);
      if (extractMatch) {
        try {
          const extracted = JSON.parse(extractMatch[1].trim());
          // Auto-match bean if AI extracted a beanName. We DON'T setSel here --
          // that would fire the "bean changed" reset effect and wipe the review
          // card. Instead, stash the matched id on `extracted` so saveChatTasting
          // can prefer it over `sel`.
          if (extracted.beanName) {
            // Strip quotes, trim, lowercase, and strip any trailing " by <roaster>" the model may have included.
            const cleaned = String(extracted.beanName)
              .replace(/["'"]/g, '')
              .replace(/\s+by\s+.+$/i, '')
              .trim()
              .toLowerCase();
            // Prefer name-only match; if multiple beans share a name, disambiguate by roaster substring.
            const candidates = beans.filter(b => (b.name || '').toLowerCase() === cleaned);
            let match = null;
            if (candidates.length === 1) {
              match = candidates[0];
            } else if (candidates.length > 1) {
              const roasterHint = String(extracted.beanName).toLowerCase();
              match = candidates.find(b => roasterHint.includes((b.roaster || '').toLowerCase())) || candidates[0];
            }
            if (match) extracted.matchedBeanId = match.id;
          }
          setChatExtracted(extracted);
          const cleanText = text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim();
          appendAssistant(cleanText, 'Great session! Review below and save when ready.');
        } catch {
          appendAssistant(text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim());
        }
      } else {
        appendAssistant(text);
      }
    } catch (err) {
      // Server-side quota race or subscription gate. Surface paywall instead
      // of a confusing "couldn't reach the AI" message. Drop the user message
      // since it never got a real response.
      if (err?.code === 'free_tier_exhausted') {
        setChatMessages(prev => prev.slice(0, -1));
        openPaywall({ feature: 'taste_cap', promote: 'pro' });
      } else if (err?.code === 'subscription_required') {
        setChatMessages(prev => prev.slice(0, -1));
        openPaywall({
          feature: 'generic',
          promote: err.tier === 'ultra' ? 'ultra' : 'pro',
        });
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: "Couldn't reach the AI. Try again." }]);
      }
    }
    setChatLoading(false);
  };

  const saveChatTasting = async () => {
    if (!chatExtracted || !sel) return;
    // Prefer a match the AI surfaced, but never send `matchedBeanId` to the db.
    const { matchedBeanId, ...extractedFields } = chatExtracted;
    const beanId = matchedBeanId || sel;
    const tastingData = { beanId, date: today(), ...extractedFields, rating: chatExtracted.rating || null };
    try {
      const tastingId = await onAddTasting(tastingData);
      if (tastingId) convertScoresInBackground(tastingId, tastingData);
      setChatExtracted(null);
      setChatMessages([]);
      setMode('list');
    } catch (err) {
      showError("Couldn't save tasting. Check your connection and try again.");
    }
  };

  // Share tasting state
  const [sharingId, setSharingId] = useState(null);
  const shareCardRef = useRef(null);
  const shareDataRef = useRef(null);

  const handleShareTasting = async (tasting) => {
    if (sharingId) return;
    const bean = beans.find(b => b.id === tasting.beanId);
    shareDataRef.current = { tasting, bean };
    setSharingId(tasting.id);
    // Wait for React to commit the off-screen card AND for the browser to
    // paint it. Double rAF is the minimum correct wait on iOS WKWebView:
    // first frame = commit, second frame = guaranteed-painted. The old 50ms
    // setTimeout sometimes fired before commit on slow devices, producing
    // blank share cards.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const dataUrl = await captureShareCard(shareCardRef);
      if (!dataUrl) return;
      const beanName = bean ? `${bean.name} by ${bean.roaster}` : 'my coffee';
      await shareImage(dataUrl, `My tasting of ${beanName} on 2manybeans`);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Share failed:', e);
    } finally {
      setSharingId(null);
      shareDataRef.current = null;
    }
  };

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  // Walk the message array in order. Two outputs:
  //   - perMessage: the step each assistant card should LABEL. Reflects
  //     literal marker value, so an explicit backstep (e.g. user asked to
  //     revisit smell) labels the card correctly. Clarifying messages with
  //     no marker inherit the prior card's label (step continuation).
  //   - maxIdx: the furthest step reached across the whole session. Drives
  //     the spine header, which stays monotonic -- backsteps don't regress
  //     the header, only the per-card label.
  //
  // Three session shapes handled:
  //   1. Fresh session (opener seeded with stepKey='smell'): markered mode
  //      from the start. Markers drive labels, inheritance fills the gaps.
  //   2. Legacy session with no markers (started before this fix): fall back
  //      to the old count-based heuristic per assistant message.
  //   3. Legacy session that transitions (first marker arrives mid-session):
  //      heuristic until the first marker, then latches into markered mode.
  const stepWalk = useMemo(() => {
    let maxIdx = 0;
    let lastCardIdx = 0;
    // null until we see the first assistant message, then latches sticky:
    // true = fresh/markered session, false = legacy. Legacy can flip to true
    // later when its first marker arrives.
    let sessionIsMarkered = null;
    let assistantSeen = 0;
    const perMessage = new Map();
    for (let i = 0; i < chatMessages.length; i++) {
      const m = chatMessages[i];
      if (m.role !== 'assistant') continue;
      const markerIdx = m.stepKey && STEP_KEY_TO_INDEX[m.stepKey] != null
        ? STEP_KEY_TO_INDEX[m.stepKey]
        : null;
      if (sessionIsMarkered === null) sessionIsMarkered = markerIdx !== null;
      let thisCardIdx;
      if (sessionIsMarkered) {
        // Markered mode -- explicit marker relabels (may backstep). No marker
        // means "continuation of prior step" -- inherit.
        thisCardIdx = markerIdx !== null ? markerIdx : lastCardIdx;
      } else {
        // Legacy mode. If a marker finally arrives, latch into markered mode.
        if (markerIdx !== null) {
          thisCardIdx = markerIdx;
          sessionIsMarkered = true;
        } else {
          thisCardIdx = Math.min(assistantSeen, TASTING_STEPS.length - 1);
        }
      }
      perMessage.set(i, thisCardIdx);
      lastCardIdx = thisCardIdx;
      if (thisCardIdx > maxIdx) maxIdx = thisCardIdx;
      assistantSeen++;
    }
    return { perMessage, maxIdx };
  }, [chatMessages]);

  const currentStep = chatExtracted ? TASTING_STEPS.length : stepWalk.maxIdx;
  const scorecard = scanScorecard(chatMessages);
  const selectedBean = beans.find(b => b.id === sel);

  const exitChat = () => {
    setMode('list');
    setChatMessages([]);
    setChatExtracted(null);
    setTeachKey(null);
    setCupOpen(false);
    setExitConfirmOpen(false);
  };

  const requestExitChat = () => {
    const hasProgress = chatMessages.length > 1 || !!chatExtracted;
    if (hasProgress) {
      setExitConfirmOpen(true);
    } else {
      exitChat();
    }
  };

  return (
    <div>
      {/* Header + list chrome hidden during chat takeover */}
      {mode !== 'chat' && (
        <>
          {/* REDESIGN: big serif title + caramel accent bar + Caveat kicker */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
            <div style={{ fontFamily: fonts.heading, fontSize: 32, color: C.text, fontWeight: 500, letterSpacing: -0.5 }}>
              Tasting
            </div>
            <div style={{ fontSize: 11, color: C.textLight, fontWeight: 600 }}>
              {tastings.length} cup{tastings.length !== 1 ? 's' : ''} logged
            </div>
          </div>
          <div style={{ width: 52, height: 2, background: C.accent, borderRadius: 1, marginBottom: 10 }} />
          <div style={{ fontFamily: fonts.title, fontSize: 18, color: C.accentDark, lineHeight: 1, marginBottom: 14 }}>
            learn what you taste
          </div>

          {/* Non-list modes (form) still need a Cancel affordance — surface
              it as a quiet link here since we no longer have header buttons. */}
          {mode === 'form' && (
            <div style={{ marginBottom: 10 }}>
              <Btn variant="ghost" onClick={() => setMode('list')}>Cancel</Btn>
            </div>
          )}

          {/* REDESIGN: guided-tasting invitation card (list mode only) */}
          {mode === 'list' && (() => {
            const onDeck = beans.find(b => b.id === sel) || active[0] || sealed[0] || null;
            const hasBeans = !!onDeck;
            return (
              <>
                <div data-tour="new-tasting" style={{
                  position: 'relative',
                  background: 'linear-gradient(145deg, #FFF8F0 0%, #F5E6D3 60%, #EDD8BF 100%)',
                  border: `1px solid ${C.border}`,
                  borderRadius: 20,
                  padding: '18px 18px 16px',
                  boxShadow: '0 2px 8px rgba(92,61,46,0.08)',
                  overflow: 'hidden',
                  marginBottom: 10,
                }}>
                  {/* Background bean motifs */}
                  <svg width="88" height="88" viewBox="0 0 24 24" style={{ position: 'absolute', right: -18, top: -18, opacity: 0.08 }}>
                    <ellipse cx="12" cy="12" rx="7" ry="9" fill={C.accentDark} transform="rotate(-20 12 12)" />
                    <path d="M9 5 Q12 12 15 19" stroke={C.cream} strokeWidth="1.2" fill="none" strokeLinecap="round" transform="rotate(-20 12 12)" />
                  </svg>
                  <svg width="60" height="60" viewBox="0 0 24 24" style={{ position: 'absolute', right: 48, bottom: -14, opacity: 0.06 }}>
                    <ellipse cx="12" cy="12" rx="7" ry="9" fill={C.accentDark} transform="rotate(35 12 12)" />
                    <path d="M9 5 Q12 12 15 19" stroke={C.cream} strokeWidth="1.2" fill="none" strokeLinecap="round" transform="rotate(35 12 12)" />
                  </svg>

                  {/* Ruphus intro strip */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, position: 'relative' }}>
                    <img
                      src="/images/ruphus-avatar.png"
                      alt="Professor Ruphus"
                      style={{
                        width: 44, height: 44, borderRadius: '50%',
                        objectFit: 'cover', objectPosition: 'center top',
                        border: `2px solid ${C.card}`,
                        boxShadow: `0 0 0 1px ${C.border}, 0 2px 6px rgba(92,61,46,0.18)`,
                        background: C.cream, flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: 1.3, textTransform: 'uppercase' }}>
                        Prof. Ruphus · your coach
                      </div>
                      <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text, lineHeight: 1.1, marginTop: 1 }}>
                        {hasBeans ? "Let's taste something together." : "Ready when you are."}
                      </div>
                    </div>
                  </div>

                  {/* On-deck bean chip — tappable to switch. Hidden <select>
                      overlays the whole chip for a native picker on mobile. */}
                  {hasBeans && (
                    <div style={{
                      background: 'rgba(255,248,240,0.7)',
                      border: `1px solid rgba(232,221,211,0.8)`,
                      borderRadius: 14, padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      marginBottom: 14, position: 'relative',
                      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                    }}>
                      {onDeck.photoUrl ? (
                        <img
                          src={onDeck.photoUrl}
                          alt={onDeck.name}
                          style={{
                            width: 36, height: 36, borderRadius: 10,
                            objectFit: 'cover',
                            boxShadow: '0 1px 3px rgba(92,61,46,0.18)',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: 10,
                          background: C.accent, color: C.cream,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontFamily: fonts.heading, fontSize: 15, fontWeight: 600,
                          boxShadow: '0 1px 3px rgba(92,61,46,0.18)',
                          flexShrink: 0,
                        }}>
                          {onDeck.jarSlot ? `#${onDeck.jarSlot}` : '•'}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1.2, color: C.textMuted, textTransform: 'uppercase' }}>
                          {onDeck.jarSlot ? `On deck · Jar ${onDeck.jarSlot}` : 'On deck · Sealed'}
                        </div>
                        <div style={{
                          fontFamily: fonts.heading, fontSize: 15, color: C.text, fontWeight: 500, lineHeight: 1.15,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1,
                        }}>{onDeck.name}</div>
                        <div style={{
                          fontSize: 11, color: C.textMuted,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {onDeck.roaster}{onDeck.origin ? ` · ${onDeck.origin}` : ''}
                        </div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textLight} strokeWidth="2" strokeLinecap="round">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      <select
                        value={sel}
                        onChange={e => setSel(e.target.value)}
                        aria-label="Pick bean to taste"
                        style={{
                          position: 'absolute', inset: 0, width: '100%', height: '100%',
                          opacity: 0, appearance: 'none', WebkitAppearance: 'none',
                          background: 'transparent', border: 'none', fontSize: 16,
                          color: 'transparent',
                        }}
                      >
                        {active.length > 0 && (
                          <optgroup label="In Jars">
                            {active.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.jarSlot})</option>)}
                          </optgroup>
                        )}
                        {sealed.length > 0 && (
                          <optgroup label="Sealed">
                            {sealed.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                          </optgroup>
                        )}
                      </select>
                    </div>
                  )}

                  {/* Big primary CTA */}
                  <button
                    onClick={hasBeans ? startChat : undefined}
                    disabled={!hasBeans}
                    style={{
                      width: '100%', border: 'none',
                      cursor: hasBeans ? 'pointer' : 'not-allowed',
                      background: hasBeans
                        ? 'linear-gradient(180deg, #BC8149 0%, #A66B38 100%)'
                        : C.cardMuted,
                      color: hasBeans ? C.cream : C.textLight,
                      padding: '14px 16px', borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 800, letterSpacing: 0.2,
                      boxShadow: hasBeans ? '0 3px 10px rgba(143,90,46,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
                    }}
                  >
                    <MessageCircle size={18} />
                    <span>{hasBeans ? 'Start guided tasting' : 'Add a bean to start'}</span>
                  </button>

                  {/* Promise row */}
                  <div style={{
                    marginTop: 10, display: 'flex', justifyContent: 'center', gap: 14,
                    fontSize: 10.5, color: C.textMuted, fontWeight: 600,
                  }}>
                    <span>6 steps</span>
                    <span style={{ color: C.textLight }}>·</span>
                    <span>~5 min</span>
                    <span style={{ color: C.textLight }}>·</span>
                    <span>auto-logs</span>
                  </div>
                </div>

                {/* Quiet "log manually" link */}
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <button
                    onClick={() => setMode('form')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: C.textMuted, fontSize: 12, fontWeight: 600,
                      fontFamily: fonts.body, textDecoration: 'underline',
                      textDecorationStyle: 'dotted', textUnderlineOffset: 3,
                      padding: '6px 12px',
                    }}
                  >or log a tasting manually</button>
                </div>

                {/* Journal divider — only when there are tastings below */}
                {tastings.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                  }}>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                    <div style={{ fontFamily: fonts.title, fontSize: 18, color: C.accentDark }}>
                      your journal
                    </div>
                    <div style={{ flex: 1, height: 1, background: C.border }} />
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Form Mode */}
      {mode === 'form' && (
        <TastingForm beans={tastable} onSubmit={handleFormSubmit} submitLabel="Save Tasting" />
      )}

      {/* Chat Mode — full-screen coach takeover.
          Portaled to document.body so position:fixed escapes the app-header's
          stacking context (content div has zIndex:1 which otherwise caps us
          below the sticky app-header at zIndex:10). */}
      {mode === 'chat' && createPortal((
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          // Sit flush above the bottom tab bar when the keyboard is closed
          // (tab bar is ~80px + safe-area-bottom). useNativeKeyboard hides the
          // tab bar while the keyboard is up, so we switch the reserved space
          // to the keyboard height instead.
          bottom: keyboardHeight > 0 ? keyboardHeight : `calc(80px + env(safe-area-inset-bottom, 0px))`,
          zIndex: 150,
          background: C.bg,
          display: 'flex', flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}>
          <style>{`
            @keyframes tchat-fade-in { from { opacity: 0 } to { opacity: 1 } }
            @keyframes tchat-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
          `}</style>

          {/* Bean header with Ruphus avatar + step spine */}
          <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Ruphus avatar — "your coach" */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src="/images/ruphus-avatar.png"
                  alt="Professor Ruphus"
                  style={{
                    width: 36, height: 36, borderRadius: '50%',
                    objectFit: 'cover', objectPosition: 'center top',
                    border: `2px solid ${C.card}`,
                    boxShadow: `0 0 0 1px ${C.border}, 0 1px 3px rgba(92,61,46,0.12)`,
                    background: C.cream,
                  }}
                />
                {/* Bean marker dot — signals the bean in play */}
                <div style={{
                  position: 'absolute', right: -3, bottom: -3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: C.cream, border: `1.5px solid ${C.card}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 1px 2px rgba(92,61,46,0.15)',
                }}>
                  <svg width="11" height="11" viewBox="0 0 24 24">
                    <ellipse cx="12" cy="12" rx="7" ry="9" fill="#5C3D2E" transform="rotate(-18 12 12)" />
                    <path d="M9 5 Q12 12 15 19" stroke="#FBF1DF" strokeWidth="1.6" fill="none" strokeLinecap="round" transform="rotate(-18 12 12)" />
                  </svg>
                </div>
              </div>

              {/* Bean name + hidden native select for switching */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Tasting with Ruphus{selectedBean?.jarSlot ? ` · Jar #${selectedBean.jarSlot}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <span style={{
                    fontFamily: fonts.heading, fontSize: 17, color: C.text, lineHeight: 1.1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{selectedBean ? selectedBean.name : 'Select a bean'}</span>
                  <span style={{ color: C.textMuted, fontSize: 13, flexShrink: 0 }}>⌄</span>
                </div>
                <select
                  value={sel}
                  onChange={e => setSel(e.target.value)}
                  aria-label="Select bean"
                  style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    opacity: 0, appearance: 'none', WebkitAppearance: 'none',
                    background: 'transparent', border: 'none', fontSize: 16,
                    color: 'transparent',
                  }}
                >
                  {active.length > 0 && (
                    <optgroup label="In Jars">
                      {active.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.jarSlot})</option>)}
                    </optgroup>
                  )}
                  {sealed.length > 0 && (
                    <optgroup label="Sealed">
                      {sealed.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>

              <button
                onClick={requestExitChat}
                style={{
                  background: 'transparent', border: 'none', color: C.accent,
                  fontFamily: fonts.body, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  padding: '8px 4px',
                }}
              >End</button>
            </div>

            {/* Step spine */}
            <div style={{ padding: '4px 14px 12px', display: 'flex', alignItems: 'center', gap: 0 }}>
              {TASTING_STEPS.map((s, i) => {
                const done = i < currentStep;
                const active = i === currentStep && !chatExtracted;
                return (
                  <div key={s} style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, minWidth: 0 }}>
                      <div style={{
                        width: active ? 9 : 7, height: active ? 9 : 7, borderRadius: '50%',
                        background: done || active ? C.accent : '#D9CBB8',
                        boxShadow: active ? `0 0 0 3px ${C.cream}` : 'none',
                        transition: 'all 0.2s',
                      }} />
                      <div style={{
                        fontSize: 9, fontWeight: active ? 700 : 500,
                        color: active ? C.text : done ? C.textMuted : C.textLight,
                        textAlign: 'center', lineHeight: 1, letterSpacing: 0.2,
                      }}>{s}</div>
                    </div>
                    {i < TASTING_STEPS.length - 1 && (
                      <div style={{
                        flex: 1, height: 1, marginTop: -14,
                        borderTop: done ? `1px solid ${C.accent}` : `1px dashed ${C.border}`,
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Conversation feed */}
          <div
            ref={chatScrollRef}
            style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 8px', WebkitOverflowScrolling: 'touch' }}
          >
            {chatMessages.map((m, i) => {
              if (m.role === 'user') return <UserHandwrittenBubble key={i}>{m.content}</UserHandwrittenBubble>;
              // Per-card step: monotonic walk handles fresh, legacy, and
              // transitioning sessions uniformly (see stepWalk comment above).
              const msgStepIdx = stepWalk.perMessage.get(i) ?? 0;
              const stepNum = msgStepIdx + 1;
              const stepName = TASTING_STEPS[msgStepIdx];
              return (
                <RuphusJournalCard
                  key={i}
                  step={stepNum}
                  stepName={stepName}
                  content={m.content}
                  onTerm={setTeachKey}
                />
              );
            })}
            {chatLoading && <RuphusTyping />}
            {chatExtracted && (
              <div style={{
                marginTop: 6, marginBottom: 14,
                background: C.greenBg, border: `1px solid #BFDDC4`,
                borderRadius: 14, padding: '12px 14px',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 }}>
                  Tasting captured — review & save
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <StarRating value={chatExtracted.rating || 0} onChange={r => setChatExtracted(p => ({ ...p, rating: r }))} size={22} />
                  {chatExtracted.oneWord && <span style={{ fontSize: 13, color: C.text }}>"{chatExtracted.oneWord}"</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
                  {chatExtracted.aroma && <span>Aroma: {chatExtracted.aroma}</span>}
                  {chatExtracted.acidity && <span>Acidity: {chatExtracted.acidity}</span>}
                  {chatExtracted.body && <span>Body: {chatExtracted.body}</span>}
                  {chatExtracted.finish && <span>Finish: {chatExtracted.finish}</span>}
                </div>
                {chatExtracted.notes && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{chatExtracted.notes}</div>}
                <Btn variant="primary" onClick={saveChatTasting} style={{ width: '100%', justifyContent: 'center' }}>
                  <Check size={14} /> Save Tasting
                </Btn>
              </div>
            )}
          </div>

          {/* Scorecard peek — hidden once the extract card owns the save flow */}
          {!chatExtracted && (
            <button
              onClick={() => setCupOpen(true)}
              style={{
                flexShrink: 0, width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                background: 'linear-gradient(180deg, #FBF1DF 0%, #F5E6D3 100%)',
                borderTop: `1px solid ${C.border}`,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10, fontFamily: fonts.body,
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: 8, background: C.card,
                border: `1px solid ${C.border}`, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M4 4 h12 l4 4 v12 a2 2 0 0 1 -2 2 h-14 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 z" stroke={C.accent} strokeWidth="1.5" fill="none" />
                  <path d="M16 4 v4 h4" stroke={C.accent} strokeWidth="1.5" fill="none" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: C.textMuted, letterSpacing: 1.2, textTransform: 'uppercase' }}>
                  Your cup so far — tap to expand
                </div>
                <div style={{
                  fontSize: 12, color: C.text, lineHeight: 1.2, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <ScorecardPeekLine scorecard={scorecard} stepName={TASTING_STEPS[currentStep] || 'Finish'} />
                </div>
              </div>
              <span style={{ color: C.accent, fontSize: 18, lineHeight: 1 }}>⌃</span>
            </button>
          )}

          {/* Input row — hidden when extract card takes over */}
          {!chatExtracted && (
            <div style={{
              flexShrink: 0,
              background: C.card, borderTop: `1px solid ${C.border}`,
              padding: `10px 12px calc(10px + env(safe-area-inset-bottom, 0px))`,
              display: 'flex', alignItems: 'flex-end', gap: 8,
            }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Describe what you taste..."
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                    chatInputRef.current?.blur();
                  }
                }}
                onFocus={scrollOnFocus}
                rows={1}
                enterKeyHint="send"
                style={{
                  flex: 1, minWidth: 0,
                  padding: '10px 16px', borderRadius: 22,
                  border: `1px solid ${C.border}`, fontFamily: fonts.body,
                  fontSize: 16, lineHeight: 1.4,
                  background: '#FAF6F1', color: C.text,
                  outline: 'none', boxSizing: 'border-box',
                  resize: 'none', overflowY: 'auto', maxHeight: 120,
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                aria-label="Send"
                style={{
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: 'linear-gradient(180deg, #BC8149 0%, #A66B38 100%)',
                  color: C.cream, cursor: 'pointer', flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(92,61,46,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <Send size={16} color={C.cream} />
              </button>
            </div>
          )}

          {/* Teach-me bottom sheet */}
          {teachKey && TASTING_GLOSSARY[teachKey] && (
            <TeachSheet entry={TASTING_GLOSSARY[teachKey]} onClose={() => setTeachKey(null)} />
          )}

          {/* Expanded scorecard sheet */}
          {cupOpen && (
            <CupSheet
              scorecard={scorecard}
              currentStep={currentStep}
              stepCount={TASTING_STEPS.length}
              bean={selectedBean}
              onClose={() => setCupOpen(false)}
            />
          )}
        </div>
      ), document.body)}

      {/* Sort Controls */}
      {mode === 'list' && tastings.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {[['date', 'Recent'], ['rating', 'Top rated']].map(([k, l]) => (
            <Btn key={k} variant={sortBy === k ? 'primary' : 'ghost'} onClick={() => setSortBy(k)} style={{ fontSize: 12, padding: '6px 14px' }}>
              {l}
            </Btn>
          ))}
        </div>
      )}

      {/* Tasting Cards */}
      {mode === 'list' && sorted.map(t => {
        const isEditing = editingId === t.id;

        if (isEditing && editForm) return (
          <div key={t.id} style={{ ...journalCard, border: `1px solid ${C.accent}`, borderLeft: `3px solid ${C.accent}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ flex: 1, marginRight: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 3 }}>Bean</label>
                <select value={editForm.beanId} onChange={e => setEditForm(p => ({ ...p, beanId: e.target.value }))} style={inputStyle}>
                  {beans.map(b => <option key={b.id} value={b.id}>{b.name} ({b.roaster})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, paddingTop: 16 }}>
                <Btn variant="primary" onClick={saveEdit} style={{ fontSize: 11, padding: '4px 10px' }}><Check size={12} /> Save</Btn>
                <Btn variant="ghost" onClick={cancelEdit} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</Btn>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>Rating</label>
              <StarRating value={editForm.rating || 0} onChange={r => setEditForm(p => ({ ...p, rating: r }))} size={26} />
            </div>
            {Object.entries(tastingFields).map(([key, label]) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 3 }}>{label}</label>
                {key === 'notes' ? (
                  <textarea value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                ) : (
                  <input value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
                )}
              </div>
            ))}
          </div>
        );

        return (
          <div key={t.id} style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.accentLight}`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 10,
            boxShadow: '0 1px 2px rgba(92,61,46,0.04)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: 6 }}>
                {(() => {
                  const b = beans.find(x => x.id === t.beanId);
                  return (
                    <>
                      <div style={{
                        fontSize: 9.5, fontWeight: 800, letterSpacing: 1.3,
                        color: C.textMuted, textTransform: 'uppercase', marginBottom: 2,
                      }}>{b?.roaster || 'Unknown roaster'}</div>
                      <div style={{
                        fontFamily: fonts.heading, fontSize: 16, color: C.text, fontWeight: 500, lineHeight: 1.2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{b?.name || 'Unknown bean'}</div>
                    </>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 10.5, color: C.textLight, fontWeight: 600, marginRight: 2 }}>
                  {formatDateRelative(t.date)}
                </span>
                <span onClick={() => handleShareTasting(t)} style={{ cursor: 'pointer', color: C.accent, padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: sharingId === t.id ? 0.5 : 1 }}>
                  <Share2 size={14} />
                </span>
                <span onClick={() => startEdit(t)} style={{ cursor: 'pointer', color: C.textMuted, padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pencil size={14} />
                </span>
                <span onClick={async () => { if (confirm('Delete this tasting?')) try { await onDeleteTasting(t.id); } catch { showError("Couldn't delete. Check your connection."); } }} style={{ cursor: 'pointer', color: C.red, padding: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </span>
              </div>
            </div>

            {/* Rating + Caveat one-word impression */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: t.aroma || t.notes ? 6 : 0 }}>
              <StarRating value={t.rating || 0} onChange={r => updateRating(t.id, r)} size={18} />
              {t.oneWord && (
                <span style={{
                  fontFamily: fonts.title, fontSize: 18, color: C.accentDark,
                  lineHeight: 1, letterSpacing: 0.2,
                }}>"{t.oneWord}"</span>
              )}
            </div>

            {/* Aroma notes as chips */}
            <AromaChips aroma={t.aroma} />

            {/* Italic free notes */}
            {t.notes && (
              <div style={{
                fontSize: 12.5, color: C.textMuted, lineHeight: 1.5,
                marginTop: 8, fontStyle: 'italic',
              }}>{t.notes}</div>
            )}

            {/* Secondary axes row — kept for info parity with today */}
            {(t.acidity || t.body || t.finish) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 6, fontSize: 11, color: C.textLight }}>
                {t.acidity && <span>Acidity: {t.acidity}</span>}
                {t.body && <span>Body: {t.body}</span>}
                {t.finish && <span>Finish: {t.finish}</span>}
              </div>
            )}
          </div>
        );
      })}

      {mode === 'list' && tastings.length > 0 && (
        <div style={{
          textAlign: 'center', padding: '10px 0 6px',
          fontFamily: fonts.title, fontSize: 16, color: C.textLight,
        }}>— the more you taste, the more you taste —</div>
      )}

      {mode === 'list' && tastings.length === 0 && (
        <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>No tastings yet. Brew something!</div>
      )}

      {/* Off-screen share card for capture */}
      {sharingId && shareDataRef.current && (
        <div style={offScreenStyle}>
          <TastingShareCard
            ref={shareCardRef}
            bean={shareDataRef.current.bean}
            tasting={shareDataRef.current.tasting}
          />
        </div>
      )}

      <Toast message={errorMsg} open={!!errorMsg} onClose={hideError} variant="error" />

      <Modal open={exitConfirmOpen} onClose={() => setExitConfirmOpen(false)} title="Discard tasting?" centered>
        <div>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 16, lineHeight: 1.5 }}>
            Ending now will discard this tasting conversation. You&apos;ll lose any notes you&apos;ve shared so far.
          </div>
          <Btn variant="danger" onClick={exitChat} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
            Discard &amp; Exit
          </Btn>
          <Btn variant="ghost" onClick={() => setExitConfirmOpen(false)} style={{ width: '100%', justifyContent: 'center' }}>
            Keep Tasting
          </Btn>
        </div>
      </Modal>
    </div>
  );
};
