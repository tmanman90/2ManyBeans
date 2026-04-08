// Quick Recipe Flow — scan a coffee bag and generate an Aiden recipe without adding to inventory
import { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Camera as CameraIcon, X, Search, RotateCcw, Save } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { compressImage } from '../lib/claude';
import { scanBeanLabel, researchBeanOnline } from '../lib/gemini';
import { useAidenBrew } from '../hooks/useAidenBrew';
import { AidenModal } from './AidenModal';
import { Modal } from './Modal';
import { Btn } from './Btn';

const ENRICHABLE_FIELDS = ['altitude', 'region', 'farm', 'roastLevel', 'cupScore', 'brewingRec', 'sourcedBy', 'variety', 'process', 'producer'];

const noop = () => {};

export const QuickRecipeFlow = ({ open, onClose, onSaveToInventory }) => {
  const [step, setStep] = useState('photo'); // photo | scanning | enriching | bagSize | brewing
  const [photo, setPhoto] = useState(null); // { base64, mediaType, previewUrl }
  const [scanData, setScanData] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [bagSizeInput, setBagSizeInput] = useState('');
  const fileRef = useRef(null);

  // Aiden brew hook with noop updateBean (ephemeral, no Firestore writes)
  const aiden = useAidenBrew(noop);

  // Reset on close + revoke blob URL
  useEffect(() => {
    if (!open) {
      if (photo?.previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(photo.previewUrl);
      }
      setStep('photo');
      setPhoto(null);
      setScanData(null);
      setScanError(null);
      setBagSizeInput('');
    }
  }, [open]);

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
      handlePhotoReady({ base64, mediaType, previewUrl: image.dataUrl });
    } catch (err) {
      if (err.message !== 'User cancelled photos app') {
        setScanError(`Failed to capture photo: ${err.message || 'Unknown error'}`);
      }
    }
  };

  const handleFileInput = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      handlePhotoReady(compressed);
    } catch (err) {
      setScanError('Failed to process photo. Try another.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const handlePhotoReady = async (photoObj) => {
    setPhoto(photoObj);
    setScanError(null);
    setStep('scanning');

    try {
      const parsed = await scanBeanLabel([photoObj]);
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
    // Build ephemeral bean (no id = no Firestore writes)
    const ephemeralBean = { ...data };
    // Ensure bagSize is a number for the recipe system
    if (typeof ephemeralBean.bagSize === 'string') {
      ephemeralBean.bagSize = parseInt(ephemeralBean.bagSize, 10) || 100;
    }
    aiden.handleBrewWithAiden(ephemeralBean);
  };

  const handleRetryPhoto = () => {
    setPhoto(null);
    setScanData(null);
    setScanError(null);
    setBagSizeInput('');
    setStep('photo');
  };

  const handleSave = () => {
    if (!scanData || !onSaveToInventory) return;
    // Pass scan data + Aiden recipe data for pre-fill
    const saveData = {
      ...scanData,
      aidenRecipe: aiden.aidenRecipe,
      aidenLink: aiden.aidenResult?.link || null,
      aidenGrind: aiden.aidenRecipe?.grindRecommendation || null,
      photo,
    };
    onClose();
    onSaveToInventory(saveData);
  };

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

  const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
    textAlign: 'center',
  };

  // During brew phase, show AidenModal directly
  if (step === 'brewing') {
    return (
      <>
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
          extraFooter={
            aiden.aidenRecipe && !aiden.aidenLoading && onSaveToInventory ? (
              <Btn variant="secondary" onClick={handleSave} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
                <Save size={14} /> Save to Inventory
              </Btn>
            ) : null
          }
        />
      </>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Quick Recipe" centered>
      {/* Photo capture step */}
      {step === 'photo' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />

          <div
            onClick={() => Capacitor.isNativePlatform() ? takeNativePhoto() : fileRef.current?.click()}
            style={{
              cursor: 'pointer', background: C.card,
              border: `2px dashed ${C.border}`,
              borderRadius: 16, padding: '40px 20px',
              marginBottom: 16, transition: 'border-color 0.15s',
            }}
          >
            <CameraIcon size={36} color={C.accent} style={{ marginBottom: 8 }} />
            <div style={{ fontFamily: fonts.heading, fontSize: 18, color: C.text, marginBottom: 4 }}>Snap the bag</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Get an Aiden recipe without adding to inventory</div>
          </div>

          {scanError && (
            <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 12, background: C.amberBg, color: C.amber, marginBottom: 12 }}>
              {scanError}
            </div>
          )}
        </div>
      )}

      {/* Scanning step */}
      {step === 'scanning' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {photo && (
            <img src={photo.previewUrl} alt="Scanned bag"
              style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 10, marginBottom: 16, opacity: 0.7 }} />
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Reading label...</span>
          </div>
        </div>
      )}

      {/* Enriching step */}
      {step === 'enriching' && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          {scanData && (scanData.name || scanData.roaster) && (
            <>
              <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text, marginBottom: 4 }}>
                {scanData.name}
              </div>
              {scanData.roaster && (
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
                  by {scanData.roaster}
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {spinner}
            <span style={{ fontSize: 14, color: C.textMuted }}>Researching online...</span>
          </div>
        </div>
      )}

      {/* Bag size prompt */}
      {step === 'bagSize' && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text, marginBottom: 4 }}>
            {scanData?.name || 'Unknown Bean'}
          </div>
          {scanData?.roaster && (
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 16 }}>
              by {scanData.roaster}
            </div>
          )}
          <div style={{ fontSize: 14, color: C.text, marginBottom: 12 }}>How many grams do you have?</div>
          <input
            type="number"
            min={1}
            value={bagSizeInput}
            onChange={e => setBagSizeInput(e.target.value)}
            placeholder="e.g. 20"
            style={{ ...inputStyle, maxWidth: 160, margin: '0 auto', marginBottom: 12 }}
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
        </div>
      )}
    </Modal>
  );
};
