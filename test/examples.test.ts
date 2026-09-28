import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from '../src/core';

/**
 * Pins the exact output of every macro in examples/, so escaping or layout changes show up as
 * snapshot diffs. Examples that reproduce a handcrafted macro are also checked in golden.test.ts.
 */
const cases = readdirSync('examples')
  .filter((f) => f.endsWith('.r20.yaml'))
  .flatMap((file) => {
    const example = file.replace('.r20.yaml', '');
    return compile(readFileSync(`examples/${file}`, 'utf8')).macros.map(
      (m) => [`${example}.${m.name}`, m] as const,
    );
  });

describe('example output', () => {
  it.each(cases)('%s', async (id, m) => {
    expect(m.output, `${id} failed to build`).toBeDefined();
    await expect(m.output).toMatchFileSnapshot(`examples/__snapshots__/${id}.roll`);
  });

  it('cantrips: toll-the-dead puts the query inside the nested dice roll, unescaped', () => {
    const m = cases.find(([id]) => id === 'cantrips.toll-the-dead')![1];
    expect(m.output).toBe(
      '&{template:5eDefault} {{character_name=@{character_name}}} {{subheader=@{character_name}}} ' +
        '{{title=Toll the Dead}} {{subheaderright=Necromancy cantrip · 60 ft}} ' +
        '{{freetextname=Wisdom save DC [[@{spell_save_dc}]]}} ' +
        '{{freetext=On a failed save the target takes ' +
        '[[ [[floor((@{level}+1)/6)+1]]d?{Is the target missing any hit points?|No (d8),8|Yes (d12),12} ]] ' +
        'necrotic damage.}}',
    );
  });
});
