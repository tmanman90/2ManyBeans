// Tasting tab — ported from prototype lines 500-789
// 3 modes: list, form, chat
import { useState, useEffect, useRef, useMemo } from 'react';
import { assetUrl } from "../lib/assetUrl";
import { createPortal } from 'react-dom';
import { MessageCircle, Plus, Check, Send, Pencil, Trash2, Share2, ChevronRight } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass, cardBase, motion } from '../styles/theme';
import { m, listContainer, listItem, fadeUp } from '../lib/motion';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { TasteFingerprint } from '../components/TasteFingerprint';
import { TastingDetailCard } from '../components/TastingDetailCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { haptic } from '../lib/haptics';
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
import { TastingWizard } from '../components/tasting/TastingWizard';
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

import { SwipeDownHandle } from '../components/SwipeDownHandle';

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
      ...type.label, color: C.textMuted,
      marginBottom: 6, paddingLeft: 2,
    }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 18, height: 18, borderRadius: radius.pill, background: C.accent, color: C.cream,
        fontFamily: fonts.heading, fontSize: 11, fontWeight: 600, letterSpacing: 0,
      }}>{step}</span>
      Step {step} · {stepName}
    </div>
    <div style={{
      ...cardBase, padding: '14px 16px',
      fontSize: 14, lineHeight: 1.55, color: C.text,
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
      background: C.accentSoft, color: C.text,
      border: `1px solid ${C.accentLight}`,
      borderRadius: '18px 18px 4px 18px',
      padding: '10px 13px',
      fontFamily: fonts.title, fontSize: 18, lineHeight: 1.25,
      boxShadow: shadows.e1,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {children}
    </div>
  </div>
);

const RuphusTyping = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 2px 8px', color: C.textMuted, fontSize: 12 }}>
    <span style={{ fontWeight: 600, fontStyle: 'italic', color: C.textLight }}>Ruphus is tasting</span>
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
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: C.green, marginRight: 5, verticalAlign: 'middle' }} />
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
      background: glass.scrim,
      display: 'flex', alignItems: 'flex-end',
      animation: 'tchat-fade-in 180ms ease-out',
    }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%',
        background: glass.sheet, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
        padding: `10px 18px calc(28px + env(safe-area-inset-bottom, 0px))`,
        boxShadow: shadows.modal,
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
          <div style={{ ...type.label, color: C.accent, marginBottom: 2 }}>
            Prof. Ruphus · Teach me
          </div>
          <div style={{ ...type.h2, color: C.text, marginBottom: 4 }}>{entry.title}</div>
          <div style={{ fontFamily: fonts.title, fontSize: 17, color: C.accentDark, lineHeight: 1.2 }}>{entry.tagline}</div>
        </div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: C.text, marginBottom: 14 }}>{entry.body}</div>
      <div style={{ ...type.label, color: C.textMuted, marginBottom: 8 }}>
        Try these words
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {(entry.examples || []).map(e => (
          <span
            key={e}
            style={{
              background: C.accentSoft, border: `1px solid ${C.hairline}`, borderRadius: radius.pill,
              padding: '6px 12px', fontSize: 12, fontWeight: 600, color: C.text, fontFamily: fonts.body,
            }}
          >{e}</span>
        ))}
      </div>
      <button
        onClick={onClose}
        style={{
          width: '100%', padding: 12, borderRadius: radius.md, border: 'none',
          background: C.accent,
          color: C.cream, fontFamily: fonts.body, fontSize: 14, fontWeight: 700,
          cursor: 'pointer', boxShadow: shadows.button,
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
        background: 'rgba(42,26,16,0.32)',
        display: 'flex', alignItems: 'flex-end',
        animation: 'tchat-fade-in 180ms ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          background: glass.sheet, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
          boxShadow: shadows.modal,
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
          <div style={{ ...type.h2, color: C.text }}>Your cup so far</div>
          <div style={{ ...type.label, color: C.textMuted }}>
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
                <span style={{ ...type.caption, color: C.accent, background: C.accentSoft, borderRadius: radius.pill, padding: '2px 7px' }}>Now</span>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: 14, padding: 12, borderRadius: radius.md, border: `1px solid ${C.hairline}`,
            background: C.card, color: C.text, fontFamily: fonts.body, fontSize: 14, fontWeight: 700,
            cursor: 'pointer',
          }}
        >Keep tasting</button>
        </div>
      </div>
    </div>
  );
};

export const TastingTab = ({ beans, tastings, onAddTasting, onUpdateTasting, onDeleteTasting, pendingTastingBeanId, onPendingTastingConsumed, isDemo, onDemoAction }) => {
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
  const reduceMotion = useReducedMotion();
  const [detailTasting, setDetailTasting] = useState(null);
  const [mode, setMode] = useState('list');
  const [sortBy, setSortBy] = useState('date');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  // Intelligent tasting wizard — the guided-tasting experience (replaces the chat takeover).
  const [wizardOpen, setWizardOpen] = useState(false);

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
    if (isDemo) { onDemoAction?.(); return; }
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= FREE_LIMITS.tasteTests) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
      return;
    }
    haptic.medium();
    const bean = beans.find(b => b.id === sel);
    setMode('chat');
    setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean), stepKey: 'smell' }]);
    setChatExtracted(null);
  };

  // Open the intelligent tasting wizard (same demo + free-tier gate as the old chat entry).
  const startWizard = () => {
    if (isDemo) { onDemoAction?.(); return; }
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= FREE_LIMITS.tasteTests) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
      return;
    }
    haptic.medium();
    setWizardOpen(true);
  };

  // Wizard saved a tasting — it already wrote tastingScores directly (real fingerprint), so we
  // persist as-is without the background LLM score conversion that the manual/chat paths use.
  const saveWizardTasting = async (record) => {
    try {
      await onAddTasting(record);
      setWizardOpen(false);
      setMode('list');
    } catch (err) {
      showError("Couldn't save tasting. Check your connection and try again.");
    }
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
    if (isDemo) { onDemoAction?.(); return; }
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

  const wizardBean = beans.find(b => b.id === sel) || active[0] || sealed[0] || null;

  return (
    <div>
      {/* Intelligent tasting wizard — full-screen overlay (portals to body) */}
      {wizardOpen && wizardBean && (
        <TastingWizard
          bean={wizardBean}
          beans={beans}
          tastings={tastings}
          isPro={hasPro}
          reduce={reduceMotion}
          onSave={saveWizardTasting}
          onClose={() => setWizardOpen(false)}
          onSwitchToManual={() => { setWizardOpen(false); setMode('form'); }}
        />
      )}

      {/* Header + list chrome hidden during chat takeover */}
      {mode !== 'chat' && (
        <>
          {/* Masthead — calm editorial: Fraunces title + a single tabular-nums stat line. */}
          <div data-masthead style={{ marginBottom: 16 }}>
            <div style={{ ...type.display, color: C.text }}>Tasting</div>
            {tastings.length > 0 && (() => {
              const beanCount = new Set(tastings.map(t => t.beanId)).size;
              return (
                <div style={{ ...type.body, color: C.textMuted, marginTop: 7, fontVariantNumeric: 'tabular-nums lining-nums' }}>
                  <strong style={{ color: C.text, fontWeight: 700 }}>{tastings.length}</strong> {tastings.length === 1 ? 'cup' : 'cups'} logged
                  <span style={{ color: C.textLight, margin: '0 7px' }}>·</span>
                  <strong style={{ color: C.text, fontWeight: 700 }}>{beanCount}</strong> {beanCount === 1 ? 'bean' : 'beans'}
                </div>
              );
            })()}
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
                  background: C.card,
                  border: `1px solid ${C.borderLight}`,
                  borderRadius: radius.xl,
                  padding: '20px 20px 18px',
                  boxShadow: shadows.e2,
                  marginBottom: 16,
                }}>
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
                      <div style={{ ...type.label, color: C.accent }}>
                        Prof. Ruphus · your coach
                      </div>
                      <div style={{ fontFamily: fonts.heading, fontSize: 19, color: C.text, lineHeight: 1.2, marginTop: 1 }}>
                        {hasBeans ? 'Taste a coffee, step by step.' : 'Add a bean to start tasting.'}
                      </div>
                    </div>
                  </div>

                  {/* On-deck bean chip — tappable to switch. Hidden <select>
                      overlays the whole chip for a native picker on mobile. */}
                  {hasBeans && (
                    <div style={{
                      background: C.cream,
                      border: `1px solid ${C.borderLight}`,
                      borderRadius: radius.md, padding: '11px 13px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      marginBottom: 14, position: 'relative',
                      boxShadow: shadows.e1,
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

                  {/* Big primary CTA — Liquid Glass (iOS 26): tinted-glass body + specular rim
                      sheen + inner glow + floating shadow; press scales + brightens + springs. */}
                  <m.button
                    onClick={hasBeans ? startWizard : undefined}
                    disabled={!hasBeans}
                    whileTap={reduceMotion || !hasBeans ? undefined : { scale: 0.975, filter: 'brightness(1.08)' }}
                    transition={motion.spring.snappy}
                    style={{
                      position: 'relative', overflow: 'hidden', isolation: 'isolate', width: '100%',
                      border: hasBeans ? '1px solid rgba(255,255,255,0.30)' : `1px solid ${C.border}`,
                      cursor: hasBeans ? 'pointer' : 'not-allowed',
                      background: hasBeans
                        ? 'linear-gradient(176deg, rgba(184,120,70,0.96) 0%, rgba(150,90,48,0.97) 45%, rgba(120,72,40,0.98) 100%)'
                        : C.cardMuted,
                      WebkitBackdropFilter: 'blur(14px) saturate(170%)', backdropFilter: 'blur(14px) saturate(170%)',
                      color: hasBeans ? '#FFF7EE' : C.textLight,
                      padding: '15px 16px 15px 15px', borderRadius: radius.lg,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      fontFamily: fonts.body, fontSize: 15, fontWeight: 700, letterSpacing: '0.01em',
                      textShadow: hasBeans ? '0 1px 2px rgba(40,20,8,0.30)' : 'none',
                      boxShadow: hasBeans
                        ? 'inset 0 1px 0 rgba(255,255,255,0.52), inset 0 -2px 7px rgba(40,20,8,0.30), 0 1px 2px rgba(70,41,26,0.20), 0 12px 30px rgba(120,70,34,0.36)'
                        : 'none',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {hasBeans && <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '52%', borderRadius: 'inherit', background: 'linear-gradient(180deg, rgba(255,255,255,0.36) 0%, rgba(255,255,255,0.04) 100%)', pointerEvents: 'none', zIndex: 0 }} />}
                    {hasBeans && <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', background: 'radial-gradient(130% 90% at 16% -10%, rgba(255,238,214,0.24), transparent 58%)', pointerEvents: 'none', zIndex: 0 }} />}
                    <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: hasBeans ? 'rgba(255,255,255,0.20)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MessageCircle size={16} />
                      </span>
                      <span>{hasBeans ? 'Start guided tasting' : 'Add a bean to start'}</span>
                    </span>
                    {hasBeans && <ChevronRight size={20} style={{ position: 'relative', zIndex: 1, opacity: 0.85 }} />}
                  </m.button>

                  {/* Quiet scaffolding line (no chrome) */}
                  <div style={{ marginTop: 10, textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: C.textLight, fontVariantNumeric: 'tabular-nums' }}>
                    Ruphus predicts · you taste · auto-logged to your journal
                  </div>
                </div>

                {/* Quiet "log manually" link */}
                <div style={{ textAlign: 'center', marginBottom: 18 }}>
                  <button
                    onClick={() => setMode('form')}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: C.accent, fontSize: 12, fontWeight: 600,
                      fontFamily: fonts.body, textDecoration: 'none',
                      textUnderlineOffset: 3,
                      padding: '8px 16px',
                    }}
                  >or log a tasting manually</button>
                </div>

                {/* Journal section header */}
                {tastings.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{ ...type.label, color: C.textMuted }}>Journal</div>
                    <div style={{ flex: 1, height: 1, background: C.hairline }} />
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
          <div style={{ background: glass.chrome, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur, borderBottom: `1px solid ${glass.chromeBorder}`, flexShrink: 0 }}>
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
                <div style={{ ...type.label, color: C.textMuted }}>
                  Tasting with Ruphus{selectedBean?.jarSlot ? ` · Jar #${selectedBean.jarSlot}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                  <span style={{
                    fontFamily: fonts.heading, fontSize: 17, color: C.text, lineHeight: 1.1,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{selectedBean ? selectedBean.name : 'Select a bean'}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textLight} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
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
                  background: 'transparent', border: 'none', color: C.red,
                  fontFamily: fonts.body, fontSize: 13, fontWeight: 700, cursor: 'pointer',
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
                        width: 8, height: 8, borderRadius: '50%',
                        background: done || active ? C.accent : '#D9CBB8',
                        boxShadow: active ? `0 0 0 2px ${C.bg}, 0 0 0 3.5px ${C.accent}` : 'none',
                        transform: active ? 'scale(1.25)' : 'scale(1)',
                        transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
                      }} />
                      <div style={{
                        fontSize: 9.5, fontWeight: active ? 800 : 500, fontFamily: fonts.body,
                        color: active ? C.text : done ? C.textMuted : C.textLight,
                        textAlign: 'center', lineHeight: 1, letterSpacing: 0.2,
                      }}>{s}</div>
                    </div>
                    {i < TASTING_STEPS.length - 1 && (
                      <div style={{
                        flex: 1, height: 1, marginTop: -14,
                        borderTop: done ? `1.5px solid ${C.accent}` : `1px dashed ${C.borderLight}`,
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
                background: C.greenBg, border: `1px solid ${C.green}20`,
                borderRadius: radius.lg, padding: '14px 16px',
              }}>
                <div style={{ ...type.label, color: C.green, marginBottom: 8 }}>
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
                background: C.cream,
                borderTop: `1px solid ${C.borderLight}`,
                padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10, fontFamily: fonts.body,
              }}
            >
              {/* live taste-fingerprint — grows as axes are captured */}
              <div style={{ width: 34, height: 34, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TasteFingerprint coverage tasting={{ aroma: scorecard.aroma, acidity: scorecard.acidity, sweetness: scorecard.sweet, body: scorecard.body, finish: scorecard.finish, firstSip: scorecard.flavor }} size={34} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...type.label, color: C.textMuted }}>
                  Your cup so far — tap to expand
                </div>
                <div style={{
                  fontSize: 12, color: C.text, lineHeight: 1.2, marginTop: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <ScorecardPeekLine scorecard={scorecard} stepName={TASTING_STEPS[currentStep] || 'Finish'} />
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0 }}><path d="M6 15l6-6 6 6" /></svg>
            </button>
          )}

          {/* Input row — hidden when extract card takes over */}
          {!chatExtracted && (
            <div style={{
              flexShrink: 0,
              background: glass.sheet, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur,
              borderTop: `1px solid ${glass.chromeBorder}`,
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
                  background: C.bgDeep, color: C.text,
                  outline: 'none', boxSizing: 'border-box',
                  resize: 'none', overflowY: 'auto', maxHeight: 120,
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={chatLoading || !chatInput.trim()}
                aria-label="Send"
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none',
                  background: C.accent,
                  color: C.cream, cursor: 'pointer', flexShrink: 0,
                  boxShadow: shadows.button,
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

      {/* Sort Controls — sliding Liquid Glass segmented control */}
      {mode === 'list' && tastings.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <SegmentedControl
            options={[['date', 'Recent'], ['rating', 'Top rated']]}
            value={sortBy}
            onChange={(k) => { haptic.selection(); setSortBy(k); }}
            reduce={reduceMotion}
            groupId="tasting-sort"
          />
        </div>
      )}

      {/* Tasting Cards */}
      {mode === 'list' && (
      <div>
      {sorted.map((t, idx) => {
        const isEditing = editingId === t.id;

        if (isEditing && editForm) return (
          <div key={t.id} style={{ ...cardBase, border: `1px solid ${C.accent}`, padding: 16, marginBottom: 12 }}>
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

        const b = beans.find(x => x.id === t.beanId);
        const notePreview = (t.notes || t.aroma || '').trim();
        // Compact, tappable summary — the full organized review opens in the detail card.
        return (
          <m.div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={() => { haptic.light(); setDetailTasting(t); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetailTasting(t); } }}
            {...(reduceMotion ? {} : {
              initial: { opacity: 0, y: 16 },
              whileInView: { opacity: 1, y: 0 },
              viewport: { once: true, margin: '-8% 0px' },
              transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1], delay: Math.min(idx, 6) * 0.05 },
            })}
            whileTap={reduceMotion ? undefined : { scale: 0.985 }}
            style={{
              background: C.card, border: `1px solid ${C.borderLight}`, borderRadius: radius.lg,
              padding: '14px 16px', marginBottom: 12, boxShadow: shadows.e2,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* rating + one-word lead; date right */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <StarRating value={t.rating || 0} size={17} />
                {t.oneWord && <span style={{ fontFamily: fonts.heading, fontStyle: 'italic', fontSize: 16, color: C.accentDark, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{t.oneWord}”</span>}
              </div>
              <div style={{ ...type.caption, color: C.textLight, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatDateRelative(t.date)}</div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...type.label, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b?.roaster || 'Unknown roaster'}</div>
                <div style={{ fontFamily: fonts.heading, fontSize: 17.5, color: C.text, fontWeight: 600, lineHeight: 1.18, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: notePreview ? 3 : 0 }}>{b?.name || 'Unknown bean'}</div>
                {notePreview && <div style={{ ...type.caption, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>{notePreview}</div>}
              </div>
              {/* the cup's flavor fingerprint — the visual signature */}
              <TasteFingerprint tasting={t} size={58} />
              <ChevronRight size={18} color={C.textLight} style={{ flexShrink: 0 }} />
            </div>
          </m.div>
        );
      })}
      </div>
      )}

      {mode === 'list' && tastings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '24px 20px' }}>
          <video
            src={assetUrl("/images/ruphus-animations/ruphus-empty-cup.mp4")}
            autoPlay muted loop playsInline
            style={{
              width: 200, height: 200, objectFit: 'contain', margin: '0 auto 8px',
              display: 'block',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            }}
          />
          <div style={{ ...type.h2, color: C.text, marginBottom: 6 }}>No tastings yet</div>
          <div style={{ ...type.body, color: C.textMuted }}>Start a guided tasting above and your first cup lands here.</div>
        </div>
      )}

      {/* Tap-through tasting review — animated radar + organized detail */}
      <TastingDetailCard
        tasting={detailTasting}
        bean={detailTasting ? beans.find(x => x.id === detailTasting.beanId) : null}
        onClose={() => setDetailTasting(null)}
        onShare={(t) => handleShareTasting(t)}
        onEdit={(t) => startEdit(t)}
        onDelete={async (t) => {
          if (!confirm('Delete this tasting?')) return;
          try { await onDeleteTasting(t.id); setDetailTasting(null); }
          catch { showError("Couldn't delete. Check your connection."); }
        }}
      />

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
