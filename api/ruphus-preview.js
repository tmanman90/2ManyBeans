import { withCorsAuthPro, getDb } from './_lib/cors-auth.js';
import { canonicalHash, validateRecipePreviewRequest } from '../src/lib/ruphus/contracts.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { readRecipeForPreview, persistRecipePreview } from './_lib/ruphusRepository.js';
import { isAgentAccessAllowed, persistRuphusTrace } from './_lib/ruphusRollout.js';

const pick = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
};
const safeIntent = (value) => pick(value, ['targetRatio', 'targetTemperatureC', 'techniquePreference', 'finesRisk', 'solubilityRisk', 'energyTendency', 'desiredStrength', 'contactTimeAdjustmentSeconds', 'grindAdjustmentMicrons', 'confidence', 'cupDirection', 'softPriors', 'reasonCodes']);
const safeConfiguration = (value) => pick(value, ['size', 'kalitaSize', 'grinder', 'roast', 'process', 'chillingMethod', 'closedBloomSeconds', 'forcedSteepDurationSeconds']);
const requestKey = ({ proposalId, coffeeId, slotKey, sessionId, dose, configuration }) => canonicalHash({ proposalId, coffeeId, slotKey, sessionId, dose, configuration: safeConfiguration(configuration) });

export default withCorsAuthPro(async (req, res, decodedToken) => {
  const uid = decodedToken?.uid;
  const body = req.body || {};
  const request = { ...body, requestId: body.requestId || body.previewId };
  const shape = validateRecipePreviewRequest(request);
  if (!uid || !shape.valid) return res.status(400).json({ error: 'invalid_preview_request', details: shape.errors });
  if (!isAgentAccessAllowed({ uid, rawUids: process.env.RUPHUS_AGENT_V3_UIDS })) return res.status(404).json({ error: 'recipe_preview_unavailable' });
  if (Object.hasOwn(body, 'recipe') || Object.hasOwn(body, 'after') || Object.hasOwn(body, 'snapshot') || Object.hasOwn(body, 'ownerId') || Object.hasOwn(body, 'uid') || Object.hasOwn(body, 'intent') || Object.hasOwn(body, 'ratio') || Object.hasOwn(body, 'targetRatio')) return res.status(400).json({ error: 'preview_recipe_is_server_bound' });
  let db;
  try {
    db = getDb();
    const configuration = safeConfiguration(body.configuration);
    const base = await readRecipeForPreview({ db, uid, coffeeId: body.coffeeId, slotKey: body.slotKey, proposalId: body.proposalId, sessionId: body.sessionId });
    const preview = createRecipePreview({ recipe: base.recipe, dose: body.dose, configuration, allowIced: true });
    const key = requestKey({ ...body, configuration });
    const proposal = await persistRecipePreview({
      db, uid, coffeeId: body.coffeeId, slotKey: body.slotKey, sessionId: body.sessionId,
      after: preview, previewKey: key, previewDose: preview.coffeeGrams, previewRatio: preview.ratio,
      previewConfiguration: { configuration }, sourceRevisionId: base.revisionId, sourceHash: base.sourceHash, sourceProposalId: body.proposalId,
    });
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-preview', contextId: body.coffeeId, requestId: request.requestId, proposalId: proposal.id, proposalValid: true, source: 'preview-preparation' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    return res.status(200).json({ ok: true, preview, proposal, saved: false, mutation: 'none', serverValidated: true, previewVersion: preview.recipePreview?.version || null });
  } catch (error) {
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-preview', contextId: body.coffeeId, requestId: request.requestId, failureCode: error.code || 'preview_failed' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    const status = ['stale', 'idempotency_conflict'].includes(error.code) ? 409 : error.code === 'not_found' ? 404 : 400;
    return res.status(status).json({ error: error.code || 'preview_failed', message: error.message, details: error.details || null });
  }
});

export { requestKey, safeIntent, safeConfiguration };
