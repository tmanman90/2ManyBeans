// Add Bean Form (Photo-First) — ported from prototype lines 920-1150
import { useState, useEffect, useRef } from 'react';
import { Plus, RotateCcw } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getProfileForRoaster, DEFAULT_PROFILE } from '../lib/roasterProfiles';
import { today } from '../lib/peakStatus';
import { scanBeanLabel } from '../lib/claude';
import { Modal } from './Modal';
import { Btn } from './Btn';

export const AddBeanForm = ({ open, onClose, onAdd }) => {
  const empty = { roaster: '', name: '', origin: '', variety: '', process: 'Washed', roastDate: today(), bagSize: 100, bagNotes: '', producer: '' };
  const [f, setF] = useState(empty);
  const [profileInfo, setProfileInfo] = useState(null);
  const [step, setStep] = useState('photo'); // "photo" | "scanning" | "review"
  const [scanError, setScanError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (f.roaster.trim()) {
      const p = getProfileForRoaster(f.roaster);
      setProfileInfo({ ...p, known: p !== DEFAULT_PROFILE });
    } else {
      setProfileInfo(null);
    }
  }, [f.roaster]);

  const reset = () => {
    setF(empty);
    setStep('photo');
    setScanError(null);
    setPreviewUrl(null);
    setProfileInfo(null);
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError(null);
    setStep('scanning');

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Failed to read file'));
      r.readAsDataURL(file);
    });

    const mediaType = file.type || 'image/jpeg';

    try {
      const parsed = await scanBeanLabel(base64, mediaType);
      setF({
        roaster: parsed.roaster || '',
        name: parsed.name || '',
        origin: parsed.origin || '',
        variety: parsed.variety || '',
        process: parsed.process || 'Washed',
        roastDate: parsed.roastDate || today(),
        bagSize: parsed.bagSize || 100,
        bagNotes: parsed.bagNotes || '',
        producer: parsed.producer || '',
      });
      setStep('review');
    } catch (err) {
      console.error('Scan error:', err);
      setScanError("Couldn't read the label. You can fill in details manually.");
      setStep('review');
    }
  };

  const handleSave = () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    const p = getProfileForRoaster(f.roaster);

    onAdd({
      roaster: f.roaster.trim(),
      name: f.name.trim(),
      origin: f.origin.trim(),
      variety: f.variety.trim(),
      process: f.process,
      roastDate: f.roastDate,
      bagSize: Number(f.bagSize) || 100,
      status: 'SEALED',
      atmosSlot: null,
      openDate: null,
      finishDate: null,
      bagNotes: f.bagNotes.trim(),
      producer: f.producer.trim(),
      degasMin: p.degasMin,
      degasMax: p.degasMax,
      peakStart: p.peakStart,
      peakEnd: p.peakEnd,
      guidance: p.guidance,
    });
    reset();
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 14, background: C.bg, color: C.text, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' };
  const rowStyle = { marginBottom: 12 };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add New Bean">
      {/* STEP 1: Photo upload */}
      {step === 'photo' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} />
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              cursor: 'pointer', background: C.card,
              border: `2px dashed ${C.border}`,
              borderRadius: 16, padding: '40px 20px',
              marginBottom: 16, transition: 'border-color 0.15s',
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
            <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 4 }}>Snap the bag label</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Take a photo or upload an image</div>
          </div>
          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>— or —</div>
          <Btn variant="ghost" onClick={() => setStep('review')} style={{ margin: '0 auto' }}>Type it manually</Btn>
        </div>
      )}

      {/* STEP 2: Scanning */}
      {step === 'scanning' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {previewUrl && <img src={previewUrl} alt="bag" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 12, marginBottom: 16, opacity: 0.7 }} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <div style={{
              width: 16, height: 16,
              border: `2px solid ${C.accent}`,
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: 14, color: C.textMuted }}>Reading label...</span>
          </div>
        </div>
      )}

      {/* STEP 3: Review / Edit */}
      {step === 'review' && (
        <>
          {previewUrl && (
            <div style={{ marginBottom: 12, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <img src={previewUrl} alt="bag" style={{ width: '100%', maxHeight: 140, objectFit: 'cover' }} />
            </div>
          )}
          {scanError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: C.amberBg, color: C.amber, marginBottom: 12 }}>
              ⚠ {scanError}
            </div>
          )}

          <div style={rowStyle}>
            <label style={labelStyle}>Roaster *</label>
            <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} placeholder="e.g. Apollon's Gold, Koppi..." style={inputStyle} />
            {profileInfo && (
              <div style={{
                marginTop: 6, padding: '6px 10px', borderRadius: 8, fontSize: 12,
                background: profileInfo.known ? C.greenBg : C.amberBg,
                color: profileInfo.known ? C.green : C.amber,
              }}>
                {profileInfo.known ? '✓ ' : '⚠ Unknown roaster — '}
                Degas {profileInfo.degasMin}–{profileInfo.degasMax}d · Peak {profileInfo.peakStart}–{profileInfo.peakEnd}d
                {!profileInfo.known && ' (est.)'}
              </div>
            )}
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Coffee Name *</label>
            <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Finca San Antonio" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
            <div>
              <label style={labelStyle}>Origin</label>
              <input value={f.origin} onChange={e => setF(p => ({ ...p, origin: e.target.value }))} placeholder="e.g. Colombia" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Variety</label>
              <input value={f.variety} onChange={e => setF(p => ({ ...p, variety: e.target.value }))} placeholder="e.g. Geisha" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
            <div>
              <label style={labelStyle}>Process</label>
              <select value={f.process} onChange={e => setF(p => ({ ...p, process: e.target.value }))} style={inputStyle}>
                {['Washed', 'Natural', 'Anaerobic Honey', 'Anaerobic Natural', 'White Honey', 'Advanced Natural', 'Honey', 'Other'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Bag Size (g)</label>
              <input value={f.bagSize} onChange={e => setF(p => ({ ...p, bagSize: e.target.value }))} type="number" min={1} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
            <div>
              <label style={labelStyle}>Roast Date</label>
              <input value={f.roastDate} onChange={e => setF(p => ({ ...p, roastDate: e.target.value }))} type="date" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Producer</label>
              <input value={f.producer} onChange={e => setF(p => ({ ...p, producer: e.target.value }))} placeholder="Optional" style={inputStyle} />
            </div>
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Tasting Notes</label>
            <input value={f.bagNotes} onChange={e => setF(p => ({ ...p, bagNotes: e.target.value }))} placeholder="e.g. peach / floral / citrus" style={inputStyle} />
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="secondary" onClick={reset} style={{ flex: 0 }}>
              <RotateCcw size={14} /> Rescan
            </Btn>
            <Btn
              variant="primary"
              onClick={handleSave}
              style={{ flex: 1, justifyContent: 'center', opacity: f.roaster.trim() && f.name.trim() ? 1 : 0.4 }}
            >
              <Plus size={14} /> Add to Inventory
            </Btn>
          </div>
        </>
      )}
    </Modal>
  );
};
