// scripts/is-main.mjs: main must run when a script is started by an ABSOLUTE path through a symlink
// (import.meta.url is the real path, argv[1] is as typed), and no script may keep the old guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './is-main.mjs';

const HELPER = fileURLToPath(new URL('./is-main.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../', import.meta.url));

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'is-main-')));
  const real = join(root, 'real');
  mkdirSync(real);
  copyFileSync(HELPER, join(real, 'is-main.mjs'));
  writeFileSync(join(real, 'script.mjs'),
    "import { isMain } from './is-main.mjs';\nif (isMain(import.meta.url)) console.log('MAIN RAN');\n");
  writeFileSync(join(real, 'importer.mjs'), "import './script.mjs';\n");
  symlinkSync(real, join(root, 'link'));
  return root;
}
const run = (file) => spawnSync(process.execPath, [file], { encoding: 'utf8' });

test('runs main by absolute path through a symlinked folder', () => {
  const root = fixture();
  try { assert.match(run(join(root, 'link', 'script.mjs')).stdout, /MAIN RAN/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('runs main by real path and by relative path', () => {
  const root = fixture();
  try {
    assert.match(run(join(root, 'real', 'script.mjs')).stdout, /MAIN RAN/);
    const r = spawnSync(process.execPath, ['script.mjs'], { cwd: join(root, 'link'), encoding: 'utf8' });
    assert.match(r.stdout, /MAIN RAN/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('does not run main when only imported', () => {
  const root = fixture();
  try { assert.doesNotMatch(run(join(root, 'link', 'importer.mjs')).stdout, /MAIN RAN/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test('isMain is false with no argv[1] or a missing path', () => {
  assert.equal(isMain(pathToFileURL(HELPER).href, undefined), false);
  assert.equal(isMain(pathToFileURL(HELPER).href, '/no/such/file.mjs'), false);
});

test('no script keeps an old symlink-unsafe main guard', () => {
  const r = spawnSync('git', ['-C', REPO, 'grep', '-nE', '--untracked',
    'import\\.meta\\.url[[:space:]]*===[[:space:]]*(new URL\\()?[`]file://\\$\\{process\\.argv\\[1\\]\\}|resolve\\(process\\.argv\\[1\\]( \\|\\| \'\')?\\)',
    '--', '*.mjs', '*.js', ':!*/node_modules/*', ':!scripts/is-main.mjs', ':!scripts/is-main.test.mjs'], { encoding: 'utf8' });
  assert.equal(r.status, 1, `old main guard still present:\n${r.stdout}${r.stderr}`);
});
