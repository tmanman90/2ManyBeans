// isMain(import.meta.url): true when this module is the script node was started with.
//
// Replaces `import.meta.url === \`file://${process.argv[1]}\`` and the `resolve(process.argv[1])` forms.
// Node gives import.meta.url as the REAL path but argv[1] as typed, and resolve() does not follow symlinks,
// so those guards skipped main (exit 0, no output) when a script was started by an absolute path through a
// symlink. Compare real paths instead.
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function isMain(url, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return realpathSync(fileURLToPath(url)) === realpathSync(argv1);
  } catch {
    return false;
  }
}
