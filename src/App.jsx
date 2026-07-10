// App shell — warm Ghibli-inspired coffee journal
import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { assetUrl } from "./lib/assetUrl";
import { getOnboardingPalate } from './lib/palateProfile';
import { buildNewBeanData } from './lib/beanBuilder';
import { Settings as SettingsIcon } from 'lucide-react';
import { C, fonts, shadows, glass } from './styles/theme';
import { m, spring } from './lib/motion';
import SteamGradient from './components/visual/SteamGradient';
import { haptic } from './lib/haptics';
import { today } from './lib/peakStatus';
import { useAuthContext } from './contexts/AuthContext';
// Rotation is the landing tab -- keep it eagerly imported so first paint
// doesn't wait on a dynamic chunk. The other four tabs lazy-load on first
// select; the user can only be looking at one tab at a time anyway.
import { RotationTab } from './tabs/RotationTab';
const InventoryTab = lazy(() => import('./tabs/InventoryTab').then(m => ({ default: m.InventoryTab })));
const TastingTab = lazy(() => import('./tabs/TastingTab').then(m => ({ default: m.TastingTab })));
const ChatTab = lazy(() => import('./tabs/ChatTab').then(m => ({ default: m.ChatTab })));
const ArchiveTab = lazy(() => import('./tabs/ArchiveTab').then(m => ({ default: m.ArchiveTab })));
import { OpenBeanFlow } from './components/OpenBeanFlow';
import { SettingsPage } from './components/SettingsPage';
import { TourOverlay } from './components/TourOverlay';
import { Wordmark } from './components/Wordmark';
import { usePreferences } from './hooks/useUserProfile';
import { Modal } from './components/Modal';

// Minimal fallback while a lazy tab chunk is fetching. Matches the app
// background so it doesn't flash white on iOS WKWebView.
const TabFallback = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontSize: 14 }}>
    Loading...
  </div>
);

const tabs = [
  { key: 'rotation', label: 'Rotation', img: '/images/nav-rotation.webp' },
  { key: 'inventory', label: 'Inventory', img: '/images/nav-inventory.webp' },
  { key: 'tasting', label: 'Tasting', img: '/images/nav-tasting.webp' },
  { key: 'chat', label: 'Chat', img: '/images/nav-chat.webp' },
  { key: 'archive', label: 'Archive', img: '/images/nav-archive.webp' },
];

export const App = ({ uid, beans, tastings, addBean, updateBean, deleteBean, addTasting, updateTasting, deleteTasting, openBean, finishBean, returnBean, getBeanById, profile, updateProfile, refetchBeans, isDemo, onDemoAction }) => {
  const { preferences } = usePreferences();
  const [tab, setTab] = useState('rotation');
  // Onboarding palate seam (null for every pre-onboarding-100x profile).
  const onboardingPalate = useMemo(() => getOnboardingPalate(profile), [profile]);
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Track which tabs have been visited so we can keep ChatTab mounted after
  // first visit. Chat holds ephemeral conversation state (messages, API
  // history, blob URLs) that only exists in-component, unlike other tabs
  // whose data comes from Firestore props.
  const [visitedTabs, setVisitedTabs] = useState(new Set(['rotation']));
  // When another flow wants to start bean entry, switch to Inventory and pass
  // the exact entry mode through. Onboarding's manual_add path must not be
  // collapsed into scan.
  const [pendingAddBeanMode, setPendingAddBeanMode] = useState(null);
  // Cross-tab bridge from BrewTimer completion → TastingTab coach.
  // Mirrors pendingAddBeanMode: set here, consumed by TastingTab which
  // pre-selects the bean and starts chat mode, then clears the flag.
  const [pendingTastingBeanId, setPendingTastingBeanId] = useState(null);
  // In-session tasting wizard draft. Kept above TastingTab so tab navigation
  // cannot discard an unfinished guided tasting; never persisted to Firebase.
  const [tastingWizardDraft, setTastingWizardDraft] = useState(null);
  const [tourActive, setTourActive] = useState(() => {
    if (new URLSearchParams(window.location.search).has('tour')) return true;
    return !!profile && !profile.tourCompleted && !!profile.onboardingComplete;
  });

  // First-bean celebration: fires once when user goes from 0 beans to >= 1
  const [firstBeanCelebrating, setFirstBeanCelebrating] = useState(false);
  const prevBeanCountRef = useRef(beans.length);
  useEffect(() => {
    const prev = prevBeanCountRef.current;
    prevBeanCountRef.current = beans.length;
    if (prev === 0 && beans.length > 0) {
      setFirstBeanCelebrating(true);
    }
  }, [beans.length]);

  const handleStartTastingSession = (beanId) => {
    if (!beanId) return;
    setPendingTastingBeanId(beanId);
    setTab('tasting');
  };

  const handleOpenBean = (preselectedBeanId, slot) => {
    if (preselectedBeanId) {
      openBean(preselectedBeanId, slot);
    } else {
      setTargetSlot(slot);
      setOpenModal(true);
    }
  };

  const handleStartAddBeanScan = () => {
    setTab('inventory');
    setPendingAddBeanMode('scan');
  };

  const handleModalOpen = (beanId, slot) => {
    openBean(beanId, slot);
    setOpenModal(false);
    setTargetSlot(null);
  };

  const isRotation = tab === 'rotation';
  const firstName = profile?.displayName?.trim().split(/\s+/)[0] || '';
  const greeting = firstName ? `Hi ${firstName}` : today();

  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
  }, [tab]);

  // Set html background to match header — covers WKWebView canvas gap at viewport edge
  useEffect(() => {
    document.documentElement.style.background = isRotation ? C.roast : C.bg;
  }, [isRotation]);

  // Onboarding → home screen handoff. R11 and R13b write
  // `profile.onboardingAnswers.postCompleteAction` as part of the
  // final atomic setDoc, so by the time App.jsx mounts the field is
  // readable. One-shot: consume + clear so a later profile refresh
  // or navigation doesn't re-trigger. Mirrors the `pendingAddBeanMode`
  // bridge but Firestore-backed so it survives a cross-device hand-off.
  //
  // R10's held scan (`pendingScanBean`, see LOOP_LOG D10): when the user
  // scanned their first bag during onboarding, action === 'scan' AND a
  // compact pendingScanBean is present. Instead of launching the scan
  // flow again, we create the bean directly from the held fields —
  // exactly once — then clear BOTH postCompleteAction and
  // pendingScanBean in the SAME updateProfile write. A plain 'scan'
  // action with no held bean (the user skipped R10, or never scanned)
  // keeps launching the scan flow exactly as before.
  const handoffConsumedRef = useRef(false);
  // Fresh beans at consume time — the async closure below would otherwise
  // capture the render-time array (stale-empty on cold native starts).
  const beansRef = useRef(beans);
  beansRef.current = beans;
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    if (tourActive) return;
    const action = profile?.onboardingAnswers?.postCompleteAction;
    if (!action || action === 'none') return;
    handoffConsumedRef.current = true;

    const pendingScanBean = profile?.onboardingAnswers?.pendingScanBean;

    if (action === 'scan' && pendingScanBean) {
      (async () => {
        // AT-MOST-ONCE ordering (codex P23 finding 1): clear the held flags
        // FIRST, then create the bean. A crash between the two loses the held
        // bean (acceptable; the user can re-scan in-app) but can never create
        // a duplicate on the next mount. If the clearing write fails we do
        // NOT create, for the same reason.
        const { pendingScanBean: _drop, ...restAnswers } = profile.onboardingAnswers;
        try {
          await updateProfile?.({
            onboardingAnswers: { ...restAnswers, postCompleteAction: 'none' },
          });
        } catch (err) {
          console.warn('[App] Could not clear scan handoff; skipping bean create to avoid duplicates', err);
          return;
        }
        // Cross-instance/second-device belt: if an identical onboarding bean
        // already exists (another mount won the race), skip creation.
        const dupe = beansRef.current.some(b => b.name === pendingScanBean.name && b.roaster === pendingScanBean.roaster);
        if (dupe) { setTab('inventory'); return; }
        try {
          const beanData = buildNewBeanData({
            roaster: pendingScanBean.roaster,
            name: pendingScanBean.name,
            origin: pendingScanBean.origin,
            variety: pendingScanBean.variety,
            process: pendingScanBean.process,
            roastDate: pendingScanBean.roastDate,
            bagNotes: Array.isArray(pendingScanBean.notes) ? pendingScanBean.notes.join(' / ') : '',
          });
          await addBean(beanData);
        } catch (err) {
          // Never retry-loop a broken held bean.
          console.error('[App] Failed to create bean from onboarding scan', err);
        }
        setTab('inventory');
      })();
      return;
    }

    if (action === 'scan') {
      setTab('inventory');
      setPendingAddBeanMode('scan');
    } else if (action === 'manual_add') {
      setTab('inventory');
      setPendingAddBeanMode('manual_add');
    }
    // Clear the field so re-mounts don't re-trigger. Non-fatal on
    // failure — worst case the next mount hits the guard ref above.
    updateProfile?.({
      onboardingAnswers: { ...profile.onboardingAnswers, postCompleteAction: 'none' },
    }).catch((err) => {
      console.warn('[App] Failed to clear postCompleteAction', err);
    });
  }, [profile, updateProfile, tourActive, addBean]);

  return (
    <div style={{ fontFamily: fonts.body, background: C.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* html background set via useEffect covers WKWebView canvas gap */}
      {/* Header */}
      {isRotation ? (
        <div className="app-header" style={{
          position: 'relative',
          height: `calc(116px + env(safe-area-inset-top, 0px))`,
          flexShrink: 0,
          zIndex: 10,
          overflow: 'hidden',
          background: C.roast,
        }}>
          {/* Animated warm steam shader hero (replaces stock illustration) */}
          <SteamGradient speed={0.85} style={{ inset: 0 }} />
          {/* Fade the shader into the page background so content blends seamlessly */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: '100%', pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(241,234,223,0) 0%, rgba(241,234,223,0.08) 50%, rgba(241,234,223,0.5) 74%, rgba(241,234,223,0.92) 91%, rgba(241,234,223,1) 100%)',
          }} />
          <div style={{
            position: 'relative', zIndex: 1,
            padding: '0 20px',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            height: '100%', paddingBottom: 14,
          }}>
            <div>
              <Wordmark />
              <div style={{ fontSize: 13, color: C.textMuted, fontFamily: fonts.body, fontWeight: 600, marginTop: 3 }}>{greeting}</div>
            </div>
            <button onClick={() => { haptic.selection(); setSettingsOpen(true); }} className="glass" style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${glass.chromeBorder}`, borderRadius: '50%', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', marginBottom: 2, boxShadow: shadows.e1 }} aria-label="Settings">
              <SettingsIcon size={20} color={C.text} />
            </button>
          </div>
        </div>
      ) : (
        <div className="app-header glass" style={{
          position: 'sticky',
          top: 0,
          padding: `calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px`,
          borderBottom: `1px solid ${glass.chromeBorder}`,
          flexShrink: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Wordmark />
            <button onClick={() => { haptic.selection(); setSettingsOpen(true); }} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} aria-label="Settings">
              <SettingsIcon size={20} color={C.textMuted} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: (tab === 'inventory' || tab === 'rotation') ? 'hidden' : 'auto', padding: (tab === 'inventory' || tab === 'rotation') ? 0 : `12px 20px calc(100px + env(safe-area-inset-bottom, 0px))`, position: 'relative', zIndex: 1 }}>
        {tab === 'rotation' && (
          <RotationTab
            uid={uid}
            beans={beans}
            tastings={tastings}
            onFinishBean={finishBean}
            onReturnBean={returnBean}
            onOpenBean={handleOpenBean}
            updateBean={updateBean}
            deleteBean={deleteBean}
            addBean={addBean}
            addTasting={addTasting}
            updateTasting={updateTasting}
            getBeanById={getBeanById}
            onStartTastingSession={handleStartTastingSession}
            onAddBeanQuickAction={handleStartAddBeanScan}
            onboardingPalate={onboardingPalate}
            isDemo={isDemo}
            onDemoAction={onDemoAction}
          />
        )}
        {tab === 'inventory' && (
          <Suspense fallback={<TabFallback />}>
            <InventoryTab
              uid={uid}
              beans={beans}
              tastings={tastings}
              onOpenBean={handleOpenBean}
              onAddBean={addBean}
              updateBean={updateBean}
              deleteBean={deleteBean}
              onFinishBean={finishBean}
              addTasting={addTasting}
              updateTasting={updateTasting}
              getBeanById={getBeanById}
              pendingAddBeanMode={pendingAddBeanMode}
              onPendingAddBeanConsumed={() => setPendingAddBeanMode(null)}
              onStartTastingSession={handleStartTastingSession}
              isDemo={isDemo}
              onDemoAction={onDemoAction}
            />
          </Suspense>
        )}
        {tab === 'tasting' && (
          <Suspense fallback={<TabFallback />}>
            <TastingTab
              beans={beans}
              tastings={tastings}
              onAddTasting={addTasting}
              onUpdateTasting={updateTasting}
              onDeleteTasting={deleteTasting}
              updateBean={updateBean}
              wizardDraft={tastingWizardDraft}
              onWizardDraftChange={setTastingWizardDraft}
              pendingTastingBeanId={pendingTastingBeanId}
              onPendingTastingConsumed={() => setPendingTastingBeanId(null)}
              onboardingPalate={onboardingPalate}
              isDemo={isDemo}
              onDemoAction={onDemoAction}
            />
          </Suspense>
        )}
        {/* ChatTab stays mounted after first visit so tab switches don't
            destroy the conversation. Other tabs derive state from Firestore
            props and don't need this treatment. */}
        {visitedTabs.has('chat') && (
          <div style={{ display: tab === 'chat' ? 'contents' : 'none' }}>
            <Suspense fallback={<TabFallback />}>
              <ChatTab
                beans={beans}
                tastings={tastings}
                addBean={addBean}
                updateBean={updateBean}
                addTasting={addTasting}
                updateTasting={updateTasting}
                profile={profile}
                uid={uid}
                isActive={tab === 'chat'}
                onStartTastingSession={handleStartTastingSession}
                onNavigateToTasting={() => setTab('tasting')}
                isDemo={isDemo}
                onDemoAction={onDemoAction}
              />
            </Suspense>
          </div>
        )}
        {tab === 'archive' && (
          <Suspense fallback={<TabFallback />}>
            <ArchiveTab beans={beans} tastings={tastings} updateBean={updateBean} deleteBean={deleteBean} getBeanById={getBeanById} uid={uid} isDemo={isDemo} onDemoAction={onDemoAction} />
          </Suspense>
        )}
      </div>

      {/* Bottom Tab Bar — frosted glass chrome with a fluid spring indicator */}
      <div
        className="app-tab-bar glass"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          borderTop: `1px solid ${glass.chromeBorder}`,
          display: 'flex', justifyContent: 'space-around',
          padding: '7px env(safe-area-inset-right, 8px) calc(env(safe-area-inset-bottom, 0px)) env(safe-area-inset-left, 8px)',
          zIndex: 100,
          boxShadow: '0 -1px 0 rgba(255,255,255,0.5) inset',
        }}
      >
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { haptic.selection(); setTab(t.key); }}
              aria-label={t.label}
              aria-current={active ? 'page' : undefined}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '4px 8px',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <div style={{
                width: 52, height: 52,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Fluid active indicator — one shared element springs between tabs */}
                {active && (
                  <m.div
                    layoutId="navPill"
                    transition={spring.bouncy}
                    style={{
                      position: 'absolute', inset: 4,
                      borderRadius: '50%',
                      background: C.accentSoft,
                      border: `1.5px solid ${C.accentLight}`,
                      boxShadow: shadows.navActive,
                    }}
                  />
                )}
                <m.img
                  src={t.img}
                  alt=""
                  animate={{ opacity: active ? 1 : 0.5, scale: active ? 1 : 0.92 }}
                  transition={spring.snappy}
                  style={{
                    position: 'relative',
                    width: 42,
                    height: 42,
                    objectFit: 'contain',
                  }}
                />
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 800 : 600,
                fontFamily: fonts.body,
                letterSpacing: active ? '0.01em' : '0',
                color: active ? C.navActive : C.navText,
                transition: 'color 0.2s, font-weight 0.2s',
              }}>
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Open Bean Modal */}
      <OpenBeanFlow
        open={openModal}
        onClose={() => { setOpenModal(false); setTargetSlot(null); }}
        beans={beans}
        onOpenBean={handleModalOpen}
        onAddNewBean={handleStartAddBeanScan}
        targetSlot={targetSlot}
        canisterCount={preferences.canisterCount || 3}
      />

      {/* Settings */}
      <SettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        uid={uid}
        beans={beans}
        refetchBeans={refetchBeans}
      />

      {/* Coach marks tour — runs once after onboarding */}
      {tourActive && (
        <TourOverlay
          setTab={setTab}
          beans={beans}
          profile={profile}
          updateProfile={updateProfile}
          onComplete={() => setTourActive(false)}
        />
      )}

      {/* First bean celebration */}
      <Modal open={firstBeanCelebrating} onClose={() => setFirstBeanCelebrating(false)} title="" centered>
        <div style={{ textAlign: 'center', padding: '8px 0 12px' }}>
          <video
            src={assetUrl("/images/ruphus-animations/ruphus-first-bean.mp4")}
            autoPlay muted playsInline
            onPlay={() => setTimeout(() => setFirstBeanCelebrating(false), 4000)}
            style={{
              width: 200, height: 200, objectFit: 'contain', margin: '0 auto 12px',
              display: 'block',
              WebkitMaskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
              maskImage: 'radial-gradient(ellipse 75% 55% at center 48%, black 60%, transparent 100%)',
            }}
          />
          <div style={{ fontFamily: fonts.heading, fontSize: 20, color: C.text, marginBottom: 4 }}>
            Your first bean!
          </div>
          <div style={{ fontSize: 14, color: C.textMuted }}>
            Welcome to the journey, brewer.
          </div>
        </div>
      </Modal>
    </div>
  );
};
