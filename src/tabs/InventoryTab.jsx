// Inventory tab — ported from prototype lines 438-481
import { useState, useEffect } from 'react';
import { assetUrl } from "../lib/assetUrl";
import { Plus, Search, Coffee, Snowflake } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass, journalCard } from '../styles/theme';
import { getPeakStatus, today, daysBetween } from '../lib/peakStatus';
import { ShelfCard } from '../components/ShelfCard';
import { BeanDetailCard } from '../components/BeanDetailCard';
import { TastingDetailCard } from '../components/TastingDetailCard';
import { BrewMethodMenu } from '../components/BrewMethodMenu';
import { useBeanDetail } from '../hooks/useBeanDetail';
import { useLongPress } from '../hooks/useLongPress';
import { Btn } from '../components/Btn';
import { GlassButton } from '../components/GlassButton';
import { ScanSheet } from '../components/ScanSheet';
import { ManualEntrySheet } from '../components/ManualEntrySheet';
import { EditBeanModal } from '../components/EditBeanModal';
import { AidenModal } from '../components/AidenModal';
import { HandBrewModal } from '../components/HandBrewModal';
import { FinishBagPrompt } from '../components/FinishBagPrompt';
import { Toast } from '../components/Toast';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';
import { usePreferences } from '../hooks/useUserProfile';
import { m, listContainer, listItem, fadeUp } from '../lib/motion';
import { haptic } from '../lib/haptics';

// Secondary Liquid-Glass pill for the rail card footer (matches the Rotation footer).
// Spreads ...rest so long-press handlers (Brew) pass through.
const GlassPill = ({ color, bg, icon, label, onClick, ...rest }) => (
  <m.button onClick={onClick} {...rest} className="glass-pill" whileTap={{ scale: 0.95 }} transition={{ type: 'spring', stiffness: 700, damping: 30, mass: 0.6 }}
    style={{ position: 'relative', overflow: 'hidden', isolation: 'isolate', width: '100%', background: `linear-gradient(180deg, rgba(255,255,255,0.55) 0%, ${bg} 100%)`, border: '1px solid rgba(255,255,255,0.65)', borderRadius: radius.md, padding: '10px 6px', fontFamily: fonts.body, fontWeight: 700, fontSize: 11, letterSpacing: '0.04em', color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', minWidth: 0, minHeight: 48, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -2px 5px rgba(70,41,26,0.10), 0 1px 2px rgba(60,38,22,0.10), 0 6px 16px rgba(60,38,22,0.15)' }}>
    <span aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.02) 100%)', borderTopLeftRadius: 'inherit', borderTopRightRadius: 'inherit', pointerEvents: 'none' }} />
    <span style={{ position: 'relative', zIndex: 1, color, display: 'inline-flex' }}>{icon}</span>
    <span style={{ position: 'relative', zIndex: 1 }}>{label}</span>
  </m.button>
);

// Brew pill with long-press → brew-method menu (restores the Rotation brew behavior).
const BrewPill = ({ bean, isHandBrew, isDemo, onDemoAction, aiden, handBrew }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const brew = () => isDemo ? onDemoAction?.() : (isHandBrew ? handBrew.handleBrewHandBrew(bean) : aiden.handleBrewWithAiden(bean));
  const handlers = useLongPress({ onTap: brew, onLongPress: () => isDemo ? onDemoAction?.() : setMenuOpen(true) });
  return (
    <div style={{ position: 'relative', display: 'flex' }}>
      <GlassPill color={C.accent} bg={C.accentSoft} icon={<Coffee size={18} />} label="Brew" {...handlers} />
      <BrewMethodMenu open={menuOpen} onClose={() => setMenuOpen(false)} onAiden={() => aiden.handleBrewWithAiden(bean)} onHandBrew={(deviceKey) => handBrew.handleBrewHandBrew(bean, null, false, deviceKey)} />
    </div>
  );
};

// Primary "Open into jar" — shared warm prominent glass + jar icon.
const OpenJarBtn = ({ onClick }) => (
  <GlassButton
    fullWidth
    onClick={onClick}
    style={{ padding: '13px', borderRadius: 14, gap: 9, fontSize: 13, letterSpacing: '0.08em' }}
  >
    <img src="/images/jar-full.webp" alt="" style={{ width: 20, height: 20, objectFit: 'contain', filter: 'brightness(0) invert(1) drop-shadow(0 1px 1px rgba(40,20,8,0.3))' }} />
    OPEN INTO JAR
  </GlassButton>
);

export const InventoryTab = ({ uid, beans, tastings, onOpenBean, onAddBean, updateBean, saveHandBrewTiming, deleteBean, onFinishBean, addTasting, updateTasting, getBeanById, pendingAddBeanMode, onPendingAddBeanConsumed, onStartTastingSession, isDemo, onDemoAction }) => {
  const { preferences } = usePreferences();
  const isHandBrew = preferences.brewMethod !== 'aiden';
  const canisterCount = preferences.canisterCount || 3;
  const sealed = beans.filter(b => b.status === 'SEALED');
  const slotNumbers = Array.from({ length: canisterCount }, (_, i) => i + 1);
  const emptySlots = slotNumbers.filter(n => !beans.find(b => b.status === 'ACTIVE' && b.jarSlot === n));
  const peakCount = sealed.filter(b => getPeakStatus(b).label.startsWith('In Peak')).length;
  const [scanOpen, setScanOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [newBeanEntry, setNewBeanEntry] = useState(null);
  const liveNewBean = newBeanEntry ? beans.find(b => b.id === newBeanEntry.id) : null;
  const newBeanForModal = newBeanEntry
    ? { ...newBeanEntry, ...(liveNewBean || {}), _scanPhotos: newBeanEntry._scanPhotos }
    : null;

  const handleBeanCreated = (beanId, beanData) => {
    setScanOpen(false);
    setManualOpen(false);
    setNewBeanEntry(beanData);
  };

  useEffect(() => {
    if (pendingAddBeanMode === 'scan') {
      setScanOpen(true);
      onPendingAddBeanConsumed?.();
    } else if (pendingAddBeanMode === 'manual_add') {
      setManualOpen(true);
      onPendingAddBeanConsumed?.();
    }
  }, [pendingAddBeanMode, onPendingAddBeanConsumed]);
  const [search, setSearch] = useState('');
  const [finishPrompt, setFinishPrompt] = useState(null);
  const [toast, setToast] = useState(null);
  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings, getBeanById);
  const aiden = useAidenBrew(updateBean);
  const handBrew = useHandBrew(updateBean, saveHandBrewTiming);
  const { detailBean, morphRect, openDetail, closeDetail } = useBeanDetail();
  const [editBean, setEditBean] = useState(null);
  const [detailTasting, setDetailTasting] = useState(null); // tasting opened from the bean card

  const handleFreeze = async (bean) => {
    if (isDemo) { onDemoAction?.(); return; }
    try {
      if (bean.frozenAt) {
        const d = daysBetween(bean.frozenAt, today());
        await updateBean(bean.id, { frozenAt: null, frozenDays: (bean.frozenDays || 0) + (d || 0) });
      } else {
        await updateBean(bean.id, { frozenAt: today() });
      }
    } catch (err) { console.error('Freeze failed:', err); }
  };

  // Opens a bean into the first free jar. Jars hold 3 active beans; when all are full
  // we surface a toast instead of evicting one arbitrarily (matches Rotation, which
  // simply hides the open affordance when there's no room).
  const tryOpenBean = (bean) => {
    if (isDemo) { onDemoAction?.(); return; }
    if (emptySlots.length === 0) { setToast('All 3 jars are full — finish a bean to free one.'); return; }
    onOpenBean(bean.id, emptySlots[0]);
  };

  // Footer for each rail card: Open into jar (primary) + Brew / Learn / Freeze (secondary).
  // Matches the Rotation footer — Brew long-presses to the method menu, Learn uses the
  // Ruphus avatar, Freeze toggles the bean's frozen state. (Finish lives on the card back.)
  const railActions = (bean) => (
    <div style={{ padding: '12px 16px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ borderTop: `1px solid ${C.hairline}`, marginBottom: 1 }} />
      <OpenJarBtn onClick={() => tryOpenBean(bean)} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <BrewPill bean={bean} isHandBrew={isHandBrew} isDemo={isDemo} onDemoAction={onDemoAction} aiden={aiden} handBrew={handBrew} />
        <GlassPill color={C.accent} bg={C.accentSoft}
          icon={<img src="/images/ruphus-avatar.png" alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />}
          label="Learn" onClick={() => isDemo ? onDemoAction?.() : handleLearn(bean)} />
        <GlassPill color={bean.frozenAt ? C.frost : C.accent} bg={bean.frozenAt ? C.frostBg : C.accentSoft}
          icon={<Snowflake size={18} />} label={bean.frozenAt ? 'Frozen' : 'Freeze'}
          onClick={() => handleFreeze(bean)} />
      </div>
    </div>
  );

  const handleFinishBag = (bean) => {
    const hasTasting = tastings.some(t => t.beanId === bean.id);
    if (hasTasting) {
      onFinishBean(bean.id);
      setToast(`${bean.name} finished!`);
    } else {
      setFinishPrompt(bean);
    }
  };

  const matchesSearch = (bean, q) => {
    if (!q) return true;
    const lq = q.toLowerCase();
    return [bean.name, bean.roaster, bean.origin, bean.variety, bean.process,
      bean.bagNotes, bean.producer, bean.region, bean.farm, bean.roastLevel, bean.sourcedBy]
      .some(v => v && v.toLowerCase().includes(lq));
  };

  const filtered = sealed.filter(b => matchesSearch(b, search));

  // Group by roaster
  const grouped = {};
  filtered.forEach(b => {
    (grouped[b.roaster] = grouped[b.roaster] || []).push(b);
  });

  // Sort within groups by peak status priority
  Object.keys(grouped).forEach(k => {
    grouped[k].sort((a, b) => {
      const pa = getPeakStatus(a);
      const pb = getPeakStatus(b);
      const order = { 'Past Peak': 0, 'Fading': 0, 'Stale': 0, 'In Peak': 1, 'Resting': 2, 'Degassing': 3, 'Unknown': 4 };
      const catA = pa.label.startsWith('In Peak') ? 'In Peak' : pa.label.split(' (')[0].split(' +')[0];
      const catB = pb.label.startsWith('In Peak') ? 'In Peak' : pb.label.split(' (')[0].split(' +')[0];
      return (order[catA] ?? 4) - (order[catB] ?? 4);
    });
  });

  // Flattened rail order for swipe-nav — same roaster-key sort + within-group order the
  // render below uses, so siblings matches exactly what's on screen.
  const railOrder = Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .flatMap(k => grouped[k]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      position: 'absolute', inset: 0,
    }}>
      {/* Fixed header — glass surface, editorial typography */}
      <div style={{
        flexShrink: 0,
        background: glass.chrome,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        borderBottom: `1px solid ${glass.chromeBorder}`,
        padding: '14px 20px 12px',
      }}>
        {/* Title row + Add Bean CTA */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ minWidth: 0, flex: '1 1 auto' }}>
            {/* Eyebrow label */}
            <div style={{
              ...type.label,
              color: C.accent,
              marginBottom: 4,
            }}>
              Sealed Inventory
            </div>
            {/* Fraunces display title */}
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h1.fontSize,
              fontWeight: type.h1.fontWeight,
              lineHeight: type.h1.lineHeight,
              letterSpacing: type.h1.letterSpacing,
              color: C.text,
            }}>
              Patiently waiting
            </div>
          </div>
          <GlassButton
            compact
            onClick={() => { haptic.light(); if (isDemo) onDemoAction?.(); else setScanOpen(true); }}
            style={{ padding: '10px 16px', minHeight: 44, marginTop: 2, flexShrink: 0, whiteSpace: 'nowrap' }}
            data-tour="add-bean"
          >
            <Plus size={15} /> Add Bean
          </GlassButton>
        </div>

        {/* Stats row — inline pills with dot separators */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}>
          {/* In peak stat */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            background: C.greenBg,
            borderRadius: radius.pill,
            padding: '3px 10px 3px 7px',
            border: `1px solid rgba(92,138,102,0.18)`,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, flexShrink: 0 }} />
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.green, lineHeight: 1 }}>
              {peakCount}
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.green, lineHeight: 1, opacity: 0.85 }}>
              in peak
            </span>
          </div>

          <span style={{ color: C.textLight, fontSize: 11, margin: '0 8px', lineHeight: 1 }}>&middot;</span>

          {/* Bags waiting */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.text }}>{sealed.length}</span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.textMuted }}>bags waiting</span>
          </div>

          <span style={{ color: C.textLight, fontSize: 11, margin: '0 8px', lineHeight: 1 }}>&middot;</span>

          {/* Empty slots */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 700, color: C.text }}>{emptySlots.length}</span>
            <span style={{ fontFamily: fonts.body, fontSize: 12, fontWeight: 500, color: C.textMuted }}>
              empty slot{emptySlots.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Search field — premium glass input */}
        {sealed.length > 5 && (
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: 13,
                top: '50%',
                transform: 'translateY(-50%)',
                color: C.textMuted,
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search beans..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 40px',
                borderRadius: radius.md,
                border: `1px solid ${C.hairline}`,
                fontFamily: fonts.body,
                fontSize: 16,
                fontWeight: 500,
                background: C.cream,
                color: C.text,
                boxSizing: 'border-box',
                outline: 'none',
                boxShadow: shadows.e1,
                minHeight: 44,
                WebkitAppearance: 'none',
              }}
            />
          </div>
        )}
      </div>

      {/* Scrollable cards area */}
      <div
        data-tour="sealed-beans"
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          padding: `12px 20px calc(100px + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        {/* Roaster groups with stagger animation */}
        <m.div
          variants={listContainer}
          initial="initial"
          animate="animate"
        >
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
            .map(([roaster, rBeans]) => (
            <m.div key={roaster} variants={listItem} style={{ marginBottom: 22 }}>
              {/* Roaster group header — "ROASTER · N" clean eyebrow + hairline rule */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ ...type.label, color: C.textMuted, flexShrink: 0 }}>
                  {roaster}
                  <span style={{ color: C.textLight, margin: '0 5px' }}>·</span>
                  <span style={{ color: C.textLight, fontVariantNumeric: 'tabular-nums' }}>{rBeans.length}</span>
                </div>
                <div style={{ flex: 1, height: 1, background: C.hairline, marginTop: 1 }} />
              </div>

              {/* Horizontal scroll-snap rail of flagship cards — swipe through this roaster's beans */}
              <div className="bean-shelf hide-scrollbar" style={{ display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch', padding: '2px 20px 6px', margin: '0 -20px', scrollPaddingLeft: 20 }}>
                {rBeans.map(bean => (
                  <div key={bean.id} style={{ scrollSnapAlign: 'center', flex: '0 0 86%', maxWidth: 430 }}>
                    <ShelfCard bean={bean} onOpenDetail={openDetail} actions={railActions(bean)} />
                  </div>
                ))}
              </div>
            </m.div>
          ))}
        </m.div>

        {/* Empty state — warm, inviting */}
        {sealed.length === 0 && (
          <m.div
            {...fadeUp}
            style={{ textAlign: 'center', padding: '40px 20px 24px' }}
          >
            <video
              src={assetUrl("/images/ruphus-animations/ruphus-empty-cup.mp4")}
              autoPlay muted loop playsInline
              style={{
                width: 200, height: 200, objectFit: 'contain', margin: '0 auto 16px',
                display: 'block',
                WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
                maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              }}
            />
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h2.fontSize,
              fontWeight: type.h2.fontWeight,
              lineHeight: type.h2.lineHeight,
              color: C.text,
              marginBottom: 8,
            }}>
              The stash is empty
            </div>
            <div style={{
              fontFamily: fonts.body,
              fontSize: type.body.fontSize,
              fontWeight: type.body.fontWeight,
              lineHeight: type.body.lineHeight,
              color: C.textMuted,
              maxWidth: 240,
              margin: '0 auto 20px',
            }}>
              Add your sealed bags and track every bean before it hits peak.
            </div>
            <GlassButton
              compact
              onClick={() => { haptic.light(); if (isDemo) onDemoAction?.(); else setScanOpen(true); }}
              style={{ minHeight: 44, padding: '10px 20px', flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              <Plus size={15} /> Add Bean
            </GlassButton>
          </m.div>
        )}

        {/* No search results */}
        {sealed.length > 0 && filtered.length === 0 && (
          <m.div
            {...fadeUp}
            style={{
              textAlign: 'center',
              color: C.textMuted,
              fontFamily: fonts.body,
              fontSize: type.body.fontSize,
              padding: '48px 20px',
            }}
          >
            No beans match &ldquo;{search}&rdquo;
          </m.div>
        )}
      </div>

      {/* Trading card — flies open from the tapped rail card via the hero morph */}
      {detailBean && (
        <BeanDetailCard
          bean={detailBean}
          tastings={tastings}
          originRect={morphRect}
          siblings={railOrder}
          onNavigate={(b) => openDetail(b, null)}
          onOpen={(b) => { closeDetail(); tryOpenBean(b); }}
          onClose={closeDetail}
          onLearn={(b) => { closeDetail(); (isDemo ? onDemoAction : handleLearn)?.(b); }}
          onFreeze={handleFreeze}
          onFinish={(b) => { closeDetail(); isDemo ? onDemoAction?.() : handleFinishBag(b); }}
          onEdit={(b) => { closeDetail(); isDemo ? onDemoAction?.() : setEditBean(b); }}
          onOpenTasting={(t) => setDetailTasting(t)}
        />
      )}
      {/* Full tasting opened from the bean card — z above BeanDetailCard (4600) so it stacks on top */}
      {detailTasting && (
        <TastingDetailCard
          tasting={detailTasting}
          bean={detailBean}
          z={5000}
          onClose={() => setDetailTasting(null)}
        />
      )}
      {editBean && (
        <EditBeanModal
          open={!!editBean}
          onClose={() => setEditBean(null)}
          bean={editBean}
          updateBean={updateBean}
          deleteBean={deleteBean}
          uid={uid}
        />
      )}

      <ScanSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onBeanCreated={handleBeanCreated}
        onManualEntry={() => { setScanOpen(false); setManualOpen(true); }}
        uid={uid}
        addBean={onAddBean}
        updateBean={updateBean}
      />
      <ManualEntrySheet
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onBeanCreated={handleBeanCreated}
        addBean={onAddBean}
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
        icedRecipe={handBrew.handBrewIcedRecipe}
        icedLoading={handBrew.handBrewIcedLoading}
        icedError={handBrew.handBrewIcedError}
        onRetryIced={handBrew.onRetryIced}
        loading={handBrew.handBrewLoading}
        error={handBrew.handBrewError}
        phase={handBrew.handBrewPhase}
        onRetry={handBrew.onRetry}
        onRegenerate={handBrew.onRegenerate}
        onKalitaSizeChange={handBrew.handleKalitaSizeChange}
        onV60VariantChange={handBrew.handleV60VariantChange}
        onKalitaIcedChillingMethodChange={handBrew.handleKalitaIcedChillingMethodChange}
        bean={handBrew.handBrewBean}
        onStartTasting={onStartTastingSession}
        userCoffeeGrams={handBrew.userCoffeeGrams}
        onCoffeeGramsChange={handBrew.handleCoffeeGramsChange}
        onPersistDose={handBrew.persistDose}
        onSaveTimingEvent={handBrew.saveTimingEvent}
      />
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
      <ProfessorRuphusSlideUp {...ruphusProps} />
    </div>
  );
};
