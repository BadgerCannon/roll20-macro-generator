import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compile } from '../../src/core';

/** Codes reported for a macro whose body is `body` (YAML-quoted). */
const codes = (body: string, extra = '') => {
  const r = compile(`macros:\n  m:\n${extra}    body: ${JSON.stringify(body)}\n`);
  return [...r.diagnostics, ...r.macros.flatMap((m) => m.diagnostics)].map((d) => d.code);
};

describe('lint rules', () => {
  it('duplicate-option-label: catches the handcrafted Guiding Bolt bug', () => {
    const raw = readFileSync('Handcrafted_macros/Guiding bolt at level template.roll', 'utf8');
    expect(codes(raw.replace(/\r\n/g, '\n'))).toContain('duplicate-option-label');
  });

  it('conflicting-query', () => {
    expect(codes('[[?{Mod|0}]] [[?{Mod|1}]]')).toContain('conflicting-query');
    expect(codes('[[?{Mod|0}]] [[?{Mod|0}]]')).not.toContain('conflicting-query');
  });

  it('space-after-comma', () => {
    expect(codes('?{Attack|Just roll, /r d20+5|Other,x}')).toContain('space-after-comma');
    expect(codes('?{Attack|Just roll,/r d20+5|Other,x}')).not.toContain('space-after-comma');
  });

  it('macro-call-space', () => {
    expect(codes('?{Which?|Attack,#use-sword|Defend,#use-shield }')).toContain('macro-call-space');
    expect(codes('?{Which?|Attack,#use-sword |Defend,#use-shield }')).not.toContain(
      'macro-call-space',
    );
  });

  it('template-leading-space', () => {
    expect(codes('&{template:default} {{ name=x}}')).toContain('template-leading-space');
  });

  it('template-with-roll', () => {
    expect(codes('/roll &{template:default} {{name=x}}')).toContain('template-with-roll');
  });

  it('template-newline', () => {
    expect(codes('&{template:default} {{name=x}}\n{{a=b}}')).toContain('template-newline');
    expect(codes('/me swings\n/roll 1d20')).not.toContain('template-newline');
  });

  it('target-max-label and bar-max', () => {
    expect(codes('[[@{target|HP|max}]]')).toContain('target-max-label');
    expect(codes('[[@{target|Foe|HP|max}]]')).not.toContain('target-max-label');
    expect(codes('[[@{selected|bar1_max}]]')).toContain('bar-max');
  });

  it('pre-escaped', () => {
    expect(codes('?{A|x,?{B&#124;1&#125;}')).toContain('pre-escaped');
  });

  it('entities-in-collection depends on target', () => {
    const body = '?{A|x,?{B|1|2}}';
    expect(codes(body)).toContain('entities-in-collection');
    expect(codes(body, '    target: ability\n')).not.toContain('entities-in-collection');
    const r = compile(`macros:\n  m:\n    target: collection\n    body: '${body}'\n`);
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({ severity: 'warning' });
  });

  it('yaml-comment-trap', () => {
    const r = compile('macros:\n  m:\n    body: /w gm #attack\n');
    expect(r.macros[0]!.output).toBe('/w gm');
    expect(r.diagnostics[0]).toMatchObject({ code: 'yaml-comment-trap', line: 3 });
  });
});

describe('examples are clean', () => {
  it.each(readdirSync('examples'))('%s has no errors or warnings', (f) => {
    const r = compile(readFileSync(`examples/${f}`, 'utf8'));
    const ds = [...r.diagnostics, ...r.macros.flatMap((m) => m.diagnostics)];
    expect(ds.filter((d) => d.severity !== 'info')).toEqual([]);
  });
});
