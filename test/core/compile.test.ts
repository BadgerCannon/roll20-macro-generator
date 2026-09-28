import { describe, expect, it } from 'vitest';
import { compile, type Diagnostic } from '../../src/core';

const one = (src: string) => {
  const r = compile(src);
  expect(r.diagnostics).toEqual([]);
  expect(r.macros).toHaveLength(1);
  return r.macros[0]!;
};
const notInfo = (ds: Diagnostic[]) => ds.filter((d) => d.severity !== 'info');
const out = (src: string) => {
  const m = one(src);
  expect(notInfo(m.diagnostics)).toEqual([]);
  return m.output;
};

describe('compile', () => {
  it('renders a template with a chat prefix, vars and flags', () => {
    expect(
      out(`
vars: { who: Bron Ironhoof }
macros:
  save:
    chat: { whisper: gm }
    template: default
    noerror: true
    fields:
      name: '@{\${who}|character_name} saves'
      CON: '[[1d20 + @{\${who}|constitution_save_bonus}]]'
`),
    ).toBe(
      '/w gm &{template:default} &{noerror} {{name=@{Bron Ironhoof|character_name} saves}} {{CON=[[1d20 + @{Bron Ironhoof|constitution_save_bonus}]]}}',
    );
  });

  it('nests named queries inside choose options and escapes them', () => {
    expect(
      out(`
macros:
  check:
    queries:
      bonus: { prompt: Bonus, default: 0 }
    choose:
      prompt: Choose a Roll
      layout: compact
      options:
        - { label: STR, value: '/roll 1d20 + @{STR} + \${bonus}' }
        - { label: DEX, value: '/roll 1d20 + @{DEX} + \${bonus}' }
`),
    ).toBe(
      '?{Choose a Roll|STR,/roll 1d20 + @{STR} + ?{Bonus&#124;0&#125;|DEX,/roll 1d20 + @{DEX} + ?{Bonus&#124;0&#125;}',
    );
  });

  it('supports query option lists and maps', () => {
    expect(
      out(`
macros:
  atk:
    queries:
      adv: { prompt: Roll, options: { Normal: 1d20, Advantage: 2d20kh1 } }
      lvl: { prompt: Level, options: [1, 2, 3] }
    body: '[[\${adv} + \${lvl}]]'
`),
    ).toBe('[[?{Roll|Normal,1d20|Advantage,2d20kh1} + ?{Level|1|2|3}]]');
  });

  it('reuses named rolls as $[[n]] (kb: dice.md)', () => {
    expect(
      out(`
macros:
  missile:
    queries: { level: { prompt: Level cast at, options: [1, 2, 3] } }
    rolls: { dart: 1d4+1 }
    chat: emote
    body: hits with [[\${level}+2]] missiles. Total [[\${dart} * \${level}]]. Each does \${dart}.
`),
    ).toBe(
      '/em hits with [[?{Level cast at|1|2|3}+2]] missiles. Total [[[[1d4+1]] * ?{Level cast at|1|2|3}]]. Each does $[[0]].',
    );
  });

  it('generates options with for/overrides and inherits with extends', () => {
    const r = compile(`
macros:
  base:
    template: 5eDefault
    fields: { title: Bolt, weapon: 1, subheader: X }
    choose:
      prompt: Level
      for: { level: 1..3 }
      fields:
        subheaderright: Level \${level}
        weapondamage: '[[ [[\${level}+3]]d6 ]]'
      overrides:
        3: { label: Three, fields: { subheaderright: Max } }
  child:
    extends: base
    fields: { title: Child, subheader: null }
`);
    expect(notInfo(r.macros.flatMap((m) => m.diagnostics))).toEqual([]);
    expect(r.macros[1]!.output).toBe(
      '&{template:5eDefault} {{title=Child}} {{weapon=1}} ?{Level\n' +
        '|1,{{subheaderright=Level 1&#125;&#125; {{weapondamage=[[ [[1+3]]d6 ]]&#125;&#125;\n' +
        '|2,{{subheaderright=Level 2&#125;&#125; {{weapondamage=[[ [[2+3]]d6 ]]&#125;&#125;\n' +
        '|Three,{{subheaderright=Max&#125;&#125; {{weapondamage=[[ [[3+3]]d6 ]]&#125;&#125;\n}',
    );
  });

  it('expands loop items in place inside options', () => {
    expect(
      out(`
macros:
  m:
    choose:
      prompt: Action
      layout: compact
      options:
        - { label: Attack, value: atk }
        - for: { a: [Dash, Hide] }
          label: Cunning \${a}
          value: '\${a}!'
          overrides: { Hide: { value: shh } }
        - { separator: true }
        - for: { n: 1..2 }
          value: 'lvl \${n}'
`),
    ).toBe(
      '?{Action|Attack,atk|Cunning Dash,Dash!|Cunning Hide,shh|-----------------------|1,lvl 1|2,lvl 2}',
    );
  });

  it('keeps the top-level for shorthand after explicit options', () => {
    expect(
      out(`
macros:
  m:
    choose:
      prompt: P
      layout: compact
      options: [{ label: First, value: '0' }]
      for: { n: 1..2 }
      value: 'v\${n}'
`),
    ).toBe('?{P|First,0|1,v1|2,v2}');
  });

  it('puts a query inside a field value and avoids `}}}`', () => {
    expect(
      out(`
macros:
  wild:
    template: 5eDefault
    fields:
      title: Wild Surge
      freetext:
        choose:
          prompt: 'Rolled '
          for: { n: 1..2 }
          value: '**Rolled: \${n}** Take [[1d6]] damage, or not.'
`),
    ).toBe(
      '&{template:5eDefault} {{title=Wild Surge}} {{freetext=?{Rolled \n' +
        '|1,**Rolled: 1** Take [[1d6]] damage&#44; or not.\n' +
        '|2,**Rolled: 2** Take [[1d6]] damage&#44; or not.\n} }}',
    );
  });

  it('pads single-option drop-downs (kb: queries.md)', () => {
    expect(
      out(`
macros:
  m:
    choose:
      prompt: Spell
      layout: compact
      options: [{ label: Grease, value: slick }]
`),
    ).toBe('?{Spell|Grease,slick|,}');
  });

  it('renders separator options', () => {
    expect(
      out(`
macros:
  m:
    choose:
      prompt: Cure
      layout: compact
      options: [{ label: A, value: '1' }, { separator: true }, { label: B, value: '2' }]
`),
    ).toBe('?{Cure|A,1|-----------------------|B,2}');
  });

  it('renders buttons with deferred evaluation (kb: buttons.md)', () => {
    expect(
      out(`
macros:
  menu:
    template: default
    fields:
      name: Menu
      Actions:
        buttons:
          - { label: Init, ability: selected|INITIATIVE }
          - { label: HP, macro: NPC-HP }
          - { label: Hit, api: 'attack @{target|token_id} [[1d6+?{Bonus|0}]] a:b' }
`),
    ).toBe(
      '&{template:default} {{name=Menu}} {{Actions=[Init](~selected|INITIATIVE) [HP](!&#13;#NPC-HP) [Hit](!attack &#64;{target|token_id} &#91;[1d6+&#63;{Bonus|0}]&#93; a&#58;b)}}',
    );
  });

  it('escapes button targets placed inside a query option', () => {
    expect(
      out(`
macros:
  m:
    choose:
      prompt: Menu
      layout: compact
      options:
        - label: Init
          fields: { Go: { button: { label: Roll, ability: selected|INIT } } }
        - { label: None, value: '-' }
`),
    ).toBe('?{Menu|Init,{{Go=[Roll](~selected&#124;INIT)&#125;&#125;|None,-}');
  });

  it('accepts JSON input', () => {
    expect(out('{"macros": {"m": {"body": "/r 1d20"}}}')).toBe('/r 1d20');
  });
});

describe('variables', () => {
  it('interpolates vars inside vars, file and macro level', () => {
    expect(
      out(`
vars:
  level: '@{level}'
  dice: '[[floor((\${level}+1)/6)+1]]'
macros:
  m:
    vars: { beams: '\${dice}' }
    body: '\${beams} beams, [[ \${dice}d10 ]]'
`),
    ).toBe('[[floor((@{level}+1)/6)+1]] beams, [[ [[floor((@{level}+1)/6)+1]]d10 ]]');
  });

  it('reports variable cycles', () => {
    const r = compile("vars: { a: '${b}', b: '${a}' }\nmacros:\n  m: { body: '${a}' }\n");
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({ code: 'var-cycle', line: 1 });
  });
});

describe('compile diagnostics', () => {
  it('reports YAML syntax errors with a position', () => {
    const r = compile('macros:\n  m: [unclosed\n');
    expect(r.diagnostics[0]).toMatchObject({ severity: 'error', line: expect.any(Number) });
  });

  it('reports schema errors at the offending key', () => {
    const r = compile('macros:\n  m:\n    chat: shout\n');
    expect(r.diagnostics[0]).toMatchObject({ code: 'schema', line: 3 });
  });

  it('reports unknown ${names} at the string that uses them', () => {
    const r = compile('macros:\n  m:\n    body: hello ${nope}\n');
    expect(r.macros[0]!.output).toBeUndefined();
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({
      code: 'undefined-ref',
      macro: 'm',
      line: 3,
    });
  });

  it('reports extends cycles and query cycles', () => {
    const r = compile(`
macros:
  a: { extends: b }
  b: { extends: a }
  q:
    queries: { x: '\${y}', y: '\${x}' }
    body: \${x}
`);
    expect(r.macros.map((m) => m.diagnostics[0]?.code)).toEqual([
      'extends-cycle',
      'extends-cycle',
      'query-cycle',
    ]);
  });

  it('warns about overrides that match no loop value', () => {
    const r = compile(`
macros:
  m:
    choose:
      prompt: L
      for: { l: 1..2 }
      value: x
      overrides: { 9: { value: y } }
`);
    expect(r.macros[0]!.diagnostics.map((d) => d.code)).toEqual(['override-unused']);
    const item = compile(`
macros:
  m:
    choose:
      prompt: L
      options:
        - { for: { l: 1..2 }, value: x, overrides: { 9: { value: y } } }
`);
    expect(item.macros[0]!.diagnostics[0]).toMatchObject({
      code: 'override-unused',
      path: ['macros', 'm', 'choose', 'options', 0, 'overrides', '9'],
    });
  });

  it('reports parse problems in the expanded text', () => {
    const r = compile('macros:\n  m:\n    body: "[[1d20"\n');
    expect(r.macros[0]!.diagnostics.map((d) => d.code)).toEqual(['unclosed-roll']);
  });
});

describe('robustness (review fixes)', () => {
  it('does not resolve inherited object members as names', () => {
    const r = compile('macros:\n  m:\n    body: ${toString} ${constructor}\n');
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({ code: 'undefined-ref' });
    const e = compile('macros:\n  m: { extends: toString }\n');
    expect(e.macros[0]!.diagnostics[0]).toMatchObject({ code: 'unknown-macro' });
    const o = compile(`
macros:
  m:
    choose:
      prompt: P
      for: { x: [constructor, a] }
      value: v\${x}
`);
    expect(o.macros[0]!.output).toBe('?{P\n|constructor,vconstructor\n|a,va\n}');
  });

  it('caps for-loop ranges', () => {
    const r = compile(
      'macros:\n  m:\n    choose:\n      prompt: P\n      for: { n: 1..999999999 }\n      value: x\n',
    );
    expect(r.macros[0]!.output).toBeUndefined();
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({ code: 'choose-for' });
  });

  it('rejects the private-use marker characters', () => {
    const r = compile('macros:\n  m:\n    body: "a \\uE000 b"\n');
    expect(r.macros[0]!.diagnostics[0]).toMatchObject({ code: 'reserved-char' });
  });
});
