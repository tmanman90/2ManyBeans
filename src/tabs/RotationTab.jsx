// Rotation tab — ported from prototype lines 279-434
import { useState } from 'react';
import { Check, Plus, Star, X, Coffee, Undo2 } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
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
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';
import { getBrewMethod } from '../lib/brewMethods';
import { usePreferences } from '../hooks/useUserProfile';

export const RotationTab = ({ uid, beans, tastings, onFinishBean, onReturnBean, onOpenBean, updateBean, addTasting, updateTasting }) => {
  const { preferences } = usePreferences();
  const brewMethod = getBrewMethod(preferences.brewMethod);
  const isHandBrew = preferences.brewMethod === 'handbrew';
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings);
  const aiden = useAidenBrew(updateBean);
  const handBrew = useHandBrew(updateBean);
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [returnConfirm, setReturnConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [showRec, setShowRec] = useState(false);
  const [recBlurb, setRecBlurb] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [slotPicker, setSlotPicker] = useState(null);

  const handleFinishBag = (bean) => {
    const hasTasting = tastings.some(t => t.beanId === bean.id);
    if (hasTasting) {
      onFinishBean(bean.id);
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
  const slots = slotNumbers.map(n => beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n) || null);
  const recs = getRecommendations(beans);
  const emptySlots = slotNumbers.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));

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
        return `Atmos #${b.atmosSlot}: ${b.roaster} ${b.name} (${b.origin}, ${b.variety} ${b.process}) — ${ps.days}d post-roast, ${ps.label}`;
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
    if (next && !recBlurb && !recLoading) fetchRecBlurb();
  };

  const sectionTitle = {
    fontFamily: fonts.title, fontSize: 30, color: C.text, marginBottom: 4,
  };
  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div>
      <div style={sectionTitle}>Active Rotation</div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Your {canisterCount} Atmos canister{canisterCount !== 1 ? 's' : ''}</div>

      {beans.length === 0 && (
        <div style={{ ...journalCard, textAlign: 'center', padding: 32 }}>
          <img src="/images/empty-rotation.png" alt="Empty canister" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 16, marginBottom: 16 }} />
          <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 6 }}>Your rotation is empty</div>
          <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>Add your first coffee bag to get started</div>
          <Btn variant="primary" onClick={() => onOpenBean(null, 1)}><Plus size={16} /> Add Bean</Btn>
        </div>
      )}

      {slots.map((bean, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <img
              src={bean ? '/images/atmos-full.png' : '/images/atmos-empty.png'}
              alt={bean ? 'Full canister' : 'Empty canister'}
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: C.accent, letterSpacing: 1, textTransform: 'uppercase' }}>
              Atmos #{i + 1}
            </span>
          </div>
          <div style={{ borderBottom: `1px solid ${C.borderLight}`, marginBottom: 8 }} />
          {bean ? (
            <BeanCard bean={bean} updateBean={updateBean} onLearn={handleLearn} uid={uid} actions={<>
              <Btn variant="small" onClick={() => isHandBrew ? handBrew.handleBrewHandBrew(bean) : aiden.handleBrewWithAiden(bean)} aria-label={brewMethod.label}>
                <Coffee size={12} /> {brewMethod.label}
              </Btn>
              <Btn variant="small" onClick={() => setReturnConfirm(bean)}>
                <Undo2 size={12} /> Return
              </Btn>
              <Btn variant="danger" onClick={() => handleFinishBag(bean)}>
                <Check size={14} /> Finish Bag
              </Btn>
            </>} />
          ) : (
            <div style={{
              ...journalCard,
              padding: 24,
              border: `2px dashed ${C.border}`,
              borderLeft: `2px dashed ${C.border}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, color: C.textMuted, marginBottom: 10 }}>Empty slot</div>
              <Btn variant="primary" onClick={() => onOpenBean(null, i + 1)}>
                <Plus size={14} /> Open a Bean
              </Btn>
            </div>
          )}
        </div>
      ))}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Btn variant="ghost" onClick={toggleRec} style={{ fontSize: 14 }}>
            <Star size={14} /> {showRec ? 'Hide' : 'Show'} Recommendations
          </Btn>
          {showRec && (
            <div style={{ marginTop: 10 }}>
              {/* AI Blurb */}
              <div style={{
                background: C.amberBg,
                borderRadius: 14,
                padding: 16,
                border: '1px solid #E8D5A0',
                marginBottom: 12,
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  <Star size={12} style={{ verticalAlign: -1, marginRight: 4 }} />What to Open Next
                </div>
                {recLoading ? (
                  <div style={{ fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>Analyzing your rotation...</div>
                ) : recBlurb ? (
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.6 }}>{recBlurb}</div>
                ) : null}
              </div>

              {/* Recommendation Cards */}
              {recs.map((r, idx) => (
                <div key={r.bean.id} style={journalCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberBg, padding: '2px 7px', borderRadius: 6 }}>
                          #{idx + 1}
                        </span>
                        <div style={{ fontFamily: fonts.heading, fontSize: 17, color: C.text }}>{r.bean.name}</div>
                      </div>
                      <div style={{ fontSize: 13, color: C.textMuted }}>
                        {r.bean.roaster} · {r.bean.origin} · {r.bean.variety} {r.bean.process}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        <Badge color={r.peakStatus.color} bg={r.peakStatus.bg}>{r.peakStatus.label}</Badge>
                        <Badge color={C.textMuted} bg={C.bg}>{r.bean.bagSize}g</Badge>
                        <Badge color={C.textMuted} bg={C.bg}>{r.peakStatus.days}d post-roast</Badge>
                      </div>
                      {r.bean.bagNotes && r.bean.bagNotes !== '(not logged)' && (
                        <div style={{ fontSize: 12, color: C.accentLight, fontStyle: 'italic', marginTop: 6 }}>
                          ☕ {r.bean.bagNotes}
                        </div>
                      )}
                    </div>
                  </div>

                  {emptySlots.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {slotPicker?.beanId === r.bean.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: C.textMuted }}>Which canister?</span>
                          {emptySlots.map(s => (
                            <Btn key={s} variant="primary" onClick={() => { onOpenBean(r.bean.id, s); setSlotPicker(null); }} style={{ fontSize: 12, padding: '5px 12px' }}>
                              Atmos #{s}
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
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <AidenModal
        open={aiden.aidenModal}
        onClose={aiden.closeAidenModal}
        recipe={aiden.aidenRecipe}
        result={aiden.aidenResult}
        loading={aiden.aidenLoading}
        error={aiden.aidenError}
        phase={aiden.aidenPhase}
        onRetry={aiden.onRetry}
        onRetryPush={aiden.onRetryPush}
        onRegenerate={aiden.onRegenerate}
        onPushCached={aiden.onPushCached}
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
      />
      <Modal open={!!returnConfirm} onClose={() => setReturnConfirm(null)} title="Return to Inventory?" centered>
        {returnConfirm && (
          <div>
            <div style={{ fontSize: 14, color: C.text, marginBottom: 16, lineHeight: 1.5 }}>
              Return <strong>{returnConfirm.name}</strong> to sealed inventory? Atmos #{returnConfirm.atmosSlot} will be freed.
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
      <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
    </div>
  );
};
