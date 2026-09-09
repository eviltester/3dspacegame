import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** npm prepare installs the versioned hook, including in linked worktrees. */
export function installHooks(root: string): void {
  // An exported source archive must not change an unrelated parent repository.
  if (!existsSync(join(root, '.git'))) return;
  const configured = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8' });
  if (configured.error) throw configured.error;
  if (configured.status !== 0 && configured.status !== 1) throw new Error('Cannot read Git hook configuration.');
  const hooksPath = configured.stdout.trim();
  if (hooksPath && hooksPath !== '.githooks') {
    throw new Error(`Existing Git hooks at ${hooksPath}. Integrate npm run check:commit there before committing.`);
  }
  chmodSync(join(root, '.githooks/pre-commit'), 0o755);
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root });
}
