// Operator-only acceptance: existing isolated fixture, standard Firebase sign-in,
// real endpoint and canonical readback. Never prints or persists credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadFixtureManifest, createCostGuard, loadCumulativeCostLedger, loadSmokeLedger, persistCumulativeCostLedger, runLiveCase, runLiveStage, persistRunArtifact } from './ruphus-conversation-runner.mjs';
import { createAnthropicJudgeAdapter } from './ruphus-conversation-judge.mjs';
import { createFirestoreSessionReset, seedFixture } from './seed-ruphus-dev-fixture.mjs';
import { resolveRuphusActionRequest } from '../src/lib/ruphusActionIdentity.js';
import { canonicalRecipeSnapshot, resolveLegacyRecipe } from '../src/lib/ruphus/legacyRecipeResolver.js';
import { canonicalHash } from '../src/lib/ruphus/contracts.js';
import { normalizeAgentSession } from '../src/lib/ruphus/session.js';

const project = 'twomanybeans-ruphus-dev';
const vercelProject = 'prj_puSGDxI5uv7x98v0NRLz0Yk8KNus';
const endpoint = process.argv[2];
const mode = process.argv[3] || 'action';
assert.ok(['action', 'smoke', 'full', 'ui', 'ui-action'].includes(mode), 'Expected action, smoke, full, ui or ui-action');
assert.match(endpoint || '', /^https:\/\/twomanybeans-ruphus-[a-z0-9]+-tmanman90s-projects\.vercel\.app$/);
const directory = 'docs/data/ruphus-agent-v3/conversation-eval';
const ledgerPath = `${directory}/live-cost-ledger.json`;
const runId = `u3-action-check-${Date.now()}`;
const report = { kind: 'live-action-acceptance', endpoint, passed: false, nativeUiTest: false };
const oauth = JSON.parse(fs.readFileSync('/Users/talmeltzer/.config/configstore/firebase-tools.json')).tokens.access_token;

async function request(url, { token = oauth, body, method = body ? 'POST' : 'GET' } = {}) {
  const response = await fetch(url, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    const code = typeof data.error === 'string' && /^[a-z_]+$/.test(data.error) ? data.error : 'request_failed';
    throw new Error(`Dev request HTTP ${response.status} ${code}`);
  }
  return data;
}
function api(path) {
  const result = spawnSync('npx', ['vercel', 'api', path, '--raw'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Managed Dev configuration read failed');
  return JSON.parse(result.stdout);
}
function encode(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: value };
}
function decode(value) {
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if ('integerValue' in value) return Number(value.integerValue);
  return Object.values(value)[0];
}

try {
  report.stage = 'managed_config';
  const envs = api(`/v10/projects/${vercelProject}/env`).envs.filter(env => env.target.includes('preview') && !env.gitBranch);
  const config = key => {
    const matches = envs.filter(env => env.key === key);
    assert.equal(matches.length, 1, 'Dev configuration must be unambiguous');
    return api(`/v1/projects/${vercelProject}/env/${matches[0].id}?decrypt=true`).value;
  };
  assert.equal(config('VITE_FIREBASE_PROJECT_ID'), project);
  for (const key of ['RUPHUS_AGENT_MAX_INPUT_TOKENS', 'RUPHUS_AGENT_MAX_OUTPUT_TOKENS']) process.env[key] = config(key);
  const deployment = api(`/v13/deployments/${new URL(endpoint).hostname}`);
  assert.equal(deployment.projectId, vercelProject);
  assert.equal(deployment.readyState, 'READY');
  assert.notEqual(deployment.target, 'production');
  report.deploymentId = deployment.id;
  report.commit = deployment.meta?.gitCommitSha;
  assert.match(report.commit || '', /^[a-f0-9]{40}$/);
  report.stage = 'fixture_lookup';
  const users = (await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:batchGet?maxResults=100`)).users;
  const fixtures = users.filter(user => !user.email && !user.providerUserInfo?.length && !user.disabled);
  assert.equal(fixtures.length, 1, 'Fixture identity must be unique');
  const uid = fixtures[0].localId;
  assert.ok(config('RUPHUS_AGENT_V3_UIDS').split(',').map(value => value.trim()).includes(uid));
  const accounts = (await request(`https://iam.googleapis.com/v1/projects/${project}/serviceAccounts`)).accounts;
  const signer = accounts.find(account => account.displayName === 'Ruphus Dev Preview' && !account.disabled);
  assert.ok(signer);
  const now = Math.floor(Date.now() / 1000);
  report.stage = 'fixture_token_signing';
  const signed = await request(`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(signer.email)}:signJwt`, { body: { payload: JSON.stringify({ iss: signer.email, sub: signer.email, aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: now, exp: now + 600, uid }) } });
  report.stage = 'fixture_sign_in';
  const auth = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${config('VITE_FIREBASE_API_KEY')}`, { token: null, body: { token: signed.signedJwt, returnSecureToken: true } });
  const claims = JSON.parse(Buffer.from(auth.idToken.split('.')[1], 'base64url'));
  assert.ok(claims.sub === uid && claims.aud === project, 'Fixture sign-in identity must match');
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${uid}`;
  const fixtureProfile = decode({ mapValue: await request(base, { token: auth.idToken }) });
  assert.equal(fixtureProfile.account || fixtureProfile.subscription?.source, 'ruphus-dev-fixture', 'Only the explicitly seeded fixture can be mutated');
  if (mode === 'ui' || mode === 'ui-action') {
    // Historical seed-only root fields violate the existing profile hasOnly
    // rule. Remove only those named fixture fields, retaining domain setup in
    // preferences and server-owned fixture identity in subscription.source.
    assert.equal(fixtureProfile.subscription?.source, 'ruphus-dev-fixture');
    const obsolete = ['account', 'manifestVersion', 'manifestHash', 'defaultMethod', 'grinder', 'units'].filter(key => key in fixtureProfile);
    const patch = { displayName: fixtureProfile.displayName || 'Ruphus Dev Fixture', username: fixtureProfile.username ?? null };
    const mask = [...obsolete, ...Object.keys(patch)].map(key => `updateMask.fieldPaths=${key}`).join('&');
    await request(`${base}?${mask}`, { method: 'PATCH', body: encode(patch).mapValue });
    report.fixtureProfileSchemaRepaired = true;
  }
  const bean = async () => decode({ mapValue: await request(`${base}/beans/fixture-colombia-other`, { token: auth.idToken }) });
  const savedRecipe = async () => {
    const coffee = await bean();
    const revisionId = coffee.activeRevisionIds?.kalita_hot;
    if (revisionId) return decode({ mapValue: await request(`${base}/recipeRevisions/${encodeURIComponent(revisionId)}`, { token: auth.idToken }) }).snapshot;
    return resolveLegacyRecipe(coffee, 'kalita_hot').recipe;
  };
  const recipeHash = recipe => {
    const normalized = canonicalRecipeSnapshot(recipe, 'kalita_hot');
    delete normalized.recipeHash;
    delete normalized.userCoffeeGrams;
    delete normalized.aidenGrind;
    return canonicalHash(normalized);
  };
  report.stage = 'canonical_recipe_read';
  const before = await savedRecipe();
  assert.ok(before, 'Seeded Kalita recipe must exist');
  const seedRevision = (await bean()).activeRevisionIds?.kalita_hot;
  if (seedRevision === 'fixture-colombia-other:kalita_hot') {
    // Repair only the named original seed's metadata; never rewrite a real action revision.
    const revision = decode({ mapValue: await request(`${base}/recipeRevisions/${encodeURIComponent(seedRevision)}`) });
    if (revision.id !== seedRevision || revision.snapshotHash !== recipeHash(before)) {
      await request(`${base}/recipeRevisions/${encodeURIComponent(seedRevision)}?updateMask.fieldPaths=id&updateMask.fieldPaths=snapshotHash`, { method: 'PATCH', body: encode({ id: seedRevision, snapshotHash: recipeHash(before) }).mapValue });
    }
  }
  if (!resolveLegacyRecipe(await bean(), 'kalita_hot').recipe) {
    report.stage = 'repair_missing_fixture_projection';
    await request(`${base}/beans/fixture-colombia-other?updateMask.fieldPaths=handBrewRecipes.kalita`, { method: 'PATCH', body: encode({ handBrewRecipes: { kalita: before } }).mapValue });
  }
  const db = { collection: collection => ({ doc: owner => ({ collection: child => ({ doc: id => ({ set: async value => {
    assert.ok(collection === 'users' && owner === uid && ((child === 'chatSessions' && id === 'active') || (child === 'rateLimits' && id === 'claude')));
    return request(`${base}/${child}/${id}`, { method: 'PATCH', body: encode(value).mapValue });
  } }) }) }) }) };
  const { account, cases } = await loadFixtureManifest();
  const fixture = cases.cases.find(item => item.id === 'AE05');
  const reset = await createFirestoreSessionReset({ projectId: project, fixtureUid: uid, db });
  if (mode === 'ui' || mode === 'ui-action') {
    report.stage = 'authenticated_browser_entry';
    await request(`${base}?updateMask.fieldPaths=onboardingComplete&updateMask.fieldPaths=tourCompleted`, { method: 'PATCH', body: encode({ onboardingComplete: true, tourCompleted: true }).mapValue });
    const keys = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID', 'VITE_RUPHUS_AGENT_V3_MUTATION_UIDS'];
    const { checkAuthenticatedDevEntry } = await import('./ruphus-dev-browser-check.mjs');
    let savedAction = null;
    let appliedResult = null;
    let artifact = null;
    if (mode === 'ui-action') {
      report.stage = 'existing_proposal_lookup';
      const proposals = [];
      let pageToken = '';
      do {
        const page = await request(`${base}/proposals${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`, { token: auth.idToken });
        proposals.push(...(page.documents || []).map(document => ({ id: document.name.split('/').at(-1), ...decode({ mapValue: document }) })));
        pageToken = page.nextPageToken || '';
      } while (pageToken);
      const currentRevision = (await bean()).activeRevisionIds?.kalita_hot || null;
      const record = proposals.find(proposal => proposal.status === 'proposed' && proposal.coffeeId === 'fixture-colombia-other' && proposal.slotKey === 'kalita_hot' && (proposal.sourceRevisionId || null) === currentRevision && proposal.before && recipeHash(proposal.before) === recipeHash(before));
      // Repository documents contain domain data, not the streamed UI envelope.
      // Reconstruct that presentation only; the real command retains all gates.
      artifact = record ? { ...record, type: 'recipe_proposal', actions: ['apply_proposal', 'brew_once', 'keep_current'] } : null;
      report.replayedProposalPresentation = true;
      assert.ok(artifact, 'No existing compatible live proposal; no model call was made');
      const session = normalizeAgentSession({ contextRef: { surface: 'direct', sessionId: artifact.sessionId || runId }, messages: [
        { id: `${runId}-question`, role: 'user', content: 'Can we update this recipe?' },
        { id: `${runId}-reply`, role: 'assistant', content: 'Review this saved recipe proposal.', turnId: artifact.turnId || runId, artifacts: [artifact] },
      ], lastActivityAt: Date.now() });
      await db.collection('users').doc(uid).collection('chatSessions').doc('active').set(session);
      savedAction = {
        command: async body => {
          assert.equal(body.mode, 'apply_proposal');
          assert.equal(body.proposalId, artifact.id);
          appliedResult = await request(`${endpoint}/api/recipe-command`, { token: auth.idToken, body });
          return appliedResult;
        },
        verify: async () => {
          assert.equal(appliedResult?.receipt?.status, 'succeeded');
          assert.equal(recipeHash(await savedRecipe()), recipeHash(artifact.after));
          report.canonicalReadback = true;
        },
      };
    }
    try {
      report.stage = 'authenticated_browser_entry';
      report.ui = await checkAuthenticatedDevEntry({ config: Object.fromEntries(keys.map(key => [key, config(key)])), customToken: signed.signedJwt, fixtureUid: uid, savedAction });
    } finally {
      if (appliedResult?.revision?.id) {
        await request(`${endpoint}/api/recipe-command`, { token: auth.idToken, body: { actionId: `${runId}-undo`, mode: 'undo_revision', coffeeId: artifact.coffeeId, slotKey: artifact.slotKey, expectedRevisionId: appliedResult.revision.id } });
        report.undoReadback = recipeHash(await savedRecipe()) === recipeHash(before);
        assert.ok(report.undoReadback);
      }
    }
    report.passed = report.ui.passed;
  } else if (mode === 'smoke' || mode === 'full') {
    const judge = mode === 'full' ? createAnthropicJudgeAdapter({}) : null;
    report.stage = `seed_live_${mode}`;
    await seedFixture({ projectId: project, fixtureUid: uid, authorized: true, write: async (path, data) => {
      assert.ok(path === `users/${uid}` || path.startsWith(`users/${uid}/`));
      await request(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`, { method: 'PATCH', body: encode(data).mapValue });
    } });
    report.stage = `live_${mode}`;
    const smoke = await runLiveStage({ stage: mode, endpoint: `${endpoint}/api/ruphus-agent`, token: auth.idToken, costCapUsd: 30, commit: report.commit, resetSession: reset, judge, pairwise: judge, ledger: await loadSmokeLedger(`${directory}/smoke-ledger.json`) });
    report[mode] = smoke;
    report.cumulativeCostUsd = smoke.cumulativeCostUsd;
    report.passed = smoke.passed;
    if (!smoke.passed) process.exitCode = 1;
  } else {
  report.stage = 'fixture_session_reset';
  await reset({ fixture, stage: 'action-acceptance', repetition: 1 });
  const prior = await loadCumulativeCostLedger(ledgerPath);
  const guard = createCostGuard(30, { initialSpentUsd: prior.spentUsd, initialReservedUsd: prior.reservedUsd, persist: state => persistCumulativeCostLedger(ledgerPath, state) });
  report.stage = 'live_conversation';
  report.conversation = await runLiveCase(account, fixture, { endpoint: `${endpoint}/api/ruphus-agent`, token: auth.idToken, costGuard: guard, stageRunId: runId });
  report.cumulativeCostUsd = guard.spentUsd;
  const artifact = report.conversation.results.flatMap(turn => turn.frames || []).find(frame => frame.type === 'artifact_ready' && frame.artifact?.type === 'recipe_proposal')?.artifact;
  assert.ok(artifact, 'Live conversation must produce a native proposal');
  assert.ok(artifact.actions?.includes('apply_proposal'), 'Live proposal must enable Apply');
  assert.equal(recipeHash(await savedRecipe()), recipeHash(before), 'Proposal must not change the saved recipe');
  const command = body => request(`${endpoint}/api/recipe-command`, { token: auth.idToken, body });
  const { request: apply } = resolveRuphusActionRequest({ uid, mode: 'apply_proposal', artifact });
  let applied;
  try {
    report.stage = 'apply';
    applied = await command(apply);
    report.applied = applied.receipt?.status === 'succeeded';
    assert.equal(recipeHash(await savedRecipe()), recipeHash(artifact.after), 'Canonical readback must match proposal');
    report.canonicalReadback = true;
    assert.equal((await command(apply)).revision.id, applied.revision.id, 'Replay must preserve revision identity');
    report.idempotentReplay = true;
  } finally {
    if (applied?.revision?.id) {
      report.stage = 'undo';
      await command({ actionId: `${runId}-undo`, mode: 'undo_revision', coffeeId: artifact.coffeeId, slotKey: artifact.slotKey, expectedRevisionId: applied.revision.id });
      report.undoReadback = recipeHash(await savedRecipe()) === recipeHash(before);
    }
  }
  assert.ok(report.applied && report.undoReadback);
  report.passed = true;
  }
} catch (error) {
  // Assertion actual/expected and request objects can contain private identifiers.
  report.failure = error.code === 'ERR_ASSERTION' ? String(error.message).split('\n')[0] : /^(?:Dev request HTTP|U3 |Managed Dev)/.test(error.message) ? error.message : 'Acceptance check failed; inspect the named stage without credentials';
  process.exitCode = 1;
} finally {
  const path = await persistRunArtifact(directory, report, runId);
  console.log(JSON.stringify({ passed: report.passed, stage: report.stage, failure: report.failure, applied: report.applied, canonicalReadback: report.canonicalReadback, idempotentReplay: report.idempotentReplay, undoReadback: report.undoReadback, cumulativeCostUsd: report.cumulativeCostUsd, report: path, nativeUiTest: false }));
}
