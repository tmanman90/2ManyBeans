// Read-only inspection of redemption codes and ledger entries.
//
// Usage:
//   GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccountKey.json \
//   node scripts/list-redemption-codes.mjs              # list all codes
//   node scripts/list-redemption-codes.mjs --code FOO   # deep inspect one code + who redeemed it

import { readFileSync } from 'fs';
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
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    die('GOOGLE_APPLICATION_CREDENTIALS env var must point at a service-account JSON');
  }

  // Read-only, so no typed confirmation needed, but still show which
  // project we're reading from so you don't confuse dev vs prod.
  try {
    const projectId = JSON.parse(
      readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
    ).project_id;
    console.log(`Reading from project: ${projectId}\n`);
  } catch { /* best-effort */ }

  if (getApps().length === 0) {
    initializeApp({ credential: applicationDefault() });
  }
  const db = getFirestore();

  const args = parseArgs(process.argv);

  if (args.code) {
    await inspectCode(db, String(args.code).toUpperCase());
  } else {
    await listAll(db);
  }
}

async function listAll(db) {
  const snap = await db.collection('redemptionCodes').get();

  if (snap.empty) {
    console.log('No redemption codes found.');
    return;
  }

  // Header
  console.log(
    pad('CODE', 22) +
      pad('PLAN', 12) +
      pad('USES', 10) +
      pad('ACTIVE', 8) +
      pad('EXPIRES', 22) +
      'NOTES'
  );
  console.log('-'.repeat(90));

  snap.docs.forEach((doc) => {
    const d = doc.data();
    const uses = `${d.useCount ?? 0}/${d.maxUses ?? '?'}`;
    const expires = d.codeExpiresAt || '-';
    const active = d.active ? 'yes' : 'NO';
    console.log(
      pad(doc.id, 22) +
        pad(d.plan || '-', 12) +
        pad(uses, 10) +
        pad(active, 8) +
        pad(expires, 22) +
        (d.notes || '')
    );
  });

  console.log(`\n${snap.size} code(s) total.`);
}

async function inspectCode(db, code) {
  const codeSnap = await db.doc(`redemptionCodes/${code}`).get();
  if (!codeSnap.exists) {
    die(`redemptionCodes/${code} does not exist.`);
  }

  console.log(`\n=== Code: ${code} ===`);
  console.log(JSON.stringify(codeSnap.data(), null, 2));

  // Find ledger entries for this code
  const ledgerSnap = await db
    .collection('redemptionLedger')
    .where('code', '==', code)
    .get();

  if (ledgerSnap.empty) {
    console.log('\nNo redemptions yet.');
    return;
  }

  console.log(`\n=== ${ledgerSnap.size} redemption(s) ===`);
  ledgerSnap.docs.forEach((doc) => {
    const d = doc.data();
    console.log(`  uid=${d.uid}  plan=${d.plan}  at=${d.redeemedAt}`);
  });
}

function pad(str, len) {
  const s = String(str);
  return s.length >= len ? s + ' ' : s + ' '.repeat(len - s.length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
