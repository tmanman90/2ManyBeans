import { withCorsAuth } from './_lib/cors-auth.js';
import { executeRecipeCommand, MUTATION_MODES, ORDINARY_MODES } from './_lib/ruphusCommandService.js';
import { getDb } from './_lib/cors-auth.js';
import { validateCommandRequest } from '../src/lib/ruphus/contracts.js';

const allowedModes = new Set([...MUTATION_MODES, ...ORDINARY_MODES]);
const mutationUids = () => new Set(String(process.env.RUPHUS_AGENT_V3_MUTATION_UIDS || '').split(',').map((value) => value.trim()).filter(Boolean));

export default withCorsAuth(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  const command = req.body || {};
  const shape = validateCommandRequest(command);
  if (!uid || !shape.valid || !allowedModes.has(command.mode)) return res.status(400).json({ error: 'invalid_command', details: shape.errors });
  if (Object.hasOwn(command, 'uid') || Object.hasOwn(command, 'ownerId') || Object.hasOwn(command, 'userId')) return res.status(400).json({ error: 'owner_identity_is_server_bound' });
  if (MUTATION_MODES.includes(command.mode) && !mutationUids().has(uid)) return res.status(404).json({ error: 'mutation_unavailable' });
  try {
    const result = await executeRecipeCommand({ db: getDb(), uid, ...command });
    return res.status(200).json(result);
  } catch (error) {
    const status = ['stale', 'idempotency_conflict'].includes(error.code) ? 409 : ['not_found', 'mutation_unavailable'].includes(error.code) ? 404 : 400;
    return res.status(status).json({ error: error.code || 'command_failed', message: error.message, details: error.details || null });
  }
});

export { allowedModes, mutationUids };
