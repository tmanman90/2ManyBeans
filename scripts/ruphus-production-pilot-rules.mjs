// Compose an additive pilot against the CURRENT production rules, not the
// broader Dev rules. Existing users/beans/tastings policies remain byte-identical.
export function productionPilotRules(current, reference, uid) {
  if (!/^[a-zA-Z0-9_-]{20,128}$/.test(uid)) throw new Error('Invalid pilot account');
  if (current.includes('RUPHUS_OWNER_PILOT')) throw new Error('Pilot already installed; inspect before updating');
  const start = reference.indexOf('    match /users/{userId}/chatSessions/{sessionId} {');
  const end = reference.indexOf('    // Redemption codes & ledger:', start);
  if (start < 0 || end < start) throw new Error('Reference rule boundaries changed');
  const section = reference.slice(start, end);
  const required = ['chatSessions', 'proposals', 'recipeRevisions', 'brewAttempts', 'actions', 'receipts', 'ruphusTelemetry'];
  const matches = [...section.matchAll(/match \/users\/\{userId\}\/([^/]+)\//g)].map(m => m[1]);
  if (JSON.stringify(matches) !== JSON.stringify(required)) throw new Error('Unexpected pilot collection');
  const guarded = section.replaceAll('request.auth != null && request.auth.uid == userId',
    `request.auth != null && request.auth.uid == userId && userId == '${uid}'`);
  const closing = current.lastIndexOf('  }\n}');
  if (closing < 0) throw new Error('Production rules structure changed');
  return current.slice(0, closing) + '    // RUPHUS_OWNER_PILOT: additive, explicit-account access only.\n'
    + guarded + current.slice(closing);
}
