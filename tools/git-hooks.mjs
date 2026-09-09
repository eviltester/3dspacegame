import { checkCommit } from './check-commit.ts';
import { installHooks } from './install-hooks.ts';

try {
  if (process.argv[2] === 'install') installHooks(process.cwd());
  else process.exitCode = checkCommit(process.cwd(), process.env.npm_execpath ?? '');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
