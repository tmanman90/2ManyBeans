// Kill switch for a redemption code. Sets active:false so no new
// redemptions go through. Does NOT touch useCount or existing grants.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json \
//   node scripts/revoke-redemption-code.mjs --code FELLOW-JAN
//
// Optional:
//   --expire 2026-05-01  Set codeExpiresAt instead of hard-killing.
//                         Lets people finish redeeming until that date.

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = val;
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const code = String(args.code || '').toUpperCase();

  if (!code || !/^[A-Z0-9-]{4,20}$/.test(code)) {
    die('--code is required (4-20 uppercase alphanumeric + hyphen)');
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    die('GOOGLE_APPLICATION_CREDENTIALS env var must point at a service-account JSON');
  }

  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let projectId;
  try {
    projectId = JSON.parse(readFileSync(saPath, 'utf8')).project_id;
  } catch {
    die('Could not read project_id from service-account JSON');
  }
  console.log(`\nTarget project: ${projectId}`);
  console.log(`Action: REVOKE code "${code}"`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) =>
    rl.question(`Type the project ID to confirm: `, resolve)
  );
  rl.close();
  if (answer.trim() !== projectId) {
    console.error('Aborted: project ID did not match.');
    process.exit(1);
  }

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();

  const ref = db.doc(`redemptionCodes/${code}`);
  const snap = await ref.get();

  if (!snap.exists) {
    die(`redemptionCodes/${code} does not exist.`);
  }

  const data = snap.data();
  console.log(`Found: ${code} (plan=${data.plan}, uses=${data.useCount}/${data.maxUses}, active=${data.active})`);

  const update = {
    revokedAt: new Date().toISOString(),
    revokedBy: 'admin-script',
  };

  if (args.expire) {
    const d = new Date(args.expire);
    if (isNaN(d.getTime())) die(`--expire value "${args.expire}" is not a valid date`);
    update.codeExpiresAt = d.toISOString();
    console.log(`Setting codeExpiresAt = ${update.codeExpiresAt} (code stays active until then)`);
  } else {
    update.active = false;
    console.log('Setting active = false (immediate kill)');
  }

  await ref.update(update);
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
