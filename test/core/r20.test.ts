import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse, rollDefMarker, rollReuseMarker } from '../../src/core/r20/parse';
import { encodeChar, render } from '../../src/core/r20/render';

const r = (src: string) => {
  const { nodes, problems } = parse(src);
  expect(problems).toEqual([]);
  return render(nodes);
};
const out = (src: string) => r(src).text;

describe('encodeChar (kb: html-entities.md nesting table)', () => {
  it.each([
    ['|', 0, '|'],
    ['|', 1, '&#124;'],
    ['}', 2, '&amp;#125;'],
    [',', 3, '&amp;amp;#44;'],
    ['x', 2, 'x'],
  ])('%s at level %i', (c, level, expected) => {
    expect(encodeChar(c, level)).toBe(expected);
  });
});

describe('round trip: text without nesting is unchanged', () => {
  it.each([
    '/r 1d20 + 5',
    '/em got [[1d20+2[dexterity]+2[init class bonus] &{tracker}]] in initiative.',
    '&{template:default} {{name=Test Attack}} {{attack=[[1d20]]}} {{damage=[[2d6]]}}',
    '/roll 1d20 + ?{Choose an Attack|\n   Melee,3[STR] |\n   Ranged,2[DEX] |\n   Magic,1[INT] }',
    '?{Which macro?|Attack,#use-sword |Defend,#use-shield }',
    '&{template:default} [[ [[1d20]] + [[1d6]] + [[6]] ]] {{name=My Attack}} {{$[[0]] + $[[1]] + $[[2]]==$[[3]]}}',
    '/r @{selected|customskill1}d6[@{selected|customskill1name}] + @{selected|str}[str]',
    '[[ [[ {10, @{CasterLevel} }kl1 ]]d6 ]]',
    '/me strikes out at @{target|foe|character_name}!\n**To Hit**: [[1d20+3]] vs. @{target|foe|npc_AC} AC',
    '[[1t[table-name]]]',
    '[Attack Roll](!attackroll &#64;{target|token_id} &#91;[1d6+&#63;{Bonus|0}]&#93;)',
  ])('%s', (src) => {
    expect(out(src)).toBe(src);
  });
});

describe('nested query escaping (kb: queries.md)', () => {
  it('escapes an inner query (wiki "Choose a Roll")', () => {
    const natural =
      '?{Choose a Roll|\n  STR,/roll 1d20 + 3 + (?{Modifier|0}) |\n  DEX,/roll 1d20 + 2 + (?{Modifier|0}) |\n  CON,/roll 1d20 + 1 + (?{Modifier|0}) }';
    expect(out(natural)).toBe(
      '?{Choose a Roll|\n  STR,/roll 1d20 + 3 + (?{Modifier&#124;0&#125;) |\n  DEX,/roll 1d20 + 2 + (?{Modifier&#124;0&#125;) |\n  CON,/roll 1d20 + 1 + (?{Modifier&#124;0&#125;) }',
    );
  });

  it('escapes two nesting levels (wiki "Nesting Queries")', () => {
    const natural = `?{Name of Query|
   Label 1,?{value1|
      Label 1A,?{value1A|
         Label 1Ai, value1Ai |
         Label 1Aii, value1Aii
      } |
      Label 1B,?{value1B|
         Label 1Bi, value1Bi |
         Label 1Bii, value1Bii
      }
   } |
   Label 2,?{value2|value2}
}`;
    expect(out(natural)).toBe(`?{Name of Query|
   Label 1,?{value1&#124;
      Label 1A&#44;?{value1A&amp;#124;
         Label 1Ai&amp;#44; value1Ai &amp;#124;
         Label 1Aii&amp;#44; value1Aii
      &amp;#125; &#124;
      Label 1B&#44;?{value1B&amp;#124;
         Label 1Bi&amp;#44; value1Bi &amp;#124;
         Label 1Bii&amp;#44; value1Bii
      &amp;#125;
   &#125; |
   Label 2,?{value2&#124;value2&#125;
}`);
  });

  it('never escapes attribute and ability calls', () => {
    expect(out('?{A|x,?{B|@{target|token_name}|%{bob|atk}}}')).toBe(
      '?{A|x,?{B&#124;@{target|token_name}&#124;%{bob|atk}&#125;}',
    );
  });

  it('escapes template fields and prose commas injected by an option', () => {
    expect(out('?{Bonus|Dash,{{title=Dash}} {{freetext=Move, then act}}}')).toBe(
      '?{Bonus|Dash,{{title=Dash&#125;&#125; {{freetext=Move&#44; then act&#125;&#125;}',
    );
  });

  it('escapes grouped-roll commas and braces inside an option', () => {
    expect(out('?{Cure|CLW,[[1d8+ {5, @{level} }kl1 ]]}')).toBe(
      '?{Cure|CLW,[[1d8+ {5&#44; @{level} &#125;kl1 ]]}',
    );
  });

  it('keeps prompt commas at the enclosing level', () => {
    expect(out('?{Main:0, Second:1, or Third:2 attack?|0}')).toBe(
      '?{Main:0, Second:1, or Third:2 attack?|0}',
    );
    expect(out('?{A|x,?{Pick one, please|1}}')).toBe('?{A|x,?{Pick one&#44; please&#124;1&#125;}');
  });

  it('separates a query closing brace from a following field brace', () => {
    expect(out('{{freetext=?{Rolled |1,one|2,two}}}')).toBe('{{freetext=?{Rolled |1,one|2,two} }}');
  });
});

describe('named roll reuse (kb: dice.md)', () => {
  it('numbers the deepest rolls first', () => {
    const src = `/em hits with [[?{Level|1|2}+2]] missiles. Total: [[${rollDefMarker('dart')}[[1d4+1]] * ?{Level}]] Each does ${rollReuseMarker('dart')} force damage.`;
    expect(out(src)).toBe(
      '/em hits with [[?{Level|1|2}+2]] missiles. Total: [[[[1d4+1]] * ?{Level}]] Each does $[[0]] force damage.',
    );
  });

  it('numbers per chat message (line)', () => {
    const src = `[[1d6]]\n${rollDefMarker('a')}[[1d20]] ${rollReuseMarker('a')}`;
    expect(out(src)).toBe('[[1d6]]\n[[1d20]] $[[0]]');
  });

  it('rejects reuse inside a roll', () => {
    const { problems } = r(`${rollDefMarker('a')}[[1d20]] [[${rollReuseMarker('a')}+1]]`);
    expect(problems.map((p) => p.code)).toContain('reuse-in-roll');
  });

  it('warns when query options contain rolls', () => {
    const { problems } = r(
      `?{A|x,[[1d4]]|y,[[1d6]]} ${rollDefMarker('a')}[[1d20]] ${rollReuseMarker('a')}`,
    );
    expect(problems.map((p) => p.code)).toEqual(['reuse-unstable']);
  });
});

describe('parse problems', () => {
  it('reports unclosed constructs', () => {
    expect(parse('?{A|b').problems.map((p) => p.code)).toEqual(['unclosed-query']);
    expect(parse('[[1d20').problems.map((p) => p.code)).toEqual(['unclosed-roll']);
    expect(parse('@{a|b').problems.map((p) => p.code)).toEqual(['unclosed-call']);
  });
});

describe('round trip: pre-escaped macros pass through unchanged', () => {
  it.each([
    'Bron_wildtable.roll',
    'Guiding bolt at level template.roll',
    'Healing at level.roll',
    'IrisBonus.roll',
  ])('Handcrafted_macros/%s', (f) => {
    const src = readFileSync(`Handcrafted_macros/${f}`, 'utf8').replace(/\r\n/g, '\n');
    expect(out(src)).toBe(src);
  });

  it('Pathfinder "EarthBreaker" (pre-escaped nested queries)', () => {
    const src =
      '&{template:pf_attack} {{color=blue}} ?{Attack Type:\n| Vital Strike, {{name=VitalStrike EarthBreaker +1 &#125;&#125; {{attack=[[1d20 + @{attk-melee} + 3[F.FOCUS] + 1[ENCHANT] + ?{Misc.Attack&#124;0&#125;[MISC] ]] vs AC &#125;&#125;\n| Full-Round, {{name=FullRound &#125;&#125;\n}';
    expect(out(src)).toBe(src);
    const q = parse(src).nodes.find((n) => n.k === 'query');
    expect(q?.k === 'query' && q.options.length).toBe(2);
  });
});
