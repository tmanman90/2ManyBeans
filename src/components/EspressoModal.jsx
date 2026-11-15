import { useEffect, useState } from 'react';
import { ChevronRight, Coffee, Undo2 } from 'lucide-react';
import { C, fonts, type, radius } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';
import { EspressoEquipmentEditor } from './EspressoEquipmentEditor';
import { usePreferences } from '../hooks/useUserProfile';
import { espressoSetupDescription } from '../lib/espressoRecipes';
import { espressoHasUnsavedEdits } from '../lib/espressoUi';

const card = { background: C.cream, border: `1px solid ${C.border}`, borderRadius: radius.md, padding: 16 };
const inputStyle = { width: '100%', minWidth: 0, minHeight: 48, padding: '10px 12px', borderRadius: radius.sm, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontFamily: fonts.body, fontSize: 16 };
const parseMass = value => value === '' ? null : Number(value);

export function EspressoModal({
  open, onClose, bean, recipe, loading = false, error = null, notice = null,
  setupMismatch = false, onStartCurrentSetup,
  onRetry, onSave, onUndo, onDoseChange, onYieldChange,
  onOpenChat = null, onStartTasting = null,
  extraFooter = null,
}) {
  const { preferences } = usePreferences();
  const [editingEquipment, setEditingEquipment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputDraft, setInputDraft] = useState(null);
  // Bind transient input text to the recipe object it edits. Switching equipment
  // displays the new targets in the same render, rather than one effect later.
  const fields = inputDraft?.recipe === recipe ? inputDraft : {
    recipe, doseText: recipe?.doseGrams == null ? '' : String(recipe.doseGrams),
    outputText: recipe?.yieldGrams == null ? '' : String(recipe.yieldGrams),
  };
  const { doseText, outputText } = fields;
  useEffect(() => { if (!open) setEditingEquipment(false); }, [open]);

  const dose = parseMass(doseText);
  const output = parseMass(outputText);
  const complete = Number.isFinite(dose) && dose > 0 && Number.isFinite(output) && output > 0;
  const localEdits = dose !== (recipe?.doseGrams ?? null) || output !== (recipe?.yieldGrams ?? null);
  const unsavedTarget = localEdits || espressoHasUnsavedEdits(recipe, bean?.espressoRecipe);
  const generic = recipe?.recipeKind === 'generic';
  const stockBasket = recipe?.setup?.machine === 'breville-barista-express' && recipe?.setup?.basket === 'stock-double-single-wall';
  const ratio = complete ? Math.round(output / dose * 100) / 100 : recipe?.ratio || 2;
  const changeDose = value => {
    const amount = parseMass(value);
    setInputDraft({ recipe, doseText: value, outputText: Number.isFinite(amount) && amount > 0 ? String(Math.round(amount * (recipe?.ratio || 2) * 10) / 10) : '' });
  };
  const save = async () => {
    if (!onSave || !complete || setupMismatch) return;
    setSaving(true);
    try { await onSave(localEdits ? { doseGrams: dose, yieldGrams: output } : {}); }
    catch (_error) { /* The hook keeps the failure actionable. */ }
    finally { setSaving(false); }
  };
  const runAction = handler => { if (handler) Promise.resolve(handler()).catch(() => {}); };
  const name = bean?.name || bean?.beanName || 'This coffee';
  const saved = recipe?.source === 'user_saved' && !unsavedTarget;
  return (
    <Modal open={open} onClose={editingEquipment ? () => setEditingEquipment(false) : onClose} title={editingEquipment ? 'Espresso equipment' : 'Espresso recipe'}>
      <section aria-label={editingEquipment ? 'Espresso equipment' : 'Espresso recipe'}>
      {editingEquipment ? <EspressoEquipmentEditor onCancel={() => setEditingEquipment(false)} onSaved={() => setEditingEquipment(false)} /> : <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <div style={{ width: 40, height: 40, borderRadius: radius.sm, background: C.amberBg, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Coffee size={21} color={C.accent} /></div>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...type.label, color: C.textMuted, overflowWrap: 'anywhere' }}>{name}</div>
            <div style={{ ...type.caption, color: C.textMuted, marginTop: 4 }}>{saved ? 'Your saved recipe' : generic ? 'Starting recipe · any espresso machine' : 'Starting recipe · Barista Express'}</div>
          </div>
        </div>
        {loading && <p role="status" style={{ ...type.body, color: C.textMuted }}>Checking this coffee’s espresso recipe…</p>}
        {error && <div role="alert" style={{ ...card, borderColor: C.red, color: C.red, marginBottom: 14 }}>
          <div style={type.body}>{error}</div>
          {onRetry && <Btn variant="secondary" onClick={() => runAction(onRetry)} disabled={loading} style={{ minHeight: 44, marginTop: 10 }}>Try again</Btn>}
        </div>}
        {recipe && <>
          <div style={card}>
            <div style={{ ...type.label, color: C.textMuted }}>{saved ? 'YOUR RATIO' : 'STARTING RATIO'}</div>
            <div style={{ ...type.h1, fontSize: 36, marginTop: 5 }}>1:{ratio}</div>
            <p style={{ ...type.body, color: C.textMuted, margin: '8px 0 0' }}>{saved ? 'Your own adjustment, kept for this coffee.' : 'Aim for this much espresso out for each gram of coffee in.'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
              <label style={{ ...type.body, fontWeight: 700 }}>Coffee in (g)
                <input aria-label="Espresso dose in grams" type="number" inputMode="decimal" min={stockBasket ? '16' : '0.1'} max={stockBasket ? '19' : undefined} step="0.1" value={doseText} placeholder="Your usual dose" disabled={setupMismatch || loading || saving} onChange={event => changeDose(event.target.value)} onBlur={() => { if (!setupMismatch && dose != null && dose > 0 && dose !== recipe.doseGrams) onDoseChange?.(dose); }} style={{ ...inputStyle, marginTop: 7 }} />
              </label>
              <label style={{ ...type.body, fontWeight: 700 }}>Espresso out (g)
                <input aria-label="Espresso output in grams" type="number" inputMode="decimal" min="0.1" step="0.1" value={outputText} placeholder="—" disabled={dose == null || setupMismatch || loading || saving} onChange={event => setInputDraft({ ...fields, outputText: event.target.value })} onBlur={() => { if (!setupMismatch && complete && output !== recipe.yieldGrams) onYieldChange?.(output); }} style={{ ...inputStyle, marginTop: 7 }} />
              </label>
            </div>
            <p style={{ ...type.caption, color: C.textMuted, margin: '10px 0 0', lineHeight: 1.5 }}>{generic ? 'Use the dose recommended for your basket, or the dose you already use.' : 'Original double basket: 16–19 g. Adjust to suit this coffee.'}</p>
          </div>
          {setupMismatch && <div style={{ ...card, marginTop: 14, background: C.bgDeep }}>
            <div style={{ ...type.h3, marginBottom: 6 }}>Saved for your previous equipment</div>
            <div style={{ ...type.body, color: C.textMuted }}>{recipe.setupDescription}. These targets haven’t been moved to your current setup.</div>
            <Btn variant="secondary" disabled={loading} onClick={onStartCurrentSetup} style={{ minHeight: 48, marginTop: 12 }}>Start a recipe for this equipment</Btn>
          </div>}
          <div style={{ ...card, marginTop: 16 }}>
            {preferences.espressoMachine ? <button type="button" aria-label="Edit espresso equipment" onClick={() => setEditingEquipment(true)} disabled={loading || saving} style={{ border: 0, background: 'transparent', padding: 0, width: '100%', minHeight: 48, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', color: C.text }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...type.body, fontWeight: 700 }}>{preferences.espressoMachine === 'breville-barista-express' ? 'Breville Barista Express' : preferences.espressoMachineName || 'Espresso machine'}</div>
                <div style={{ ...type.caption, color: C.textMuted, marginTop: 4, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{espressoSetupDescription(preferences)}</div>
              </div>
              <span style={{ ...type.caption, color: C.accent, fontWeight: 700, flexShrink: 0 }}>{preferences.espressoBasket ? 'Edit' : 'Complete setup'}</span><ChevronRight size={16} color={C.accent} style={{ flexShrink: 0 }} />
            </button> : <>
              <Btn variant="ghost" disabled={loading || saving} onClick={() => setEditingEquipment(true)} style={{ minHeight: 44, color: C.accent, padding: 0 }}>Add your machine →</Btn>
              <p style={{ ...type.body, color: C.textMuted, margin: '2px 0 0' }}>Get setup tips tailored to your equipment.</p>
            </>}
          </div>
          <div style={{ margin: '20px 0 16px' }}>
            <div style={type.h3}>Around {recipe.timeRangeSeconds?.[0]}–{recipe.timeRangeSeconds?.[1]} seconds</div>
            <p style={{ ...type.body, color: C.textMuted, margin: '5px 0 0' }}>Count from machine start to stop, including preinfusion. Stop near your output target; let taste guide the next shot.</p>
          </div>
          <ol style={{ ...type.body, color: C.textMuted, paddingLeft: 22, lineHeight: 1.6 }}>{recipe.preparation?.map(step => <li key={step} style={{ paddingLeft: 3, marginBottom: 9 }}>{step}</li>)}</ol>
          {recipe.grindGuidance && <p style={{ ...type.body, color: C.textMuted, margin: '12px 0' }}>{recipe.grindGuidance}</p>}
          {recipe.grinderSetting?.value != null && <p style={{ ...type.caption, color: C.textMuted }}>Your grinder setting: {recipe.grinderSetting.value}{recipe.grinderSetting.model ? ` · ${recipe.grinderSetting.model}` : ''}</p>}
          {recipe.temperature?.mode === 'machine_default' && Number(recipe.temperature.offsetF) !== 0 && <p style={{ ...type.caption, color: C.textMuted }}>Temperature: machine default {recipe.temperature.offsetF > 0 ? '+' : ''}{recipe.temperature.offsetF}°F</p>}
          {!setupMismatch && complete && <Btn onClick={save} disabled={saving || loading} style={{ width: '100%', minHeight: 48 }}>{saving ? 'Saving…' : saved ? 'Save recipe changes' : 'Save recipe'}</Btn>}
          {notice?.undoAvailable && onUndo && !setupMismatch && <Btn variant="secondary" onClick={() => runAction(onUndo)} disabled={loading} style={{ width: '100%', minHeight: 44, marginTop: 9 }}><Undo2 size={16} /> Undo saved change</Btn>}
          {onOpenChat && unsavedTarget && !setupMismatch && <p role="status" style={{ ...type.caption, color: C.textMuted, margin: '10px 0 0' }}>Save these edited targets before discussing them with Ruphus.</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {onOpenChat && <Btn variant="secondary" onClick={onOpenChat} disabled={unsavedTarget || setupMismatch || loading || saving} style={{ minHeight: 48, flex: 1 }}>Ask Ruphus</Btn>}
            {onStartTasting && <Btn variant="secondary" onClick={onStartTasting} disabled={loading || saving || localEdits} style={{ minHeight: 48, flex: 1 }}>Taste this coffee</Btn>}
          </div>
          <details style={{ marginTop: 16 }}>
            <summary style={{ ...type.caption, color: C.textMuted, minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Why this starting recipe?</summary>
            <p style={{ ...type.body, color: C.textMuted, margin: '4px 0', overflowWrap: 'anywhere' }}>Source: {recipe.provenance?.label || recipe.source}. {generic ? 'A general starting framework informed by James Hoffmann’s espresso guidance. Basket limits and controls follow your machine’s manual.' : 'An app starting recipe informed by James Hoffmann’s espresso guidance and the Breville BES870 manual.'} Taste decides what to keep.</p>
            {recipe.provenance?.url && <a href={recipe.provenance.url} target="_blank" rel="noopener noreferrer" style={{ ...type.body, color: C.accent, display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>Read recipe source</a>}
          </details>
        </>}
        {extraFooter}
      </>}
      </section>
    </Modal>
  );
}
