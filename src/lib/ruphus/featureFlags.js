// Agent v3 dogfood is opt-in at build/runtime and always off in production.
// Mutation is deliberately a separate flag; M1 never enables command writes.
export const isRuphusAgentV3Enabled = ({ isDemo = false, env = import.meta.env } = {}) => !isDemo && env?.MODE !== 'production' && env?.VITE_RUPHUS_AGENT_V3 === 'true';
export const isRuphusMutationEnabled = ({ env = import.meta.env } = {}) => env?.VITE_RUPHUS_AGENT_V3_MUTATION === 'true';
