import { useState } from 'react';
import { Coffee, ExternalLink, RefreshCw, Save, Undo2 } from 'lucide-react';
import { C, fonts, type, radius, shadows } from '../styles/theme';
import { Modal } from './Modal';
import { Btn } from './Btn';

const card = { background: C.bgDeep, border: `1px solid ${C.borderLight}`, borderRadius: radius.md, padding: '12px' };
const inputStyle = { width: '100%', minHeight: 44, padding: '8px 10px', borderRadius: radius.sm, border: `1px solid ${C.border}`, background: C.cream, color: C.text, fontFamily: fonts.body, fontSize: 16 };

export function EspressoModal({
  open, onClose, bean, recipe, loading = false, error = null, phase = null, notice = null,
  onRetry, onRegenerate, onSave, onUndo, onDoseChange, onYieldChange,
  onOpenChat = null, onStartTasting = null,
}) {
  const [saving, setSaving] = useState(false);
  const unsupported = phase === 'setup' && !recipe;
  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try { await onSave(); } catch (_error) { /* The hook renders the actionable error state. */ } finally { setSaving(false); }
  };
  const runAction = (handler) => {
    if (!handler) return;
    Promise.resolve(handler()).catch(() => {});
  };
  const name = bean?.name || bean?.beanName || 'This bean';
  return (
    <Modal open={open} onClose={onClose} title="Espresso recipe">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: radius.sm, background: C.amberBg, display: 'grid', placeItems: 'center' }}><Coffee size={21} color={C.accent} /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...type.label, color: C.textMuted }}>ESPRESSO · {name}</div>
          <div style={{ ...type.caption, color: C.textLight, marginTop: 3 }}>{recipe?.setupDescription || 'Confirm your machine and basket to get numeric targets.'}</div>
        </div>
      </div>
      {loading && <div role="status" style={{ ...card, color: C.textMuted }}>Checking this bean’s espresso recipe…</div>}
      {error && <div role="alert" style={{ ...card, borderColor: C.danger, color: C.danger, marginBottom: 12 }}><div>{error}</div>{onRetry && !unsupported && <Btn variant="secondary" onClick={() => runAction(onRetry)} style={{ minHeight: 44, marginTop: 10 }}>Try again</Btn>}</div>}
      {unsupported && (
        <div style={{ ...card, marginBottom: 12 }}>
          <div style={{ ...type.h3, marginBottom: 6 }}>Setup confirmation needed</div>
          <div style={{ ...type.body, color: C.textMuted, lineHeight: 1.5 }}>Numeric Barista Express targets are available after you confirm the machine and stock double basket. You can still use chat or guided tasting for an unsupported setup.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {onOpenChat && <Btn variant="secondary" onClick={onOpenChat} style={{ minHeight: 44 }}>Open chat</Btn>}
            {onStartTasting && <Btn variant="secondary" onClick={onStartTasting} style={{ minHeight: 44 }}>Guided tasting</Btn>}
          </div>
        </div>
      )}
      {recipe && (
        <>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
            <label style={{ ...type.caption, color: C.textMuted }}>Dose (g)<input aria-label="Espresso dose in grams" type="number" min="16" max="19" step="0.1" value={recipe.doseGrams} onChange={(event) => onDoseChange?.(Number(event.target.value))} style={inputStyle} /></label>
            <label style={{ ...type.caption, color: C.textMuted }}>Output (g)<input aria-label="Espresso output in grams" type="number" min="16" step="0.1" value={recipe.yieldGrams} onChange={(event) => onYieldChange?.(Number(event.target.value))} style={inputStyle} /></label>
            <div><div style={{ ...type.caption, color: C.textMuted }}>Ratio</div><div style={{ ...type.h2, marginTop: 10 }}>1:{recipe.ratio}</div></div>
          </div>
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ ...type.label, color: C.textMuted }}>TARGET GUIDE</div>
            <div style={{ ...type.h2, marginTop: 5 }}>{recipe.timeRangeSeconds?.[0]}–{recipe.timeRangeSeconds?.[1]} seconds</div>
            <div style={{ ...type.caption, color: C.textLight, marginTop: 4 }}>Timing: machine start to stop · target output mass, not water input</div>
          </div>
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ ...type.label, color: C.textMuted }}>GRIND & PREP</div>
            <div style={{ ...type.body, lineHeight: 1.5, marginTop: 5 }}>{recipe.grindGuidance}</div>
            <ul style={{ ...type.body, lineHeight: 1.5, color: C.textMuted, margin: '8px 0 0', paddingLeft: 20 }}>{recipe.preparation?.map((step) => <li key={step}>{step}</li>)}</ul>
          </div>
          <div style={{ ...type.caption, color: C.textLight, marginBottom: 12 }}>Source: {recipe.provenance?.label || recipe.source}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Btn onClick={save} disabled={saving || loading} style={{ minHeight: 44 }}><Save size={16} /> {saving ? 'Saving…' : 'Save recipe'}</Btn>
            {onUndo && notice?.undoAvailable && <Btn variant="secondary" onClick={() => runAction(onUndo)} disabled={loading} style={{ minHeight: 44 }}><Undo2 size={16} /> Undo</Btn>}
            {onRegenerate && <Btn variant="secondary" onClick={() => runAction(onRegenerate)} disabled={loading} style={{ minHeight: 44 }}><RefreshCw size={16} /> Refresh</Btn>}
            {onOpenChat && <Btn variant="secondary" onClick={onOpenChat} style={{ minHeight: 44 }}><ExternalLink size={16} /> Discuss in chat</Btn>}
            {onStartTasting && <Btn variant="secondary" onClick={onStartTasting} style={{ minHeight: 44 }}>Guided tasting</Btn>}
          </div>
        </>
      )}
    </Modal>
  );
}
