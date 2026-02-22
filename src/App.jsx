// App shell — ported from prototype lines 1193-1272
import { useState } from 'react';
import { Coffee, Package, Droplets, MessageCircle, Archive } from 'lucide-react';
import { C, fonts } from './styles/theme';
import { today } from './lib/peakStatus';
import { RotationTab } from './tabs/RotationTab';
import { InventoryTab } from './tabs/InventoryTab';
import { TastingTab } from './tabs/TastingTab';
import { ChatTab } from './tabs/ChatTab';
import { ArchiveTab } from './tabs/ArchiveTab';
import { OpenBeanFlow } from './components/OpenBeanFlow';

const tabs = [
  { key: 'rotation', label: 'Rotation', icon: Coffee },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'tasting', label: 'Tasting', icon: Droplets },
  { key: 'chat', label: 'Chat', icon: MessageCircle },
  { key: 'archive', label: 'Archive', icon: Archive },
];

export const App = ({ beans, tastings, addBean, updateBean, deleteBean, addTasting, updateTasting, deleteTasting, openBean, finishBean, seedTalData }) => {
  const [tab, setTab] = useState('rotation');
  const [openModal, setOpenModal] = useState(false);
  const [targetSlot, setTargetSlot] = useState(null);

  const showSeedButton = beans.length === 0;

  // handleOpenBean has two paths:
  // 1. If preselectedBeanId is provided (from InventoryTab "Open" button), open directly
  // 2. Otherwise open the selection modal
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

  return (
    <div style={{ fontFamily: fonts.body, background: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div className="app-header" style={{ padding: '16px 20px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: C.accent,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Coffee size={20} color="#fff" />
        </div>
        <div>
          <div style={{ fontFamily: fonts.title, fontSize: 20, color: C.text, lineHeight: 1.1 }}>Coffee Hub</div>
          <div style={{ fontSize: 11, color: C.textMuted }}>{today()}</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px 100px' }}>
        {tab === 'rotation' && (
          <RotationTab
            beans={beans}
            onFinishBean={finishBean}
            onOpenBean={handleOpenBean}
            showSeedButton={showSeedButton}
            onSeed={seedTalData}
          />
        )}
        {tab === 'inventory' && (
          <InventoryTab
            beans={beans}
            onOpenBean={handleOpenBean}
            onAddBean={addBean}
          />
        )}
        {tab === 'tasting' && (
          <TastingTab
            beans={beans}
            tastings={tastings}
            onAddTasting={addTasting}
            onUpdateTasting={updateTasting}
          />
        )}
        {tab === 'chat' && <ChatTab beans={beans} tastings={tastings} />}
        {tab === 'archive' && <ArchiveTab beans={beans} />}
      </div>

      {/* Bottom Tab Bar */}
      <div
        className="app-tab-bar"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: C.cream, borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-around',
          padding: '8px 0',
          zIndex: 100,
        }}
      >
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 2, padding: '4px 12px',
                opacity: active ? 1 : 0.5, transition: 'opacity 0.15s',
              }}
            >
              <Icon size={20} color={active ? C.accent : C.textMuted} strokeWidth={active ? 2.5 : 2} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? C.accent : C.textMuted }}>
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
