import { C, radius, shadows, type as typeScale } from '../../../styles/theme';
import { ArtifactAction } from './ArtifactAction';

const ACTIONS = Object.freeze([
  { mode: 'apply_proposal', label: 'Apply' },
  { mode: 'brew_once', label: 'Brew once' },
  { mode: 'keep_current', label: 'Keep current' },
]);

export function RecipeProposalCard({ proposal = {}, onAction, actionPending = false }) {
  const before = proposal.before || {};
  const after = proposal.after || {};
  const rows = [['Ratio', before.ratio, after.ratio], ['Temperature', before.waterTemp?.celsius, after.waterTemp?.celsius], ['Grind', before.grindSize?.setting, after.grindSize?.setting], ['Dose', before.coffeeGrams, after.coffeeGrams]];
  const status = actionPending ? 'applying' : proposal.status || 'proposed';
  const allowedActions = new Set(Array.isArray(proposal.actions) ? proposal.actions : []);
  const showActions = proposal.status === 'proposed' && Boolean(onAction);
  return <div data-artifact="recipe_proposal" data-status={status} style={{ width: '100%', padding: 14, border: `1px solid ${C.hairline}`, borderRadius: radius.lg, boxShadow: shadows.e1, background: C.cream }}>
    <div style={typeScale.h3}>One change</div>
    {rows.filter(([, oldValue, newValue]) => oldValue != null || newValue != null).map(([label, oldValue, newValue]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 7, fontVariantNumeric: 'tabular-nums' }}><span style={{ color: oldValue === newValue ? C.textMuted : C.text }}>{label}</span><span style={{ color: oldValue === newValue ? C.textMuted : C.text }}>{oldValue === newValue ? String(newValue) : `${oldValue} → ${newValue}`}</span></div>)}
    {showActions && <div data-proposal-actions="true" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {ACTIONS.filter(({ mode }) => allowedActions.has(mode)).map(({ mode, label }) => <ArtifactAction key={mode} action={mode} label={label} status={status} disabled={actionPending} onClick={() => onAction({ mode, artifact: proposal })} />)}
    </div>}
  </div>;
}
