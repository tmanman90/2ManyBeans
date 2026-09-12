import { withCorsAuthPro, getDb } from './_lib/cors-auth.js';
import { RATE_LIMIT } from './_lib/claudeShared.js';
import { canonicalHash, validateRecipePreviewRequest } from '../src/lib/ruphus/contracts.js';
import { createRecipePreview } from '../src/lib/ruphus/recipePreview.js';
import { generateManualSourceTechniqueOption } from '../src/lib/ruphus/techniqueOptions.js';
import { readRecipeForPreview, persistRecipePreview } from './_lib/ruphusRepository.js';
import { isAgentAccessAllowed, persistRuphusTrace } from './_lib/ruphusRollout.js';

const SOURCE_CONFIGURATION_KEYS = Object.freeze([
  'device', 'brewer', 'variant', 'v60Variant', 'size', 'v60Size', 'kalitaSize',
  'model', 'filter', 'material', 'mode', 'sourceDoseSelection',
]);

const pick = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
};
// U2 exposes dose-only drafts. Technique, grinder, temperature, size, and
// chilling controls remain immutable until a server-issued technique identity
// exists in the later exploration unit.
const safeConfiguration = (value) => pick(value, []);
const safeSourceConfiguration = (value) => pick(value, SOURCE_CONFIGURATION_KEYS);
const sourceConfigurationKeysAreSafe = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  return Object.keys(value).every((key) => SOURCE_CONFIGURATION_KEYS.includes(key));
};
const requestKey = ({ proposalId, coffeeId, slotKey, sessionId, dose, configuration, sourceId, sourceRevision, sourceConfiguration }) => canonicalHash({
  proposalId, coffeeId, slotKey, sessionId, dose,
  configuration: safeConfiguration(configuration),
  sourceId: sourceId || null,
  sourceRevision: sourceRevision || null,
  sourceConfiguration: safeSourceConfiguration(sourceConfiguration),
});

function sourceConfigurationMismatch(stored, requested) {
  const storedConfig = stored?.sourceProjection?.sourceConfiguration || {};
  const storedEquipment = stored?.sourceProjection?.equipment || {};
  const normalizedRequested = {
    brewer: requested.brewer,
    device: requested.device ?? (requested.brewer === 'switch' ? 'v60' : requested.brewer),
    variant: requested.variant ?? requested.v60Variant,
    size: requested.size ?? requested.v60Size ?? requested.kalitaSize,
    model: requested.model,
    filter: requested.filter,
    material: requested.material,
    mode: requested.mode,
  };
  const pairs = [
    ['brewer', storedEquipment.brewer],
    ['device', storedConfig.device || (storedEquipment.brewer === 'switch' ? 'v60' : storedEquipment.brewer)],
    ['variant', storedConfig.variant || (storedEquipment.brewer === 'switch' ? 'switch' : storedEquipment.brewer === 'v60' ? 'classic' : 'wave')],
    ['size', storedConfig.size || storedEquipment.size],
    ['model', storedConfig.model || storedEquipment.model],
    ['filter', storedConfig.filter || storedEquipment.filter],
    ['material', storedConfig.material || storedEquipment.material],
    ['mode', storedConfig.mode || stored?.sourceProjection?.mode],
  ];
  return pairs.find(([key, expected]) => normalizedRequested[key] != null && expected != null && String(normalizedRequested[key]) !== String(expected)) || null;
}

function sourceRequestFromBody(body, storedRecipe) {
  const storedProjection = storedRecipe?.sourceProjection;
  const sourceRequested = body.sourceId != null || body.sourceRevision != null || body.sourceConfiguration != null;
  if (!storedProjection) {
    if (sourceRequested) throw Object.assign(new Error('A source-backed proposal is required for source preview.'), { code: 'source_proposal_required' });
    return null;
  }
  if (body.sourceId != null && body.sourceId !== storedProjection.sourceId) throw Object.assign(new Error('The requested source does not match the reviewed proposal.'), { code: 'source_identity_mismatch' });
  if (body.sourceRevision != null && Number(body.sourceRevision) !== Number(storedProjection.sourceRevision)) throw Object.assign(new Error('The requested source revision does not match the reviewed proposal.'), { code: 'source_revision_mismatch' });
  const bodyConfiguration = body.sourceConfiguration ?? {};
  if (!sourceConfigurationKeysAreSafe(bodyConfiguration)) throw Object.assign(new Error('Only exact source hardware/configuration fields may be previewed.'), { code: 'unsupported_preview_configuration' });
  const mismatch = sourceConfigurationMismatch(storedRecipe, bodyConfiguration);
  if (mismatch) throw Object.assign(new Error(`The requested source ${mismatch[0]} does not match the reviewed proposal.`), { code: 'source_configuration_mismatch', details: { field: mismatch[0], expected: mismatch[1], received: bodyConfiguration[mismatch[0]] } });
  return {
    sourceId: storedProjection.sourceId,
    sourceRevision: storedProjection.sourceRevision,
    sourceConfiguration: {
      ...(storedProjection.sourceConfiguration || {}),
      ...safeSourceConfiguration(bodyConfiguration),
    },
  };
}

const LEGACY_SOURCE_PROJECTION_DISCLOSURE = 'App-calculated quantities are exposed in typed fields; source-native prose remains verbatim and source timing is not carried over.';
const LEGACY_SOURCE_DOSE_POLICY_DISCLOSURE = 'App-scaled typed quantities preserve native units and the source checkpoint/event anchors. Timing is an unchanged source guide at the selected dose, not a new author claim.';

// Before executable source labels were adapted, a stored projection carried
// the original labels while its typed checkpoints had already been scaled.
// Accept only that exact representation of the current trusted source revision;
// all typed values, hardware, timing and owner-bound source identity remain in
// the comparison. The corrected trusted projection is still returned below.
function legacySourceProjectionWitness(projection) {
  const legacy = structuredClone(projection);
  const sourceLabels = legacy.sourceSnapshot?.stages || [];
  if (!Array.isArray(legacy.sourceExecution?.stages) || !Array.isArray(legacy.stages)
    || legacy.sourceExecution.stages.length !== sourceLabels.length
    || legacy.stages.length !== sourceLabels.length) return null;
  legacy.sourceExecution.stages = legacy.sourceExecution.stages.map((stage, index) => ({
    ...stage,
    label: sourceLabels[index]?.label,
  }));
  legacy.stages = legacy.stages.map((stage, index) => ({
    ...stage,
    label: sourceLabels[index]?.label,
  }));
  legacy.adaptation = {
    ...legacy.adaptation,
    changes: (legacy.adaptation?.changes || []).filter((change) => !/^stages\.\d+\.label$/.test(change.path || change.field || '')),
    disclosure: legacy.adaptation?.timingPolicy
      ? LEGACY_SOURCE_DOSE_POLICY_DISCLOSURE
      : LEGACY_SOURCE_PROJECTION_DISCLOSURE,
  };
  return legacy;
}

function reconstructSourcePreview(base, body, sourceRequest) {
  const storedProjection = base.recipe.sourceProjection;
  const sourceDose = Number(base.recipe.coffeeGrams);
  const trusted = generateManualSourceTechniqueOption({ sourceId: sourceRequest.sourceId, sourceRevision: sourceRequest.sourceRevision }, {}, {
    ...sourceRequest.sourceConfiguration,
    sourceRevision: sourceRequest.sourceRevision,
    dose: sourceDose,
  });
  const trustedProjection = trusted.recipe.sourceProjection;
  const currentMatches = canonicalHash(trustedProjection) === canonicalHash(storedProjection);
  const legacyMatches = !currentMatches
    && canonicalHash(legacySourceProjectionWitness(trustedProjection)) === canonicalHash(storedProjection);
  if (!currentMatches && !legacyMatches) {
    throw Object.assign(new Error('The reviewed source projection no longer matches the trusted source record.'), { code: 'source_projection_mismatch' });
  }
  return createRecipePreview({
    recipe: trusted.recipe,
    dose: body.dose,
    configuration: sourceRequest.sourceConfiguration,
    allowIced: true,
  });
}

export async function handleRecipePreview(req, res, decodedToken, { db = getDb() } = {}) {
  const uid = decodedToken?.uid;
  const body = req.body || {};
  const request = { ...body, requestId: body.requestId || body.previewId };
  const shape = validateRecipePreviewRequest(request);
  if (!uid || !shape.valid) return res.status(400).json({ error: 'invalid_preview_request', details: shape.errors });
  if (!isAgentAccessAllowed({ uid, rawUids: process.env.RUPHUS_AGENT_V3_UIDS })) return res.status(404).json({ error: 'recipe_preview_unavailable' });
  if (Object.hasOwn(body, 'recipe') || Object.hasOwn(body, 'after') || Object.hasOwn(body, 'snapshot') || Object.hasOwn(body, 'ownerId') || Object.hasOwn(body, 'uid') || Object.hasOwn(body, 'intent') || Object.hasOwn(body, 'ratio') || Object.hasOwn(body, 'targetRatio')) return res.status(400).json({ error: 'preview_recipe_is_server_bound' });
  if (body.configuration && Object.keys(body.configuration).length) return res.status(400).json({ error: 'unsupported_preview_configuration' });
  try {
    const base = await readRecipeForPreview({ db, uid, coffeeId: body.coffeeId, slotKey: body.slotKey, proposalId: body.proposalId, sessionId: body.sessionId });
    const sourceRequest = sourceRequestFromBody(body, base.recipe);
    const sourceConfiguration = sourceRequest?.sourceConfiguration || {};
    if (!sourceRequest && body.sourceConfiguration) throw Object.assign(new Error('A source-backed proposal is required for source preview.'), { code: 'source_proposal_required' });
    const configuration = sourceRequest ? sourceConfiguration : safeConfiguration(body.configuration);
    const preview = sourceRequest
      ? reconstructSourcePreview(base, body, sourceRequest)
      : createRecipePreview({ recipe: base.recipe, dose: body.dose, configuration, allowIced: true });
    const key = requestKey({ ...body, configuration, sourceId: sourceRequest?.sourceId, sourceRevision: sourceRequest?.sourceRevision, sourceConfiguration });
    const proposal = await persistRecipePreview({
      db, uid, coffeeId: body.coffeeId, slotKey: body.slotKey, sessionId: body.sessionId,
      after: preview, previewKey: key, previewDose: preview.coffeeGrams, previewRatio: preview.ratio ?? null,
      previewConfiguration: { configuration, ...(sourceRequest ? { sourceId: sourceRequest.sourceId, sourceRevision: sourceRequest.sourceRevision } : {}) }, sourceRevisionId: base.revisionId, sourceHash: base.sourceHash, sourceProposalId: body.proposalId, requestId: request.requestId,
    });
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-preview', contextId: body.coffeeId, requestId: request.requestId, proposalId: proposal.id, proposalValid: true, source: 'preview-preparation' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    return res.status(200).json({ ok: true, preview, proposal, saved: false, mutation: 'none', serverValidated: true, previewVersion: preview.recipePreview?.version || null });
  } catch (error) {
    await persistRuphusTrace({ db, uid, event: { feature: 'ruphus-agent-v3', endpoint: '/api/ruphus-preview', contextId: body.coffeeId, requestId: request.requestId, failureCode: error.code || 'preview_failed' }, retentionRaw: process.env.RUPHUS_AGENT_TRACE_RETENTION_DAYS }).catch(() => {});
    const status = ['stale', 'idempotency_conflict'].includes(error.code) ? 409 : error.code === 'not_found' ? 404 : 400;
    return res.status(status).json({ error: error.code || 'preview_failed', message: error.message, details: error.details || null });
  }
}

export default withCorsAuthPro((req, res, decodedToken) => handleRecipePreview(req, res, decodedToken), { rateLimit: RATE_LIMIT });

export { requestKey, safeConfiguration, safeSourceConfiguration };
