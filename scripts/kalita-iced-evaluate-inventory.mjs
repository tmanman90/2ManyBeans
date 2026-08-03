// Read-only current-inventory evaluator.
// Required: --uid <target UID> --service-account <service-account.json>
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateAndRedactKalitaIcedInventory } from '../src/lib/kalitaIcedInventoryEvaluation.js';

export function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function fail(message) {
  console.error(`REFUSED: ${message}`);
  process.exitCode = 2;
}

function loadServiceAccount(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (error) {
    throw new Error(`could not read service-account JSON: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || !parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('service-account JSON must contain project_id, client_email, and private_key');
  }
  return parsed;
}

async function readTargetBeans(uid, serviceAccount) {
  const [{ cert, initializeApp }, { getFirestore }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/firestore'),
  ]);
  const app = initializeApp({ credential: cert(serviceAccount) }, `kalita-iced-read-only-${Date.now()}`);
  const snapshot = await getFirestore(app)
    .collection('users').doc(uid).collection('beans').get();
  return snapshot.docs.map((document) => document.data());
}

async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (!options.uid || !options['service-account']) throw new Error('supply --uid and --service-account <path>');
    const serviceAccount = loadServiceAccount(options['service-account']);
    const beans = await readTargetBeans(options.uid, serviceAccount);
    const summary = evaluateAndRedactKalitaIcedInventory(beans);
    console.log(JSON.stringify({ readOnly: true, targetUid: 'redacted', ...summary }, null, 2));
  } catch (error) {
    fail(error.message || 'inventory evaluation failed');
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] || '')) main();
