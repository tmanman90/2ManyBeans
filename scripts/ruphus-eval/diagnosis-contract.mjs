// Independent U4 adjudication table. This is intentionally separate from the
// case JSON so prompts, numeric observations, and controlled directions cannot
// silently drift together.
export const DIAGNOSIS_CONTRACT = Object.freeze({
  'dec-013': Object.freeze({ phrase: 'bright citrus but thin and drying', drawdown: 'fast', cause: 'under-extracted', direction: 'finer' }),
  'dec-014': Object.freeze({ phrase: 'muted sweetness and a heavy finish', drawdown: 'slow', cause: 'over-extracted', direction: 'coarser' }),
  'dec-015': Object.freeze({ phrase: 'sharp bitterness after a slow drawdown', drawdown: 'slow', cause: 'over-extracted', direction: 'coarser' }),
  'dec-016': Object.freeze({ phrase: 'hollow cup with a papery edge', drawdown: 'fast', cause: 'channeling risk', direction: 'earlier' }),
  'dec-017': Object.freeze({ phrase: 'sweet but muddy with a slow finish', drawdown: 'slow', cause: 'over-agitated extraction', direction: 'less-agitation' }),
  'dec-018': Object.freeze({ phrase: 'weak and cool despite a normal dose', drawdown: 'fast', cause: 'low-temperature extraction', direction: 'hotter' }),
  'dec-019': Object.freeze({ phrase: 'astringent citrus with a short finish', drawdown: 'slow', cause: 'over-extracted', direction: 'coarser' }),
  'dec-020': Object.freeze({ phrase: 'flat sweetness after a long bloom', drawdown: 'slow', cause: 'uneven saturation', direction: 'more-even-flow' }),
  'dec-021': Object.freeze({ phrase: 'clean but underpowered cup', drawdown: 'fast', cause: 'under-extracted', direction: 'finer' }),
  'dec-022': Object.freeze({ phrase: 'dry cocoa and astringency', drawdown: 'slow', cause: 'over-extracted', direction: 'lower-extraction' }),
  'dec-023': Object.freeze({ phrase: 'sour fruit and a quick drawdown', drawdown: 'fast', cause: 'fast-flow under-extraction', direction: 'finer' }),
  'dec-024': Object.freeze({ phrase: 'bitter finish with low clarity', drawdown: 'missing', cause: null, direction: null }),
});

export function diagnosisContractMatches(caseDefinition) {
  const contract = DIAGNOSIS_CONTRACT[caseDefinition?.id];
  if (!contract) return true;
  const prompt = caseDefinition.userPrompt || '';
  if (!prompt.includes(contract.phrase)) return false;
  const history = caseDefinition.fixture?.tasting?.history || {};
  if (contract.drawdown === 'missing') return history.drawdownSeconds === undefined && !/with a (?:fast|slow) drawdown/i.test(prompt);
  if (!Number.isFinite(history.drawdownSeconds)) return false;
  const observed = history.drawdownSeconds < 180 ? 'fast' : history.drawdownSeconds > 220 ? 'slow' : 'ambiguous';
  return observed === contract.drawdown;
}
