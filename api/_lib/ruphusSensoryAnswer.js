// This permits a review, never a saved-recipe mutation. Both readiness paths
// must recognize the same answers to the assistant's sensory clarification.
export function answeredSensoryClarifier(userText = '', conversation = []) {
  const previous = [...conversation].reverse().find(message => message?.role === 'assistant'
    && !/^Couldn't reach the AI\. Try again in a sec\.$/.test(message.content || ''))?.content || '';
  if (!/\?/.test(previous) || !/\b(?:thin|sweet|clean|sour|sharp|muted|bitter|harsh|dry|astringent|flat|watery|weak|hollow)\b/i.test(previous)) return false;
  const text = String(userText);
  if (/\?|\b(?:maybe|perhaps|unsure|not sure|can't tell|cannot tell|what if|explain|why|wait|not yet|do not|don't|don’t)\b/i.test(text)) return false;
  // A negated symptom alone is not a diagnosis; a contrasting positive
  // symptom ("not sour, just bitter") still answers the question.
  const positive = text.replace(/\b(?:not|never|wasn['’]t|isn['’]t|didn['’]t taste)\s+(?:(?:really|very|at all|particularly)\s+)*(?:sweet|clean|sour|sharp|muted|bitter|harsh|dry|astringent)\b/gi, '');
  return /\b(?:sweet|clean|sour|sharp|muted|bitter|harsh|dry|astringent)\b/i.test(positive);
}
