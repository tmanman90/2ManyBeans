// Mint a redemption code document via Firebase Admin SDK.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json \
//   node scripts/create-redemption-code.mjs \
//     --code FRIEND-ABC123 \
//     --plan pro_1year \
//     --days 365 \
//     --max-uses 1 \
//     --notes "Friend: Dave"
//
// Required env:
//   GOOGLE_APPLICATION_CREDENTIALS — points at a local service-account JSON.
//
// Uses ref.create() (not set) so minting a duplicate code name throws
// instead of silently resetting useCount to 0.

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_PLANS = new Set(['pro_1week', 'pro_1year']);
const CODE_RE = /^[A-Z0-9-]{4,20}$/;

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

function usage(msg) {
  if (msg) console.error(`Error: ${msg}\n`);
  console.error(
    `Usage:
  node scripts/create-redemption-code.mjs \\
    --code FRIEND-ABC123 \\
    --plan pro_1year \\
    --days 365 \\
    --max-uses 1 \\
    --notes "Friend: Dave"

Flags:
  --code       Uppercase alphanumeric + hyphen, 4-20 chars
  --plan       pro_1week | pro_1year
  --days       Duration in days (positive integer)
  --max-uses   Max redemptions before exhausted (positive integer)
  --notes      Free-form context string (optional)
`
  );
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv);

  const code = String(args.code || '').toUpperCase();
  const plan = String(args.plan || '');
  const days = Number(args.days);
  const maxUses = Number(args['max-uses']);
  const notes = args.notes ? String(args.notes) : '';

  if (!CODE_RE.test(code)) {
    usage('--code must be 4-20 uppercase alphanumeric + hyphen characters');
  }
  if (!ALLOWED_PLANS.has(plan)) {
    usage(`--plan must be one of: ${[...ALLOWED_PLANS].join(', ')}`);
  }
  if (!Number.isInteger(days) || days <= 0) {
    usage('--days must be a positive integer');
  }
  if (!Number.isInteger(maxUses) || maxUses <= 0) {
    usage('--max-uses must be a positive integer');
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    usage('GOOGLE_APPLICATION_CREDENTIALS env var must point at a service-account JSON');
  }

  // Show which project we're about to write to and require confirmation.
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  let projectId;
  try {
    projectId = JSON.parse(readFileSync(saPath, 'utf8')).project_id;
  } catch {
    usage('Could not read project_id from service-account JSON');
  }
  console.log(`\nTarget project: ${projectId}`);
  console.log(`Action: CREATE code "${code}" (${plan}, ${days}d, max ${maxUses} uses)`);
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
  const doc = {
    code,
    plan,
    durationDays: days,
    maxUses,
    useCount: 0,
    active: true,
    codeExpiresAt: null,
    notes,
    createdAt: new Date().toISOString(),
    createdBy: 'admin-script',
  };

  try {
    await ref.create(doc);
  } catch (err) {
    if (err.code === 6 || /already exists/i.test(err?.message || '')) {
      console.error(`Error: redemptionCodes/${code} already exists. Pick a different code.`);
      process.exit(2);
    }
    throw err;
  }

  console.log(`Created redemptionCodes/${code}:`);
  console.log(JSON.stringify(doc, null, 2));
  console.log(
    `\nSummary: ${plan} for ${days} days, up to ${maxUses} redemption${maxUses === 1 ? '' : 's'}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
