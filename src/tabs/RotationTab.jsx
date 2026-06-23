// Rotation tab — ported from prototype lines 279-434
import { useCallback, useState } from 'react';
import { Check, Plus, Star, X, Coffee, Undo2, Camera, Bean, Archive } from 'lucide-react';
import { BrewButton } from '../components/BrewButton';
import { C, fonts, type, shadows, radius, glass, journalCard, cardBase } from '../styles/theme';
import { getPeakStatus, daysOpen } from '../lib/peakStatus';
import { getRecommendations } from '../lib/recommendations';
import { getRecBlurb } from '../lib/claude';
import { BeanCard } from '../components/BeanCard';
import { AidenModal } from '../components/AidenModal';
import { HandBrewModal } from '../components/HandBrewModal';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { Badge } from '../components/Badge';
import { Btn } from '../components/Btn';
import { Modal } from '../components/Modal';
import { FinishBagPrompt } from '../components/FinishBagPrompt';
import { Toast } from '../components/Toast';
import { QuickRecipeFlow } from '../components/QuickRecipeFlow';
import { QuickRecipeActionMenu } from '../components/QuickRecipeActionMenu';
import { EditBeanModal } from '../components/EditBeanModal';
import { buildNewBeanData } from '../lib/beanBuilder';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';
import { useLongPress } from '../hooks/useLongPress';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';
import { m, listContainer, listItem, fadeUp, cardPress } from '../lib/motion';

const PillButton = ({ color, bg, icon, label, onClick }) => (
  <m.button
    onClick={onClick}
    whileTap={{ scale: 0.96 }}
    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
    style={{
      background: bg || C.bgDeep,
      border: `1px solid ${C.hairline}`,
      borderRadius: radius.md,
      padding: '10px 6px',
      fontFamily: fonts.body, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em',
      color,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      minWidth: 0,
      minHeight: 56,
    }}
  >
    <span style={{ color, display: 'inline-flex' }}>{icon}</span>
    <span>{label}</span>
  </m.button>
);

export const RotationTab = ({ uid, beans, tastings, onFinishBean, onReturnBean, onOpenBean, updateBean, deleteBean, addBean, addTasting, updateTasting, getBeanById, onStartTastingSession, onAddBeanQuickAction, isDemo, onDemoAction }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const isHandBrew = preferences.brewMethod !== 'aiden';
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings, getBeanById);
  const aiden = useAidenBrew(updateBean);
  const handBrew = useHandBrew(updateBean);
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [returnConfirm, setReturnConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [showRec, setShowRec] = useState(false);
  const [recBlurb, setRecBlurb] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [slotPicker, setSlotPicker] = useState(null);
  const [brewMenuBean, setBrewMenuBean] = useState(null);
  const [quickRecipeOpen, setQuickRecipeOpen] = useState(false);
  const [quickRecipeMenuOpen, setQuickRecipeMenuOpen] = useState(false);
  const [newBeanEntry, setNewBeanEntry] = useState(null);
  const liveNewBean = newBeanEntry ? beans.find(b => b.id === newBeanEntry.id) : null;
  const newBeanForModal = newBeanEntry
    ? { ...newBeanEntry, ...(liveNewBean || {}), _scanPhotos: newBeanEntry._scanPhotos }
    : null;

  const handleSaveToInventory = async (data) => {
    const { aidenRecipe, aidenLink, aidenGrind, handBrewRecipe, handBrewRecipes, photo, ...fields } = data;
    const aidenData = aidenRecipe ? { aidenRecipe, aidenLink, aidenGrind } : undefined;
    const beanData = buildNewBeanData(fields, { aidenData });
    if (handBrewRecipe) beanData.handBrewRecipe = handBrewRecipe;
    if (handBrewRecipes) beanData.handBrewRecipes = handBrewRecipes;
    try {
      const beanId = await addBean(beanData);
      setNewBeanEntry({ id: beanId, ...beanData });
    } catch (err) {
      console.error('Failed to save bean:', err);
      setToast('Failed to save bean');
    }
  };

  const [celebratingBean, setCelebratingBean] = useState(null);

  const handleFinishBag = (bean) => {
    const hasTasting = tastings.some(t => t.beanId === bean.id);
    if (hasTasting) {
      onFinishBean(bean.id);
      setCelebratingBean(bean);
    } else {
      setFinishPrompt(bean);
    }
  };

  const handleReturnConfirm = async () => {
    if (!returnConfirm) return;
    try {
      await onReturnBean(returnConfirm.id);
      setToast(`${returnConfirm.name} returned to inventory`);
    } catch (err) {
      console.error('Return failed:', err);
    }
    setReturnConfirm(null);
  };

  const canisterCount = preferences.canisterCount || 3;
  const slotNumbers = Array.from({ length: canisterCount }, (_, i) => i + 1);
  const slots = slotNumbers.map(n => beans.find(b => b.status === 'ACTIVE' && b.jarSlot === n) || null);
  const recs = getRecommendations(beans);
  const emptySlots = slotNumbers.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.jarSlot === n));

  const openQuickRecipe = useCallback(() => {
    if (isDemo) {
      onDemoAction?.();
      return;
    }
    setQuickRecipeMenuOpen(false);
    setQuickRecipeOpen(true);
  }, [isDemo, onDemoAction]);

  const openAddBean = useCallback(() => {
    if (isDemo) {
      onDemoAction?.();
      return;
    }
    setQuickRecipeMenuOpen(false);
    onAddBeanQuickAction?.();
  }, [isDemo, onAddBeanQuickAction, onDemoAction]);

  const quickRecipeLongPressHandlers = useLongPress({
    onTap: openQuickRecipe,
    onLongPress: () => setQuickRecipeMenuOpen(true),
  });

  const handleOpenRec = (beanId) => {
    if (emptySlots.length === 0) return;
    if (emptySlots.length === 1) {
      onOpenBean(beanId, emptySlots[0]);
      return;
    }
    setSlotPicker({ beanId });
  };

  const fetchRecBlurb = async () => {
    if (recs.length === 0) return;
    setRecLoading(true);
    setRecBlurb('');
    try {
      const activeDesc = slots.filter(Boolean).map(b => {
        const ps = getPeakStatus(b);
        return `Jar #${b.jarSlot}: ${b.roaster} ${b.name} (${b.origin}, ${b.variety} ${b.process}) — ${ps.days}d post-roast, ${ps.label}`;
      }).join('\n');

      const recDesc = recs.map((r, i) =>
        `${i + 1}. ${r.bean.roaster} ${r.bean.name} (${r.bean.origin}, ${r.bean.variety} ${r.bean.process}) — ${r.peakStatus.days}d post-roast, ${r.peakStatus.label}, ${r.bean.bagSize}g. Notes: ${r.bean.bagNotes || 'none'}`
      ).join('\n');

      const blurb = await getRecBlurb(activeDesc, recDesc);
      setRecBlurb(blurb);
    } catch {
      setRecBlurb("Couldn't load analysis — but the picks below are sorted by urgency and variety.");
    }
    setRecLoading(false);
  };

  const toggleRec = () => {
    const next = !showRec;
    setShowRec(next);
    if (next && !recBlurb && !recLoading) {
      if (isDemo) {
        setRecBlurb("Sign in to unlock AI-powered rotation analysis.");
      } else {
        fetchRecBlurb();
      }
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      position: 'absolute', inset: 0,
    }}>
      {/* Editorial page header */}
      <div style={{
        flexShrink: 0,
        background: C.bg,
        padding: '16px 20px 14px',
        borderBottom: `1px solid ${C.hairline}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            {/* Eyebrow label */}
            <div style={{
              ...type.label,
              color: C.textLight,
              marginBottom: 4,
            }}>
              Your {canisterCount} jar{canisterCount !== 1 ? 's' : ''}
            </div>
            {/* Display title — Fraunces, editorial */}
            <div style={{
              ...type.h1,
              fontFamily: fonts.heading,
              color: C.text,
            }}>
              Active Rotation
            </div>
          </div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Btn
              variant="primary"
              style={{ padding: '10px 16px', minHeight: 44 }}
              aria-label="Quick Recipe"
              {...quickRecipeLongPressHandlers}
            >
              <Camera size={14} /> Quick Recipe
            </Btn>
            <QuickRecipeActionMenu
              open={quickRecipeMenuOpen}
              onClose={() => setQuickRecipeMenuOpen(false)}
              onQuickRecipe={openQuickRecipe}
              onAddBean={openAddBean}
            />
          </div>
        </div>
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        padding: `16px 20px calc(100px + env(safe-area-inset-bottom, 0px))`,
        background: C.bg,
      }}>
      {beans.length === 0 && (
        <m.div
          {...fadeUp}
          style={{
            ...cardBase,
            textAlign: 'center',
            padding: 40,
          }}
        >
          <video
            src="/images/ruphus-animations/ruphus-empty-cup.mp4"
            autoPlay muted loop playsInline
            style={{
              width: 200, height: 200, objectFit: 'contain', marginBottom: 8,
              WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            }}
          />
          <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 6 }}>Your rotation is empty</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Add your first coffee bag to get started</div>
          <Btn variant="primary" onClick={() => onOpenBean(null, 1)}><Plus size={16} /> Add Bean</Btn>
        </m.div>
      )}

      <m.div
        variants={listContainer}
        initial="initial"
        animate="animate"
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
      {slots.map((bean, i) => (
        <m.div key={i} variants={listItem} {...(i === 0 ? { 'data-tour': 'jar-slots' } : {})}>
          {/* Jar eyebrow row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
          }}>
            {/* Refined jar indicator pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: bean ? C.accentSoft : C.bgDeep,
              borderRadius: radius.pill,
              padding: '4px 10px 4px 6px',
              border: `1px solid ${bean ? C.accentLight : C.hairline}`,
            }}>
              <img
                src={bean ? '/images/jar-full.webp' : '/images/jar-empty.webp'}
                alt={bean ? 'Full jar' : 'Empty jar'}
                style={{ width: 18, height: 18, objectFit: 'contain' }}
              />
              <span style={{
                ...type.label,
                color: bean ? C.accent : C.textLight,
                fontSize: 11,
              }}>
                Jar {i + 1}
              </span>
            </div>
            {/* Hairline separator that extends to fill remaining space */}
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
          </div>

          {bean ? (
            <BeanCard bean={bean} updateBean={updateBean} deleteBean={deleteBean} onLearn={isDemo ? onDemoAction : handleLearn} uid={uid} tourTag={i === 0 ? 'bean-actions' : undefined} actions={
              <div style={{ paddingTop: 14 }}>
                <div style={{ borderTop: `1px solid ${C.hairline}`, margin: '0 16px' }} />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr 1fr 1fr',
                  gap: 8,
                  padding: '12px 16px 16px',
                  alignItems: 'stretch',
                }}>
                  <div {...(i === 0 ? { 'data-tour': 'brew-button' } : {})}>
                    <BrewButton
                      bean={bean}
                      label={brewMethod.label}
                      isHandBrew={isHandBrew}
                      brewMenuBean={brewMenuBean}
                      setBrewMenuBean={setBrewMenuBean}
                      onAiden={isDemo ? onDemoAction : aiden.handleBrewWithAiden}
                      onHandBrew={isDemo ? onDemoAction : handBrew.handleBrewHandBrew}
                      compact={false}
                    />
                  </div>
                  <PillButton color={C.green} bg={C.greenBg} icon={<Bean size={18} />} label="Taste" onClick={() => onStartTastingSession?.(bean.id)} />
                  <PillButton color={C.textMuted} bg={C.bgDeep} icon={<Undo2 size={18} />} label="Return" onClick={() => setReturnConfirm(bean)} />
                  <PillButton color={C.red} bg={C.redBg} icon={<Archive size={18} />} label="Finish" onClick={() => handleFinishBag(bean)} />
                </div>
              </div>
            } />
          ) : (
            /* Empty slot — elegant dashed card */
            <m.div
              whileTap={{ scale: 0.985 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={() => onOpenBean(null, i + 1)}
              style={{
                background: C.accentSoft,
                borderRadius: radius.lg,
                border: `1.5px dashed ${C.accentLight}`,
                padding: '28px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: radius.pill,
                background: `rgba(168,106,56,0.12)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 12px',
              }}>
                <Plus size={20} color={C.accent} />
              </div>
              <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text, fontWeight: 600, marginBottom: 4 }}>
                Open a bean
              </div>
              <div style={{ ...type.body, color: C.textLight }}>
                Tap to fill this jar from your inventory
              </div>
            </m.div>
          )}
        </m.div>
      ))}
      </m.div>

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ marginTop: 24 }}>
          {/* Eyebrow row + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
            <Btn variant="ghost" onClick={toggleRec} style={{ fontSize: 12, gap: 5, padding: '6px 12px' }}>
              <Star size={12} /> {showRec ? 'Hide' : 'Show'} Recommendations
            </Btn>
            <div style={{ flex: 1, height: 1, background: C.hairline }} />
          </div>

          {showRec && (
            <m.div
              variants={listContainer}
              initial="initial"
              animate="animate"
              style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
            >
              {/* AI Blurb */}
              <m.div
                variants={listItem}
                style={{
                  background: C.amberBg,
                  borderRadius: radius.lg,
                  padding: '16px 18px',
                  border: `1px solid ${C.border}`,
                }}
              >
                <div style={{ ...type.label, color: C.amber, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Star size={11} />What to Open Next
                </div>
                {recLoading ? (
                  <div style={{ ...type.body, color: C.textMuted, fontStyle: 'italic' }}>Analyzing your rotation...</div>
                ) : recBlurb ? (
                  <div style={{ ...type.body, color: C.text, lineHeight: 1.6 }}>{recBlurb}</div>
                ) : null}
              </m.div>

              {/* Recommendation Cards */}
              {recs.map((r, idx) => (
                <m.div key={r.bean.id} variants={listItem} style={{ ...cardBase, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          ...type.caption,
                          color: C.amber, background: C.amberBg,
                          padding: '2px 8px', borderRadius: radius.pill,
                          border: `1px solid ${C.border}`,
                        }}>
                          #{idx + 1}
                        </span>
                        <div style={{ fontFamily: fonts.heading, fontSize: 17, fontWeight: 600, color: C.text }}>{r.bean.name}</div>
                      </div>
                      <div style={{ ...type.body, color: C.textMuted }}>
                        {r.bean.roaster} · {r.bean.origin} · {r.bean.variety} {r.bean.process}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        <Badge color={r.peakStatus.color} bg={r.peakStatus.bg}>{r.peakStatus.label}</Badge>
                        <Badge color={C.textMuted} bg={C.bgDeep}>{r.bean.bagSize}g</Badge>
                        <Badge color={C.textMuted} bg={C.bgDeep}>{r.peakStatus.days}d post-roast</Badge>
                      </div>
                      {r.bean.bagNotes && r.bean.bagNotes !== '(not logged)' && (
                        <div style={{ ...type.caption, color: C.textLight, fontStyle: 'italic', marginTop: 8 }}>
                          ☕ {r.bean.bagNotes}
                        </div>
                      )}
                    </div>
                  </div>

                  {emptySlots.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      {slotPicker?.beanId === r.bean.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ ...type.body, color: C.textMuted }}>Which jar?</span>
                          {emptySlots.map(s => (
                            <Btn key={s} variant="primary" onClick={() => { onOpenBean(r.bean.id, s); setSlotPicker(null); }} style={{ fontSize: 12, padding: '5px 12px' }}>
                              Jar #{s}
                            </Btn>
                          ))}
                          <Btn variant="ghost" onClick={() => setSlotPicker(null)} style={{ fontSize: 12, padding: '5px 8px' }}>
                            <X size={12} />
                          </Btn>
                        </div>
                      ) : (
                        <Btn variant="small" onClick={() => handleOpenRec(r.bean.id)}>
                          <Plus size={12} /> Open This Bean
                        </Btn>
                      )}
                    </div>
                  )}
                </m.div>
              ))}
            </m.div>
          )}
        </div>
      )}
      </div>
      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        bean={aiden.aidenBean}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
        onRegenerate={aiden.onRegenerate}
        onPushCached={aiden.onPushCached}
        icedResult={aiden.icedResult}
        icedLoading={aiden.icedLoading}
        icedError={aiden.icedError}
        onPushIced={aiden.onPushIced}
        onRetryIcedPush={aiden.onRetryIcedPush}
      />
      <HandBrewModal
        open={handBrew.handBrewModal}
        onClose={handBrew.closeHandBrewModal}
        recipe={handBrew.handBrewRecipe}
        loading={handBrew.handBrewLoading}
        error={handBrew.handBrewError}
        phase={handBrew.handBrewPhase}
        onRetry={handBrew.onRetry}
        onRegenerate={handBrew.onRegenerate}
        bean={handBrew.handBrewBean}
        onStartTasting={onStartTastingSession}
        userCoffeeGrams={handBrew.userCoffeeGrams}
        onCoffeeGramsChange={handBrew.setUserCoffeeGrams}
        onPersistDose={handBrew.persistDose}
      />
      <Modal open={!!returnConfirm} onClose={() => setReturnConfirm(null)} title="Return to Inventory?" centered>
        {returnConfirm && (
          <div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 16, lineHeight: 1.5 }}>
              Return <strong>{returnConfirm.name}</strong> to sealed inventory? Jar #{returnConfirm.jarSlot} will be freed.
            </div>
            <Btn variant="primary" onClick={handleReturnConfirm} style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}>
              Yes, Return It
            </Btn>
            <Btn variant="ghost" onClick={() => setReturnConfirm(null)} style={{ width: '100%', justifyContent: 'center' }}>
              Cancel
            </Btn>
          </div>
        )}
      </Modal>
      <ProfessorRuphusSlideUp {...ruphusProps} />
      <FinishBagPrompt
        open={!!finishPrompt}
        onClose={(msg) => { setFinishPrompt(null); if (msg) setToast(msg); }}
        bean={finishPrompt}
        onFinish={onFinishBean}
        onAddTasting={addTasting}
        onUpdateTasting={updateTasting}
        beans={beans}
      />
      <Modal open={!!celebratingBean} onClose={() => setCelebratingBean(null)} title="" centered>
        <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
          <video
            src="/images/ruphus-animations/ruphus-fist-pump.mp4"
            autoPlay muted playsInline
            onPlay={() => setTimeout(() => { setCelebratingBean(null); setToast('Bag finished!'); }, 2200)}
            style={{
              width: 200, height: 200, objectFit: 'contain', margin: '0 auto 12px',
              display: 'block',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            }}
          />
          <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.text, marginBottom: 4 }}>
            Bag finished!
          </div>
          <div style={{ fontSize: 14, color: C.textMuted }}>
            On to the next one, brewer.
          </div>
        </div>
      </Modal>
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
      <QuickRecipeFlow
        open={quickRecipeOpen}
        onClose={() => setQuickRecipeOpen(false)}
        onSaveToInventory={handleSaveToInventory}
        addBean={addBean}
        addTasting={addTasting}
        uid={uid}
        onStartTastingSession={onStartTastingSession}
      />
      {newBeanEntry && (
        <EditBeanModal
          open={!!newBeanEntry}
          onClose={() => setNewBeanEntry(null)}
          bean={newBeanForModal}
          updateBean={updateBean}
          deleteBean={deleteBean}
          isNewBean
          uid={uid}
        />
      )}
    </div>
  );
};
