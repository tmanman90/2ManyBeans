// Browser/server-neutral contract graders.  These functions are deliberately
// pure: the runner, tests, and (later) the runtime post-check share them.

const textOf = (value) => typeof value === 'string' ? value : String(value ?? '');
const words = (value) => textOf(value).trim().split(/\s+/).filter(Boolean);
const paragraphs = (value) => textOf(value).trim() ? textOf(value).trim().split(/\n\s*\n/) : [];
const sentenceCount = (value) => textOf(value).replace(/(\d)\.(\d)/g, '$1\u0000$2').split(/[.!?]+/).map((part) => part.trim()).filter((part) => Boolean(part.replace(/^[”’"')\]}]+|[“‘"'([{]+$/g, '').trim())).length;
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const PRIVATE_USE = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

export const CONTRACT_VERSION = 'conversation-contract-v1';
export const CATEGORIES = Object.freeze({ CATASTROPHIC: 'catastrophic', ORDINARY: 'ordinary' });

// C6a is the runtime-hard vocabulary.  C6b is intentionally separate: it is
// evaluated for feel, but never causes runtime replacement or regeneration.
export const C6A_MACHINE_TOKENS = Object.freeze([
  'resolve_coffee', 'read_coffee_evidence', 'read_recipe', 'read_tastings',
  'read_attempts', 'propose_recipe_change', 'coffeeId', 'coffeeGrams',
  'waterGrams', 'waterTemp', 'grindSize', 'slotKey', 'revisionId',
  'sourceHash', 'recipeHash', 'as an AI', 'language model',
  'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced',
]);
export const HARD_MACHINE_TOKENS = C6A_MACHINE_TOKENS;

export const C6B_PHRASES = Object.freeze([
  'canonical', 'executable', 'owner', 'slot', 'revision', 'data gap', 'resolver',
  'tool', 'artifact', 'context', 'session', 'record', 'database', 'query', 'ID',
  'JSON', 'payload', 'schema', 'fetch', 'snapshot', 'ledger', 'agent', 'system',
  'standard chat', 'your account data', "I don't have access",
]);
export const CONTEXT_PHRASES = C6B_PHRASES;
export const C6B_ALLOWLIST_VERSION = 'c6b-natural-collocations-v1';
export const C6B_ALLOWLIST = Object.freeze([
  /\brecorded brew\b/i, /\byou recorded\b/i, /\btasting session\b/i,
  /\bbrewing session\b/i, /\byour grinder and kettle\b/i,
]);

// Underscore-delimited values are always machine-shaped. A hyphenated value
// needs an identifier signal (a digit or another delimiter) so ordinary coffee
// language such as "coffee-specific" or "brew-by-brew" is not rewritten.
const INTERNAL_REFERENCE = /(?:^|[\s([{])(?:ref|coffee|bean|brew|tasting|attempt|recipe|session|turn|call)(?:_[a-z0-9][a-z0-9_-]{2,}|-(?=[a-z0-9_-]*(?:\d|_))[a-z0-9][a-z0-9_-]{2,})(?=$|[\s)\]}.,!?])/i;
const HASH = /\b[a-f0-9]{16,}\b/i;
const LONG_ID = /\b(?=[a-z0-9_-]{20,}\b)(?=[a-z0-9_-]*(?:\d|_|-))[a-z0-9_-]+\b/i;
const JSON_SHAPE = /(?:[{[]\s*["']?[A-Za-z_][\w-]*["']?\s*:|["'][A-Za-z_][\w-]*["']\s*:)/;
const MARKUP = /```|<\/?[A-Za-z][^>]*>|(^|\s)[*_]{1,3}\S|(^|\s)[-•]\s/m;
const PROPOSAL_SHAPE = /(?:\b(?:proposal|update)\s*[:{]|\b(?:from|to|delta)\s*[:=])/i;
const AUTHORITY = /\b(?:I(?:'ve| have)\s+(?:saved|made|applied|sent|changed)|saved (?:that|it)|change applied|brew once|receipt)\b/i;
// Credential-shaped values remain unsafe even when a fixture uses a short
// stand-in rather than a production-length key.
const SECRET = /\b(?:sk|pk)-[A-Za-z0-9_-]{4,}\b|\bAIza[A-Za-z0-9_-]{12,}\b|\bBearer\s+[A-Za-z0-9._~-]{8,}\b/i;
const DRAFT_LEAK = /\b(?:need no generic question|snapshot says|current recipe unknown|no tool until agreement|they may agree explicitly later|ensure no weird)\b|\bfinal\.\s*$/i;
const INTERNAL_PRODUCT_PHRASE = /\b(?:aiden|coffee|brewer|recipe|rotation)\s+(?:context|slot)\b/i;

function violation(code, category, message, details = {}) {
  return { code, category, message, ...details };
}

export function gradeC1Length({ reply = '', replyKind = 'default' } = {}) {
  const count = words(reply).length;
  const limit = replyKind === 'opening' ? 40 : replyKind === 'proposal' ? 60 : ['diagnosis', 'comparison'].includes(replyKind) ? 140 : 90;
  const result = [];
  if (count > limit) result.push(violation('C1_LENGTH', CATEGORIES.ORDINARY, `reply has ${count} words; limit is ${limit}`, { count, limit }));
  if (count > 160) result.push(violation('RT2_LENGTH', CATEGORIES.ORDINARY, 'reply exceeds the hard 160-word cap', { count, runtime: true }));
  return result;
}

export function gradeC2Shape({ reply = '' } = {}) {
  const value = textOf(reply);
  const result = [];
  const ps = paragraphs(value);
  if (ps.length > 3) result.push(violation('C2_PARAGRAPHS', CATEGORIES.ORDINARY, 'reply has more than three paragraphs'));
  if (ps.some((paragraph) => sentenceCount(paragraph) > 3)) result.push(violation('C2_SENTENCES', CATEGORIES.ORDINARY, 'paragraph has more than three sentences'));
  if (MARKUP.test(value)) result.push(violation('RT2_MARKUP', CATEGORIES.ORDINARY, 'reply contains markup or a code fence', { runtime: true }));
  if (/[\p{Extended_Pictographic}]/u.test(value)) result.push(violation('C2_EMOJI', CATEGORIES.ORDINARY, 'reply contains emoji'));
  if (/^\s*(?:#{1,6}\s|\d+[.)]\s|[-•]\s)/m.test(value)) result.push(violation('C2_ENUMERATION', CATEGORIES.ORDINARY, 'reply uses a heading or list'));
  return result;
}

function isQuestionOnly(value) {
  const stripped = textOf(value).replace(/\?/g, '').trim();
  return Boolean(stripped) && !/[.!:]/.test(stripped) && words(stripped).length <= 16;
}

function asksForHeldData(reply, ledger) {
  const value = textOf(reply).toLowerCase();
  const held = JSON.stringify(ledger || {}).toLowerCase();
  return ['dose', 'grind', 'ratio', 'temperature', 'drawdown', 'tasting note', 'method'].some((field) => value.includes(field) && held.includes(field));
}

export function gradeC3Questions({ reply = '', priorReplies = [], ledger = {}, methodCandidates = [] } = {}) {
  const value = textOf(reply);
  const result = [];
  const questionCount = (value.match(/\?/g) || []).length;
  if (questionCount > 1) result.push(violation('C3_QUESTION_COUNT', CATEGORIES.ORDINARY, 'reply asks more than one question', { questionCount }));
  const previous = Array.isArray(priorReplies) ? priorReplies.at(-1) : null;
  const previousText = previous && textOf(previous.reply ?? previous.text ?? previous);
  if (isQuestionOnly(value) && (previous?.questionOnly === true || isQuestionOnly(previousText))) {
    result.push(violation('C3_CONSECUTIVE_QUESTION_ONLY', CATEGORIES.ORDINARY, 'two question-only replies are consecutive'));
  }
  const candidateText = methodCandidates.length > 0 && methodCandidates.every((candidate) => value.toLowerCase().includes(textOf(candidate).toLowerCase()));
  if (asksForHeldData(value, ledger) && !candidateText) result.push(violation('C3_HELD_DATA_QUESTION', CATEGORIES.ORDINARY, 'reply asks for data already held in the ledger'));
  return result;
}

export function gradeC4Value({ reply = '', opening = false } = {}) {
  if (opening) return [];
  const value = textOf(reply).trim();
  if (!value || /^(?:okay|sure|got it|let me look|i can help|one moment)[.!]?$/i.test(value)) {
    return [violation('C4_NO_VALUE', CATEGORIES.ORDINARY, 'reply does not move the brew forward')];
  }
  return [];
}

export function gradeC5Numbers({ reply = '', userUnits = {} } = {}) {
  const value = textOf(reply);
  const result = [];
  if (/\b\d+\.\d{2,}\b/.test(value) && !/\b(?:grinder|ode)\s*\d+\.\d{2}\b/i.test(value)) result.push(violation('C5_PRECISION', CATEGORIES.ORDINARY, 'number precision is too fine'));
  if (/\b(?:microns?|µm)\b/i.test(value) && !userUnits.microns) result.push(violation('C5_UNITS', CATEGORIES.ORDINARY, 'microns were introduced without the user using microns'));
  const directional = /\b(?:increase|decrease|finer|coarser|hotter|cooler)\b|\b(?:more|less|higher|lower)\s+(?:(?:bloom|contact|brew)\s+)?(?:coffee|dose|water|heat|temperature|time|agitation|extraction|bloom|contact|steep(?:ing)?|drawdown|flow|pour(?:s|ing)?)\b|\b(?:turn|move|adjust|go)\s+(?:up|down)\b/i;
  const recommendation = /\b(?:try|test|use|make|move|go|adjust|change|increase|decrease|aim|set|turn|start|shift|bump|drop|target|recommend|suggest|should|could|would)\b|\bgrind\s+(?:the\s+)?(?:coffee\s+)?(?:(?:one|two|three|a|an)\s+(?:small\s+)?(?:step|click|notch)s?\s+)?(?:finer|coarser)\b/i;
  const sized = /\b\d+(?:\.\d+)?\s*(?:g|grams?|ml|°?[CF]|steps?|clicks?|notches?|degrees?|seconds?|min(?:ute)?s?)\b|\b(?:ode|grinder)\s+\d+(?:\.\d+)?\b|\b(?:one|two|three|a|an|another)\s+(?:(?:small|tiny|half|gentle|modest)\s+)?(?:(?:finer|coarser)\s+)?(?:grind\s+|dose\s+|ode\s+(?:grind\s+)?)?(?:step|gram|click|notch|degree|adjustment|increase|decrease|change)s?(?:\s+(?:finer|coarser))?\b|\b(?:a|an)\s+(?:gentle|modest|small|slight)\s+(?:extraction|strength|temperature|agitation)\s+(?:increase|decrease)\b|\b(?:a\s+)?half\s+(?:a\s+)?(?:step|click|notch|degree)s?\b|\b(?:a\s+(?:little|touch|bit)|slightly)\s+(?:more|less)\s+(?:extraction|agitation|time|heat|water|coffee|dose)\b|\bfrom\s+(?:[A-Za-z]+\s+)?\d+(?:\.\d+)?\s+(?:to|→)\s+\d+(?:\.\d+)?\b/i;
  const sentences = value.split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
  const odeSmallStep = value.match(/\b(?:one|a)\s+(?:small\s+)?step\b[^.!?]*?\b(?:ode\s*)?(\d+(?:\.\d+)?)\s*(?:to|→)\s*(?:about\s+)?(\d+(?:\.\d+)?)/i)
    || value.match(/\b(?:ode\s*)?(\d+(?:\.\d+)?)\s*(?:to|→)\s*(?:about\s+)?(\d+(?:\.\d+)?)[^.!?]*?\b(?:one|a)\s+(?:small\s+)?step\b/i);
  if (odeSmallStep && Math.abs(Number(odeSmallStep[1]) - Number(odeSmallStep[2])) >= 1) {
    result.push(violation('C5_DIRECTION_SIZE', CATEGORIES.ORDINARY, 'claimed small grinder step conflicts with the numeric change'));
  }
  // A recommendation may be followed by its explicit adjustment. A historical
  // setting alone is not an adjustment and must not satisfy this link.
  const explicitAdjustment = /\bfrom\s+(?:ode\s+|grinder\s+)?\d+(?:\.\d+)?\s+(?:to|→)\s+\d+(?:\.\d+)?\b/i;
  const hasSizedRecommendation = sentences.some((sentence) => recommendation.test(sentence) && sized.test(sentence))
    || sentences.some((sentence) => recommendation.test(sentence)) && sentences.some((sentence) => directional.test(sentence) && explicitAdjustment.test(sentence));
  const comparison = /\b(?:finer|coarser|dose|grind|water|coffee|extraction)\b[^.!?]*(?:\b(?:beats?|before|rather than|instead of|over)\b)[^.!?]*\b(?:finer|coarser|dose|grind|water|coffee|extraction)\b/i;
  const conditionalAlternative = /\bif\b/i;
  const counterfactualAlternative = /(?:^|;\s*)\s*(?:more|less|higher|lower|extra)\s+(?:coffee|dose|water|heat|temperature|time|agitation|extraction)\b[^;.!?]*\b(?:could|would|may|might)\b/i;
  const actionableAdditional = /\b(?:try|test|use|make|move|go|adjust|change|increase|decrease|aim|set|turn|start|shift|bump|drop|target|recommend|suggest|should|raise|lower)\b/i;
  const explanationAfterSizedRecommendation = /^(?:so\s+)?(?:a|an|the|this)\s+(?:(?:modest|small|slight|gentle|clean)\s+){0,2}(?:extraction|strength|temperature|agitation)?\s*(?:increase|decrease)\s+(?:is|would be|should be)\s+(?:the\s+)?(?:cleanest|best|safest|simplest)\s+(?:next\s+)?(?:test|move|change|step)[.!]?$/i;
  const explanatoryTest = /(?:^|;\s*)\s*(?:this|that)(?:\s+(?:is|would be)|[’']s)\s+(?:the\s+)?(?:cleanest|best|safest|simplest)\s+(?:small\s+)?(?:first|next)?\s*(?:test|move|change|step)\s+for\s+(?:a\s+little\s+)?more\s+extraction\b/i;
  const predictedOutcome = /(?:^|;\s*|\band\s+)\s*(?:[^;.!?]{0,80}\bso\s+)?(?:the\s+(?:finer|coarser)\s+grind|(?:finer|coarser)(?:\s+grounds)?|the\s+change|this(?:\s+change)?|that(?:\s+change)?|(?:the\s+)?(?:(?:muted|dry|flat|sour|thin)\s+)?(?:finish|cup|brew|flavou?r))\s+(?:should|would|could)\s+(?:(?:gently|slightly|modestly|directly)\s+)?(?:encourage|target|address|help|increase|decrease|improve|reduce|preserve|keep|add|give|bring|benefit\s+from)\b/i;
  const evidenceSupportsSizedChange = /\b(?:supports?|backs?|justifies?)\s+(?:that|this|the)\s+(?:(?:modest|small|slight|gentle)\s+){0,2}(?:extraction|strength|temperature|agitation)\s+(?:increase|decrease)\b/i;
  const additionalRecommendation = /\b(?:raise|lower)\b/i;
  const sizedDose = /(?:\b(?:dose|coffee)\b[^.!?]{0,32}\b\d+(?:\.\d+)?\s*(?:g|grams?)\b|\b\d+(?:\.\d+)?\s*(?:g|grams?)\b[^.!?]{0,32}\b(?:dose|coffee)\b)/i.test(value);
  const sizedGrind = /(?:\b(?:ode|grinder)\s+\d+(?:\.\d+)?\b|\b(?:ode|grinder)\s+from\s+\d+(?:\.\d+)?\s*(?:to|→)\s*\d+(?:\.\d+)?\b|\b(?:one|two|three|a|an|another)\s+(?:(?:small|tiny|half|gentle|modest)\s+)?(?:(?:finer|coarser)\s+)?(?:grind\s+|ode\s+)?(?:step|click|notch|adjustment)s?\b)/i.test(value);
  const sizedWater = /(?:\bwater\b[^.!?]{0,32}\b\d+(?:\.\d+)?\s*(?:g|ml)\b|\b\d+(?:\.\d+)?\s*(?:g|ml)\b[^.!?]{0,32}\bwater\b)/i.test(value);
  const sizedTemperature = /\b\d+(?:\.\d+)?\s*°?\s*[CF]\b/i.test(value);
  if (!result.some((item) => item.code === 'C5_DIRECTION_SIZE') && sentences.some((sentence) => {
    // "For this test" names the experiment; it is not the imperative "test".
    // Keep the surrounding prose so genuine extra controls still get graded.
    const recommendationProse = sentence.replace(/\bfor\s+(?:this|that|the)\s+test\b/gi, '');
    const explicitDirectionalControl = sentence.match(/\b(?:try|use|make|move|adjust|change|increase|decrease|raise|lower|turn|set)\b[^.!?]{0,32}\b(?:more|less|higher|lower)\s+(coffee|dose|water|temperature|heat|agitation|time|bloom|contact|extraction)\b/i)?.[1]?.toLowerCase() || null;
    const controlHasSize = explicitDirectionalControl === 'coffee' || explicitDirectionalControl === 'dose'
      ? /(?:\b\d+(?:\.\d+)?\s*(?:g|grams?)\b[^.!?]{0,24}\b(?:coffee|dose)\b|\b(?:coffee|dose)\b[^.!?]{0,24}\b\d+(?:\.\d+)?\s*(?:g|grams?)\b)/i.test(value)
      : explicitDirectionalControl === 'water'
        ? /(?:\b\d+(?:\.\d+)?\s*(?:g|ml)\b[^.!?]{0,24}\bwater\b|\bwater\b[^.!?]{0,24}\b\d+(?:\.\d+)?\s*(?:g|ml)\b)/i.test(value)
        : explicitDirectionalControl === 'temperature' || explicitDirectionalControl === 'heat'
          ? /\b\d+(?:\.\d+)?\s*°?\s*[CF]\b/i.test(value)
          : explicitDirectionalControl ? sized.test(sentence) : false;
    const unsizedAdditionalControl = sentence.replace(/\b(finer|coarser)\s+grinding\b/gi, '$1 grounds').split(/;|,\s*(?:and|also)\s+|\s+\b(?:and|also)\b\s+(?=(?:try|test|use|make|move|go|adjust|change|increase|decrease|aim|set|turn|start|shift|bump|drop|target|recommend|suggest|raise|lower)\b)/i).slice(1)
      .some((clause) => directional.test(clause) && (actionableAdditional.test(clause) || additionalRecommendation.test(clause)) && !sized.test(clause) && !counterfactualAlternative.test(clause) && !predictedOutcome.test(clause) && !explanatoryTest.test(clause) && !/\baim\s+for\s+(?:a\s+)?(?:little|touch|bit)\s+more\s+(?:contact|sweetness|clarity|body|extraction)\b/i.test(clause));
    const linkedSizedControl = hasSizedRecommendation && (
      (/\b(?:more|less|higher|lower)\s+(?:dose|coffee)\b/i.test(sentence) && sizedDose)
      || (/\b(?:finer|coarser|grind)\b/i.test(sentence) && sizedGrind)
      || (/\b(?:more|less|higher|lower)\s+water\b/i.test(sentence) && sizedWater)
      || (/\b(?:hotter|cooler|temperature|heat)\b/i.test(sentence) && sizedTemperature)
    );
    const boundedOutcome = hasSizedRecommendation && /\baim\s+for\s+(?:a\s+)?(?:little|touch|bit)\s+more\s+(?:contact|sweetness|clarity|body|extraction)\b/i.test(sentence);
    return explicitDirectionalControl && !controlHasSize || unsizedAdditionalControl || directional.test(sentence) && recommendation.test(recommendationProse) && !sized.test(sentence)
      && !(linkedSizedControl || boundedOutcome || hasSizedRecommendation && (comparison.test(sentence) || conditionalAlternative.test(sentence) || counterfactualAlternative.test(sentence) || explanationAfterSizedRecommendation.test(sentence) || explanatoryTest.test(sentence) || predictedOutcome.test(sentence) || evidenceSupportsSizedChange.test(sentence)));
  })) {
    result.push(violation('C5_DIRECTION_SIZE', CATEGORIES.ORDINARY, 'recommended direction has no clear size'));
  }
  return result;
}

export function gradeC6aMachineTokens({ reply = '' } = {}) {
  const value = textOf(reply);
  const result = [];
  const matched = C6A_MACHINE_TOKENS.filter((token) => value.toLowerCase().includes(token.toLowerCase()));
  if (matched.length) result.push(violation('CF5_MACHINE_TOKEN', CATEGORIES.CATASTROPHIC, `reply leaks machine token: ${matched.join(', ')}`, { matched, runtime: true }));
  if (INTERNAL_REFERENCE.test(value) || HASH.test(value) || LONG_ID.test(value)) result.push(violation('CF5_OPAQUE_REFERENCE', CATEGORIES.CATASTROPHIC, 'reply leaks an opaque reference or identifier', { runtime: true }));
  if (JSON_SHAPE.test(value)) result.push(violation('CF6_JSON_PROSE', CATEGORIES.CATASTROPHIC, 'reply contains JSON-shaped prose', { runtime: true }));
  if (PROPOSAL_SHAPE.test(value)) result.push(violation('CF6_PROPOSAL_PROSE', CATEGORIES.CATASTROPHIC, 'proposal appears in prose', { runtime: true }));
  if (AUTHORITY.test(value)) result.push(violation('RT2_FALSE_AUTHORITY', CATEGORIES.CATASTROPHIC, 'reply claims an action without approved authority', { runtime: true }));
  if (SECRET.test(value)) result.push(violation('CF5_SECRET', CATEGORIES.CATASTROPHIC, 'reply leaks a credential-like value', { runtime: true }));
  if (DRAFT_LEAK.test(value)) result.push(violation('CF5_DRAFT_LEAK', CATEGORIES.CATASTROPHIC, 'reply leaks internal drafting instructions', { runtime: true }));
  if (INTERNAL_PRODUCT_PHRASE.test(value)) result.push(violation('CF5_INTERNAL_PRODUCT_LANGUAGE', CATEGORIES.CATASTROPHIC, 'reply leaks internal product language', { runtime: true }));
  if (PRIVATE_USE.test(value)) result.push(violation('CF5_PRIVATE_USE', CATEGORIES.CATASTROPHIC, 'reply contains a private-use character', { runtime: true }));
  return result;
}

function phraseRegex(phrase) {
  return new RegExp(`(^|[^\\p{L}])${phrase.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'iu');
}

export function gradeC6bPhrases({ reply = '' } = {}) {
  const value = textOf(reply);
  const result = [];
  for (const phrase of C6B_PHRASES) {
    const allowedForPhrase = (phrase === 'record' && C6B_ALLOWLIST.slice(0, 2))
      || (phrase === 'session' && C6B_ALLOWLIST.slice(2, 4))
      || [];
    if (phraseRegex(phrase).test(value) && !allowedForPhrase.some((allowed) => allowed.test(value))) {
      result.push(violation('C6B_CONTEXT_PHRASE', CATEGORIES.ORDINARY, `machine-adjacent phrase outside allowlist: ${phrase}`, { phrase, allowlistVersion: C6B_ALLOWLIST_VERSION }));
    }
  }
  return result;
}

export function gradeC7Tone({ reply = '' } = {}) {
  const value = textOf(reply);
  const result = [];
  if ((value.match(/!/g) || []).length > 1) result.push(violation('C7_EXCLAMATIONS', CATEGORIES.ORDINARY, 'reply uses more than one exclamation'));
  if ((value.match(/\b(?:sorry|apologies)\b/gi) || []).length > 1) result.push(violation('C7_APOLOGY', CATEGORIES.ORDINARY, 'reply apologizes more than once'));
  if (/great question|excellent question|as an ai|language model|i cannot provide|i'm just an ai/i.test(value)) result.push(violation('C7_DISCLAIMER', CATEGORIES.ORDINARY, 'reply uses praise or disclaimer language'));
  return result;
}

export function gradeC8Correction({ reply = '', userTurn = '', _priorReplies = [] } = {}) {
  const user = textOf(userTurn);
  if (!/(?:actually|no[, ]|correction|instead|not\s+the|i\s+(?:meant|brewed|used))/i.test(user)) return [];
  const value = textOf(reply);
  if (!/(?:got it|thanks|you[’']re right|okay|understood|i had that wrong|that changes|you[’']re correct)/i.test(value)) return [violation('CF3_SILENT_CORRECTION', CATEGORIES.CATASTROPHIC, 'reply uses corrected state without acknowledging the correction')];
  if ((value.match(/\b(?:sorry|apologies)\b/gi) || []).length > 1) return [violation('C8_REARGUED', CATEGORIES.ORDINARY, 'correction contains more than one apology')];
  return [];
}

export function gradeC9ProposalTiming({ reply = '', frames = [], priorReplies = [], userTurn = '' } = {}) {
  const value = textOf(reply);
  const result = [];
  const hasProposal = Array.isArray(frames) && frames.some((frame) => frame?.type === 'artifact_ready' && frame?.artifact?.type === 'recipe_proposal');
  if (PROPOSAL_SHAPE.test(value) || JSON_SHAPE.test(value)) result.push(violation('CF6_PROPOSAL_PROSE', CATEGORIES.CATASTROPHIC, 'proposal is rendered in prose', { runtime: true }));
  if (!hasProposal) return result;
  const substantive = Array.isArray(priorReplies) && priorReplies.some((item) => words(item?.reply ?? item?.text ?? item).length >= 8);
  const agreement = /\b(?:change|do it|yes|agree|try that|make that|go ahead|update (?:the |my |this |our )?recipe)\b/i.test(textOf(userTurn));
  if (!substantive || !agreement) result.push(violation('C9_PREMATURE_PROPOSAL', CATEGORIES.ORDINARY, 'proposal appeared before diagnosis and agreement'));
  return result;
}

export function gradeC10FocusAcknowledgment({ reply = '', focusChanged = false, coffeeName = '' } = {}) {
  if (!focusChanged) return [];
  if (!coffeeName || !textOf(reply).toLowerCase().includes(textOf(coffeeName).toLowerCase())) return [violation('C10_MISSING_COFFEE_NAME', CATEGORIES.ORDINARY, 'focus change was not named naturally')];
  return [];
}

export function gradeEvidenceScope({ reply = '', readWindow = null, evidence = {} } = {}) {
  const value = textOf(reply);
  // Saved-coffee inventory is not a time-windowed history claim. Do not read
  // “I don't have a saved coffee called X ... or its recipe” as an exhaustive
  // assertion that recipe history is absent.
  if (/\b(?:don[’']?t|do not)\s+have\b[^.?!]{0,80}\b(?:a\s+)?saved\s+coffees?\b/i.test(value)) return [];
  if (/\b(?:can[’']?t|cannot)\s+match\b[^.?!]{0,80}\b(?:a\s+)?saved\s+coffee\b|\bisn[’']?t\b[^.?!]{0,80}\b(?:among|in)\b[^.?!]{0,40}\bsaved\s+coffees?\b/i.test(value)) return [];
  const absence = value.match(/\b(?:no|none|nothing)\b[^.?!]*(?:tasting|brew|recipe)s?\b|\b(?:don[’']?t|do not)\s+have\b[^.?!]*(?:tasting|brew|recipe)s?\b/i);
  if (!absence) return [];
  const unavailable = new Set([
    ...(Array.isArray(evidence?.unavailable) ? evidence.unavailable : []),
    ...Object.entries(evidence || {}).filter(([, entry]) => entry?.status === 'unavailable').map(([kind]) => kind),
  ].map((kind) => textOf(kind).toLowerCase()));
  const claimedSubject = absence[0].match(/\b(?:tasting|brew|recipe)s?\b/i)?.[0]?.toLowerCase() || 'recipe';
  const claimedKind = claimedSubject.startsWith('tasting') ? 'tastings' : claimedSubject.startsWith('brew') ? 'brews' : 'recipe';
  if (unavailable.has(claimedKind) || unavailable.has(claimedKind.replace(/s$/, ''))) {
    return [violation('EVIDENCE_SCOPE', CATEGORIES.ORDINARY, `reply claims ${claimedKind} are absent even though that source was unavailable`, { runtime: true })];
  }
  if (/\bnothing\b[^.?!]*(?:(?:brew log|brew details|notes)[^.?!]*\b(?:flags?|points?|suggests?|indicates?|alarms?|alarming|concerns?|concerning|wrong|problematic)\b|\b(?:alarms?|alarming|concerns?|concerning|wrong|problematic)\b[^.?!]*(?:brew log|brew details|notes))/i.test(value)) return [];
  if (/\bno\s+(?:(?:linked|separate|recorded)\s+)?(?:tasting|brew|recipe)(?:\s+note)?\s+(?:is\s+)?(?:attached|linked|describing)\s+(?:to\s+)?(?:that|the|this)?\s*(?:brew|cup|it)?\b|\bno\s+(?:(?:linked|separate|recorded)\s+)?(?:tasting|brew|recipe)(?:\s+note)?\s+for\s+that\s+(?:brew|cup)\b|\b(?:v60|kalita|aiden|brew|cup)\b[^?!]{0,128}\b(?:had|has|with)\b[^?!]{0,64}\bno\s+(?:(?:linked|separate|recorded|attached)\s+)?tasting(?:\s+note)?\b/i.test(value)) return [];
  const windowed = object(readWindow) && (readWindow.days || readWindow.from || readWindow.to);
  const hasEvidence = Object.values(evidence || {}).some((entry) => Array.isArray(entry) && entry.length > 0);
  if (windowed && hasEvidence && !/(?:last|past|previous)\s+(?:two|14|fourteen)\s+weeks?|since|between/i.test(value)) return [violation('EVIDENCE_SCOPE', CATEGORIES.ORDINARY, 'absence claim is not qualified by the read window')];
  return [];
}

export function gradeFalseAuthority({ reply = '', trace = {} } = {}) {
  if (!AUTHORITY.test(textOf(reply))) return [];
  if (trace?.approvedAction === true || trace?.actionApproved === true) return [];
  return [violation('CF4_FALSE_AUTHORITY', CATEGORIES.CATASTROPHIC, 'reply claims a write without approved action', { runtime: true })];
}

export function gradeIdentityAndEvidence({ trace = {}, expectedCoffeeId = null, actualCoffeeId = null, ambiguous = false } = {}) {
  const result = [];
  const expected = expectedCoffeeId ?? trace?.expectedCoffeeId;
  const actual = actualCoffeeId ?? trace?.actualCoffeeId ?? trace?.focusCoffeeId;
  if (!ambiguous && expected && actual && expected !== actual) result.push(violation('CF1_WRONG_COFFEE', CATEGORIES.CATASTROPHIC, 'an unambiguous reference resolved to the wrong coffee'));
  if (trace?.fabricatedEvidence === true || (Array.isArray(trace?.fabricatedFacts) && trace.fabricatedFacts.length > 0)) result.push(violation('CF2_FABRICATED_EVIDENCE', CATEGORIES.CATASTROPHIC, 'reply contains evidence absent from the fixture and tool trace'));
  return result;
}
export const gradeFocusResolution = gradeIdentityAndEvidence;

export function gradeReply(input = {}) {
  const violations = [
    ...gradeC1Length(input), ...gradeC2Shape(input), ...gradeC3Questions(input),
    ...gradeC4Value(input), ...gradeC5Numbers(input), ...gradeC6aMachineTokens(input),
    ...gradeC6bPhrases(input), ...gradeC7Tone(input), ...gradeC8Correction(input),
    ...gradeC9ProposalTiming(input), ...gradeC10FocusAcknowledgment(input),
    ...gradeEvidenceScope(input), ...gradeFalseAuthority(input), ...gradeIdentityAndEvidence(input),
  ];
  return {
    version: CONTRACT_VERSION,
    passed: violations.length === 0,
    violations,
    catastrophic: violations.filter((item) => item.category === CATEGORIES.CATASTROPHIC),
    ordinary: violations.filter((item) => item.category === CATEGORIES.ORDINARY),
    runtimeTriggers: violations.filter((item) => item.runtime === true).map((item) => item.code),
  };
}

export function runtimeTriggers(input = {}) {
  return gradeReply(input).violations.filter((item) => item.runtime === true && [
    'RT2_LENGTH', 'RT2_MARKUP', 'CF6_JSON_PROSE', 'CF6_PROPOSAL_PROSE',
    'CF5_MACHINE_TOKEN', 'CF5_OPAQUE_REFERENCE', 'CF5_SECRET', 'CF5_DRAFT_LEAK', 'CF5_INTERNAL_PRODUCT_LANGUAGE', 'CF5_PRIVATE_USE', 'RT2_FALSE_AUTHORITY',
    'EVIDENCE_SCOPE',
  ].includes(item.code));
}
export const getRuntimeTriggers = runtimeTriggers;
export const shouldRegenerate = (input = {}) => runtimeTriggers(input).length > 0;

export function validateOpening({ text = '', dataLoaded = false, coffees = [] } = {}) {
  const value = textOf(text);
  const errors = [];
  if (words(value).length > 40) errors.push('opening exceeds 40 words');
  if (!dataLoaded && /\b(?:empty|no coffees?|nothing on|add a coffee)\b/i.test(value)) errors.push('opening claims rotation state before data loaded');
  if (dataLoaded && coffees.length > 0 && /\b(?:empty|no coffees?|add a coffee)\b/i.test(value)) errors.push('loaded non-empty rotation has empty opening');
  return { valid: errors.length === 0, errors };
}

export function validateCaption({ text = '' } = {}) {
  const value = textOf(text);
  const errors = [];
  if (!value.trim()) errors.push('caption is empty');
  if (gradeC6aMachineTokens({ reply: value }).length) errors.push('caption leaks a hard machine token');
  if (gradeC6bPhrases({ reply: value }).length) errors.push('caption leaks a machine-adjacent phrase');
  return { valid: errors.length === 0, errors };
}

export function classifyFailures(value = []) {
  const violations = Array.isArray(value) ? value : value.violations || [];
  return {
    catastrophic: violations.filter((item) => item.category === CATEGORIES.CATASTROPHIC),
    ordinary: violations.filter((item) => item.category === CATEGORIES.ORDINARY),
  };
}

// Small schema helpers are exported so U1 can freeze launch contexts without
// importing product/runtime modules.
export const LAUNCH_SURFACES = Object.freeze(['direct', 'bean_card', 'recipe_kalita_v60', 'recipe_aiden', 'tasting_card', 'tasting_wizard']);
export const LAUNCH_ITEM_KINDS = Object.freeze(['recipe', 'brew', 'tasting']);
export const RECIPE_SLOTS = Object.freeze(['aiden', 'v60_hot', 'v60_iced', 'kalita_hot', 'kalita_iced']);

export function validateLaunchContext(value) {
  const errors = [];
  if (!object(value)) return { valid: false, errors: ['launchContext must be an object'] };
  for (const key of ['coffeeId', 'method', 'slotKey', 'mode', 'revisionId', 'tastingEvidence']) if (Object.hasOwn(value, key)) errors.push(`${key} is not valid in launchContext`);
  if (value.coffeeRef != null && (typeof value.coffeeRef !== 'string' || !value.coffeeRef.trim())) errors.push('coffeeRef must be a non-empty string');
  if (!LAUNCH_SURFACES.includes(value.surface)) errors.push('surface is invalid');
  if (value.launchItem != null) {
    if (!object(value.launchItem)) errors.push('launchItem must be an object');
    else {
      const item = value.launchItem;
      if (!LAUNCH_ITEM_KINDS.includes(item.kind)) errors.push('launchItem kind is invalid');
      if (typeof item.ref !== 'string' || !item.ref.trim()) errors.push('launchItem ref is required');
      if (item.method != null && (typeof item.method !== 'string' || !RECIPE_SLOTS.includes(item.method))) errors.push('launchItem method is invalid');
      if (item.kind === 'recipe' && !item.method) errors.push('recipe launchItem method is required');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function fixtureManifestShape(account, cases) {
  if (!object(account) || !object(cases)) return { valid: false, errors: ['fixture account and cases are required'] };
  const errors = [];
  if (!Number.isInteger(account.manifestVersion) || account.manifestVersion < 1) errors.push('account manifestVersion is required');
  if (cases.manifestVersion !== account.manifestVersion) errors.push('manifest versions differ');
  if (!Array.isArray(cases.cases) || cases.cases.length < 14) errors.push('the fourteen baseline cases are required');
  return { valid: errors.length === 0, errors };
}

export { words, paragraphs, sentenceCount };
