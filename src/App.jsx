// App shell — warm Ghibli-inspired coffee journal
import { useState } from 'react';
import { C, fonts, shadows } from './styles/theme';
import { haptic } from './lib/haptics';
import { today } from './lib/peakStatus';
import { RotationTab } from './tabs/RotationTab';
import { InventoryTab } from './tabs/InventoryTab';
import { TastingTab } from './tabs/TastingTab';
import { ChatTab } from './tabs/ChatTab';
import { ArchiveTab } from './tabs/ArchiveTab';
import { OpenBeanFlow } from './components/OpenBeanFlow';

const tabs = [
  { key: 'rotation', label: 'Rotation', img: '/images/nav-rotation.png' },
  { key: 'inventory', label: 'Inventory', img: '/images/nav-inventory.png' },
  { key: 'tasting', label: 'Tasting', img: '/images/nav-tasting.png' },
  { key: 'chat', label: 'Chat', img: '/images/nav-chat.png' },
  { key: 'archive', label: 'Archive', img: '/images/nav-archive.png' },
];

export const App = ({ beans, tastings, addBean, updateBean, deleteBean, addTasting, updateTasting, deleteTasting, openBean, finishBean, returnBean, seedTalData }) => {
  const [tab, setTab] = useState('rotation');
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);

  const showSeedButton = beans.length === 0;

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

  return (
    <div style={{ fontFamily: fonts.body, background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {isRotation ? (
        <div className="app-header" style={{
          position: 'relative',
          height: 160,
          zIndex: 0,
        }}>
          <img
            src="/images/rotation-header.png"
            alt=""
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              width: '100%', height: 450,
              objectFit: 'cover', objectPosition: 'center 30%',
              pointerEvents: 'none',
            }}
          />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 450, pointerEvents: 'none',
            background: 'linear-gradient(to bottom, rgba(250,246,241,0.15) 0%, rgba(250,246,241,0.7) 25%, rgba(250,246,241,0.88) 40%, rgba(250,246,241,0.95) 60%, rgba(250,246,241,1) 85%)',
          }} />
          <div style={{
            position: 'relative', zIndex: 1,
            padding: '0 20px',
            display: 'flex', alignItems: 'flex-end',
            height: '100%', paddingBottom: 12,
          }}>
            <div>
              <div style={{ fontFamily: fonts.title, fontSize: 36, color: C.accent, lineHeight: 1.1, textShadow: '0 1px 4px rgba(250,246,241,0.8)' }}>Coffee Hub</div>
              <div style={{ fontSize: 12, color: C.textMuted, fontFamily: fonts.body, marginTop: 2 }}>{today()}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="app-header" style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid ${C.borderLight}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <div style={{ fontFamily: fonts.title, fontSize: 32, color: C.accent, lineHeight: 1.1 }}>Coffee Hub</div>
            <div style={{ fontSize: 12, color: C.textMuted, fontFamily: fonts.body }}>{today()}</div>
          </div>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 100px', position: 'relative', zIndex: 1 }}>
        {tab === 'rotation' && (
          <RotationTab
            beans={beans}
            tastings={tastings}
            onFinishBean={finishBean}
            onReturnBean={returnBean}
            onOpenBean={handleOpenBean}
            updateBean={updateBean}
            showSeedButton={showSeedButton}
            onSeed={seedTalData}
            addTasting={addTasting}
            updateTasting={updateTasting}
          />
        )}
        {tab === 'inventory' && (
          <InventoryTab
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
          padding: '6px 0',
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
                borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active ? C.amberBg : 'transparent',
                border: active ? `2px solid ${C.accentLight}` : '2px solid transparent',
                boxShadow: active ? shadows.navActive : 'none',
                transition: 'all 0.15s',
              }}>
                <img
                  src={t.img}
                  alt={t.label}
                  style={{
                    width: 44, height: 44,
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
    </div>
  );
};
