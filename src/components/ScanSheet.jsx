import { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { X, Search, Camera, Image } from 'lucide-react';
import { C, fonts, type, shadows, radius, glass } from '../styles/theme';
import { compressImage } from '../lib/claude';
import { scanBeanLabel, researchBeanOnline, generateProductShot, deleteProductShot } from '../lib/gemini';
import { ensurePhotoLibraryAccess, galleryPhotosToScanPhotos, isPhotoPickerCancel } from '../lib/photoPicker';
import { uploadOriginalPhoto } from '../lib/storage';
import { generateRuphusStory } from '../lib/professorRuphus';
import { buildNewBeanData } from '../lib/beanBuilder';
import { buildSourceContextHash } from '../lib/sourceInsights';
import { handlePaywallError } from '../lib/paywallHelpers';
import { ENRICHABLE_FIELDS } from '../lib/beanFields';
import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { FREE_LIMITS } from '../lib/subscriptionConfig';

export const ScanSheet = ({ open, onClose, onBeanCreated, onManualEntry, uid, addBean, updateBean }) => {
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();

  const [photos, setPhotos] = useState([]);
  const [step, setStep] = useState('photo'); // photo | scanning | researching | saving
  const [scanError, setScanError] = useState(null);
  const fileRef = useRef(null);
  const genCounter = useRef(0);
  const pendingBeanIdRef = useRef(null);

  const reset = () => {
    photos.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl); });
    if (pendingBeanIdRef.current) {
      deleteProductShot(pendingBeanIdRef.current).catch(() => {});
    }
    setPhotos([]);
    setStep('photo');
    setScanError(null);
    pendingBeanIdRef.current = null;
    genCounter.current++;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const takeNativePhoto = async () => {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const perms = await Camera.checkPermissions();
      if (perms.camera !== 'granted') {
        const requested = await Camera.requestPermissions({ permissions: ['camera'] });
        if (requested.camera === 'denied') {
          setScanError('Camera permission denied. Enable it in Settings > 2manybeans.');
          return;
        }
      }
      const image = await Camera.getPhoto({
        quality: 85,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 1200,
        height: 1200,
      });
      const mediaType = 'image/jpeg';
      const base64 = image.dataUrl.split(',')[1];
      setPhotos(prev => [...prev, { base64, mediaType, previewUrl: image.dataUrl }].slice(0, 3));
    } catch (err) {
      if (!isPhotoPickerCancel(err)) {
        console.error('Camera error:', err);
        setScanError(`Failed to capture photo: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const pickNativePhotos = async () => {
    const remaining = 3 - photos.length;
    if (remaining <= 0) return;
    try {
      const { Camera } = await import('@capacitor/camera');
      const canReadPhotos = await ensurePhotoLibraryAccess(Camera);
      if (!canReadPhotos) {
        setScanError('Photo library permission denied. Enable it in Settings > 2manybeans.');
        return;
      }
      const result = await Camera.pickImages({
        quality: 85,
        width: 1200,
        height: 1200,
        limit: remaining,
      });
      const converted = await galleryPhotosToScanPhotos(result.photos, { limit: remaining });
      if (converted.length > 0) {
        setPhotos(prev => [...prev, ...converted].slice(0, 3));
        setScanError(null);
      }
    } catch (err) {
      if (!isPhotoPickerCancel(err)) {
        console.error('Photo picker error:', err);
        setScanError(`Failed to choose photos: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handlePhoto = async (e) => {
    const remaining = 3 - photos.length;
    const files = Array.from(e.target.files || []).slice(0, remaining);
    if (files.length === 0) return;
    try {
      const compressed = await Promise.all(files.map(file => compressImage(file)));
      setPhotos(prev => [...prev, ...compressed].slice(0, 3));
      setScanError(null);
    } catch (err) {
      console.error('Compression error:', err);
      setScanError('Failed to process photo. Try another.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const updated = prev.filter((_, i) => i !== idx);
      if (prev[idx]?.previewUrl) URL.revokeObjectURL(prev[idx].previewUrl);
      return updated;
    });
  };

  const handleScan = async () => {
    if (photos.length === 0) return;
    if (!hasPro && (freeUsage?.aiScans ?? 0) >= FREE_LIMITS.aiScans) {
      openPaywall({ feature: 'scan_cap', promote: 'pro' });
      return;
    }
    setScanError(null);
    setStep('scanning');

    const thisGen = ++genCounter.current;

    try {
      const parsed = await scanBeanLabel(photos);
      if (thisGen !== genCounter.current) return;

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
        sourceInsights: parsed.sourceInsights || null,
      };

      // Pre-allocate Firestore doc ID for photo upload
      if (uid) {
        pendingBeanIdRef.current = doc(collection(db, 'users', uid, 'beans')).id;
      }

      // Research online (non-blocking failure)
      setStep('researching');
      let enrichedData = scanData;
      let researchResult = null;
      try {
        const research = await researchBeanOnline(scanData);
        if (thisGen !== genCounter.current) return;
        researchResult = research;
        const merged = { ...scanData };
        for (const field of ENRICHABLE_FIELDS) {
          if (!merged[field] && research[field]) merged[field] = research[field];
        }
        enrichedData = merged;
        enrichedData.enrichedAt = new Date().toISOString();
      } catch (researchErr) {
        console.log('Research skipped/failed:', researchErr.message);
      }
      if (thisGen !== genCounter.current) return;

      // Auto-save: build bean data and write to Firestore
      setStep('saving');
      const beanData = buildNewBeanData(enrichedData, {
        story: null,
      });
      if (updateBean) {
        beanData.storyStatus = 'pending';
      }
      const preAllocId = pendingBeanIdRef.current;
      const beanId = await addBean(beanData, preAllocId || null);

      // Upload original photo (fire-and-forget, server writes photoUrl directly)
      const scanPhoto = photos[0];
      if (scanPhoto && preAllocId) {
        uploadOriginalPhoto(preAllocId, scanPhoto, { writeMode: 'if-empty' })
          .catch(err => console.warn('Original photo upload failed:', err.message));
      }

      // Clear refs before callback (we're saving, not canceling)
      pendingBeanIdRef.current = null;

      // Capture photos before reset clears them
      const scanPhotos = [...photos];
      const savedBean = { id: beanId, ...beanData, _scanPhotos: scanPhotos };

      if (updateBean) {
        const storyBean = { ...savedBean };
        generateRuphusStory(storyBean, { enrichment: researchResult })
          .then(story => {
            const storyContextHash = buildSourceContextHash(storyBean);
            return updateBean(beanId, {
              story,
              storyStatus: 'ready',
              storyGeneratedAt: story.generatedAt || new Date().toISOString(),
              storyContextHash,
              sourceContextHash: storyContextHash,
            });
          })
          .catch(err => {
            console.log('Background story gen skipped:', err.message);
            updateBean(beanId, {
              storyStatus: 'failed',
              storyError: (err.message || 'Story generation failed').slice(0, 180),
            }).catch(() => {});
          });
      }

      reset();
      onBeanCreated(beanId, savedBean);
    } catch (err) {
      if (thisGen !== genCounter.current) return;
      if (handlePaywallError(err, openPaywall)) {
        setStep('photo');
        return;
      }
      console.error('Scan error:', err);
      setScanError(err.message || "Couldn't read the label. Try again or add manually.");
      setStep('photo');
    }
  };

  const Spinner = ({ label }) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '36px 0' }}>
      <div style={{
        width: 36, height: 36,
        border: `2.5px solid ${C.accentLight}`,
        borderTopColor: C.accent, borderRadius: '50%',
        animation: 'spin 0.85s linear infinite',
      }} />
      <span style={{ ...type.body, color: C.textMuted }}>{label}</span>
    </div>
  );

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Scan a Bag">
      <input type="file" accept="image/*" multiple ref={fileRef} onChange={handlePhoto}
        style={{ display: 'none' }} />

      {/* STEP: Photo capture */}
      {step === 'photo' && (
        <div style={{ padding: '8px 0 12px' }}>
          {photos.length === 0 ? (
            <div
              style={{
                border: `1.5px dashed ${C.accentLight}`, borderRadius: radius.xl,
                padding: '40px 24px 36px',
                background: C.bgDeep,
                textAlign: 'center',
              }}
            >
              {/* Camera icon ring */}
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: C.accentSoft, border: `1.5px solid ${C.accentLight}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px', boxShadow: shadows.e2,
              }}>
                <Camera size={30} color={C.accent} />
              </div>
              <div style={{ ...type.h2, color: C.text, marginBottom: 6 }}>Snap the bag label</div>
              <div style={{ ...type.body, color: C.textMuted, marginBottom: 22 }}>
                Up to 3 photos for best results
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {Capacitor.isNativePlatform() ? (
                  <>
                    <Btn variant="secondary" onClick={takeNativePhoto}>
                      <Camera size={14} /> Camera
                    </Btn>
                    <Btn variant="primary" onClick={pickNativePhotos}>
                      <Image size={14} /> Library
                    </Btn>
                  </>
                ) : (
                  <Btn variant="primary" onClick={() => fileRef.current?.click()}>
                    <Image size={14} /> Choose Photos
                  </Btn>
                )}
              </div>
              {onManualEntry && (
                <div
                  onClick={(e) => { e.stopPropagation(); onManualEntry(); }}
                  style={{ ...type.body, color: C.accent, marginTop: 18, cursor: 'pointer', fontWeight: 600 }}
                >
                  or add manually
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Photo thumbnails */}
              <div style={{
                display: 'flex', gap: 10, marginBottom: 18,
                justifyContent: photos.length < 3 ? 'flex-start' : 'center',
              }}>
                {photos.map((photo, idx) => (
                  <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
                    <img
                      src={photo.previewUrl}
                      alt={`Photo ${idx + 1}`}
                      style={{
                        width: 96, height: 96, objectFit: 'cover',
                        borderRadius: radius.md, border: `1px solid ${C.hairline}`,
                        boxShadow: shadows.e2, display: 'block',
                      }}
                    />
                    {/* Count badge */}
                    <div style={{
                      position: 'absolute', top: 6, left: 6,
                      background: glass.chrome, backdropFilter: glass.blur, WebkitBackdropFilter: glass.blur,
                      borderRadius: 6, padding: '2px 6px',
                      ...type.caption, color: C.textMuted,
                      border: `1px solid ${glass.chromeBorder}`,
                    }}>{idx + 1}</div>
                    <button
                      onClick={() => removePhoto(idx)}
                      aria-label="Remove photo"
                      style={{
                        position: 'absolute', top: -16, right: -16,
                        width: 44, height: 44, borderRadius: '50%',
                        background: 'transparent', border: 'none', padding: 0,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: '50%',
                        background: C.red, border: `2px solid ${C.cream}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: shadows.e1,
                      }}>
                        <X size={11} color="#fff" />
                      </span>
                    </button>
                  </div>
                ))}
                {/* Add more slot */}
                {photos.length < 3 && (
                  <button
                    onClick={Capacitor.isNativePlatform() ? pickNativePhotos : () => fileRef.current?.click()}
                    style={{
                      width: 96, height: 96, flexShrink: 0,
                      borderRadius: radius.md, border: `1.5px dashed ${C.accentLight}`,
                      background: C.bgDeep, cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 6, color: C.textMuted,
                    }}
                  >
                    <Image size={20} color={C.accentLight} />
                    <span style={{ ...type.caption, color: C.textMuted }}>Add</span>
                  </button>
                )}
              </div>

              {Capacitor.isNativePlatform() && photos.length < 3 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <Btn variant="ghost" onClick={takeNativePhoto} style={{ flex: 1, justifyContent: 'center', fontSize: 13 }}>
                    <Camera size={13} /> Camera
                  </Btn>
                </div>
              )}

              <Btn variant="primary" onClick={handleScan} style={{ width: '100%', justifyContent: 'center' }}>
                <Search size={14} /> Scan {photos.length > 1 ? `${photos.length} photos` : 'photo'}
              </Btn>
            </div>
          )}

          {scanError && (
            <div style={{
              padding: '10px 14px', borderRadius: radius.md,
              ...type.body, fontSize: 13, background: C.amberBg,
              color: C.amber, marginTop: 14,
              border: `1px solid ${C.accentLight}`,
            }}>
              {scanError}
            </div>
          )}
        </div>
      )}

      {/* STEP: Scanning */}
      {step === 'scanning' && (
        <div style={{ textAlign: 'center' }}>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, paddingTop: 8 }}>
              {photos.map((photo, idx) => (
                <img key={idx} src={photo.previewUrl} alt={`Photo ${idx + 1}`}
                  style={{
                    width: 64, height: 64, objectFit: 'cover',
                    borderRadius: radius.sm, opacity: 0.5,
                    border: `1px solid ${C.hairline}`, boxShadow: shadows.e1,
                  }} />
              ))}
            </div>
          )}
          <Spinner label={`Reading ${photos.length > 1 ? 'labels' : 'label'}...`} />
        </div>
      )}

      {/* STEP: Researching */}
      {step === 'researching' && (
        <div style={{ textAlign: 'center' }}>
          <Spinner label="Researching online..." />
        </div>
      )}

      {/* STEP: Saving */}
      {step === 'saving' && (
        <div style={{ textAlign: 'center' }}>
          <Spinner label="Saving bean..." />
        </div>
      )}
    </Modal>
  );
};
