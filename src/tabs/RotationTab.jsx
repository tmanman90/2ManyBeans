// Rotation tab — ported from prototype lines 279-434
import { useState } from 'react';
import { Check, Plus, Star, X, Coffee } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getPeakStatus, daysOpen } from '../lib/peakStatus';
import { getRecommendations } from '../lib/recommendations';
import { getRecBlurb } from '../lib/claude';
import { BeanCard } from '../components/BeanCard';
import { AidenModal } from '../components/AidenModal';
import { Badge } from '../components/Badge';
import { Btn } from '../components/Btn';
import { generateAidenRecipe, researchBean, pushToAiden } from '../lib/aiden';

export const RotationTab = ({ beans, onFinishBean, onOpenBean, showSeedButton, onSeed }) => {
  const [showRec, setShowRec] = useState(false);
  const [recBlurb, setRecBlurb] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [slotPicker, setSlotPicker] = useState(null);
  const [aidenModal, setAidenModal] = useState(false);
  const [aidenRecipe, setAidenRecipe] = useState(null);
  const [aidenResult, setAidenResult] = useState(null);
  const [aidenLoading, setAidenLoading] = useState(false);
  const [aidenError, setAidenError] = useState(null);
  const [aidenBean, setAidenBean] = useState(null);
  const [aidenResearch, setAidenResearch] = useState(null);
  const [aidenPhase, setAidenPhase] = useState(null); // 'research' | 'recipe' | 'push'

  const slots = [1, 2, 3].map(n => beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n) || null);
  const recs = getRecommendations(beans);
  const emptySlots = [1, 2, 3].filter(n => !beans.find(b => b.status === 'ACTIVE' && b.atmosSlot === n));

  const handleOpenRec = (beanId) => {
    if (emptySlots.length === 0) return;
    if (emptySlots.length === 1) {
      onOpenBean(beanId, emptySlots[0]);
      return;
    }
    setSlotPicker({ beanId });
  };

  const handlePushToAiden = async (recipe) => {
    setAidenError(null);
    setAidenResult(null);
    setAidenLoading(true);
    try {
      const result = await pushToAiden(recipe);
      setAidenResult(result);
      if (result.grindRecommendation) {
        setAidenRecipe(prev => ({ ...prev, grindRecommendation: result.grindRecommendation }));
      }
    } catch (fellowErr) {
      setAidenError(fellowErr.message || "Couldn't push to Aiden");
    }
    setAidenLoading(false);
  };

  const handleBrewWithAiden = async (bean, cachedResearch = null) => {
    setAidenBean(bean);
    setAidenRecipe(null);
    setAidenResult(null);
    setAidenError(null);
    setAidenLoading(true);
    setAidenModal(true);

    // Step 1: Research (skip if cached)
    let research = cachedResearch;
    if (!research) {
      setAidenPhase('research');
      try {
        research = await researchBean(bean);
        setAidenResearch(research);
      } catch (err) {
        console.warn('Bean research failed, continuing without enrichment:', err.message);
        research = null;
      }
    }

    // Step 2: Recipe
    setAidenPhase('recipe');
    try {
      const recipe = await generateAidenRecipe(bean, research);
      setAidenRecipe(recipe);
      setAidenError(null);
      // Step 3: Push to Fellow
      setAidenPhase('push');
      await handlePushToAiden(recipe);
    } catch (err) {
      setAidenError(err.message || "Couldn't generate a recipe");
      setAidenLoading(false);
    }
    setAidenPhase(null);
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

  return (
    <div>
      <div style={{ fontFamily: fonts.title, fontSize: 26, color: C.text, marginBottom: 4 }}>Active Rotation</div>
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>Your 3 Atmos canisters</div>

      {showSeedButton && (
        <div style={{
          background: C.amberBg,
          borderRadius: 14,
          padding: 16,
          border: `1px solid #E8D5A0`,
          marginBottom: 16,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 8 }}>Welcome! Import your coffee inventory?</div>
          <Btn variant="primary" onClick={onSeed}>
            Import Tal's Inventory
          </Btn>
        </div>
      )}

      {slots.map((bean, i) => (
        <div key={i}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.accentLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
            Atmos #{i + 1}
          </div>
          {bean ? (
            <BeanCard bean={bean} actions={<>
              <Btn variant="small" onClick={() => handleBrewWithAiden(bean)}>
                <Coffee size={12} /> Brew with Aiden
              </Btn>
              <Btn variant="danger" onClick={() => onFinishBean(bean.id)}>
                <Check size={14} /> Finish Bag
              </Btn>
            </>} />
          ) : (
            <div style={{
              background: C.card,
              borderRadius: 14,
              padding: 24,
              border: `2px dashed ${C.border}`,
              marginBottom: 10,
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
                <div key={r.bean.id} style={{
                  background: C.card,
                  borderRadius: 14,
                  padding: 16,
                  border: `1px solid ${C.border}`,
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.amber, background: C.amberBg, padding: '2px 7px', borderRadius: 6 }}>
                          #{idx + 1}
                        </span>
                        <div style={{ fontFamily: fonts.title, fontSize: 17, color: C.text }}>{r.bean.name}</div>
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
        open={aidenModal}
        onClose={() => setAidenModal(false)}
        recipe={aidenRecipe}
        result={aidenResult}
        loading={aidenLoading}
        error={aidenError}
        phase={aidenPhase}
        onRetry={aidenBean ? () => handleBrewWithAiden(aidenBean, aidenResearch) : undefined}
        onRetryPush={aidenRecipe ? () => handlePushToAiden(aidenRecipe) : undefined}
      />
    </div>
  );
};
