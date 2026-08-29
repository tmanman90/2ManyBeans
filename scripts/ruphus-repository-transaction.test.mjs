import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('proposal transaction completes all reads before revision and bean writes', async () => {
  const source = await readFile(new URL('../api/_lib/ruphusRepository.js', import.meta.url), 'utf8');
  const reads = source.indexOf('const [pairSnap, sessionSnap]');
  const writes = source.indexOf('tx.set(revisions.doc');
  assert.ok(reads >= 0, 'proposal transaction must read owner/session state');
  assert.ok(writes >= 0, 'proposal transaction must write revision state');
  assert.ok(reads < writes, 'Firestore transaction reads must precede writes');
  assert.match(source, /tx\.get\(pairQuery\)/);
  assert.match(source, /tx\.get\(sessionQuery\)/);
});
