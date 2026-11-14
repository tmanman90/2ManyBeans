const includesUid = (value, uid) => typeof uid === 'string' && uid.length > 0
  && String(value || '').split(',').map(entry => entry.trim()).filter(Boolean).includes(uid);

// Production is an account-scoped pilot, never a global switch. Server
// allowlists independently authorize every request. Dev behavior is unchanged.
export const isRuphusAgentV3Enabled = ({ uid, isDemo = false, env = import.meta.env } = {}) => {
  if (isDemo || typeof __APP_VARIANT__ === 'undefined') return false;
  return __APP_VARIANT__ === 'dev'
    || (__APP_VARIANT__ === 'prod' && includesUid(env?.VITE_RUPHUS_AGENT_V3_UIDS, uid));
};

export const isRuphusMutationEnabled = ({ uid, isDemo = false, env = import.meta.env } = {}) =>
  isRuphusAgentV3Enabled({ uid, isDemo, env })
  && includesUid(env?.VITE_RUPHUS_AGENT_V3_MUTATION_UIDS, uid);
