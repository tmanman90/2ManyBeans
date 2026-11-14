// Quick Recipe Flow — scan a coffee bag and generate a recipe without adding to inventory
import { useState, useRef, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CameraIcon, X, Search, RotateCcw, Save, Coffee, Star, BookOpen } from 'lucide-react';
import { C, fonts, type, shadows, radius } from '../styles/theme';
import { m } from '../lib/motion';
import { fadeUp, popIn, spring } from '../lib/motion';
import { compressImage } from '../lib/claude';
import { scanBeanLabel, researchBeanOnline } from '../lib/gemini';
import { ENRICHABLE_FIELDS } from '../lib/beanFields';
import { haptic } from '../lib/haptics';
import { ensurePhotoLibraryAccess, galleryPhotosToScanPhotos, isPhotoPickerCancel } from '../lib/photoPicker';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { useHandBrew } from '../hooks/useHandBrew';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';
import { usePreferences } from '../hooks/useUserProfile';
import { AidenModal } from './AidenModal';
import { HandBrewModal } from './HandBrewModal';
import { ProfessorRuphusSlideUp } from './ProfessorRuphusSlideUp';
import { QuickRateForm } from './QuickRateForm';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { Toast } from './Toast';

const noop = () => {};

const toEphemeralBean = (data) => {
  const bean = { ...data };
  if (typeof bean.bagSize === 'string') {
    bean.bagSize = parseInt(bean.bagSize, 10) || 100;
  }
  return bean;
};

export const QuickRecipeFlow = ({ open, onClose, onSaveToInventory, addBean, addTasting, uid, onStartTastingSession }) => {
  const { preferences } = usePreferences();
  const isHandBrew = preferences.brewMethod !== 'aiden';

  const [step, setStep] = useState('photo'); // photo | scanning | enriching | bagSize | brewing
  const [photos, setPhotos] = useState([]); // up to 3 { base64, mediaType, previewUrl }
  const [scanData, setScanData] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [bagSizeInput, setBagSizeInput] = useState('');
  const [activeMethod, setActiveMethod] = useState(isHandBrew ? 'handbrew' : 'aiden');
  const [savedBeanId, setSavedBeanId] = useState(null);
  const [quickRateOpen, setQuickRateOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);
  const savingRef = useRef(null); // guards against double-tap race on auto-save
  const photosRef = useRef([]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  const clearPhotos = useCallback(() => {
    photosRef.current.forEach(p => {
      if (p?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
    });
    photosRef.current = [];
    setPhotos([]);
  }, []);

  // Brew hooks with noop updateBean (ephemeral, no Firestore writes)
  const aiden = useAidenBrew(noop);
  const handBrew = useHandBrew(noop);
  const { handleLearn, ruphusProps } = useProfessorRuphus(noop);

  // Reset on close + revoke blob URL
  useEffect(() => {
    if (!open) {
      clearPhotos();
      setStep('photo');
      setScanData(null);
      setScanError(null);
      setBagSizeInput('');
      setActiveMethod(isHandBrew ? 'handbrew' : 'aiden');
      setSavedBeanId(null);
      savingRef.current = null;
      setQuickRateOpen(false);
      setToast(null);
    }
  }, [clearPhotos, isHandBrew, open]);

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
      handlePhotosReady([{ base64, mediaType, previewUrl: image.dataUrl }]);
    } catch (err) {
      if (!isPhotoPickerCancel(err)) {
        setScanError(`Failed to capture photo: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const pickNativePhotos = async () => {
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
        limit: 3,
      });
      const converted = await galleryPhotosToScanPhotos(result.photos, { limit: 3 });
      if (converted.length > 0) {
        handlePhotosReady(converted);
      }
    } catch (err) {
      if (!isPhotoPickerCancel(err)) {
        setScanError(`Failed to choose photos: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handleFileInput = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, 3);
    if (files.length === 0) return;
    try {
      const compressed = await Promise.all(files.map(file => compressImage(file)));
      handlePhotosReady(compressed);
    } catch (err) {
      setScanError('Failed to process photo. Try another.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePhotosReady = async (photoObjs) => {
    const nextPhotos = photoObjs.slice(0, 3);
    photosRef.current.forEach(p => {
      if (p?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl);
    });
    photosRef.current = nextPhotos;
    setPhotos(nextPhotos);
    setScanError(null);
    setStep('scanning');

    try {
      const parsed = await scanBeanLabel(nextPhotos);
      const scanResult = {
        roaster: parsed.roaster || '',
        name: parsed.name || '',
        origin: parsed.origin || '',
        variety: parsed.variety || '',
        process: parsed.process || '',
        roastDate: parsed.roastDate || '',
        bagSize: parsed.bagSize || '',
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

      // Set scan data immediately so enriching step can show bean name/roaster
      setScanData(scanResult);

      // Enrich via web search (merge into a new copy, don't mutate scanResult)
      setStep('enriching');
      let enriched = scanResult;
      try {
        const research = await researchBeanOnline(scanResult);
        const merged = { ...scanResult };
        for (const field of ENRICHABLE_FIELDS) {
          if (!merged[field] && research[field]) {
            merged[field] = research[field];
          }
        }
        enriched = merged;
        setScanData(merged);
      } catch (researchErr) {
        console.log('Quick recipe research skipped:', researchErr.message);
      }

      // Check if we have bag size
      if (!enriched.bagSize) {
        setStep('bagSize');
      } else {
        startBrew(enriched);
      }
    } catch (err) {
      setScanError(err.message || "Couldn't read the label. Try a clearer photo.");
      setStep('photo');
    }
  };

  const handleBagSizeSubmit = () => {
    const grams = parseInt(bagSizeInput, 10);
    if (!grams || grams < 1) return;
    const updated = { ...scanData, bagSize: grams };
    setScanData(updated);
    startBrew(updated);
  };

  const startBrew = (data) => {
    setStep('brewing');
    const ephemeralBean = toEphemeralBean(data);
    // Start with user's preferred brew method
    if (isHandBrew) {
      setActiveMethod('handbrew');
      handBrew.handleBrewHandBrew(ephemeralBean);
    } else {
      setActiveMethod('aiden');
      aiden.handleBrewWithAiden(ephemeralBean);
    }
  };

  const handleToggleMethod = () => {
    if (!scanData) return;
    const ephemeralBean = toEphemeralBean(scanData);
    if (activeMethod === 'aiden') {
      // Switch to hand brew, pass Aiden's research as cache
      setActiveMethod('handbrew');
      handBrew.handleBrewHandBrew(ephemeralBean, aiden.aidenResearch);
    } else {
      // Switch to Aiden, pass hand brew's research as cache
      setActiveMethod('aiden');
      aiden.handleBrewWithAiden(ephemeralBean, handBrew.handBrewResearch);
    }
  };

  const handleRetryPhoto = () => {
    clearPhotos();
    setScanData(null);
    setScanError(null);
    setBagSizeInput('');
    setStep('photo');
  };

  const handleSave = () => {
    if (!scanData || !onSaveToInventory) return;
    const handBrewForSave = handBrew.handBrewRecipe
      ? {
          ...handBrew.handBrewRecipe,
          ...(typeof handBrew.userCoffeeGrams === 'number'
            ? { userCoffeeGrams: handBrew.userCoffeeGrams }
            : {}),
        }
      : null;
    const icedForSave = handBrew.handBrewIcedRecipe
      ? { ...handBrew.handBrewIcedRecipe, generatedAt: handBrew.handBrewIcedRecipe.generatedAt || new Date().toISOString() }
      : null;
    const saveData = {
      ...scanData,
      aidenRecipe: aiden.aidenRecipe,
      aidenLink: aiden.aidenResult?.link || null,
      aidenGrind: aiden.aidenRecipe?.grindRecommendation || null,
      handBrewRecipe: handBrewForSave,
      ...(handBrewForSave ? { handBrewRecipes: { [handBrewForSave.device || 'v60']: handBrewForSave } } : {}),
      ...(icedForSave ? { handBrewIcedRecipes: { [icedForSave.device || 'v60']: icedForSave } } : {}),
      photo: photos[0] || null,
      scanPhotos: photos,
    };
    onClose();
    onSaveToInventory(saveData);
  };

  // Auto-save bean to inventory as SEALED (for tasting actions)
  const handleAutoSave = async () => {
    if (savedBeanId) return savedBeanId;
    // Ref guard: if a save is already in flight, await it instead of starting a second
    if (savingRef.current) return savingRef.current;
    if (!addBean || !scanData) return null;
    const savePromise = (async () => {
      try {
        const beanData = {
          ...toEphemeralBean(scanData),
          status: 'SEALED',
          uid,
        };
        // Attach any generated recipes
        if (aiden.aidenRecipe) {
          beanData.aidenRecipe = { ...aiden.aidenRecipe, generatedAt: new Date().toISOString() };
          if (aiden.aidenResult?.link) beanData.aidenLink = aiden.aidenResult.link;
          if (aiden.aidenRecipe?.grindRecommendation) beanData.aidenGrind = aiden.aidenRecipe.grindRecommendation;
        }
        if (handBrew.handBrewRecipe) {
          beanData.handBrewRecipe = { ...handBrew.handBrewRecipe, generatedAt: new Date().toISOString() };
          if (typeof handBrew.userCoffeeGrams === 'number') {
            beanData.handBrewRecipe.userCoffeeGrams = handBrew.userCoffeeGrams;
          }
          const dev = beanData.handBrewRecipe.device || 'v60';
          beanData.handBrewRecipes = { [dev]: beanData.handBrewRecipe };
        }
        if (handBrew.handBrewIcedRecipe) {
          const icedRecipe = { ...handBrew.handBrewIcedRecipe, generatedAt: handBrew.handBrewIcedRecipe.generatedAt || new Date().toISOString() };
          beanData.handBrewIcedRecipes = { [icedRecipe.device || 'v60']: icedRecipe };
        }
        const newId = await addBean(beanData);
        setSavedBeanId(newId);
        handBrew.attachHandBrewBeanId(newId);
        setToast(`${scanData.name || 'Bean'} saved to inventory`);
        return newId;
      } catch (err) {
        console.error('Auto-save failed:', err);
        setToast('Failed to save bean');
        // Clear ref on failure so user can retry
        savingRef.current = null;
        return null;
      }
    })();
    savingRef.current = savePromise;
    return savePromise;
  };

  const handleQuickRate = async () => {
    const beanId = await handleAutoSave();
    if (beanId) setQuickRateOpen(true);
  };

  const handleQuickRateSubmit = async ({ rating, notes }) => {
    const beanId = savedBeanId;
    if (!beanId || !addTasting) return;
    await addTasting({ beanId, rating, notes });
    haptic.success();
    setToast('Rating saved');
  };

  const handleRuphusTasting = async () => {
    const beanId = await handleAutoSave();
    if (beanId) {
      setToast(`${scanData?.name || 'Bean'} saved. Start a tasting from the Tasting tab.`);
    }
  };

  // Called from BrewTimer completion screen. The "bean" at this point is the
  // ephemeral scanData, so we auto-save it to Firestore first (if not already),
  // then fire the App-level tasting bridge with the real Firestore id.
  const handleBrewTimerStartTasting = async () => {
    const beanId = await handleAutoSave();
    if (!beanId) return;
    onClose?.();
    onStartTastingSession?.(beanId);
  };

  const handleLearnPress = () => {
    if (!scanData) return;
    handleLearn(toEphemeralBean(scanData));
  };

  // Refined CSS spinner
  const spinner = (
    <div style={{
      width: 20,
      height: 20,
      border: `2px solid ${C.borderLight}`,
      borderTopColor: C.accent,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );

  const inputStyle = {
    width: '100%',
    padding: '13px 16px',
    borderRadius: radius.md,
    border: `1px solid ${C.border}`,
    fontFamily: fonts.body,
    fontSize: 16,
    background: C.card,
    color: C.text,
    boxSizing: 'border-box',
    textAlign: 'center',
    outline: 'none',
    boxShadow: shadows.e1,
  };

  // Build the action buttons shown in the recipe footer
  const recipeHasLoaded = activeMethod === 'aiden'
    ? aiden.aidenRecipe && !aiden.aidenLoading
    : handBrew.handBrewRecipe && !handBrew.handBrewLoading;

  const actionButtons = recipeHasLoaded ? (
    <m.div
      {...fadeUp}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}
    >
      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.hairline}`, marginBottom: 4 }} />

      {/* Brew method toggle */}
      <Btn variant="secondary" onClick={handleToggleMethod} style={{ width: '100%', justifyContent: 'center' }}>
        <Coffee size={14} />
        {activeMethod === 'aiden' ? 'Get Hand Brew Recipe' : 'Get Aiden Recipe'}
      </Btn>

      {/* Quick Rate */}
      <Btn variant="ghost" onClick={handleQuickRate} style={{ width: '100%', justifyContent: 'center' }}>
        <Star size={14} /> Quick Rate
      </Btn>

      {/* Ruphus Tasting */}
      <Btn variant="ghost" onClick={handleRuphusTasting} style={{ width: '100%', justifyContent: 'center' }}>
        <Coffee size={14} /> Tasting with Ruphus
      </Btn>

      {/* Learn */}
      <Btn variant="ghost" onClick={handleLearnPress} style={{ width: '100%', justifyContent: 'center' }}>
        <BookOpen size={14} /> Learn About This Bean
      </Btn>

      {/* Save to Inventory */}
      {onSaveToInventory && !savedBeanId && (
        <Btn variant="ghost" onClick={handleSave} style={{ width: '100%', justifyContent: 'center' }}>
          <Save size={14} /> Save to Inventory
        </Btn>
      )}
    </m.div>
  ) : null;

  // During brew phase, show the appropriate modal
  if (step === 'brewing') {
    return (
      <>
        {activeMethod === 'aiden' ? (
          <AidenModal
            open={open}
            onClose={onClose}
            bean={aiden.aidenBean}
            recipe={aiden.aidenRecipe}
            result={aiden.aidenResult}
            loading={aiden.aidenLoading}
            error={aiden.aidenError}
            phase={aiden.aidenPhase}
            onRetry={aiden.onRetry}
            onRetryPush={aiden.onRetryPush}
            onRegenerate={aiden.onRegenerate}
            onPushCached={aiden.onPushCached}
            icedResult={aiden.icedResult}
            icedLoading={aiden.icedLoading}
            icedError={aiden.icedError}
            onPushIced={aiden.onPushIced}
            onRetryIcedPush={aiden.onRetryIcedPush}
            extraFooter={actionButtons}
          />
        ) : (
          <HandBrewModal
            open={open}
            onClose={onClose}
            recipe={handBrew.handBrewRecipe}
            icedRecipe={handBrew.handBrewIcedRecipe}
            icedLoading={handBrew.handBrewIcedLoading}
            icedError={handBrew.handBrewIcedError}
            onRetryIced={handBrew.onRetryIced}
            loading={handBrew.handBrewLoading}
            error={handBrew.handBrewError}
            phase={handBrew.handBrewPhase}
            onRetry={handBrew.onRetry}
            onRegenerate={handBrew.onRegenerate}
            onKalitaSizeChange={handBrew.handleKalitaSizeChange}
            onV60VariantChange={handBrew.handleV60VariantChange}
            onKalitaIcedChillingMethodChange={handBrew.handleKalitaIcedChillingMethodChange}
            extraFooter={actionButtons}
            bean={handBrew.handBrewBean}
            onStartTasting={handleBrewTimerStartTasting}
            userCoffeeGrams={handBrew.userCoffeeGrams}
            onCoffeeGramsChange={handBrew.handleCoffeeGramsChange}
            onPersistDose={handBrew.persistDose}
          />
        )}
        <ProfessorRuphusSlideUp {...ruphusProps} />
        <QuickRateForm
          open={quickRateOpen}
          onClose={() => setQuickRateOpen(false)}
          beanName={scanData?.name}
          onSubmit={handleQuickRateSubmit}
        />
        <Toast message={toast} open={!!toast} onClose={() => setToast(null)} />
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick Recipe" centered>
      {/* Photo capture step */}
      {step === 'photo' && (
        <m.div {...fadeUp} style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />

          {/* Drop zone */}
          <div style={{
            background: C.card,
            border: `2px dashed ${C.accentLight}`,
            borderRadius: radius.lg,
            padding: '40px 24px 36px',
            marginBottom: 16,
          }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: radius.lg,
              background: C.accentSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
            }}>
              <CameraIcon size={26} color={C.accent} />
            </div>
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h2.fontSize,
              fontWeight: 600,
              color: C.text,
              marginBottom: 6,
            }}>Snap the bag</div>
            <div style={{ ...type.body, color: C.textMuted, marginBottom: 20 }}>
              Bag plus pamphlet photos are welcome
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {Capacitor.isNativePlatform() ? (
                <>
                  <Btn variant="secondary" onClick={takeNativePhoto}>Take Photo</Btn>
                  <Btn variant="primary" onClick={pickNativePhotos}>Choose Photos</Btn>
                </>
              ) : (
                <Btn variant="primary" onClick={() => fileRef.current?.click()}>Choose Photos</Btn>
              )}
            </div>
          </div>

          {scanError && (
            <m.div
              {...popIn}
              style={{
                padding: '10px 14px',
                borderRadius: radius.sm,
                ...type.body,
                background: C.amberBg,
                color: C.amber,
                marginBottom: 12,
                textAlign: 'left',
              }}
            >
              {scanError}
            </m.div>
          )}
        </m.div>
      )}

      {/* Scanning step */}
      {step === 'scanning' && (
        <m.div {...fadeUp} style={{ textAlign: 'center', padding: '36px 0' }}>
          {photos.length > 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20 }}>
              {photos.map((photo, idx) => (
                <img
                  key={idx}
                  src={photo.previewUrl}
                  alt={`Scanned photo ${idx + 1}`}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: 'cover',
                    borderRadius: radius.sm,
                    opacity: 0.8,
                    boxShadow: shadows.e1,
                  }}
                />
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {spinner}
            <span style={{ ...type.bodyL, color: C.textMuted }}>
              Reading {photos.length > 1 ? 'photos' : 'label'}...
            </span>
          </div>
        </m.div>
      )}

      {/* Enriching step */}
      {step === 'enriching' && (
        <m.div {...fadeUp} style={{ textAlign: 'center', padding: '36px 0' }}>
          {scanData && (scanData.name || scanData.roaster) && (
            <div style={{ marginBottom: 20 }}>
              {scanData.name && (
                <div style={{
                  fontFamily: fonts.heading,
                  fontSize: type.h2.fontSize,
                  fontWeight: 600,
                  color: C.text,
                  marginBottom: 4,
                }}>
                  {scanData.name}
                </div>
              )}
              {scanData.roaster && (
                <div style={{ ...type.body, color: C.textMuted }}>
                  by {scanData.roaster}
                </div>
              )}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            {spinner}
            <span style={{ ...type.bodyL, color: C.textMuted }}>Researching online...</span>
          </div>
        </m.div>
      )}

      {/* Bag size prompt */}
      {step === 'bagSize' && (
        <m.div {...fadeUp} style={{ textAlign: 'center', padding: '20px 0' }}>
          {scanData?.name && (
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h2.fontSize,
              fontWeight: 600,
              color: C.text,
              marginBottom: 4,
            }}>
              {scanData.name}
            </div>
          )}
          {!scanData?.name && (
            <div style={{
              fontFamily: fonts.heading,
              fontSize: type.h2.fontSize,
              fontWeight: 600,
              color: C.text,
              marginBottom: 4,
            }}>Unknown Bean</div>
          )}
          {scanData?.roaster && (
            <div style={{ ...type.body, color: C.textMuted, marginBottom: 20 }}>
              by {scanData.roaster}
            </div>
          )}
          {!scanData?.roaster && <div style={{ marginBottom: 20 }} />}

          <div style={{ ...type.bodyL, color: C.text, marginBottom: 12 }}>
            How many grams do you have?
          </div>
          <input
            type="number"
            min={1}
            value={bagSizeInput}
            onChange={e => setBagSizeInput(e.target.value)}
            placeholder="e.g. 200"
            style={{ ...inputStyle, maxWidth: 160, margin: '0 auto 16px', display: 'block' }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Btn variant="ghost" onClick={handleRetryPhoto}>
              <RotateCcw size={12} /> Retake
            </Btn>
            <Btn variant="primary" onClick={handleBagSizeSubmit} disabled={!bagSizeInput || parseInt(bagSizeInput, 10) < 1}>
              <Search size={14} /> Get Recipe
            </Btn>
          </div>
        </m.div>
      )}
    </Modal>
  );
};
