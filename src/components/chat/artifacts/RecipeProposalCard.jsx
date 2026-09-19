import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';
import { Btn } from '../../Btn';
import { recipeCardMetadata } from '../../../lib/ruphus/recipeCardMetadata';
import { aidenProfileRows } from '../../../lib/ruphus/aidenProfilePreview';

const ACTIONS = Object.freeze([
  { mode: 'apply_proposal', label: 'Update saved recipe' },
  { mode: 'brew_once', label: 'Try for one brew' },
  { mode: 'keep_current', label: 'Leave unchanged' },
]);

const brewerName = (slot, recipe) => recipeCardMetadata(recipe, slot).brewerLabel;
const amount = (value, unit = '') => {
  if (value == null) return '—';
  if (value && typeof value === 'object') {
    if (value.value != null) {
      const nativeUnit = String(value.unit || unit);
      return `${value.value}${['C', 'F'].includes(nativeUnit.toUpperCase()) ? `°${nativeUnit.toUpperCase()}` : nativeUnit}`;
    }
    if (value.microns != null) return `${value.microns} µm`;
    if (value.celsius != null) return `${value.celsius}°C`;
  }
  return `${value}${unit}`;
};
const PREVIEW_SLOTS = new Set(['v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']);

const ratioLabel = (value) => {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return `1:${value}`;
  const text = String(value).trim();
  if (!text) return null;
  return /^\d+(?:\.\d+)?$/.test(text) ? `1:${text}` : text;
};

const techniqueDisplayName = (proposal, after) => proposal.techniqueExperiment?.name || after.techniqueLabel || after.techniqueName || proposal.techniqueLabel || proposal.techniqueName || after.title || null;
const techniqueValue = (recipe = {}) => recipe.techniqueId || recipe.technique || recipe.techniqueName || recipe.techniqueLabel || null;
const comparable = (value) => value && typeof value === 'object' ? JSON.stringify(value) : String(value);
const changedValue = (before, after, fields) => fields.map(({ label, selector, unit }) => ({
  label,
  unit,
  oldValue: selector(before),
  newValue: selector(after),
})).find(({ oldValue, newValue }) => (oldValue != null || newValue != null) && comparable(oldValue) !== comparable(newValue));
const temperature = (recipe = {}) => recipe.waterTemp?.celsius ?? recipe.temperatureC ?? recipe.temperature;
const grind = (recipe = {}) => {
  const value = recipe.grindSize?.setting ?? recipe.grind;
  return value && typeof value === 'object' && value.microns != null ? { value: value.microns, unit: ' µm' } : value;
};

const previewCopy = {
  proposed: 'Your saved recipe is unchanged until you choose.',
  applying: 'Working on your choice…',
  applied: 'Saved to your recipe.',
  kept: 'Your saved recipe is unchanged.',
  attempt_created: 'Ready for one brew. Your saved recipe is unchanged.',
  trial: 'Ready for one brew. Your saved recipe is unchanged.',
  stale: 'This preview is out of date. Ask Ruphus for a fresh one.',
  superseded: 'This preview was replaced by a newer suggestion.',
  undone: 'This change was undone. Your saved recipe is unchanged.',
};

// Undo receipts identify the revision that was revoked, while the original
// proposal is a separate artifact. Keep both artifact surfaces in sync so a
// receipt cannot leave an actionable-looking historical card behind.
export const reconcileUndoneProposalArtifacts = (items, receipt) => {
  if (!Array.isArray(items) || receipt?.mode !== 'undo_revision' || receipt?.status !== 'succeeded') return items;
  const proposalId = receipt.proposalId;
  const revisionId = receipt.undoneRevisionId;
  if (!proposalId && !revisionId) return items;
  return items.map(item => {
    if (item?.type !== 'recipe_proposal') return item;
    const sameProposal = proposalId && item.id === proposalId;
    const sameRevision = revisionId && item.revisionId === revisionId
      && (!receipt.coffeeId || item.coffeeId === receipt.coffeeId)
      && (!receipt.slotKey || item.slotKey === receipt.slotKey);
    if (!sameProposal && !sameRevision) return item;
    return { ...item, status: 'undone', undoAvailable: false, executionAvailable: false, promoteAvailable: false };
  });
};

export const reconcileUndoneProposalMessages = (messages, receipt) => {
  if (!Array.isArray(messages)) return messages;
  return messages.map(message => Array.isArray(message?.artifacts)
    ? { ...message, artifacts: reconcileUndoneProposalArtifacts(message.artifacts, receipt) }
    : message);
};

export const reconcileUndoneProposalHistory = (messages) => {
  const receipts = (messages || []).flatMap(message => message?.artifacts || [])
    .filter(item => item?.mode === 'undo_revision' && item.status === 'succeeded');
  return receipts.reduce((current, receipt) => reconcileUndoneProposalMessages(current, receipt), messages);
};

export const mergeUndoneProposalCanonical = (artifact, canonical) => {
  if (!canonical) return artifact;
  const merged = { ...artifact, ...canonical };
  // The server's before-state is the saved revision for commit/undo authority.
  // A conversation edit may instead compare against the preceding unsaved
  // draft. Keep that display base only for the identical immutable proposal.
  if (artifact?.id === canonical.id && artifact?.coffeeId === canonical.coffeeId
    && artifact?.slotKey === canonical.slotKey && artifact?.recipeHash
    && artifact.recipeHash === canonical.recipeHash
    && (artifact.before != null || (artifact.before === null && canonical.sourceState === 'absent'))) {
    merged.before = artifact.before;
  }
  return artifact?.status === 'undone'
    ? { ...merged, status: 'undone', undoAvailable: false, executionAvailable: false, promoteAvailable: false }
    : merged;
};

function PreviewCard({ proposal, after, before, status, onPreview, onInspect }) {
  const coffeeName = proposal.coffeeName || proposal.coffee?.name || 'Your coffee';
  const metadata = recipeCardMetadata(after, proposal.slotKey);
  const ratio = ratioLabel(after.ratio ?? after.finalBeverageRatio ?? before.ratio ?? before.finalBeverageRatio);
  const beforeRatio = ratioLabel(before.ratio ?? before.finalBeverageRatio);
  const ratioChanged = beforeRatio && ratio && beforeRatio !== ratio;
  const requestedRatio = ratioLabel(after.sourceProjection?.adaptation?.controls?.ratio);
  const nativeRatioRequest = requestedRatio && !ratio ? `${requestedRatio} (native ${after.sourceNativeWaterUnit || 'source'} schedule)` : null;
  const technique = techniqueDisplayName(proposal, after);
  const techniqueChanged = technique && String(techniqueValue(before)) !== String(techniqueValue(after));
  const derivativeChange = changedValue(before, after, [
    { label: 'Coffee dose', selector: recipe => recipe.coffeeGrams ?? recipe.dose, unit: 'g' },
    { label: 'Temperature', selector: temperature, unit: '°C' },
    { label: 'Grind', selector: grind, unit: '' },
  ]);
  const primaryChange = proposal.techniqueExperiment && technique
    ? { label: 'Technique', oldValue: null, newValue: technique }
    : ratioChanged
    ? { label: 'Ratio', oldValue: beforeRatio, newValue: ratio }
    : nativeRatioRequest
      ? { label: 'Ratio request', oldValue: null, newValue: nativeRatioRequest }
    : techniqueChanged
      ? { label: 'Technique', oldValue: null, newValue: technique }
      : derivativeChange
        ? derivativeChange
        : null;
  const viewRecipe = status === 'proposed' ? onPreview : status === 'undone' ? null : onInspect;
  const disabled = typeof viewRecipe !== 'function' || status === 'applying';
  const differentBrewer = proposal.before && brewerName(proposal.slotKey, before) !== brewerName(proposal.slotKey, after);
  const stateCopy = status === 'proposed' && proposal.sourceState === 'absent'
    ? 'Try it first, or save it as your recipe.'
    : status === 'proposed' && differentBrewer
      ? `Your saved ${brewerName(proposal.slotKey, before)} stays unchanged. Save replaces it with this recipe.`
      : previewCopy[status] || 'This suggestion is no longer open.';

  return <section aria-label={`${coffeeName} recipe preview`} data-artifact="recipe_proposal" data-preview="true" data-preview-card="true" data-preview-id={proposal.id || undefined} data-status={status} style={{ width: '100%', boxSizing: 'border-box', padding: 18, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={{ ...typeScale.h3, color: C.text }}>{coffeeName} <span aria-hidden="true" style={{ color: C.textLight }}>·</span> <span style={{ color: C.textMuted }}>{brewerName(proposal.slotKey, after)}</span></div>
    {primaryChange ? <div data-preview-change="true" style={{ marginTop: 12, color: C.text, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: C.textMuted }}>{primaryChange.label}</span>{' '}<strong>{primaryChange.oldValue == null ? primaryChange.newValue : `${amount(primaryChange.oldValue, primaryChange.unit)} → ${amount(primaryChange.newValue, primaryChange.unit)}`}</strong></div> : <div data-preview-change="true" style={{ marginTop: 12, color: C.textMuted }}>Recipe updated</div>}
    {(proposal.techniqueExperiment || nativeRatioRequest) && <p style={{ color: C.textMuted, margin: '8px 0 0', lineHeight: 1.5 }}>{[metadata.adaptationLabel, metadata.sourceSummary || (ratio ? `Ratio ${ratio}` : nativeRatioRequest)].filter(Boolean).join(' · ')}</p>}
    {status !== 'undone' && <Btn variant="primary" onClick={() => viewRecipe?.(proposal)} disabled={disabled} aria-label="View recipe" style={{ minHeight: 44, width: '100%', marginTop: 16 }}>{status === 'applying' ? 'Working…' : 'View recipe'}</Btn>}
    <p aria-live="polite" style={{ color: C.textMuted, margin: '10px 0 0', lineHeight: 1.5 }}>{stateCopy}</p>
  </section>;
}

function AidenProfileCard({ proposal, before, after, status, onAction, actionPending }) {
  const previousRows = new Map(aidenProfileRows(before));
  const firstProfile = proposal.sourceState === 'absent' && proposal.before == null;
  const changed = aidenProfileRows(after).filter(([label, value]) => previousRows.get(label) !== value);
  const allowed = new Set(proposal.actions || []);
  const actions = [
    { mode: 'apply_proposal', label: 'Save profile' },
    { mode: 'brew_once', label: 'Prepare trial in Fellow' },
    { mode: 'keep_current', label: 'Leave unchanged' },
  ];
  return <section aria-label={`${proposal.coffeeName || 'Coffee'} Aiden profile review`} data-artifact="recipe_proposal" data-aiden-profile="true" data-status={status} style={{ padding: 18, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, background: C.cream, boxShadow: shadows.e1 }}>
    <div style={typeScale.h3}>{proposal.coffeeName || 'Your coffee'} · Aiden</div>
    <p style={{ margin: '10px 0', color: C.textMuted }}>{after.title || 'Aiden profile'}</p>
    {changed.map(([label, value]) => <div key={label} data-profile-change={label} style={{ marginTop: 12, lineHeight: 1.5, overflowWrap: 'anywhere' }}><span style={{ color: C.textMuted }}>{label}</span><div>{firstProfile ? <strong>{value}</strong> : <>{previousRows.get(label)} → <strong>{value}</strong></>}</div></div>)}
    <details style={{ marginTop: 12 }}><summary style={{ minHeight: 44, padding: '12px 0', cursor: 'pointer' }}>View full Aiden profile</summary>
      <dl style={{ margin: 0 }}>{aidenProfileRows(after).map(([label, value]) => <div key={label} style={{ margin: '10px 0', lineHeight: 1.5 }}><dt style={{ color: C.textMuted }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>)}</dl>
      <p style={{ lineHeight: 1.5 }}>Choose the serving size on Aiden. The ratio scales with it; grinder settings stay unchanged.</p>
    </details>
    {proposal.status === 'proposed' && onAction && <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{actions.filter(action => allowed.has(action.mode)).map(action => <ArtifactAction key={action.mode} action={action.mode} label={action.label} status={status} disabled={actionPending} onClick={() => onAction({ mode: action.mode, artifact: proposal })} />)}</div>}
    <p aria-live="polite" style={{ color: C.textMuted, margin: '12px 0 0', lineHeight: 1.5 }}>{status === 'proposed' ? 'Save changes the app recipe only. Preparing a trial sends this profile to Fellow without replacing your saved recipe or starting the brewer.' : previewCopy[status] || 'This profile review is no longer open.'}</p>
  </section>;
}

export function RecipeProposalCard({ proposal = {}, onAction, onPreview, onInspect, actionPending = false }) {
  const before = proposal.before || {};
  const after = proposal.after || {};
  const status = actionPending ? 'applying' : proposal.status || 'proposed';
  if (proposal.slotKey === 'aiden') return <AidenProfileCard proposal={proposal} before={before} after={after} status={status} onAction={onAction} actionPending={actionPending} />;
  if (PREVIEW_SLOTS.has(proposal.slotKey) && (typeof onPreview === 'function' || typeof onInspect === 'function')) return <PreviewCard proposal={proposal} before={before} after={after} status={status} onPreview={onPreview} onInspect={onInspect} />;
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
  const completedMessage = { applied: 'Saved to your recipe.', kept: 'Your saved recipe is unchanged.', attempt_created: 'Ready for one brew. Your saved recipe is unchanged.', undone: 'This change was undone. Your saved recipe is unchanged.' }[status];
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
