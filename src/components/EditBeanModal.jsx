// Edit Bean Modal — edit any bean field + grind settings + enriched details + photo
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Save, Camera, Trash2 } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { compressImage } from '../lib/claude';
import { generateAndUploadProductShot } from '../lib/productShot';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { scrollOnFocus } from '../lib/formHelpers';

export const EditBeanModal = ({ open, onClose, bean, updateBean, deleteBean, uid }) => {
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoGenerating, setPhotoGenerating] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const fileRef = useRef(null);
  const photoInFlight = useRef(false);

  useEffect(() => {
    if (bean && open) {
      setF({
        roaster: bean.roaster || '',
        name: bean.name || '',
        origin: bean.origin || '',
        variety: bean.variety || '',
        process: bean.process || 'Washed',
        bagSize: bean.bagSize || 100,
        roastDate: bean.roastDate || '',
        producer: bean.producer || '',
        bagNotes: bean.bagNotes || '',
        ssGrind: bean.aidenGrind?.singleServe ?? '',
        batchGrind: bean.aidenGrind?.batch ?? '',
        region: bean.region || '',
        altitude: bean.altitude || '',
        farm: bean.farm || '',
        roastLevel: bean.roastLevel || '',
        cupScore: bean.cupScore || '',
        brewingRec: bean.brewingRec || '',
        sourcedBy: bean.sourcedBy || '',
      });
      setPhotoGenerating(false);
      setPhotoError(false);
      setConfirmDelete(false);
      photoInFlight.current = false;
    }
  }, [bean, open]);

  if (!bean) return null;

  const handleDelete = async () => {
    if (!deleteBean || !bean.id) return;
    await deleteBean(bean.id);
    onClose();
  };

  // Fire-and-forget product shot generation (non-blocking)
  const fireProductShot = (photo) => {
    if (photoInFlight.current || !uid || !bean.id) return;
    photoInFlight.current = true;
    setPhotoGenerating(true);
    setPhotoError(false);
    const capturedBeanId = bean.id;
    generateAndUploadProductShot(photo, uid, capturedBeanId, updateBean)
      .then(() => { setPhotoGenerating(false); photoInFlight.current = false; })
      .catch(err => {
        console.error('Photo generation failed:', err);
        setPhotoGenerating(false);
        setPhotoError(true);
        photoInFlight.current = false;
      });
  };

  const handlePhotoCapture = async (file) => {
    try {
      const compressed = await compressImage(file);
      fireProductShot(compressed);
    } catch (err) {
      console.error('Image compression failed:', err);
      setPhotoError(true);
    }
  };

  const handleNativePhoto = async () => {
    try {
      const { Camera: CapCamera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perms = await CapCamera.checkPermissions();
      if (perms.camera !== 'granted' || perms.photos !== 'granted') {
        const requested = await CapCamera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (requested.camera === 'denied') return;
      }
      const image = await CapCamera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        width: 1200,
        height: 1200,
      });
      const base64 = image.dataUrl.split(',')[1];
      fireProductShot({ base64, mediaType: 'image/jpeg' });
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Camera error:', err);
      }
    }
  };

  const handleSave = async () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    setSaving(true);

    const changes = {};
    if (f.roaster.trim() !== (bean.roaster || '')) changes.roaster = f.roaster.trim();
    if (f.name.trim() !== (bean.name || '')) changes.name = f.name.trim();
    if (f.origin.trim() !== (bean.origin || '')) changes.origin = f.origin.trim();
    if (f.variety.trim() !== (bean.variety || '')) changes.variety = f.variety.trim();
    if (f.process !== (bean.process || 'Washed')) changes.process = f.process;
    if (Number(f.bagSize) !== (bean.bagSize || 100)) changes.bagSize = Number(f.bagSize) || 100;
    if (f.roastDate !== (bean.roastDate || '')) changes.roastDate = f.roastDate;
    if (f.producer.trim() !== (bean.producer || '')) changes.producer = f.producer.trim();
    if (f.bagNotes.trim() !== (bean.bagNotes || '')) changes.bagNotes = f.bagNotes.trim();

    // Enriched fields
    if (f.region.trim() !== (bean.region || '')) changes.region = f.region.trim();
    if (f.altitude.trim() !== (bean.altitude || '')) changes.altitude = f.altitude.trim();
    if (f.farm.trim() !== (bean.farm || '')) changes.farm = f.farm.trim();
    if (f.roastLevel !== (bean.roastLevel || '')) changes.roastLevel = f.roastLevel;
    if (f.cupScore.trim() !== (bean.cupScore || '')) changes.cupScore = f.cupScore.trim();
    if (f.brewingRec.trim() !== (bean.brewingRec || '')) changes.brewingRec = f.brewingRec.trim();
    if (f.sourcedBy.trim() !== (bean.sourcedBy || '')) changes.sourcedBy = f.sourcedBy.trim();

    // Grind handling
    const ssNum = Number(f.ssGrind);
    const ss = f.ssGrind !== '' && !isNaN(ssNum) ? ssNum : null;
    const batchNum = Number(f.batchGrind);
    const batch = f.batchGrind !== '' && !isNaN(batchNum) ? batchNum : null;
    const oldSs = bean.aidenGrind?.singleServe ?? null;
    const oldBatch = bean.aidenGrind?.batch ?? null;

    if (ss !== oldSs || batch !== oldBatch) {
      if (ss !== null || batch !== null) {
        changes.aidenGrind = { singleServe: ss, batch };
      } else {
        changes.aidenGrind = null;
      }
    }

    if (Object.keys(changes).length > 0) {
      await updateBean(bean.id, changes);
    }

    setSaving(false);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' };
  const rowStyle = { marginBottom: 12 };

  return (
    <Modal open={open} onClose={onClose} title="Edit Bean" footer={
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn
          variant="primary"
          onClick={handleSave}
          disabled={saving || !f.roaster?.trim() || !f.name?.trim()}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Save size={14} /> {saving ? 'Saving...' : 'Save Changes'}
        </Btn>
      </div>
    }>
      {/* Photo section */}
      <div style={{ marginBottom: 16 }}>
        {bean.photoUrl ? (
          <div style={{ position: 'relative' }}>
            <img
              src={bean.photoUrl}
              alt={`${bean.name} bag`}
              style={{
                width: '100%', height: 160, objectFit: 'cover', objectPosition: 'center',
                borderRadius: 10, border: `1px solid ${C.borderLight}`,
              }}
            />
            <input ref={fileRef} type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) handlePhotoCapture(e.target.files[0]); }} style={{ display: 'none' }} />
            <Btn
              variant="ghost"
              onClick={() => { setPhotoError(false); Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click(); }}
              disabled={photoGenerating}
              style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 11, padding: '4px 10px', background: 'rgba(255,248,240,0.9)', backdropFilter: 'blur(4px)' }}
            >
              {photoError ? 'Failed. Retry?' : photoGenerating ? 'Generating...' : <><Camera size={12} /> Change Photo</>}
            </Btn>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) handlePhotoCapture(e.target.files[0]); }} style={{ display: 'none' }} />
            {photoError ? (
              <Btn
                variant="ghost"
                onClick={() => Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click()}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 0', border: `1px dashed ${C.border}`, borderRadius: 10, color: C.amber }}
              >
                Photo generation failed. Tap to retry.
              </Btn>
            ) : (
              <Btn
                variant="ghost"
                onClick={() => Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click()}
                disabled={photoGenerating}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 0', border: `1px dashed ${C.border}`, borderRadius: 10 }}
              >
                {photoGenerating ? 'Generating product shot...' : <><Camera size={14} /> Add Photo</>}
              </Btn>
            )}
          </>
        )}
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Roaster *</label>
        <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Coffee Name *</label>
        <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div>
          <label style={labelStyle}>Origin</label>
          <input value={f.origin} onChange={e => setF(p => ({ ...p, origin: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
        </div>
        <div>
          <label style={labelStyle}>Variety</label>
          <input value={f.variety} onChange={e => setF(p => ({ ...p, variety: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div>
          <label style={labelStyle}>Process</label>
          <select value={f.process} onChange={e => setF(p => ({ ...p, process: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus}>
            {['Washed', 'Natural', 'Honey', 'Anaerobic Honey', 'Anaerobic Natural', 'White Honey', 'Anaerobic White Honey', 'Advanced Natural', 'Other'].map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Bag Size (g)</label>
          <input value={f.bagSize} onChange={e => setF(p => ({ ...p, bagSize: e.target.value }))} type="number" min={1} style={inputStyle} onFocus={scrollOnFocus} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <label style={labelStyle}>Roast Date</label>
          <input value={f.roastDate} onChange={e => setF(p => ({ ...p, roastDate: e.target.value }))} type="date" style={{ ...inputStyle, minWidth: 0, overflow: 'hidden' }} onFocus={scrollOnFocus} />
        </div>
        <div style={{ minWidth: 0, overflow: 'hidden' }}>
          <label style={labelStyle}>Producer</label>
          <input value={f.producer} onChange={e => setF(p => ({ ...p, producer: e.target.value }))} placeholder="Optional" style={{ ...inputStyle, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} onFocus={scrollOnFocus} />
        </div>
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Tasting Notes</label>
        <input value={f.bagNotes} onChange={e => setF(p => ({ ...p, bagNotes: e.target.value }))} placeholder="e.g. peach / floral / citrus" style={inputStyle} onFocus={scrollOnFocus} />
      </div>

      {/* Enriched Details */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, ...rowStyle }}>
        <label style={{ ...labelStyle, fontSize: 13, color: C.accent }}>Enriched Details</label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Region</label>
            <input value={f.region} onChange={e => setF(p => ({ ...p, region: e.target.value }))} placeholder="e.g. Huila" style={inputStyle} onFocus={scrollOnFocus} />
          </div>
          <div>
            <label style={labelStyle}>Farm</label>
            <input value={f.farm} onChange={e => setF(p => ({ ...p, farm: e.target.value }))} placeholder="e.g. Finca La Palma" style={inputStyle} onFocus={scrollOnFocus} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Altitude</label>
            <input value={f.altitude} onChange={e => setF(p => ({ ...p, altitude: e.target.value }))} placeholder="e.g. 1800 masl" style={inputStyle} onFocus={scrollOnFocus} />
          </div>
          <div>
            <label style={labelStyle}>Roast Level</label>
            <select value={f.roastLevel} onChange={e => setF(p => ({ ...p, roastLevel: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus}>
              <option value="">—</option>
              {['light', 'medium-light', 'medium', 'medium-dark', 'dark'].map(l => (
                <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={labelStyle}>Cup Score</label>
            <input value={f.cupScore} onChange={e => setF(p => ({ ...p, cupScore: e.target.value }))} placeholder="e.g. 87.5" style={inputStyle} onFocus={scrollOnFocus} />
          </div>
          <div>
            <label style={labelStyle}>Sourced By</label>
            <input value={f.sourcedBy} onChange={e => setF(p => ({ ...p, sourcedBy: e.target.value }))} placeholder="e.g. Dayglow" style={inputStyle} onFocus={scrollOnFocus} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Brewing Recommendations</label>
          <input value={f.brewingRec} onChange={e => setF(p => ({ ...p, brewingRec: e.target.value }))} placeholder="From roaster" style={inputStyle} onFocus={scrollOnFocus} />
        </div>
      </div>

      {/* Grind Settings */}
      <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, ...rowStyle }}>
        <label style={{ ...labelStyle, fontSize: 13, color: C.accent }}>Grind Settings (Ode Gen 2)</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={labelStyle}>SS Grind</label>
            <input
              value={f.ssGrind}
              onChange={e => setF(p => ({ ...p, ssGrind: e.target.value }))}
              type="number"
              step={0.1}
              min={0}
              placeholder="e.g. 4.0"
              style={inputStyle}
              onFocus={scrollOnFocus}
            />
          </div>
          <div>
            <label style={labelStyle}>Batch Grind</label>
            <input
              value={f.batchGrind}
              onChange={e => setF(p => ({ ...p, batchGrind: e.target.value }))}
              type="number"
              step={0.1}
              min={0}
              placeholder="e.g. 6.2"
              style={inputStyle}
              onFocus={scrollOnFocus}
            />
          </div>
        </div>
      </div>

      {/* Delete bean */}
      {deleteBean && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 16, marginBottom: 8 }}>
          {!confirmDelete ? (
            <Btn
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              style={{ width: '100%', justifyContent: 'center', color: C.red }}
            >
              <Trash2 size={14} /> Delete Bean
            </Btn>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: C.text, marginBottom: 10 }}>
                Delete <strong>{bean.name}</strong>? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="secondary" onClick={() => setConfirmDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Cancel
                </Btn>
                <Btn
                  variant="primary"
                  onClick={handleDelete}
                  style={{ flex: 1, justifyContent: 'center', background: C.red }}
                >
                  <Trash2 size={14} /> Delete
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}

    </Modal>
  );
};
