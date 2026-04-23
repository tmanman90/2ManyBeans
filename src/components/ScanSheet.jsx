import { useState, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { X, Search } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { compressImage } from '../lib/claude';
import { scanBeanLabel, researchBeanOnline, generateProductShot, deleteProductShot } from '../lib/gemini';
import { uploadOriginalPhoto } from '../lib/storage';
import { generateRuphusStory } from '../lib/professorRuphus';
import { buildNewBeanData } from '../lib/beanBuilder';
import { handlePaywallError } from '../lib/paywallHelpers';
import { ENRICHABLE_FIELDS } from '../lib/beanFields';
import { collection, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { useSubscription } from '../contexts/SubscriptionContext';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { FREE_LIMITS } from '../lib/subscriptionConfig';

export const ScanSheet = ({ open, onClose, onBeanCreated, uid, addBean }) => {
  const { hasPro, freeUsage } = useSubscription();
  const { openPaywall } = usePaywall();

  const [photos, setPhotos] = useState([]);
  const [step, setStep] = useState('photo'); // photo | scanning | researching | saving
  const [scanError, setScanError] = useState(null);
  const fileRef = useRef(null);
  const storyRef = useRef(null);
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
    storyRef.current = null;
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
      };

      // Pre-allocate Firestore doc ID for photo upload
      if (uid) {
        pendingBeanIdRef.current = doc(collection(db, 'users', uid, 'beans')).id;
      }

      // Research online (non-blocking failure)
      setStep('researching');
      let enrichedData = scanData;
      try {
        const research = await researchBeanOnline(scanData);
        if (thisGen !== genCounter.current) return;
        const merged = { ...scanData };
        for (const field of ENRICHABLE_FIELDS) {
          if (!merged[field] && research[field]) merged[field] = research[field];
        }
        enrichedData = merged;
      } catch (researchErr) {
        console.log('Research skipped/failed:', researchErr.message);
      }
      if (thisGen !== genCounter.current) return;

      // Background story generation (fire-and-forget)
      storyRef.current = null;
      generateRuphusStory(enrichedData, { useWebSearch: false })
        .then(story => { if (thisGen === genCounter.current) storyRef.current = story; })
        .catch(err => console.log('Background story gen skipped:', err.message));

      // Auto-save: build bean data and write to Firestore
      setStep('saving');
      const beanData = buildNewBeanData(enrichedData, { story: storyRef.current });
      const preAllocId = pendingBeanIdRef.current;
      const beanId = await addBean(beanData, preAllocId || null);

      // Upload original photo (fire-and-forget, server writes photoUrl directly)
      const scanPhoto = photos[0];
      if (scanPhoto && preAllocId) {
        uploadOriginalPhoto(preAllocId, scanPhoto)
          .catch(err => console.warn('Original photo upload failed:', err.message));
      }

      // Clear refs before callback (we're saving, not canceling)
      pendingBeanIdRef.current = null;

      // Pass beanData directly so parent doesn't need beans.find()
      reset();
      onBeanCreated(beanId, { id: beanId, ...beanData });
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

  const spinner = (
    <div style={{
      width: 20, height: 20, border: `2px solid ${C.border}`,
      borderTopColor: C.accent, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite',
    }} />
  );

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Scan a Bag">
      <input type="file" accept="image/*" ref={fileRef} onChange={handlePhoto}
        style={{ display: 'none' }} />

      {/* STEP: Photo capture */}
      {step === 'photo' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          {photos.length === 0 ? (
            <div
              onClick={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
              style={{
                border: `2px dashed ${C.border}`, borderRadius: 16,
                padding: '40px 20px', cursor: 'pointer',
                background: C.card,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 8 }}>📸</div>
              <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 4 }}>Snap the bag label</div>
              <div style={{ fontSize: 13, color: C.textMuted }}>Take a photo or choose from library</div>
            </div>
          ) : (
            <>
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

      {/* STEP: Researching */}
      {step === 'researching' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Researching online...</span>
          </div>
        </div>
      )}

      {/* STEP: Saving */}
      {step === 'saving' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Saving bean...</span>
          </div>
        </div>
      )}
    </Modal>
  );
};
