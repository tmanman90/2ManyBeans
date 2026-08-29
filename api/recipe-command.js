import { withCorsAuth } from './_lib/cors-auth.js';
import { executeRecipeCommand, MUTATION_MODES, ORDINARY_MODES } from './_lib/ruphusCommandService.js';
import { getDb } from './_lib/cors-auth.js';
import { checkEntitlement } from './_lib/checkEntitlement.js';
import { validateCommandRequest } from '../src/lib/ruphus/contracts.js';
import { isMutationAllowed, persistRuphusTrace, recordRuphusCensus } from './_lib/ruphusRollout.js';

const allowedModes = new Set([...MUTATION_MODES, ...ORDINARY_MODES]);
const mutationUids = () => new Set(String(process.env.RUPHUS_AGENT_V3_MUTATION_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean));
const requiredTierFor = (mode) => {
  if (mode === 'set_aiden_link' || mode === 'prepare_attempt') return 'ultra';
  if (mode === 'replace_active_recipe' || mode === 'set_aiden_grind' || MUTATION_MODES.includes(mode)) return 'pro';
  return null;
};

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  const command = req.body || {};
  let db;
  const shape = validateCommandRequest(command);
  if (!uid || !shape.valid || !allowedModes.has(command.mode)) return res.status(400).json({ error: 'invalid_command', details: shape.errors });
  if (Object.hasOwn(command, 'uid') || Object.hasOwn(command, 'ownerId') || Object.hasOwn(command, 'userId')) return res.status(400).json({ error: 'owner_identity_is_server_bound' });
  if (MUTATION_MODES.includes(command.mode) && !isMutationAllowed({ uid, mode: command.mode, rawUids: process.env.RUPHUS_AGENT_V3_MUTATION_UIDS })) return res.status(404).json({ error: 'mutation_unavailable' });
  try {
    const requiredTier = requiredTierFor(command.mode);
    if (requiredTier) {
      const entitlement = await checkEntitlement(uid);
      if (entitlement.unavailable) return res.status(503).json({ error: 'entitlement_check_unavailable', message: 'Subscription service temporarily unavailable. Please try again in a moment.' });
      const entitled = requiredTier === 'ultra' ? entitlement.ultra : entitlement.pro;
      if (!entitled) return res.status(403).json({ error: 'subscription_required', tier: requiredTier, message: requiredTier === 'ultra' ? 'This feature requires a Coffee Hub Ultra subscription.' : 'This feature requires a Coffee Hub Pro subscription.' });
    }
    db = getDb();
    await recordRuphusCensus({ db, uid, clientVersion: command.clientVersion, commandCapabilities: command.commandCapabilities, source: 'command' }).catch(() => {});
    const { clientVersion: _clientVersion, commandCapabilities: _commandCapabilities, ...serverCommand } = command;
    const result = await executeRecipeCommand({ db, uid, ...serverCommand });
    const proposalMode = ['apply_proposal', 'brew_once', 'promote_attempt', 'undo_revision'].includes(command.mode);
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/recipe-command', contextId: command.coffeeId, actionId: command.actionId, receiptId: result?.receipt?.id, approvalSource: MUTATION_MODES.includes(command.mode) ? 'native_card' : 'ordinary_app', proposalValid: proposalMode ? result?.receipt?.status !== 'validation_rejected' : undefined, failureCode: result?.error }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    return res.status(200).json(result);
  } catch (error) {
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/recipe-command', contextId: command.coffeeId, actionId: command.actionId, failureCode: error.code || 'command_failed' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    const status = ['stale', 'idempotency_conflict'].includes(error.code) ? 409 : ['not_found', 'mutation_unavailable'].includes(error.code) ? 404 : 400;
    return res.status(status).json({ error: error.code || 'command_failed', message: error.message, details: error.details || null });
  }
});

export { allowedModes, mutationUids, requiredTierFor };
