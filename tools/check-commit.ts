import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

/** Check the index, not the working tree: unstaged tests cannot rescue a bad commit. */
export function checkCommit(root: string, npmCli: string): number {
  if (!npmCli || !existsSync(npmCli)) throw new Error('Run this check with npm run check:commit.');
  if (!existsSync(join(root, 'node_modules'))) throw new Error('Install dependencies with npm ci before committing.');
  const snapshot = mkdtempSync(join(tmpdir(), 'space-coverage-'));
  try {
    // checkout-index honours Git's temporary index for commit -a as well as partial staging.
    // Nothing is stashed, staged or modified in the player's working copy.
    execFileSync('git', ['checkout-index', '--all', `--prefix=${snapshot.replaceAll('\\', '/')}/`], { cwd: root });
    const stagedLock: unknown = JSON.parse(readFileSync(join(snapshot, 'package-lock.json'), 'utf8'));
    const workingLock: unknown = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    if (!isDeepStrictEqual(stagedLock, workingLock)) {
      throw new Error('Staged dependency lock differs from the working copy. Align dependencies and run npm ci before committing.');
    }
    symlinkSync(join(root, 'node_modules'), join(snapshot, 'node_modules'), 'junction');
    // Tests may themselves use Git fixtures. Do not leak the real commit's index into them.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
    console.log('Checking staged files with the same coverage thresholds as CI...');
    const result = spawnSync(process.execPath, [npmCli, 'run', 'test:coverage'], { cwd: snapshot, env, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    removeSnapshot(snapshot);
  }
}

/** Delete only our direct temporary child, unlinking rather than following junctions. */
export function removeSnapshot(snapshot: string): void {
  if (dirname(resolve(snapshot)) !== resolve(tmpdir()) || !basename(snapshot).startsWith('space-coverage-')) {
    throw new Error('Refusing to remove an unexpected coverage snapshot path.');
  }
  rmSync(snapshot, { recursive: true, force: true });
}
