// Edit Bean Modal — edit any bean field + grind settings + enriched details + photo
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Save, Camera, Trash2, X, Search } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getPeakStatus, daysSinceRoast, parseShelfLifeDays, effectivePeakEnd } from '../lib/peakStatus';
import { compressImage } from '../lib/claude';
import { generateProductShot, researchBeanOnline, summarizeNotes } from '../lib/gemini';
import { uploadOriginalPhoto } from '../lib/storage';
import { generateRuphusStory } from '../lib/professorRuphus';
import { handlePaywallError } from '../lib/paywallHelpers';
import { ENRICHABLE_FIELDS } from '../lib/beanFields';
import { buildSourceContextHash, summarizeSourceInsights } from '../lib/sourceInsights';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { Toast } from './Toast';
import { scrollOnFocus } from '../lib/formHelpers';
import { PROCESS_TYPES } from '../lib/beanFields';
import { useErrorToast } from '../hooks/useErrorToast';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall';
import { usePreferences } from '../hooks/useUserProfile';
import { GRINDER_LABELS } from '../lib/brewMethods';
import { ROAST_STYLE_CATEGORIES } from '../lib/roasterProfiles';
import { FREE_LIMITS } from '../lib/subscriptionConfig';

const SprigDivider = ({ color = C.accentLight, size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
    <path d="M7 12 Q7 7 7 2" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M7 5 Q4 4 2.5 5.5" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M7 5 Q10 4 11.5 5.5" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M7 8 Q4.5 7.5 3 9" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <path d="M7 8 Q9.5 7.5 11 9" stroke={color} strokeWidth="1" fill="none" strokeLinecap="round"/>
    <ellipse cx="2.5" cy="5.5" rx="1.2" ry="0.6" fill={color} opacity="0.55"/>
    <ellipse cx="11.5" cy="5.5" rx="1.2" ry="0.6" fill={color} opacity="0.55"/>
    <ellipse cx="3" cy="9" rx="1" ry="0.5" fill={color} opacity="0.55"/>
    <ellipse cx="11" cy="9" rx="1" ry="0.5" fill={color} opacity="0.55"/>
  </svg>
);

const ChapterHeader = ({ number, title, subtitle, collapsible, open, onToggle }) => (
  <div
    onClick={collapsible ? onToggle : undefined}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, margin: '22px 0 12px',
      cursor: collapsible ? 'pointer' : 'default',
    }}
  >
    <div style={{
      width: 22, height: 22, borderRadius: '50%', border: `1px solid ${C.accentLight}`,
      color: C.accent, fontFamily: fonts.heading, fontSize: 12, fontWeight: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: C.card,
    }}>{number}</div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: fonts.heading, fontSize: 15, color: C.text, lineHeight: 1.1 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11, color: C.textLight, marginTop: 2 }}>{subtitle}</div>
      )}
    </div>
    <SprigDivider />
    <div style={{ flex: '0 1 80px', height: 1, background: `repeating-linear-gradient(to right, ${C.accentLight} 0, ${C.accentLight} 2px, transparent 2px, transparent 5px)` }} />
    {collapsible && (
      <div style={{ color: C.textLight, fontSize: 11, fontFamily: fonts.body, width: 14, textAlign: 'right' }}>
        {open ? '\u2212' : '+'}
      </div>
    )}
  </div>
);

const PeakTimeline = ({ bean }) => {
  if (!bean.peakStart || !bean.peakEnd) return null;
  const ps = getPeakStatus(bean);
  const days = daysSinceRoast(bean.roastDate, bean);
  const totalRange = bean.peakEnd + 14;
  const pct = Math.max(0, Math.min(1, (days ?? 0) / totalRange));
  const peakStartPct = bean.peakStart / totalRange;
  const peakEndPct = bean.peakEnd / totalRange;
  const degasPct = (bean.degasMin || 0) / totalRange;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 22, color: ps.color, lineHeight: 1 }}>
            {days != null ? `Day ${days}` : '\u2014'}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: ps.color, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {ps.label}
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textLight, fontFamily: fonts.body }}>
          Peak {bean.peakStart}{'\u2013'}{bean.peakEnd}d
        </div>
      </div>
      <div style={{ position: 'relative', height: 46, marginBottom: 4 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 18, height: 10, borderRadius: 5, background: C.cardMuted }} />
        <div style={{ position: 'absolute', left: 0, top: 18, height: 10, borderRadius: '5px 0 0 5px', width: `${degasPct*100}%`, background: '#6B5B95', opacity: 0.18 }} />
        <div style={{ position: 'absolute', top: 14, height: 18, borderRadius: 9, left: `${peakStartPct*100}%`, width: `${(peakEndPct-peakStartPct)*100}%`, background: C.green, opacity: 0.25, border: `1px solid ${C.green}` }} />
        <div style={{ position: 'absolute', top: 18, height: 10, left: `${peakStartPct*100}%`, width: `${(peakEndPct-peakStartPct)*100}%`, background: `linear-gradient(90deg, ${C.green}, ${C.accentLight})`, opacity: 0.85, borderRadius: 5 }} />
        <div style={{ position: 'absolute', top: 0, left: `${peakStartPct*100}%`, transform: 'translateX(-50%)', fontSize: 9, color: C.green, fontWeight: 700 }}>{bean.peakStart}d</div>
        <div style={{ position: 'absolute', top: 0, left: `${peakEndPct*100}%`, transform: 'translateX(-50%)', fontSize: 9, color: C.green, fontWeight: 700 }}>{bean.peakEnd}d</div>
        <div style={{ position: 'absolute', top: 8, left: `${pct*100}%`, transform: 'translateX(-50%)', width: 2, height: 30, background: ps.color, borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 2, left: `${pct*100}%`, transform: 'translateX(-50%)', width: 12, height: 12, borderRadius: '50%', background: C.card, border: `2px solid ${ps.color}`, boxShadow: '0 1px 3px rgba(59,36,23,0.15)' }} />
        <div style={{ position: 'absolute', top: 34, right: 0, fontSize: 9, color: C.textLight }}>+14d</div>
      </div>
    </div>
  );
};

export const EditBeanModal = ({ open, onClose, bean, updateBean, deleteBean, uid, isNewBean = false }) => {
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();
  const { preferences } = usePreferences();
  const [f, setF] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { errorMsg, showError, hideError } = useErrorToast();
  const [photoGenerating, setPhotoGenerating] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [displayPhotoUrl, setDisplayPhotoUrl] = useState('');
  const [aiFilling, setAiFilling] = useState(false);
  const fileRef = useRef(null);
  const photoInFlight = useRef(false);
  const savedRef = useRef(false);
  const wasOpen = useRef(false);
  const [enrichedOpen, setEnrichedOpen] = useState(false);
  const [grindOpen, setGrindOpen] = useState(false);

  useEffect(() => {
    if (open && !wasOpen.current && bean) {
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
        shelfLifeOverride: bean.shelfLifeOverride ? `${bean.shelfLifeOverride} days` : '',
        roasterStyle: bean.roasterStyle || '',
        sourceInsights: bean.sourceInsights || null,
      });
      if (!photoInFlight.current) {
        setPhotoGenerating(false);
        setPhotoError(false);
        setPendingPhoto(isNewBean && bean._scanPhotos?.length > 0 ? bean._scanPhotos[0] : null);
      }
      setDisplayPhotoUrl(bean.photoUrl || '');
      setConfirmDelete(false);
      setEnrichedOpen(false);
      setGrindOpen(false);
      setAiFilling(false);
      savedRef.current = false;
    }
    wasOpen.current = open;
  }, [bean, isNewBean, open]);

  useEffect(() => {
    if (!pendingPhoto && bean?.photoUrl) {
      setDisplayPhotoUrl(bean.photoUrl);
    }
  }, [bean?.photoUrl, pendingPhoto]);

  if (!bean) return null;

  const pendingPhotoDataUrl = pendingPhoto?.base64
    ? `data:${pendingPhoto.mediaType || 'image/jpeg'};base64,${pendingPhoto.base64}`
    : '';
  const pendingPhotoPreviewSrc = pendingPhoto
    ? (pendingPhoto.previewUrl && !pendingPhoto.previewUrl.startsWith('blob:')
      ? pendingPhoto.previewUrl
      : pendingPhotoDataUrl || pendingPhoto.previewUrl)
    : '';

  const NOTE_CHIPS = ['Floral','Citrus','Stonefruit','Chocolate','Nutty','Berry','Caramel','Spice'];
  const addChip = (chip) => {
    const notes = (f.bagNotes || '').trim();
    if (!notes) setF(p => ({ ...p, bagNotes: chip }));
    else if (!notes.toLowerCase().includes(chip.toLowerCase())) {
      setF(p => ({ ...p, bagNotes: notes + (notes.endsWith(',') ? ' ' : ', ') + chip.toLowerCase() }));
    }
  };

  const handleDelete = async () => {
    if (!deleteBean || !bean.id) return;
    photoInFlight.current = false;
    setPhotoGenerating(false);
    await deleteBean(bean.id);
    onClose();
  };

  const handleCancel = async () => {
    if (isNewBean && !savedRef.current && deleteBean && bean.id) {
      await deleteBean(bean.id);
    }
    onClose();
  };

  const handleAiFill = async () => {
    if (aiFilling) return;
    if (!hasPro && (freeUsage?.aiScans ?? 0) >= FREE_LIMITS.aiScans) {
      openPaywall({ feature: 'scan_cap', promote: 'pro' });
      return;
    }
    setAiFilling(true);
    try {
      const research = await researchBeanOnline(f, { metered: true });
      const merged = { ...f };
      for (const field of ENRICHABLE_FIELDS) {
        if (!merged[field] && research[field]) merged[field] = research[field];
      }
      merged.enrichedAt = new Date().toISOString();
      setF(merged);
      generateRuphusStory(merged, { enrichment: research })
        .then(story => {
          if (story && updateBean && bean.id) {
            const storyContextHash = buildSourceContextHash({ ...bean, ...merged });
            updateBean(bean.id, {
              story,
              enrichedAt: merged.enrichedAt,
              storyStatus: 'ready',
              storyGeneratedAt: story.generatedAt || new Date().toISOString(),
              storyContextHash,
              sourceContextHash: storyContextHash,
              storyError: null,
            });
          }
        })
        .catch(() => {});
    } catch (err) {
      if (handlePaywallError(err, openPaywall)) {
        setAiFilling(false);
        return;
      }
      console.log('AI Fill failed:', err.message);
    }
    setAiFilling(false);
  };

  // Capture a photo and hold it as pending. User then chooses "Use This Photo"
  // or "Generate Product Shot" before it's committed.
  const handlePhotoCapture = async (file) => {
    try {
      const compressed = await compressImage(file);
      setPendingPhoto(compressed);
      setPhotoError(false);
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
      setPendingPhoto({ base64, mediaType: 'image/jpeg', previewUrl: image.dataUrl });
      setPhotoError(false);
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Camera error:', err);
      }
    }
  };

  // Upload the user's original photo as the bean image (any user).
  const handleUseOriginal = async () => {
    if (!pendingPhoto || !bean.id || photoInFlight.current) return;
    setPhotoGenerating(true);
    setPhotoError(false);
    try {
      const result = await uploadOriginalPhoto(bean.id, pendingPhoto);
      if (result?.photoUrl) {
        setDisplayPhotoUrl(result.photoUrl);
      }
      if (result?.photoUrl && updateBean) {
        await updateBean(bean.id, { photoUrl: result.photoUrl });
      }
      setPendingPhoto(null);
    } catch (err) {
      showError('Photo upload failed');
      setPhotoError(true);
    }
    setPhotoGenerating(false);
  };

  // Generate an AI product shot from the pending photo.
  // Safety: uploads the original photo first so it's in Firestore before
  // generation starts. If the user saves/navigates away, the original is safe.
  // Metered: free users get FREE_LIMITS.productShots completed generations, then paywall.
  const handleProductShot = () => {
    if (!pendingPhoto || photoInFlight.current || !bean.id) return;
    if (!hasPro && (freeUsage?.productShots ?? 0) >= FREE_LIMITS.productShots) {
      openPaywall({ feature: 'product_shot', promote: 'pro' });
      return;
    }
    photoInFlight.current = true;
    setPhotoGenerating(true);
    setPhotoError(false);
    const capturedBeanId = bean.id;
    const capturedPhoto = pendingPhoto;

    uploadOriginalPhoto(capturedBeanId, capturedPhoto, { writeMode: 'if-empty' })
      .catch(err => console.warn('Original photo upload failed:', err.message));

    generateProductShot(capturedPhoto, capturedBeanId)
      .then(photoUrl => {
        if (!photoInFlight.current) return;
        setPhotoGenerating(false);
        setPendingPhoto(null);
        setDisplayPhotoUrl(photoUrl);
        if (updateBean) {
          updateBean(capturedBeanId, { photoUrl })
            .finally(() => { photoInFlight.current = false; });
        } else {
          photoInFlight.current = false;
        }
      })
      .catch(err => {
        if (!photoInFlight.current) return;
        photoInFlight.current = false;
        setPhotoGenerating(false);
        if (err?.code === 'subscription_required' || err?.code === 'free_tier_exhausted') {
          openPaywall({ feature: 'product_shot', promote: 'pro' });
          return;
        }
        showError('Photo generation failed');
        setPhotoError(true);
      });
  };

  // Remove the current photo from the bean entirely.
  const handleRemovePhoto = async () => {
    if (!bean.id || !updateBean) return;
    photoInFlight.current = false;
    setPhotoGenerating(true);
    try {
      await updateBean(bean.id, { photoUrl: null });
      setDisplayPhotoUrl('');
      // Best-effort Storage cleanup (deleteBeanPhoto is already imported lazily in storage.js)
      const { deleteBeanPhoto } = await import('../lib/storage');
      deleteBeanPhoto(uid, bean.id).catch(() => {});
    } catch (err) {
      showError('Failed to remove photo');
    }
    setPhotoGenerating(false);
  };

  const handleSave = async () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    savedRef.current = true;
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
    if (f.roasterStyle !== (bean.roasterStyle || '')) changes.roasterStyle = f.roasterStyle || null;

    const sourceHashBefore = buildSourceContextHash(bean);
    const sourceHashAfter = buildSourceContextHash({ ...bean, ...changes, sourceInsights: f.sourceInsights || bean.sourceInsights });
    if (sourceHashAfter && sourceHashAfter !== sourceHashBefore) {
      changes.sourceContextHash = sourceHashAfter;
      if (bean.story?.intro) changes.storyStatus = 'stale';
    }

    // Roaster context + enrichedAt (set by AI Fill, not user-editable)
    for (const key of ['roasterLocation', 'roasterDescription', 'roasterFounded', 'redditNotes', 'enrichedAt']) {
      if (f[key] && f[key] !== (bean[key] || '')) changes[key] = f[key];
    }

    // Shelf-life override
    const newShelfDays = parseShelfLifeDays(f.shelfLifeOverride);
    const oldShelfDays = bean.shelfLifeOverride ?? null;
    if (newShelfDays !== oldShelfDays) {
      changes.shelfLifeOverride = newShelfDays ?? null;
    }

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

    // Fire-and-forget: regenerate notesSummary if bagNotes changed
    const newBagNotes = f.bagNotes.trim();
    const oldBagNotes = bean.bagNotes || '';
    if (newBagNotes !== oldBagNotes && newBagNotes && newBagNotes !== '(not logged)') {
      const capturedId = bean.id;
      summarizeNotes(newBagNotes)
        .then(result => {
          if (result != null && updateBean) {
            updateBean(capturedId, { notesSummary: result });
          }
        })
        .catch(() => {});
    }

    setSaving(false);
    onClose();
  };

  const inputStyle = {
    width: '100%', padding: '9px 12px', borderRadius: 10,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.card, color: C.text, boxSizing: 'border-box',
    outline: 'none',
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 700, color: C.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 5, display: 'block',
  };
  const rowStyle = { marginBottom: 12 };
  const filled = [f.roaster, f.name, f.origin, f.variety, f.process, f.bagSize, f.roastDate, f.bagNotes].filter(v => v && String(v).trim()).length;
  const total = 8;
  const sourceSummary = summarizeSourceInsights(f, { maxChars: 260 });

  return (
    <Modal open={open} onClose={handleCancel} title={
      <div>
        <span style={{ fontFamily: fonts.title, fontSize: 28, color: C.accentDark }}>{isNewBean ? 'New Bean' : 'Editing'}</span>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 700, fontFamily: fonts.body }}>
          {bean.roaster} {'\u00B7'} {bean.name.length > 28 ? bean.name.slice(0,28) + '\u2026' : bean.name}
        </div>
      </div>
    } footer={
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700 }}>
          <div style={{ flex: 1, height: 3, background: C.cardMuted, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${(filled/total)*100}%`, height: '100%', background: `linear-gradient(90deg, ${C.accentLight}, ${C.accent})` }} />
          </div>
          <span>{filled}/{total} filled</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={handleCancel}>{isNewBean ? 'Discard' : 'Cancel'}</Btn>
          <Btn
            variant="primary"
            onClick={handleSave}
            disabled={saving || !f.roaster?.trim() || !f.name?.trim()}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            <Save size={14} /> {saving ? 'Saving...' : isNewBean ? 'Add Bean' : 'Save Changes'}
          </Btn>
        </div>
      </div>
    }>
      {/* Photo section */}
      <div style={{ marginBottom: 16 }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={e => { if (e.target.files?.[0]) handlePhotoCapture(e.target.files[0]); }} style={{ display: 'none' }} />

        {/* Pending photo: show preview with choice buttons */}
        {pendingPhoto ? (
          <div>
            <img
              src={pendingPhotoPreviewSrc}
              alt="New photo"
              style={{
                width: '100%', height: 180, objectFit: 'contain', objectPosition: 'center',
                borderRadius: 10, border: `1px solid ${C.borderLight}`, background: C.card,
              }}
            />
            {photoGenerating ? (
              <div style={{ fontSize: 12, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>Processing...</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Btn
                  variant="primary"
                  onClick={handleUseOriginal}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                >
                  Use This Photo
                </Btn>
                <Btn
                  variant="secondary"
                  onClick={handleProductShot}
                  style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}
                >
                  Product Shot
                </Btn>
              </div>
            )}
            {!photoGenerating && (
              <Btn
                variant="ghost"
                onClick={() => setPendingPhoto(null)}
                style={{ width: '100%', justifyContent: 'center', fontSize: 11, marginTop: 4 }}
              >
                Cancel
              </Btn>
            )}
          </div>
        ) : displayPhotoUrl ? (
          <div style={{ position: 'relative', width: '100%', height: 180, background: C.card, overflow: 'hidden', borderRadius: 10 }}>
            <img
              src={displayPhotoUrl}
              alt={`${bean.name} bag`}
              style={{
                width: '100%', height: 180, objectFit: 'contain', objectPosition: 'center',
              }}
            />
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: [
                `linear-gradient(to right, ${C.card}, transparent 35%)`,
                `linear-gradient(to left, ${C.card}, transparent 35%)`,
                `linear-gradient(to top, ${C.card}, transparent 20%)`,
              ].join(', '),
            }} />
            <div style={{ position: 'absolute', bottom: 8, right: 8, display: 'flex', gap: 4 }}>
              <Btn
                variant="ghost"
                onClick={handleRemovePhoto}
                disabled={photoGenerating}
                style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,248,240,0.9)', backdropFilter: 'blur(4px)' }}
              >
                <X size={12} /> Remove
              </Btn>
              <Btn
                variant="ghost"
                onClick={() => { setPhotoError(false); Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click(); }}
                disabled={photoGenerating}
                style={{ fontSize: 11, padding: '4px 10px', background: 'rgba(255,248,240,0.9)', backdropFilter: 'blur(4px)' }}
              >
                {photoError ? 'Failed. Retry?' : <><Camera size={12} /> Change</>}
              </Btn>
            </div>
          </div>
        ) : (
          <>
            {photoError ? (
              <Btn
                variant="ghost"
                onClick={() => Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click()}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 0', border: `1px dashed ${C.border}`, borderRadius: 10, color: C.amber }}
              >
                Failed. Tap to retry.
              </Btn>
            ) : (
              <Btn
                variant="ghost"
                onClick={() => Capacitor.isNativePlatform() ? handleNativePhoto() : fileRef.current?.click()}
                disabled={photoGenerating}
                style={{ width: '100%', justifyContent: 'center', padding: '12px 0', border: `1px dashed ${C.border}`, borderRadius: 10 }}
              >
                {photoGenerating ? 'Processing...' : <><Camera size={14} /> Add Photo</>}
              </Btn>
            )}
          </>
        )}
      </div>

      <ChapterHeader number="1" title="Identity" />
      <div style={rowStyle}>
        <label style={labelStyle}>Roaster *</label>
        <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
      </div>

      <div style={rowStyle}>
        <label style={labelStyle}>Coffee Name *</label>
        <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus} />
      </div>

      {f.roaster?.trim() && f.name?.trim() && (
        <Btn
          variant="ghost"
          onClick={handleAiFill}
          disabled={aiFilling}
          style={{ width: '100%', justifyContent: 'center', marginBottom: 12, fontSize: 12 }}
        >
          <Search size={12} /> {aiFilling ? 'Researching...' : 'AI Fill'}
        </Btn>
      )}

      <ChapterHeader number="2" title="Origin Story" subtitle="Where this coffee comes from" />
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
            {f.process && !PROCESS_TYPES.includes(f.process) && (
              <option value={f.process}>{f.process}</option>
            )}
            {PROCESS_TYPES.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Bag Size (g)</label>
          <input value={f.bagSize} onChange={e => setF(p => ({ ...p, bagSize: e.target.value }))} type="number" min={1} style={inputStyle} onFocus={scrollOnFocus} />
        </div>
      </div>

      <ChapterHeader number="3" title="On the Shelf" subtitle="Roast date sets the peak window" />
      <div style={{ background: C.card, borderRadius: 14, padding: '14px 14px 10px', border: `1px solid ${C.borderLight}`, marginBottom: 12, boxShadow: '0 1px 2px rgba(92,61,46,0.04)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Roast Date</label>
            <div style={{
              ...inputStyle,
              padding: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              background: C.bg,
            }}>
              <input
                value={f.roastDate}
                onChange={e => setF(p => ({ ...p, roastDate: e.target.value }))}
                type="date"
                style={{
                  width: '100%', border: 'none', background: 'transparent',
                  padding: '9px 12px', fontFamily: fonts.body, fontSize: 16,
                  color: C.text, outline: 'none', minWidth: 0,
                }}
                onFocus={scrollOnFocus}
              />
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <label style={labelStyle}>Producer</label>
            <input value={f.producer} onChange={e => setF(p => ({ ...p, producer: e.target.value }))} placeholder="Optional" style={{ ...inputStyle, minWidth: 0, textOverflow: 'ellipsis' }} onFocus={scrollOnFocus} />
          </div>
        </div>
        <PeakTimeline bean={{ ...bean, roastDate: f.roastDate,
          shelfLifeOverride: undefined,
          peakEnd: parseShelfLifeDays(f.shelfLifeOverride) || bean.shelfLifeOverride || bean.peakEnd }} />
      </div>

      <ChapterHeader number="4" title="Tasting Notes" subtitle="From the bag or what you're finding" />
      <div style={{ marginBottom: 10 }}>
        <textarea
          value={f.bagNotes}
          onChange={e => setF(p => ({ ...p, bagNotes: e.target.value }))}
          placeholder="e.g. nectarine, honeysuckle, lavender finish..."
          rows={3}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: `repeating-linear-gradient(to bottom, #FDF8EF 0px, #FDF8EF 27px, ${C.borderLight} 27px, ${C.borderLight} 28px)`,
            fontFamily: fonts.heading, fontSize: 16, color: C.text, lineHeight: '28px',
            boxSizing: 'border-box', resize: 'vertical', outline: 'none',
            fontStyle: f.bagNotes ? 'normal' : 'italic',
          }}
          onFocus={scrollOnFocus}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {NOTE_CHIPS.map(chip => (
          <button
            key={chip}
            onClick={() => addChip(chip)}
            style={{
              padding: '5px 11px', borderRadius: 99,
              border: `1px solid ${C.borderLight}`, background: C.card,
              fontFamily: fonts.body, fontSize: 11, fontWeight: 600, color: C.textMuted,
              cursor: 'pointer',
            }}
          >+ {chip}</button>
        ))}
      </div>
      {sourceSummary && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          borderRadius: 10,
          background: C.amberBg,
          border: `1px solid ${C.border}`,
          fontSize: 12.5,
          color: C.text,
          lineHeight: 1.45,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>
            Source insight
          </div>
          {sourceSummary}
        </div>
      )}

      <ChapterHeader
        number="5" title="Deeper Details"
        subtitle={enrichedOpen ? 'Region, farm, altitude, cup score' : 'Region, farm, altitude...'}
        collapsible open={enrichedOpen}
        onToggle={() => setEnrichedOpen(o => !o)}
      />
      {enrichedOpen && (
        <div>
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
                <option value="">--</option>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelStyle}>Brewing Rec</label>
              <input value={f.brewingRec} onChange={e => setF(p => ({ ...p, brewingRec: e.target.value }))} placeholder="From roaster" style={inputStyle} onFocus={scrollOnFocus} />
            </div>
            <div>
              <label style={labelStyle}>Shelf Life</label>
              <input value={f.shelfLifeOverride} onChange={e => setF(p => ({ ...p, shelfLifeOverride: e.target.value }))} placeholder="e.g. 60 days" style={inputStyle} onFocus={scrollOnFocus} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelStyle}>Roast Style</label>
            <select value={f.roasterStyle} onChange={e => setF(p => ({ ...p, roasterStyle: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus}>
              <option value="">Auto-detect</option>
              {Object.entries(ROAST_STYLE_CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <ChapterHeader
        number="6" title="Grind Settings" subtitle={GRINDER_LABELS[preferences?.grinder] || preferences?.grinderCustomName || 'Grinder'}
        collapsible open={grindOpen}
        onToggle={() => setGrindOpen(o => !o)}
      />
      {grindOpen && (
        <div style={{
          background: `linear-gradient(145deg, ${C.card}, #FDF8EF)`,
          borderRadius: 14, padding: 14, border: `1px solid ${C.borderLight}`,
          position: 'relative', overflow: 'hidden', marginBottom: 12,
        }}>
          <div style={{ position: 'absolute', top: -6, right: -6, opacity: 0.1 }}>
            <svg width="70" height="70" viewBox="0 0 70 70">
              <circle cx="35" cy="35" r="26" fill="none" stroke={C.accent} strokeWidth="1"/>
              <circle cx="35" cy="35" r="18" fill="none" stroke={C.accent} strokeWidth="1"/>
              <circle cx="35" cy="35" r="10" fill="none" stroke={C.accent} strokeWidth="1"/>
              <line x1="35" y1="4" x2="35" y2="12" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
            <div>
              <label style={labelStyle}>Single Serve</label>
              <input
                value={f.ssGrind}
                onChange={e => setF(p => ({ ...p, ssGrind: e.target.value }))}
                type="number"
                step={0.1}
                min={0}
                placeholder="4.0"
                style={{ ...inputStyle, fontFamily: fonts.heading, fontSize: 20, textAlign: 'center' }}
                onFocus={scrollOnFocus}
              />
            </div>
            <div>
              <label style={labelStyle}>Batch</label>
              <input
                value={f.batchGrind}
                onChange={e => setF(p => ({ ...p, batchGrind: e.target.value }))}
                type="number"
                step={0.1}
                min={0}
                placeholder="6.2"
                style={{ ...inputStyle, fontFamily: fonts.heading, fontSize: 20, textAlign: 'center' }}
                onFocus={scrollOnFocus}
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete bean (hidden for new beans — cancel/discard handles cleanup) */}
      {deleteBean && !isNewBean && (
        <div style={{ marginTop: 24, marginBottom: 4 }}>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                width: '100%', padding: 10, borderRadius: 10,
                background: 'transparent', border: `1px dashed ${C.border}`,
                color: C.red, fontFamily: fonts.body, fontSize: 12, fontWeight: 600,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} /> Delete this bean
            </button>
          ) : (
            <div style={{
              padding: 14, borderRadius: 12, background: '#FDF0EB',
              border: `1px solid ${C.red}`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>
                Delete <strong>{bean.name}</strong>? This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn variant="secondary" onClick={() => setConfirmDelete(false)} style={{ flex: 1, justifyContent: 'center' }}>
                  Keep
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

      <Toast message={errorMsg} open={!!errorMsg} onClose={hideError} variant="error" />
    </Modal>
  );
};
