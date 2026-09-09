import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';
import { Btn } from '../../Btn';

const ACTIONS = Object.freeze([
  { mode: 'apply_proposal', label: 'Update saved recipe' },
  { mode: 'brew_once', label: 'Try for one brew' },
  { mode: 'keep_current', label: 'Leave unchanged' },
]);

const brewerName = (slot, recipe) => ({ aiden: 'Aiden', v60_hot: 'V60', v60_iced: 'Iced V60', kalita_hot: `Kalita ${recipe.kalitaSize || ''}`.trim(), kalita_iced: `Iced Kalita ${recipe.kalitaSize || ''}`.trim() }[slot] || 'Recipe');
const amount = (value, unit = '') => value == null ? '—' : `${value}${unit}`;
const HOT_PREVIEW_SLOTS = new Set(['v60_hot', 'kalita_hot']);

const ratioLabel = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return `1:${value}`;
  const text = String(value).trim();
  if (!text) return null;
  return /^\d+(?:\.\d+)?$/.test(text) ? `1:${text}` : text;
};

const techniqueDisplayName = (proposal, after) => after.techniqueLabel || after.techniqueName || proposal.techniqueLabel || proposal.techniqueName || null;
const techniqueValue = (recipe = {}) => recipe.techniqueId || recipe.technique || recipe.techniqueName || recipe.techniqueLabel || null;
const changedValue = (before, after, fields) => fields.map(({ label, selector, unit }) => ({
  label,
  unit,
  oldValue: selector(before),
  newValue: selector(after),
})).find(({ oldValue, newValue }) => (oldValue != null || newValue != null) && String(oldValue) !== String(newValue));
const temperature = (recipe = {}) => recipe.waterTemp?.celsius ?? recipe.temperatureC ?? recipe.temperature;
const grind = (recipe = {}) => recipe.grindSize?.setting ?? recipe.grind;

const previewCopy = {
  proposed: 'Your saved recipe is unchanged until you choose.',
  applying: 'Working on your choice…',
  applied: 'Saved to your recipe.',
  kept: 'Your saved recipe is unchanged.',
  attempt_created: 'Ready for one brew. Your saved recipe is unchanged.',
  trial: 'Ready for one brew. Your saved recipe is unchanged.',
  stale: 'This preview is out of date. Ask Ruphus for a fresh one.',
  superseded: 'This preview was replaced by a newer suggestion.',
};

function PreviewCard({ proposal, after, before, status, onPreview }) {
  const coffeeName = proposal.coffeeName || proposal.coffee?.name || 'Your coffee';
  const ratio = ratioLabel(after.ratio ?? after.finalBeverageRatio ?? before.ratio ?? before.finalBeverageRatio);
  const beforeRatio = ratioLabel(before.ratio ?? before.finalBeverageRatio);
  const ratioChanged = beforeRatio && ratio && beforeRatio !== ratio;
  const technique = techniqueDisplayName(proposal, after);
  const techniqueChanged = technique && String(techniqueValue(before)) !== String(techniqueValue(after));
  const derivativeChange = changedValue(before, after, [
    { label: 'Temperature', selector: temperature, unit: '°C' },
    { label: 'Grind', selector: grind, unit: '' },
  ]);
  const primaryChange = ratioChanged
    ? { label: 'Ratio', oldValue: beforeRatio, newValue: ratio }
    : techniqueChanged
      ? { label: 'Technique', oldValue: null, newValue: technique }
      : derivativeChange
        ? derivativeChange
        : null;
  const canPreview = status === 'proposed' && typeof onPreview === 'function';
  const disabled = !canPreview || status === 'stale' || status === 'superseded' || status === 'applying';

  return <section aria-label={`${coffeeName} recipe preview`} data-artifact="recipe_proposal" data-preview="true" data-preview-card="true" data-preview-id={proposal.id || undefined} data-status={status} style={{ width: '100%', boxSizing: 'border-box', padding: 18, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={{ ...typeScale.h3, color: C.text }}>{coffeeName} <span aria-hidden="true" style={{ color: C.textLight }}>·</span> <span style={{ color: C.textMuted }}>{brewerName(proposal.slotKey, after)}</span></div>
    {primaryChange ? <div data-preview-change="true" style={{ marginTop: 12, color: C.text, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: C.textMuted }}>{primaryChange.label}</span>{' '}<strong>{primaryChange.oldValue == null ? primaryChange.newValue : `${amount(primaryChange.oldValue, primaryChange.unit)} → ${amount(primaryChange.newValue, primaryChange.unit)}`}</strong></div> : <div data-preview-change="true" style={{ marginTop: 12, color: C.textMuted }}>Recipe updated</div>}
    <Btn variant="primary" onClick={() => onPreview?.(proposal)} disabled={disabled} aria-label="View recipe" style={{ minHeight: 44, width: '100%', marginTop: 16 }}>{status === 'applying' ? 'Working…' : 'View recipe'}</Btn>
    <p aria-live="polite" style={{ color: C.textMuted, margin: '10px 0 0', lineHeight: 1.5 }}>{previewCopy[status] || 'This suggestion is no longer open.'}</p>
  </section>;
}

export function RecipeProposalCard({ proposal = {}, onAction, onPreview, actionPending = false }) {
  const before = proposal.before || {};
  const after = proposal.after || {};
  const status = actionPending ? 'applying' : proposal.status || 'proposed';
  if (HOT_PREVIEW_SLOTS.has(proposal.slotKey) && typeof onPreview === 'function') return <PreviewCard proposal={proposal} before={before} after={after} status={status} onPreview={onPreview} />;
  const rows = [
    ['Water', before.waterGrams ?? before.water, after.waterGrams ?? after.water, ' g'],
    ['Coffee', before.coffeeGrams ?? before.dose, after.coffeeGrams ?? after.dose, ' g'],
    ['Grind', before.grindSize?.setting ?? before.grind, after.grindSize?.setting ?? after.grind, ''],
    ['Temperature', before.waterTemp?.celsius ?? before.temperatureC ?? before.temperature, after.waterTemp?.celsius ?? after.temperatureC ?? after.temperature, '°C'],
    ['Ratio', before.ratio, after.ratio, ''],
  ].filter(([, oldValue, newValue]) => oldValue != null || newValue != null);
  const changedRows = rows.filter(([, oldValue, newValue]) => String(oldValue) !== String(newValue));
  const unchangedRows = rows.filter(([, oldValue, newValue]) => String(oldValue) === String(newValue));
  const allowedActions = new Set(Array.isArray(proposal.actions) ? proposal.actions : []);
  const showActions = proposal.status === 'proposed' && Boolean(onAction) && allowedActions.size > 0;
  const steps = [...(after.prepSteps || []), ...(after.steps || []), ...(after.postBrewSteps || [])];
  const completedMessage = { applied: 'Saved to your recipe.', kept: 'Your saved recipe is unchanged.', attempt_created: 'Ready for one brew. Your saved recipe is unchanged.' }[status];
  return <section aria-label={`${proposal.coffeeName || 'Coffee'} recipe change`} data-artifact="recipe_proposal" data-status={status} style={{ width: '100%', boxSizing: 'border-box', padding: 18, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={{ color: C.textMuted, marginBottom: 6 }}>{[proposal.coffeeName, brewerName(proposal.slotKey, after)].filter(Boolean).join(' · ')}</div>
    <div style={typeScale.h3}>Your next recipe</div>
    {changedRows.map(([label, oldValue, newValue, unit]) => <div key={label} data-recipe-change={label.toLowerCase()} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, paddingTop: 12, fontVariantNumeric: 'tabular-nums' }}><span>{label}</span><strong>{amount(oldValue, unit)} → {amount(newValue, unit)}</strong></div>)}
    {unchangedRows.length > 0 && <p style={{ color: C.textMuted, margin: '12px 0', lineHeight: 1.5 }}>Keep: {unchangedRows.map(([label, , value, unit]) => label === 'Grind' ? `grind ${value}` : label === 'Temperature' ? amount(value, unit) : `${amount(value, unit)} ${label.toLowerCase()}`).join(' · ')}</p>}
    {steps.length > 0 && <details style={{ marginTop: 12 }}><summary style={{ minHeight: 44, display: 'list-item', alignContent: 'center', cursor: 'pointer' }}>View full recipe</summary><ol style={{ margin: '4px 0 12px', paddingLeft: 22 }}>{steps.map((step, index) => <li key={index} style={{ padding: '6px 0', lineHeight: 1.5 }}>{step.time ? `${step.time} — ` : ''}{step.action}</li>)}</ol></details>}
    {showActions && <div data-proposal-actions="true" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      {ACTIONS.filter(({ mode }) => allowedActions.has(mode)).map(({ mode, label }) => <ArtifactAction key={mode} action={mode} label={label} status={status} disabled={actionPending} onClick={() => onAction({ mode, artifact: proposal })} />)}
    </div>}
    <p aria-live="polite" style={{ color: C.textMuted, margin: '12px 0 0', lineHeight: 1.5 }}>{actionPending ? 'Working on your choice…' : status === 'proposed' ? showActions ? 'Your saved recipe is unchanged until you choose.' : 'This suggestion can’t be saved from this chat right now. Your recipe is unchanged.' : completedMessage || (status === 'stale' || status === 'superseded' ? 'This suggestion is out of date. Ask Ruphus for a fresh one.' : 'This suggestion is no longer open.')}</p>
  </section>;
}
