// Add Bean Form — Multi-photo scan + web research + AI Fill
import { useState, useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Plus, RotateCcw, X, Search } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { getProfileForRoaster, DEFAULT_PROFILE } from '../lib/roasterProfiles';
import { today, parseShelfLifeDays } from '../lib/peakStatus';
import { compressImage } from '../lib/claude';
import { scanBeanLabel, researchBeanOnline, generateProductShot, deleteProductShot, summarizeNotes } from '../lib/gemini';
import { uploadOriginalPhoto } from '../lib/storage';
import { generateRuphusStory } from '../lib/professorRuphus';
import { scrollOnFocus } from '../lib/formHelpers';
import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { Toast } from './Toast';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { useErrorToast } from '../hooks/useErrorToast';
import { FREE_LIMITS } from '../lib/subscriptionConfig';
import { ENRICHABLE_FIELDS, PROCESS_TYPES } from '../lib/beanFields';

// Catch a paywall-triggering error from any AI call and route it to the
// global paywall sheet instead of showing a generic toast. Returns true if
// the error was a paywall trigger and was handled, false otherwise.
function handlePaywallError(err, openPaywall) {
  if (err?.code === 'free_tier_exhausted') {
    openPaywall({ feature: 'scan_cap', promote: 'pro' });
    return true;
  }
  if (err?.code === 'subscription_required') {
    openPaywall({
      feature: 'generic',
      promote: err.tier === 'ultra' ? 'ultra' : 'pro',
    });
    return true;
  }
  return false;
}

export const AddBeanForm = ({ open, onClose, onAdd, uid, updateBean, initialData, onToast }) => {
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();
  const { errorMsg, showError, hideError } = useErrorToast();
  const empty = {
    roaster: '', name: '', origin: '', variety: '', process: 'Washed',
    roastDate: '', bagSize: 100, bagNotes: '', producer: '',
    altitude: '', region: '', farm: '', roastLevel: '', cupScore: '',
    brewingRec: '', sourcedBy: '', shelfLife: '', roastedIn: '',
  };
  const [f, setF] = useState(empty);
  const [profileInfo, setProfileInfo] = useState(null);
  const [step, setStep] = useState('photo'); // photo | scanning | researching | review
  const [scanError, setScanError] = useState(null);
  const [photos, setPhotos] = useState([]); // [{ base64, mediaType, previewUrl }]
  const [aiFilling, setAiFilling] = useState(false);
  const fileRef = useRef(null);
  const storyRef = useRef(null); // Background Professor Ruphus story
  const genCounter = useRef(0); // Monotonic counter: invalidates stale story + product shot on rescan
  const pendingBeanIdRef = useRef(null); // Pre-allocated Firestore doc ID for product shot
  const productShotUrlRef = useRef(null); // Holds photoUrl from pre-generated product shot
  const [productShotStatus, setProductShotStatus] = useState('idle'); // idle | generating | ready | failed
  const [photoChoice, setPhotoChoice] = useState('original'); // original | productShot

  // Pre-fill from initialData (e.g. Quick Recipe save-to-inventory)
  const initialRef = useRef(null);
  useEffect(() => {
    if (open && initialData && initialData !== initialRef.current) {
      initialRef.current = initialData;
      const prefill = { ...empty };
      for (const key of Object.keys(prefill)) {
        if (initialData[key] != null && initialData[key] !== '') prefill[key] = initialData[key];
      }
      setF(prefill);
      // Include the photo if provided
      if (initialData.photo) {
        setPhotos([initialData.photo]);
      }
      setStep('review');
    }
  }, [open, initialData]);

  useEffect(() => {
    if (f.roaster.trim()) {
      const p = getProfileForRoaster(f.roaster);
      setProfileInfo({ ...p, known: p !== DEFAULT_PROFILE });
    } else {
      setProfileInfo(null);
    }
  }, [f.roaster]);

  const reset = () => {
    photos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    // Clean up orphaned product shot if user canceled (best-effort)
    if (pendingBeanIdRef.current) {
      deleteProductShot(pendingBeanIdRef.current);
    }
    setF(empty);
    setStep('photo');
    setScanError(null);
    setPhotos([]);
    setProfileInfo(null);
    setAiFilling(false);
    storyRef.current = null;
    pendingBeanIdRef.current = null;
    productShotUrlRef.current = null;
    setProductShotStatus('idle');
    setPhotoChoice('original');
    genCounter.current++;
  };

  const takeNativePhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      // Ensure camera + photo library permissions are granted
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted' || perms.photos !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
        if (requested.camera === 'denied') {
          setScanError('Camera permission denied. Enable it in Settings > 2manybeans.');
          return;
        }
      }
      const image = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        width: 1200,
        height: 1200,
      });
      // Convert dataUrl to the same format as compressImage output
      const mediaType = 'image/jpeg';
      const base64 = image.dataUrl.split(',')[1];
      setPhotos(prev => [...prev, { base64, mediaType, previewUrl: image.dataUrl }].slice(0, 3));
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        console.error('Camera error:', err);
        setScanError(`Failed to capture photo: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setPhotos(prev => [...prev, compressed].slice(0, 3));
    } catch (err) {
      console.error('Compression error:', err);
      setScanError('Failed to process photo. Try another.');
    }
    // Reset input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      // Revoke the removed preview URL
      if (prev[idx]?.previewUrl) URL.revokeObjectURL(prev[idx].previewUrl);
      return updated;
    });
  };

  const handleScan = async () => {
    if (photos.length === 0) return;
    // Free users get FREE_LIMITS.aiScans lifetime bean scans. Client-side
    // pre-check skips the round-trip and shows the paywall instantly. The
    // server still enforces the cap atomically via withCorsAuthMetered.
    if (!hasPro && (freeUsage?.aiScans ?? 0) >= FREE_LIMITS.aiScans) {
      openPaywall({ feature: 'scan_cap', promote: 'pro' });
      return;
    }
    setScanError(null);
    setStep('scanning');

    const thisGen = ++genCounter.current;

    try {
      // Scan first (user-blocking, prioritize bandwidth on cellular)
      const parsed = await scanBeanLabel(photos);
      // If user reset/rescanned while scan was in flight, discard stale results
      if (thisGen !== genCounter.current) return;
      // Save scan results immediately -- safe even if research fails
      const scanData = {
        roaster: parsed.roaster || '',
        name: parsed.name || '',
        origin: parsed.origin || '',
        variety: parsed.variety || '',
        process: parsed.process || '',
        roastDate: parsed.roastDate || '',
        bagSize: parsed.bagSize || 100,
        bagNotes: parsed.bagNotes || '',
        producer: parsed.producer || '',
        region: parsed.region || '',
        altitude: parsed.altitude || '',
        farm: parsed.farm || '',
        roastLevel: parsed.roastLevel || '',
        cupScore: parsed.cupScore || '',
        brewingRec: parsed.brewingRec || '',
        sourcedBy: parsed.sourcedBy || '',
        shelfLife: parsed.shelfLife || '',
        roastedIn: parsed.roastedIn || '',
      };
      setF(scanData);

      // Pre-allocate a Firestore doc ID for the bean. Used by both original
      // photo upload and product shot generation at save time.
      if (uid) {
        pendingBeanIdRef.current = doc(collection(db, 'users', uid, 'beans')).id;
      }

      // Auto-trigger research
      setStep('researching');
      let enrichedData = scanData;
      try {
        const research = await researchBeanOnline(scanData);
        if (thisGen !== genCounter.current) return; // stale guard
        // Merge: only fill empty fields
        const merged = { ...scanData };
        for (const field of ENRICHABLE_FIELDS) {
          if (!merged[field] && research[field]) {
            merged[field] = research[field];
          }
        }
        setF(merged);
        enrichedData = merged;
      } catch (researchErr) {
        console.log('Research skipped/failed:', researchErr.message);
        // Silent — scan data is already saved
      }
      if (thisGen !== genCounter.current) return; // stale guard
      // Background: generate Professor Ruphus story (non-blocking, guarded by gen counter)
      storyRef.current = null;
      generateRuphusStory(enrichedData, { useWebSearch: false })
        .then(story => { if (thisGen === genCounter.current) storyRef.current = story; })
        .catch(err => console.log('Background story gen skipped:', err.message));
      setStep('review');
    } catch (err) {
      if (thisGen !== genCounter.current) return; // stale guard
      // Server-side quota race: client passed the local check but server
      // rejected. Surface the paywall instead of a confusing scan error.
      if (handlePaywallError(err, openPaywall)) {
        setStep('photos'); // back to photo step
        return;
      }
      console.error('Scan error:', err);
      setScanError(err.message || "Couldn't read the label. You can fill in details manually.");
      setStep('review');
    }
  };

  const handleAiFill = async () => {
    if (aiFilling) return;
    // AI Fill counts against the same free-tier quota as bean scans because
    // it's the chargeable action when there's no scan happening first.
    if (!hasPro && (freeUsage?.aiScans ?? 0) >= FREE_LIMITS.aiScans) {
      openPaywall({ feature: 'scan_cap', promote: 'pro' });
      return;
    }
    setAiFilling(true);
    const thisGen = genCounter.current;
    try {
      // Pass metered: true because this is the standalone use of research,
      // not the post-scan enrichment chain.
      const research = await researchBeanOnline(f, { metered: true });
      const merged = { ...f };
      for (const field of ENRICHABLE_FIELDS) {
        if (!merged[field] && research[field]) {
          merged[field] = research[field];
        }
      }
      setF(merged);
      // Background: generate Professor Ruphus story (non-blocking, guarded by gen counter)
      storyRef.current = null;
      generateRuphusStory(merged, { useWebSearch: false })
        .then(story => { if (thisGen === genCounter.current) storyRef.current = story; })
        .catch(err => console.log('Background story gen skipped:', err.message));
    } catch (err) {
      if (handlePaywallError(err, openPaywall)) {
        setAiFilling(false);
        return;
      }
      console.log('AI Fill failed:', err.message);
    }
    setAiFilling(false);
  };

  // Triggered by the "Generate Product Shot" button on review screen.
  // Pro users get unlimited; free users get 1 free (metered server-side).
  const handleGenerateProductShot = async () => {
    if (!uid || photos.length === 0 || productShotStatus === 'generating') return;
    // Client-side pre-check: if free user has already used their free product shot
    if (!hasPro && (freeUsage?.productShots ?? 0) >= FREE_LIMITS.productShots) {
      openPaywall({ feature: 'product_shot', promote: 'pro' });
      return;
    }
    const thisGen = genCounter.current;
    const preId = pendingBeanIdRef.current || doc(collection(db, 'users', uid, 'beans')).id;
    pendingBeanIdRef.current = preId;
    productShotUrlRef.current = null;
    setProductShotStatus('generating');
    setPhotoChoice('productShot');
    try {
      const photoUrl = await generateProductShot(photos[0], preId, { skipFirestoreWrite: true });
      if (thisGen === genCounter.current) {
        productShotUrlRef.current = photoUrl;
        setProductShotStatus('ready');
      }
    } catch (err) {
      if (handlePaywallError(err, openPaywall)) {
        if (thisGen === genCounter.current) {
          setProductShotStatus('idle');
          setPhotoChoice('original');
        }
        return;
      }
      console.log('Product shot generation failed:', err.message);
      if (thisGen === genCounter.current) {
        setProductShotStatus('failed');
        setPhotoChoice('original');
      }
    }
  };

  const handleSave = async () => {
    if (!f.roaster.trim() || !f.name.trim()) return;
    const p = getProfileForRoaster(f.roaster);

    // Override peakEnd if bag states a shelf life
    const shelfDays = parseShelfLifeDays(f.shelfLife);
    const peakEnd = shelfDays && shelfDays > p.peakEnd ? shelfDays : p.peakEnd;

    const beanData = {
      roaster: f.roaster.trim(),
      name: f.name.trim(),
      origin: f.origin.trim(),
      variety: f.variety.trim(),
      process: f.process,
      roastDate: f.roastDate || '',
      bagSize: Number(f.bagSize) || 100,
      status: 'SEALED',
      jarSlot: null,
      openDate: null,
      finishDate: null,
      bagNotes: f.bagNotes.trim(),
      producer: f.producer.trim(),
      degasMin: p.degasMin,
      degasMax: p.degasMax,
      peakStart: p.peakStart,
      peakEnd,
      guidance: p.guidance,
    };

    // Include enriched fields only if non-empty
    if (f.altitude.trim()) beanData.altitude = f.altitude.trim();
    if (f.region.trim()) beanData.region = f.region.trim();
    if (f.farm.trim()) beanData.farm = f.farm.trim();
    if (f.roastLevel.trim()) beanData.roastLevel = f.roastLevel.trim();
    if (f.cupScore.trim()) beanData.cupScore = f.cupScore.trim();
    if (f.brewingRec.trim()) beanData.brewingRec = f.brewingRec.trim();
    if (f.sourcedBy.trim()) beanData.sourcedBy = f.sourcedBy.trim();
    if (f.shelfLife.trim()) beanData.shelfLife = f.shelfLife.trim();
    if (f.roastedIn.trim()) beanData.roastedIn = f.roastedIn.trim();

    // Include Professor Ruphus story if background generation finished
    if (storyRef.current) beanData.story = storyRef.current;

    // Include Aiden recipe data if pre-filled from Quick Recipe
    if (initialData?.aidenRecipe) {
      beanData.aidenRecipe = { ...initialData.aidenRecipe, generatedAt: initialData.aidenRecipe.generatedAt || new Date().toISOString() };
      if (initialData.aidenLink) beanData.aidenLink = initialData.aidenLink;
      if (initialData.aidenGrind) beanData.aidenGrind = initialData.aidenGrind;
    }

    const scanPhoto = photos.length > 0 ? photos[0] : null;
    const preAllocId = pendingBeanIdRef.current;
    const preGenPhotoUrl = productShotUrlRef.current;

    // If product shot was chosen and is ready, include the URL directly
    if (photoChoice === 'productShot' && preGenPhotoUrl) {
      beanData.photoUrl = preGenPhotoUrl;
    }

    let beanId;
    try {
      // Save bean + upload original photo in parallel.
      // Use pre-allocated ID so both operations target the same doc.
      const savePromise = onAdd(beanData, preAllocId || null);

      // Upload original photo if that's the user's choice and we have a photo
      let uploadPromise = Promise.resolve(null);
      if (photoChoice === 'original' && scanPhoto && preAllocId) {
        uploadPromise = uploadOriginalPhoto(preAllocId, scanPhoto, { skipFirestoreWrite: true })
          .catch(err => {
            console.log('Original photo upload failed:', err.message);
            return null;
          });
      }

      const [savedBeanId, uploadResult] = await Promise.all([savePromise, uploadPromise]);
      beanId = savedBeanId;

      // Write photoUrl to bean doc after both operations complete
      if (uploadResult?.photoUrl && beanId && updateBean) {
        await updateBean(beanId, { photoUrl: uploadResult.photoUrl });
      }
    } catch (err) {
      showError("Couldn't save bean. Check your connection and try again.");
      return;
    }

    // Fire-and-forget: generate notesSummary from bag notes (nice-to-have, non-blocking)
    if (beanId && updateBean && beanData.bagNotes && beanData.bagNotes !== '(not logged)') {
      summarizeNotes(beanData.bagNotes)
        .then(result => { if (result) return updateBean(beanId, { notesSummary: result }); })
        .catch(() => {}); // silent — notesSummary is optional
    }

    // Clear refs WITHOUT triggering cleanup (we're saving, not canceling)
    pendingBeanIdRef.current = null;
    productShotUrlRef.current = null;
    setProductShotStatus('idle');
    setPhotoChoice('original');

    reset();
    onClose();

    if (photoChoice === 'productShot' && preGenPhotoUrl && onToast) {
      onToast('Product shot ready!');
    } else if (photoChoice === 'original' && scanPhoto && onToast) {
      onToast('Bean saved!');
    }
  };

  const hasSearchableData = f.roaster.trim() || f.name.trim();
  const hasEmptyEnrichable = ENRICHABLE_FIELDS.some(field => !f[field]);

  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.textMuted, marginBottom: 4, display: 'block' };
  const rowStyle = { marginBottom: 12 };
  const spinner = (
    <div style={{
      width: 16, height: 16,
      border: `2px solid ${C.accent}`,
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
      display: 'inline-block',
    }} />
  );

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add New Bean" centered footer={step === 'review' ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="secondary" onClick={reset} style={{ flex: 1, justifyContent: 'center' }}>
            <RotateCcw size={14} /> Rescan
          </Btn>
          {hasSearchableData && hasEmptyEnrichable && (
            <Btn
              variant="secondary"
              onClick={handleAiFill}
              disabled={aiFilling}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {aiFilling ? (
                <>{spinner} Researching...</>
              ) : (
                <><Search size={14} /> AI Fill</>
              )}
            </Btn>
          )}
        </div>
        <Btn
          variant="primary"
          onClick={handleSave}
          style={{ width: '100%', justifyContent: 'center', opacity: f.roaster.trim() && f.name.trim() ? 1 : 0.4 }}
        >
          <Plus size={14} /> Add to Inventory
        </Btn>
      </div>
    ) : null}>
      {/* STEP: Photo upload + gallery */}
      {step === 'photo' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />

          {photos.length === 0 ? (
            <div
              onClick={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
              style={{
                cursor: 'pointer', background: C.card,
                border: `2px dashed ${C.border}`,
                borderRadius: 16, padding: '40px 20px',
                marginBottom: 16, transition: 'border-color 0.15s',
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 4 }}>Snap the bag label</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>Take a photo or choose from library</div>
            </div>
          ) : (
            <>
              {/* Thumbnail gallery */}
              <div style={{
                display: 'flex', gap: 10, justifyContent: 'center',
                marginBottom: 16, flexWrap: 'wrap',
              }}>
                {photos.map((photo, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <img
                      src={photo.previewUrl}
                      alt={`Photo ${idx + 1}`}
                      style={{
                        width: 90, height: 90, objectFit: 'cover',
                        borderRadius: 10, border: `1px solid ${C.border}`,
                      }}
                    />
                    <button
                      onClick={() => removePhoto(idx)}
                      style={{
                        position: 'absolute', top: -10, right: -10,
                        width: 28, height: 28, borderRadius: '50%',
                        background: C.red, border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 8,
                      }}
                    >
                      <X size={12} color="#fff" />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                {photos.length < 3 && (
                  <Btn variant="secondary" onClick={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}>
                    + Add photo
                  </Btn>
                )}
                <Btn variant="primary" onClick={handleScan}>
                  <Search size={14} /> Scan {photos.length > 1 ? `${photos.length} photos` : 'photo'}
                </Btn>
              </div>
            </>
          )}

          {scanError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: C.amberBg, color: C.amber, marginBottom: 12 }}>
              {scanError}
            </div>
          )}

          <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>— or —</div>
          <Btn variant="ghost" onClick={() => setStep('review')} style={{ margin: '0 auto' }}>Type it manually</Btn>
        </div>
      )}

      {/* STEP: Scanning */}
      {step === 'scanning' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
              {photos.map((photo, idx) => (
                <img key={idx} src={photo.previewUrl} alt={`Photo ${idx + 1}`}
                  style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 8, opacity: 0.7 }} />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Reading {photos.length > 1 ? 'labels' : 'label'}...</span>
          </div>
        </div>
      )}

      {/* STEP: Researching online */}
      {step === 'researching' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {(f.roaster || f.name) && (
            <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text, marginBottom: 4 }}>
              {f.name}
            </div>
          )}
          {f.roaster && (
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
              by {f.roaster}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Researching online...</span>
          </div>
          <Btn
            variant="ghost"
            onClick={() => setStep('review')}
            style={{ margin: '0 auto', fontSize: 12 }}
          >
            Skip research
          </Btn>
        </div>
      )}

      {/* STEP: Review / Edit */}
      {step === 'review' && (
        <>
          {photos.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              {/* Photo preview */}
              <div style={{
                display: 'flex', gap: 6, overflowX: 'auto',
                borderRadius: 12, border: `1px solid ${C.border}`, padding: 6,
              }}>
                {photos.map((photo, idx) => (
                  <img key={idx} src={photo.previewUrl} alt={`Photo ${idx + 1}`}
                    style={{ height: 80, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                ))}
              </div>

              {/* Photo choice: Use This Photo vs Generate Product Shot */}
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setPhotoChoice('original'); setProductShotStatus('idle'); }}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 12, fontFamily: fonts.body, fontWeight: 600,
                    border: `1.5px solid ${photoChoice === 'original' ? C.accent : C.border}`,
                    background: photoChoice === 'original' ? C.amberBg : C.card,
                    color: photoChoice === 'original' ? C.accent : C.textMuted,
                    transition: 'all 0.15s',
                  }}
                >
                  Use This Photo
                </button>
                <button
                  onClick={handleGenerateProductShot}
                  disabled={productShotStatus === 'generating'}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                    fontSize: 12, fontFamily: fonts.body, fontWeight: 600,
                    border: `1.5px solid ${photoChoice === 'productShot' ? C.accent : C.border}`,
                    background: photoChoice === 'productShot' ? C.amberBg : C.card,
                    color: photoChoice === 'productShot' ? C.accent : C.textMuted,
                    opacity: productShotStatus === 'generating' ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {productShotStatus === 'generating' ? (
                    <>{spinner} Generating...</>
                  ) : productShotStatus === 'ready' ? (
                    'Product Shot Ready'
                  ) : (
                    'Product Shot'
                  )}
                </button>
              </div>
            </div>
          )}
          {scanError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: C.amberBg, color: C.amber, marginBottom: 12 }}>
              {scanError}
            </div>
          )}

          <div style={rowStyle}>
            <label style={labelStyle}>Roaster *</label>
            <input value={f.roaster} onChange={e => setF(p => ({ ...p, roaster: e.target.value }))} placeholder="e.g. Apollon's Gold, Koppi..." style={inputStyle} onFocus={scrollOnFocus} />
            {profileInfo && (
              <div style={{
                marginTop: 6, padding: '6px 10px', borderRadius: 8, fontSize: 12,
                background: profileInfo.known ? C.greenBg : C.amberBg,
                color: profileInfo.known ? C.green : C.amber,
              }}>
                {f.shelfLife ? (
                  <>Bag says: consume within {f.shelfLife} of roast</>
                ) : (
                  <>
                    {profileInfo.known ? '✓ ' : 'Unknown roaster — '}
                    Degas {profileInfo.degasMin}–{profileInfo.degasMax}d · Peak {profileInfo.peakStart}–{profileInfo.peakEnd}d
                    {!profileInfo.known && ' (est.)'}
                  </>
                )}
              </div>
            )}
          </div>

          <div style={rowStyle}>
            <label style={labelStyle}>Coffee Name *</label>
            <input value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Finca San Antonio" style={inputStyle} onFocus={scrollOnFocus} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
            <div>
              <label style={labelStyle}>Origin</label>
              <input value={f.origin} onChange={e => setF(p => ({ ...p, origin: e.target.value }))} placeholder="e.g. Colombia" style={inputStyle} onFocus={scrollOnFocus} />
            </div>
            <div>
              <label style={labelStyle}>Variety</label>
              <input value={f.variety} onChange={e => setF(p => ({ ...p, variety: e.target.value }))} placeholder="e.g. Geisha" style={inputStyle} onFocus={scrollOnFocus} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
            <div>
              <label style={labelStyle}>Process</label>
              <select value={f.process} onChange={e => setF(p => ({ ...p, process: e.target.value }))} style={inputStyle} onFocus={scrollOnFocus}>
                <option value="" disabled>Select...</option>
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

          {/* Enriched Details Section */}
          <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, marginBottom: 12 }}>
            <label style={{ ...labelStyle, fontSize: 13, color: C.accent, marginBottom: 10 }}>Enriched Details</label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
              <div>
                <label style={labelStyle}>Region</label>
                <input value={f.region} onChange={e => setF(p => ({ ...p, region: e.target.value }))} placeholder="e.g. Huila" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
              <div>
                <label style={labelStyle}>Farm</label>
                <input value={f.farm} onChange={e => setF(p => ({ ...p, farm: e.target.value }))} placeholder="e.g. Finca La Palma" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
              <div>
                <label style={labelStyle}>Altitude</label>
                <input value={f.altitude} onChange={e => setF(p => ({ ...p, altitude: e.target.value }))} placeholder="e.g. 1800-2100 masl" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
              <div>
                <label style={labelStyle}>Roast Level</label>
                <select value={f.roastLevel} onChange={e => setF(p => ({ ...p, roastLevel: e.target.value }))} style={inputStyle}>
                  <option value="">—</option>
                  {['light', 'medium-light', 'medium', 'medium-dark', 'dark'].map(l => (
                    <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
              <div>
                <label style={labelStyle}>Accolades</label>
                <input value={f.cupScore} onChange={e => setF(p => ({ ...p, cupScore: e.target.value }))} placeholder="e.g. 87.5, award" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
              <div>
                <label style={labelStyle}>Sourced By</label>
                <input value={f.sourcedBy} onChange={e => setF(p => ({ ...p, sourcedBy: e.target.value }))} placeholder="e.g. Dayglow" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
              <div>
                <label style={labelStyle}>Roasted In</label>
                <input value={f.roastedIn} onChange={e => setF(p => ({ ...p, roastedIn: e.target.value }))} placeholder="e.g. Florence, Italy" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
              <div>
                <label style={labelStyle}>Brewing Recommendations</label>
                <input value={f.brewingRec} onChange={e => setF(p => ({ ...p, brewingRec: e.target.value }))} placeholder="From roaster" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, ...rowStyle }}>
              <div>
                <label style={labelStyle}>Shelf Life</label>
                <input value={f.shelfLife} onChange={e => setF(p => ({ ...p, shelfLife: e.target.value }))} placeholder="e.g. 3 months" style={inputStyle} onFocus={scrollOnFocus} />
              </div>
            </div>
          </div>

        </>
      )}
      <Toast message={errorMsg} open={!!errorMsg} onClose={hideError} variant="error" />
    </Modal>
  );
};
