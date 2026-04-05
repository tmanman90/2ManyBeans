// App shell — warm Ghibli-inspired coffee journal
import { useState, useEffect } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { C, fonts, shadows } from './styles/theme';
import { haptic } from './lib/haptics';
import { today } from './lib/peakStatus';
import { useAuthContext } from './contexts/AuthContext';
import { RotationTab } from './tabs/RotationTab';
import { InventoryTab } from './tabs/InventoryTab';
import { TastingTab } from './tabs/TastingTab';
import { ChatTab } from './tabs/ChatTab';
import { ArchiveTab } from './tabs/ArchiveTab';
import { OpenBeanFlow } from './components/OpenBeanFlow';
import { SettingsPage } from './components/SettingsPage';

const tabs = [
  { key: 'rotation', label: 'Rotation', img: '/images/nav-rotation.png' },
  { key: 'inventory', label: 'Inventory', img: '/images/nav-inventory.png' },
  { key: 'tasting', label: 'Tasting', img: '/images/nav-tasting.png' },
  { key: 'chat', label: 'Chat', img: '/images/nav-chat.png' },
  { key: 'archive', label: 'Archive', img: '/images/nav-archive.png' },
];

export const App = ({ uid, beans, tastings, addBean, updateBean, deleteBean, addTasting, updateTasting, deleteTasting, openBean, finishBean, returnBean, profile, updateProfile }) => {
  const [tab, setTab] = useState('rotation');
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);


  const handleOpenBean = (preselectedBeanId, slot) => {
    if (preselectedBeanId) {
      openBean(preselectedBeanId, slot);
    } else {
      setTargetSlot(slot);
      setOpenModal(true);
    }
  };

  const handleModalOpen = (beanId, slot) => {
    openBean(beanId, slot);
    setOpenModal(false);
    setTargetSlot(null);
  };

  const isRotation = tab === 'rotation';

  // Set html background to match header — covers WKWebView canvas gap at viewport edge
  useEffect(() => {
    document.documentElement.style.background = isRotation ? '#5C6B4E' : C.bg;
  }, [isRotation]);

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
            src="/images/rotation-header.png"
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
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: fonts.body, marginTop: 2 }}>{today()}</div>
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, lineHeight: 1.1 }}>2manybeans</div>
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: fonts.body }}>{today()}</div>
            </div>
            <button onClick={() => { haptic.selection(); setSettingsOpen(true); }} style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }} aria-label="Settings">
              <SettingsIcon size={20} color={C.textMuted} />
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: `12px 20px calc(100px + env(safe-area-inset-bottom, 0px))`, position: 'relative', zIndex: 1 }}>
        {tab === 'rotation' && (
          <RotationTab
            uid={uid}
            beans={beans}
            tastings={tastings}
            onFinishBean={finishBean}
            onReturnBean={returnBean}
            onOpenBean={handleOpenBean}
            updateBean={updateBean}
            addTasting={addTasting}
            updateTasting={updateTasting}
          />
        )}
        {tab === 'inventory' && (
          <InventoryTab
            uid={uid}
            beans={beans}
            tastings={tastings}
            onOpenBean={handleOpenBean}
            onAddBean={addBean}
            updateBean={updateBean}
            onFinishBean={finishBean}
            addTasting={addTasting}
            updateTasting={updateTasting}
          />
        )}
        {tab === 'tasting' && (
          <TastingTab
            beans={beans}
            tastings={tastings}
            onAddTasting={addTasting}
            onUpdateTasting={updateTasting}
            onDeleteTasting={deleteTasting}
            updateBean={updateBean}
          />
        )}
        {tab === 'chat' && (
          <ChatTab
            beans={beans}
            tastings={tastings}
            addBean={addBean}
            updateBean={updateBean}
            addTasting={addTasting}
            updateTasting={updateTasting}
          />
        )}
        {tab === 'archive' && <ArchiveTab beans={beans} tastings={tastings} updateBean={updateBean} />}
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
        targetSlot={targetSlot}
      />

      {/* Settings */}
      <SettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        updateProfile={updateProfile}
        uid={uid}
      />
    </div>
  );
};
