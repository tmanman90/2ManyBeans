// A narrow consistency check, not an extraction classifier. Match a direct
// sensory-to-extraction claim, not unrelated words elsewhere in the sentence.
// This deliberately does not attempt to grade every possible coffee inference.
export function hasUnsupportedSensoryInference(value) {
  if (typeof value !== 'string') return false;
  const direction = String.raw`(?:over[ -]?extract\w*|under[ -]?extract\w*|too much extraction|more extraction|less extraction|(?:you\s+)?(?:must\s+)?grind(?:ing)? (?:finer|coarser))`;
  const subject = String.raw`(?:sharpness|sourness|(?:sharp|sour) (?:cup|coffee))`;
  const direct = new RegExp(String.raw`\b${subject}\s+(?:(?:alone|by itself)\s+)?(?:means?|proves?|confirms?)\s+(?:(?:that|it(?:'s| is)|the cup is|you have)\s+)*${direction}\b`, 'i');
  const reversal = /\b(?:sharpness|sourness|sharp|sour)(?:\s+(?:cup|coffee|alone))?\s*,?\s*(?:(?:that|it)\s+)?points?\s+away\s+from\s+(?:more|higher|increasing)\s+extraction\b/i;
  const conditionalDiagnosis = new RegExp(String.raw`\b(?:turns?|tastes?|is)\s+(?:sharp|sour)\s*,\s*(?:it|that|the cup)\s+(?:must be|is definitely|is certainly)\s+${direction}\b`, 'i');
  const rejectedPrefix = /(?:\b(?:do not|don[’']t|never|avoid)\s+(?:assum(?:e|ing)|say(?:ing)?|claim(?:ing)?|conclud(?:e|ing))|\b(?:wrong|incorrect|misleading|unjustified)\s+to\s+(?:say|claim|assume|conclude)|\bnot\s+(?:true|established)\s+that)\s+(?:that\s+)?(?:[“"‘']\s*)?(?:(?:a|the)\s+)?$/i;
  const rejectedSuffix = /^[”"’']?\s+(?:is|would be)\s+(?:wrong|incorrect|unsupported|unjustified|not supported)\b/i;
  return value.split(/(?<=[.!?])\s+/u).some(sentence => {
    if (sentence.trim().endsWith('?')) return false;
    return [direct, reversal, conditionalDiagnosis].some(pattern => {
      // Check rejection at each matched claim, so an unrelated negation or
      // qualification cannot excuse a second categorical assertion.
      for (const match of sentence.matchAll(new RegExp(pattern.source, 'gi'))) {
        if (!rejectedPrefix.test(sentence.slice(0, match.index))
          && !rejectedSuffix.test(sentence.slice(match.index + match[0].length))) return true;
      }
      return false;
    });
  });
}

export const SENSORY_UNCERTAINTY_CORRECTION = 'Sharpness alone does not establish extraction direction or rule out more extraction. Distinguish sour acidity from bitterness or a drying sensation; describe a bounded test or ask what sharp means. Do not invent a reported sensation or change the recipe merely to fix the explanation.';
