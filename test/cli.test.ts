import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (...args: string[]) => {
  try {
    const stdout = execFileSync('npx', ['tsx', 'src/cli/index.ts', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, stdout: err.stdout, stderr: err.stderr };
  }
};

describe('r20m CLI', () => {
  it('builds one macro', () => {
    const r = run('build', 'examples/basics.r20.yaml', '--macro', 'initiative', '-q');
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(
      '&{template:default} {{name=@{selected|token_name} Initiative}} {{Roll=[[1d20 + @{selected|initiative_bonus} &{tracker}]]}}',
    );
  });

  it('checks files and exits 1 on errors', () => {
    const r = run('check', 'test/fixtures/broken.r20.yaml');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/broken\.r20\.yaml:\d+:\d+: error unclosed-query/);
  }, 30_000);
});
