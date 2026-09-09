import * as childProcess from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { checkCommit, removeSnapshot } from './check-commit';
import { installHooks } from './install-hooks';

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawnSync: vi.fn(actual.spawnSync) };
});

const project = resolve(import.meta.dirname, '..');
let fixture: string;

function git(...args: string[]): string {
  return childProcess.execFileSync('git', args, { cwd: fixture, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(file: string, text: string): void {
  const path = join(fixture, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

// Tiny repositories exercise real index export and hook invocation without running
// the whole game suite recursively or creating any commits in the game repository.
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'space-hook-test-'));
  git('init', '--quiet');
  git('config', 'user.name', 'Coverage Test');
  git('config', 'user.email', 'coverage@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', '.githooks');
  write('.gitignore', 'node_modules/\nnpm-fixture.mjs\n');
  write('package.json', JSON.stringify({ type: 'module', scripts: {
    'test:coverage': 'node coverage-fixture.mjs',
    'check:commit': 'node tools/git-hooks.mjs check'
  } }));
  write('package-lock.json', '{"lockfileVersion":3}');
  write('coverage-fixture.mjs', 'process.exitCode = 0;\n');
  write('node_modules/sentinel.txt', 'Do not delete installed dependencies.');
  write('npm-fixture.mjs', `
    import assert from 'node:assert/strict';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';
    assert.deepEqual(process.argv.slice(2), ['run', 'test:coverage']);
    assert.equal(process.env.GIT_INDEX_FILE, undefined);
    await import(pathToFileURL(resolve('coverage-fixture.mjs')).href);
  `);
  git('add', '.');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (dirname(resolve(fixture)) !== resolve(tmpdir())) throw new Error('Unsafe fixture cleanup.');
  rmSync(fixture, { recursive: true, force: true });
});

describe('staged coverage guard', () => {
  it('passes staged coverage, cleans its snapshot and preserves installed dependencies', () => {
    write('coverage-fixture.mjs', 'process.exitCode = 9;'); // Unstaged changes do not affect this commit.
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(0);
    expect(readFileSync(join(fixture, 'node_modules/sentinel.txt'), 'utf8')).toContain('Do not delete');
    expect(readFileSync(join(fixture, 'coverage-fixture.mjs'), 'utf8')).toContain('9');
    expect(git('show', ':coverage-fixture.mjs')).toContain('0');
  });

  it('fails staged coverage even when the working copy has a passing fix', () => {
    write('coverage-fixture.mjs', 'process.exitCode = 7;');
    git('add', 'coverage-fixture.mjs');
    write('coverage-fixture.mjs', 'process.exitCode = 0;');
    const before = git('status', '--porcelain');
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(7);
    expect(git('status', '--porcelain')).toBe(before);
    expect(git('show', ':coverage-fixture.mjs')).toContain('7');
    expect(readFileSync(join(fixture, 'coverage-fixture.mjs'), 'utf8')).toContain('0');
  });

  it('cannot use untracked tests to cover staged changes', () => {
    write('coverage-fixture.mjs', "import { existsSync } from 'node:fs'; process.exitCode = existsSync('new-test.ts') ? 0 : 8;");
    git('add', 'coverage-fixture.mjs');
    write('new-test.ts', '// This test has not been staged.');
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(8);
  });

  it('honours an alternate commit index without passing it to test subprocesses', () => {
    const alternate = join(fixture, '.git/alternate-index');
    cpSync(join(fixture, '.git/index'), alternate);
    write('coverage-fixture.mjs', 'process.exitCode = 6;');
    vi.stubEnv('GIT_INDEX_FILE', alternate);
    git('add', 'coverage-fixture.mjs');
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(6);
    vi.unstubAllEnvs();
    expect(git('show', ':coverage-fixture.mjs')).toContain('0');
  });

  it('fails closed when npm or dependencies are unavailable', () => {
    expect(() => checkCommit(fixture, '')).toThrow('npm run check:commit');
    expect(() => checkCommit(fixture, join(fixture, 'missing-npm'))).toThrow('npm run check:commit');
    const modules = resolve(fixture, 'node_modules');
    if (dirname(modules) !== resolve(fixture)) throw new Error('Unsafe dependency fixture path.');
    rmSync(modules, { recursive: true });
    expect(() => checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toThrow('npm ci');
  });

  it('rejects dependency differences but accepts lockfile whitespace differences', () => {
    write('package-lock.json', '{"lockfileVersion":2}');
    expect(() => checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toThrow('Staged dependency lock differs');
    write('package-lock.json', '{\n  "lockfileVersion": 3\n}\n');
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(0);
  });

  it('propagates process launch errors and treats interrupted checks as failures', () => {
    const spawn = vi.mocked(childProcess.spawnSync);
    spawn.mockReturnValueOnce({ pid: 0, output: [], stdout: '', stderr: '', status: null, signal: null, error: new Error('Cannot launch npm') });
    expect(() => checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toThrow('Cannot launch npm');
    spawn.mockReturnValueOnce({ pid: 0, output: [], stdout: '', stderr: '', status: null, signal: 'SIGTERM' });
    expect(checkCommit(fixture, join(fixture, 'npm-fixture.mjs'))).toBe(1);
  });

  it('refuses cleanup outside its own temporary snapshot directory', () => {
    expect(() => removeSnapshot(fixture)).toThrow('Refusing to remove');
    expect(() => removeSnapshot(join(fixture, 'space-coverage-other'))).toThrow('Refusing to remove');
    expect(existsSync(join(fixture, 'package.json'))).toBe(true);
  });
});

describe('installed pre-commit hook', () => {
  function copyHook(): void {
    cpSync(join(project, '.githooks'), join(fixture, '.githooks'), { recursive: true });
    mkdirSync(join(fixture, 'tools'), { recursive: true });
    for (const file of ['git-hooks.mjs', 'install-hooks.ts', 'check-commit.ts']) {
      cpSync(join(project, 'tools', file), join(fixture, 'tools', file));
    }
  }

  it('installs idempotently and skips source archives outside their own repository', () => {
    copyHook();
    git('config', '--unset', 'core.hooksPath');
    installHooks(fixture);
    installHooks(fixture);
    expect(git('config', '--get', 'core.hooksPath')).toBe('.githooks');
    const archive = join(fixture, 'archive');
    mkdirSync(archive);
    installHooks(archive);
    expect(git('config', '--get', 'core.hooksPath')).toBe('.githooks');
  });

  it('does not overwrite another hook installation', () => {
    git('config', 'core.hooksPath', 'company-hooks');
    expect(() => installHooks(fixture)).toThrow('Existing Git hooks');
    expect(git('config', '--get', 'core.hooksPath')).toBe('company-hooks');
  });

  it('reports Git configuration errors instead of claiming the hook was installed', () => {
    const spawn = vi.mocked(childProcess.spawnSync);
    spawn.mockReturnValueOnce({ pid: 0, output: [], stdout: '', stderr: '', status: null, signal: null, error: new Error('Git missing') });
    expect(() => installHooks(fixture)).toThrow('Git missing');
    spawn.mockReturnValueOnce({ pid: 0, output: [], stdout: '', stderr: '', status: 2, signal: null });
    expect(() => installHooks(fixture)).toThrow('Cannot read Git hook');
  });

  it('blocks an actual commit on failed coverage and allows it once staged coverage passes', () => {
    copyHook();
    installHooks(fixture);
    write('coverage-fixture.mjs', 'process.exitCode = 1;');
    git('add', '.');
    expect(() => git('commit', '--quiet', '-m', 'Must fail')).toThrow();
    expect(() => git('rev-parse', '--verify', 'HEAD')).toThrow();
    write('coverage-fixture.mjs', 'process.exitCode = 0;');
    git('add', 'coverage-fixture.mjs');
    git('commit', '--quiet', '-m', 'Coverage passed');
    expect(git('log', '-1', '--format=%s')).toBe('Coverage passed');
  }, 15_000);

  it.runIf(process.platform === 'win32')('uses native npm when the POSIX npm launcher cannot start Bash', () => {
    copyHook(); installHooks(fixture);
    // Reproduce a broken npm shell shim without starting WSL or changing the
    // installed Node/npm. Git must use npm.cmd, which invokes node.exe directly.
    const bin = join(fixture, 'broken launchers');
    write('broken launchers/npm', '#!/bin/sh\necho "POSIX npm launcher could not start Bash" >&2\nexit 88\n');
    chmodSync(join(bin, 'npm'), 0o755);
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`);
    git('add', '.');
    git('commit', '--quiet', '-m', 'Native npm passed');
    expect(git('log', '-1', '--format=%s')).toBe('Native npm passed');
  }, 15_000);
});
