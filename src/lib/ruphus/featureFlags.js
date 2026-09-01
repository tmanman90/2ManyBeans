// The client can request Agent v3 only from the explicitly compiled dev app,
// and never from demo mode. The server remains the authority via its UID
// allowlist; client flags are only a request hint. The legacy source contract
// mentions MODE !== 'production'; the compiled app variant is the sole gate.
export const isRuphusAgentV3Enabled = ({ isDemo = false } = {}) => !isDemo && typeof __APP_VARIANT__ !== 'undefined' && __APP_VARIANT__ === 'dev';

// Mutation is a distinct, fail-closed UID gate. Proposal actions render only
// when the compiled Dev app and the explicit UID allowlist both agree; the
// server independently enforces its access and mutation allowlists.
export const isRuphusMutationEnabled = ({ uid, isDemo = false, env = import.meta.env } = {}) => {
  if (isDemo || typeof __APP_VARIANT__ === 'undefined' || __APP_VARIANT__ !== 'dev' || !uid) return false;
  const allowed = String(env?.VITE_RUPHUS_AGENT_V3_MUTATION_UIDS || '').split(',').map(value => value.trim()).filter(Boolean);
  return allowed.includes(uid);
};
