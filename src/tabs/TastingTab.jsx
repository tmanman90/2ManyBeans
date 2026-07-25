// Tasting tab — ported from prototype lines 500-789
// 2 modes: list, form. Guided tasting lives in TastingWizard (full-screen overlay);
// the old chat-takeover coach was removed once the wizard replaced its entry points.
import { useState, useEffect, useRef, useMemo } from 'react';
import { assetUrl } from "../lib/assetUrl";
import { MessageCircle, Plus, Check, Pencil, Trash2, Share2, ChevronRight } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass, cardBase } from '../styles/theme';
import { m, listContainer, listItem, fadeUp } from '../lib/motion';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { TasteFingerprint } from '../components/TasteFingerprint';
import { TastingDetailCard } from '../components/TastingDetailCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { haptic } from '../lib/haptics';
import { today } from '../lib/peakStatus';
import { convertTastingScores } from '../lib/professorRuphus';
import { StarRating } from '../components/StarRating';
import { Btn } from '../components/Btn';
import { GlassButton } from '../components/GlassButton';
import { Toast } from '../components/Toast';
import { useErrorToast } from '../hooks/useErrorToast';
import { TastingForm } from '../components/TastingForm';
import { TastingWizard } from '../components/tasting/TastingWizard';
import { TastingShareCard, captureShareCard, offScreenStyle } from '../components/ShareCard';
import { shareImage } from '../lib/share';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { FREE_LIMITS } from '../lib/subscriptionConfig';

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


export const TastingTab = ({ beans, tastings, onAddTasting, onUpdateTasting, onDeleteTasting, wizardDraft = null, onWizardDraftChange = () => {}, pendingTastingBeanId, onPendingTastingConsumed, onboardingPalate = null, isDemo, onDemoAction }) => {
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
  const setWizardDraft = onWizardDraftChange;

  const tastingFields = {
    aroma: 'Aroma', firstSip: 'First sip', acidity: 'Acidity', sweetness: 'Sweetness',
    body: 'Body', finish: 'Finish', oneWord: 'One-word score', notes: 'Notes', changeTomorrow: 'Change tomorrow?',
  };
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };

  const getBeanName = (id) => {
    const b = beans.find(x => x.id === id);
    return b ? `${b.name} (${b.roaster})` : 'Unknown';
  };

  const handleFormSubmit = async (formData) => {
    const tastingData = { date: today(), ...formData };
    try {
      const tastingId = await onAddTasting(tastingData);
      haptic.success();
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

  // Open the intelligent tasting wizard (same demo + free-tier gate as the old chat entry).
  const startWizard = () => {
    if (isDemo) { onDemoAction?.(); return; }
    if (!hasPro && (freeUsage?.tasteTests ?? 0) >= FREE_LIMITS.tasteTests) {
      openPaywall({ feature: 'taste_cap', promote: 'pro' });
      return;
    }
    haptic.medium();
    if (wizardDraft?.beanId) setSel(wizardDraft.beanId);
    setWizardOpen(true);
  };

  const closeWizard = (opts = {}) => {
    if (opts.clearDraft) setWizardDraft(null);
    setWizardOpen(false);
  };

  // Wizard saved a tasting — it already wrote tastingScores directly (real fingerprint), so we
  // persist as-is without the background LLM score conversion that the manual/chat paths use.
  const saveWizardTasting = async (record) => {
    try {
      await onAddTasting(record);
      setWizardDraft(null);
      setWizardOpen(false);
      setMode('list');
    } catch (err) {
      showError("Couldn't save tasting. Check your connection and try again.");
    }
  };

  // Cross-tab bridge: BrewTimer completion sets pendingTastingBeanId in App.
  // Here we consume it — pre-select the bean, open the guided tasting WIZARD, and clear the
  // flag. The effect re-runs whenever beans updates, so if the pending bean isn't in the list
  // yet (e.g. a Firestore round-trip is pending), we keep the flag set and retry on the next
  // beans update. The paywall path still clears the flag since that's a terminal outcome.
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
    if (wizardDraft?.beanId && wizardDraft.beanId !== pendingTastingBeanId) setWizardDraft(null);
    setSel(pendingTastingBeanId);
    setWizardOpen(true);
    onPendingTastingConsumed?.();
  }, [pendingTastingBeanId, beans, hasPro, freeUsage, wizardDraft, setWizardDraft]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const selectedBean = beans.find(b => b.id === sel);
  const draftBean = wizardDraft?.beanId ? beans.find(b => b.id === wizardDraft.beanId) : null;

  const wizardBean = (wizardOpen && draftBean) || beans.find(b => b.id === sel) || active[0] || sealed[0] || null;

  return (
    <div>
      {/* Intelligent tasting wizard — full-screen overlay (portals to body) */}
      {wizardOpen && wizardBean && (
        <TastingWizard
          bean={wizardBean}
          beans={beans}
          tastings={tastings}
          onboardingPalate={onboardingPalate}
          isPro={hasPro}
          reduce={reduceMotion}
          draft={wizardDraft}
          onDraftChange={setWizardDraft}
          onSave={saveWizardTasting}
          onClose={closeWizard}
          onSwitchToManual={() => { setWizardDraft(null); setWizardOpen(false); setMode('form'); }}
        />
      )}

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
            const hasDraft = !!draftBean;
            const onDeck = draftBean || beans.find(b => b.id === sel) || active[0] || sealed[0] || null;
            const hasBeans = !!onDeck;
            const ctaLabel = hasDraft ? `Resume your ${draftBean.name} tasting` : (hasBeans ? 'Start guided tasting' : 'Add a bean to start');
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
                          {hasDraft ? 'Resume draft' : (onDeck.jarSlot ? `On deck · Jar ${onDeck.jarSlot}` : 'On deck · Sealed')}
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
                        value={onDeck.id}
                        onChange={e => {
                          const nextBeanId = e.target.value;
                          if (wizardDraft?.beanId && nextBeanId !== wizardDraft.beanId) setWizardDraft(null);
                          setSel(nextBeanId);
                        }}
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
                  <GlassButton
                    fullWidth
                    onClick={hasBeans ? startWizard : undefined}
                    disabled={!hasBeans}
                    whileTap={reduceMotion || !hasBeans ? undefined : { scale: 0.975, filter: 'brightness(1.08)' }}
                    trailing={<ChevronRight size={20} style={{ opacity: hasBeans ? 0.85 : 0 }} />}
                    style={{
                      padding: '15px 16px 15px 15px', borderRadius: radius.lg,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <span style={{ width: 30, height: 30, borderRadius: '50%', background: hasBeans ? 'rgba(255,255,255,0.20)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <MessageCircle size={16} />
                      </span>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ctaLabel}</span>
                    </span>
                  </GlassButton>

                  {/* Quiet scaffolding line (no chrome) */}
                  <div style={{ marginTop: 10, textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: C.textLight, fontVariantNumeric: 'tabular-nums' }}>
                    {hasDraft ? 'Progress saved in this session' : 'Ruphus predicts · you taste · auto-logged to your journal'}
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

      {/* Form Mode */}
      {mode === 'form' && (
        <TastingForm beans={tastable} onSubmit={handleFormSubmit} submitLabel="Save Tasting" />
      )}

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
    </div>
  );
};
