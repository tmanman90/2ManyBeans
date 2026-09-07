import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';

const ACTIONS = Object.freeze([
  { mode: 'apply_proposal', label: 'Update saved recipe' },
  { mode: 'brew_once', label: 'Try for one brew' },
  { mode: 'keep_current', label: 'Leave unchanged' },
]);

const brewerName = (slot, recipe) => ({ aiden: 'Aiden', v60_hot: 'V60', v60_iced: 'Iced V60', kalita_hot: `Kalita ${recipe.kalitaSize || ''}`.trim(), kalita_iced: `Iced Kalita ${recipe.kalitaSize || ''}`.trim() }[slot] || 'Recipe');
const amount = (value, unit = '') => value == null ? '—' : `${value}${unit}`;

export function RecipeProposalCard({ proposal = {}, onAction, actionPending = false }) {
  const before = proposal.before || {};
  const after = proposal.after || {};
  const rows = [
    ['Water', before.waterGrams ?? before.water, after.waterGrams ?? after.water, ' g'],
    ['Coffee', before.coffeeGrams ?? before.dose, after.coffeeGrams ?? after.dose, ' g'],
    ['Grind', before.grindSize?.setting ?? before.grind, after.grindSize?.setting ?? after.grind, ''],
    ['Temperature', before.waterTemp?.celsius ?? before.temperatureC ?? before.temperature, after.waterTemp?.celsius ?? after.temperatureC ?? after.temperature, '°C'],
    ['Ratio', before.ratio, after.ratio, ''],
  ].filter(([, oldValue, newValue]) => oldValue != null || newValue != null);
  const changedRows = rows.filter(([, oldValue, newValue]) => String(oldValue) !== String(newValue));
  const unchangedRows = rows.filter(([, oldValue, newValue]) => String(oldValue) === String(newValue));
  const status = actionPending ? 'applying' : proposal.status || 'proposed';
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
