// App shell — warm Ghibli-inspired coffee journal
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { C, fonts, shadows } from './styles/theme';
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
import { usePreferences } from './hooks/useUserProfile';

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

export const App = ({ uid, beans, tastings, addBean, updateBean, deleteBean, addTasting, updateTasting, deleteTasting, openBean, finishBean, returnBean, getBeanById, profile, updateProfile, refetchBeans }) => {
  const { preferences } = usePreferences();
  const [tab, setTab] = useState('rotation');
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Track which tabs have been visited so we can keep ChatTab mounted after
  // first visit. Chat holds ephemeral conversation state (messages, API
  // history, blob URLs) that only exists in-component, unlike other tabs
  // whose data comes from Firestore props.
  const [visitedTabs, setVisitedTabs] = useState(new Set(['rotation']));
  // When the user lands in the empty-inventory state and taps "Add a Bean",
  // we switch to the Inventory tab and signal it to open AddBeanForm.
  // InventoryTab consumes this flag and clears it via onPendingAddBeanConsumed.
  const [pendingAddBean, setPendingAddBean] = useState(false);
  // Cross-tab bridge from BrewTimer completion → TastingTab coach.
  // Mirrors pendingAddBean: set here, consumed by TastingTab which
  // pre-selects the bean and starts chat mode, then clears the flag.
  const [pendingTastingBeanId, setPendingTastingBeanId] = useState(null);
  const [tourActive, setTourActive] = useState(() => {
    if (new URLSearchParams(window.location.search).has('tour')) return true;
    return !!profile && !profile.tourCompleted && !!profile.onboardingComplete;
  });

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

  const handleAddNewBeanFromOpenFlow = () => {
    // Switch to Inventory tab and queue up the AddBeanForm. InventoryTab
    // already owns the AddBeanForm component and its state.
    setTab('inventory');
    setPendingAddBean(true);
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
    document.documentElement.style.background = isRotation ? '#5C6B4E' : C.bg;
  }, [isRotation]);

  // Onboarding → home screen handoff. R11 and R13b write
  // `profile.onboardingAnswers.postCompleteAction` as part of the
  // final atomic setDoc, so by the time App.jsx mounts the field is
  // readable. One-shot: consume + clear so a later profile refresh
  // or navigation doesn't re-trigger. Mirrors the `pendingAddBean`
  // bridge but Firestore-backed so it survives a cross-device hand-off.
  const handoffConsumedRef = useRef(false);
  useEffect(() => {
    if (handoffConsumedRef.current) return;
    if (tourActive) return;
    const action = profile?.onboardingAnswers?.postCompleteAction;
    if (!action || action === 'none') return;
    handoffConsumedRef.current = true;
    if (action === 'scan' || action === 'manual_add') {
      setTab('inventory');
      setPendingAddBean(true);
    }
    // Clear the field so re-mounts don't re-trigger. Non-fatal on
    // failure — worst case the next mount hits the guard ref above.
    updateProfile?.({
      onboardingAnswers: { ...profile.onboardingAnswers, postCompleteAction: 'none' },
    }).catch((err) => {
      console.warn('[App] Failed to clear postCompleteAction', err);
    });
  }, [profile, updateProfile, tourActive]);

  return (
    <div style={{ fontFamily: fonts.body, background: C.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* html background set via useEffect covers WKWebView canvas gap */}
      {/* Header */}
      {isRotation ? (
        <div className="app-header" style={{
          position: 'relative',
          height: `calc(160px + env(safe-area-inset-top, 0px))`,
          flexShrink: 0,
          zIndex: 10,
          overflow: 'hidden',
          background: '#5C6B4E',
        }}>
          <img
            src="/images/rotation-header.webp"
            alt=""
            style={{
              position: 'absolute', top: -1, left: 0, right: 0,
              width: '100%', height: 'calc(100% + 1px)',
              objectFit: 'cover', objectPosition: 'center 30%',
              pointerEvents: 'none',
            }}
          />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: '100%', pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(250,246,241,0) 0%, rgba(250,246,241,0.3) 40%, rgba(250,246,241,0.7) 65%, rgba(250,246,241,0.95) 85%, rgba(250,246,241,1) 100%)',
          }} />
          <div style={{
            position: 'relative', zIndex: 1,
            padding: '0 20px',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            height: '100%', paddingBottom: 12,
          }}>
            <div>
              <div style={{ fontFamily: fonts.title, fontSize: 36, color: C.accent, lineHeight: 1.1, textShadow: '0 1px 4px rgba(250,246,241,0.8)' }}>2manybeans</div>
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: fonts.body, marginTop: 2 }}>{greeting}</div>
            </div>
            <button onClick={() => { haptic.selection(); setSettingsOpen(true); }} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.5)', border: 'none', borderRadius: '50%', cursor: 'pointer', WebkitTapHighlightColor: 'transparent', marginBottom: 2 }} aria-label="Settings">
              <SettingsIcon size={20} color={C.textMuted} />
            </button>
          </div>
        </div>
      ) : (
        <div className="app-header" style={{
          position: 'sticky',
          top: 0,
          padding: `calc(env(safe-area-inset-top, 0px) + 16px) 20px 12px`,
          borderBottom: `1px solid ${C.borderLight}`,
          background: C.bg,
          flexShrink: 0,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, lineHeight: 1.1 }}>2manybeans</div>
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
              pendingAddBean={pendingAddBean}
              onPendingAddBeanConsumed={() => setPendingAddBean(false)}
              onStartTastingSession={handleStartTastingSession}
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
              pendingTastingBeanId={pendingTastingBeanId}
              onPendingTastingConsumed={() => setPendingTastingBeanId(null)}
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
                isActive={tab === 'chat'}
                onStartTastingSession={handleStartTastingSession}
              />
            </Suspense>
          </div>
        )}
        {tab === 'archive' && (
          <Suspense fallback={<TabFallback />}>
            <ArchiveTab beans={beans} tastings={tastings} updateBean={updateBean} deleteBean={deleteBean} getBeanById={getBeanById} uid={uid} />
          </Suspense>
        )}
      </div>

      {/* Bottom Tab Bar */}
      <div
        className="app-tab-bar"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.navBg,
          borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-around',
          padding: '6px env(safe-area-inset-right, 8px) calc(env(safe-area-inset-bottom, 0px)) env(safe-area-inset-left, 8px)',
          zIndex: 100,
        }}
      >
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => { haptic.selection(); setTab(t.key); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '4px 8px',
                transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 56, height: 56,
                position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {/* Circle background (separate from image to avoid clipping) */}
                <div style={{
                  position: 'absolute', inset: 0,
                  borderRadius: '50%',
                  background: active ? C.amberBg : 'transparent',
                  border: active ? `2px solid ${C.accentLight}` : '2px solid transparent',
                  boxShadow: active ? shadows.navActive : 'none',
                  transition: 'all 0.15s',
                }} />
                <img
                  src={t.img}
                  alt={t.label}
                  style={{
                    position: 'relative',
                    width: 44,
                    height: 44,
                    objectFit: 'contain',
                    opacity: active ? 1 : 0.55,
                    transition: 'opacity 0.15s',
                  }}
                />
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                fontFamily: fonts.body,
                color: active ? C.navActive : C.navText,
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
        onAddNewBean={handleAddNewBeanFromOpenFlow}
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
    </div>
  );
};
