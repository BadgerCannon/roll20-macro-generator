import { describe, expect, it } from 'vitest';
import { evaluate, ExprError, interpolate } from '../../src/core/expr';

const vars: Record<string, string | number> = {
  level: 3,
  char: 'Alveriel',
  'bron-dc': 14,
  n: '2',
};
const res = (k: string) => vars[k];

describe('evaluate', () => {
  it.each([
    ['level', 3],
    ['level + 3', 6],
    ['level*2 - 1', 5],
    ['(level + 1) * 2', 8],
    ['-level', -3],
    ['n + 1', 3],
    ['floor(7 / 2)', 3],
    ['max(level, 5)', 5],
    ['bron-dc', 14],
    ['bron-dc-1', 13],
    ['char', 'Alveriel'],
  ])('%s → %s', (src, expected) => {
    expect(evaluate(src, res)).toBe(expected);
  });

  it('rejects unknown names and bad types', () => {
    expect(() => evaluate('nope', res)).toThrow(ExprError);
    expect(() => evaluate('char + 1', res)).toThrow(/not a number/);
    expect(() => evaluate('1 +', res)).toThrow(/end/);
    expect(() => evaluate('1 2', res)).toThrow(/trailing/);
  });
});

describe('interpolate', () => {
  it('replaces expressions and keeps Roll20 syntax', () => {
    expect(interpolate('@{${char}|wisdom_mod} [[ [[${level}+3]]d6 ]]', res)).toBe(
      '@{Alveriel|wisdom_mod} [[ [[3+3]]d6 ]]',
    );
  });
  it('supports $${ as a literal', () => {
    expect(interpolate('cost: $${level}', res)).toBe('cost: ${level}');
  });
});
