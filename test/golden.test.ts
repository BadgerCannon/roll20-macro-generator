import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/core';

/** Whitespace-insensitive: layout differs, content, order and escaping must not. */
const squash = (s: string) => s.replace(/\s+/g, '');

const goldens = readdirSync('test/golden').filter((f) => f.endsWith('.roll'));

describe('examples reproduce the handcrafted macros', () => {
  it.each(goldens)('%s', async (file) => {
    const [example, macro] = file.replace(/\.roll$/, '').split('.');
    const result = compile(readFileSync(`examples/${example}.r20.yaml`, 'utf8'));
    expect(result.diagnostics).toEqual([]);
    const m = result.macros.find((x) => x.name === macro);
    expect(m, `macro ${macro} in examples/${example}.r20.yaml`).toBeDefined();
    expect(m!.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(squash(m!.output!)).toBe(squash(readFileSync(`test/golden/${file}`, 'utf8')));
    await expect(m!.output).toMatchFileSnapshot(`golden/__snapshots__/${file}`);
  });
});
