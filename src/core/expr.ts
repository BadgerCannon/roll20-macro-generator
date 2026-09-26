/**
 * `${expr}` interpolation used in DSL strings.
 *
 * Grammar (no `eval`):
 *   expr    := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := '-' unary | primary
 *   primary := number | identifier | identifier '(' args ')' | '(' expr ')'
 *
 * Functions: floor, ceil, round, abs, min, max.
 * `$${` writes a literal `${`.
 */

export type Value = string | number | boolean;

/** Resolves an identifier. Returns `undefined` when unknown. */
export type Resolver = (name: string) => Value | undefined;

export class ExprError extends Error {
  constructor(
    message: string,
    readonly code: 'expr-syntax' | 'undefined-ref' | 'expr-type' = 'expr-syntax',
  ) {
    super(message);
  }
}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+/.exec(src.slice(i));
      if (!m) throw new ExprError(`Bad number in \`${src}\``);
      toks.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w-]*/.exec(src.slice(i))!;
      // Allow hyphenated names (`bron-dc`) but not a trailing operator minus (`a-1`).
      let id = m[0];
      while (/-\d/.test(id.slice(-2)) || id.endsWith('-')) id = id.slice(0, id.lastIndexOf('-'));
      toks.push({ t: 'id', v: id });
      i += id.length;
    } else if ('+-*/%(),'.includes(c)) {
      toks.push({ t: 'op', v: c });
      i++;
    } else {
      throw new ExprError(`Unexpected \`${c}\` in \`\${${src}}\``);
    }
  }
  return toks;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
};

export function evaluate(src: string, resolve: Resolver): Value {
  const toks = tokenize(src);
  let p = 0;
  const isOp = (v: string) => {
    const t = toks[p];
    return t?.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected \`${v}\` in \`\${${src}}\``);
    p++;
  };

  const num = (v: Value, what: string): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
    throw new ExprError(`\`${what}\` is not a number (value: ${JSON.stringify(v)})`, 'expr-type');
  };

  const primary = (): Value => {
    const t = toks[p];
    if (!t) throw new ExprError(`Unexpected end of \`\${${src}}\``);
    p++;
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = expr();
      expect(')');
      return v;
    }
    if (t.t === 'id') {
      if (isOp('(')) {
        const fn = FUNCS[t.v];
        if (!fn) throw new ExprError(`Unknown function \`${t.v}\``);
        p++;
        const args: number[] = [];
        if (!isOp(')')) {
          args.push(num(expr(), t.v));
          while (isOp(',')) {
            p++;
            args.push(num(expr(), t.v));
          }
        }
        expect(')');
        return fn(...args);
      }
      const v = resolve(t.v);
      if (v === undefined) throw new ExprError(`Unknown name \`${t.v}\``, 'undefined-ref');
      return v;
    }
    throw new ExprError(`Unexpected \`${t.v}\` in \`\${${src}}\``);
  };

  const unary = (): Value => {
    if (isOp('-')) {
      p++;
      return -num(unary(), '-');
    }
    return primary();
  };

  const term = (): Value => {
    let l = unary();
    while (isOp('*') || isOp('/') || isOp('%')) {
      const op = (toks[p++] as { v: string }).v;
      const r = num(unary(), op);
      const a = num(l, op);
      l = op === '*' ? a * r : op === '/' ? a / r : a % r;
    }
    return l;
  };

  const expr = (): Value => {
    let l = term();
    while (isOp('+') || isOp('-')) {
      const op = (toks[p++] as { v: string }).v;
      const r = num(term(), op);
      l = op === '+' ? num(l, op) + r : num(l, op) - r;
    }
    return l;
  };

  const v = expr();
  if (p < toks.length) throw new ExprError(`Unexpected trailing input in \`\${${src}}\``);
  return v;
}

/**
 * Replaces every `${expr}` in `text`. `onValue` may transform the evaluated value (used to
 * substitute named queries/rolls); by default values are stringified.
 */
export function interpolate(
  text: string,
  resolve: Resolver,
  onValue: (v: Value, expr: string) => string = (v) => String(v),
): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const j = text.indexOf('${', i);
    if (j < 0) {
      out += text.slice(i);
      break;
    }
    if (text[j - 1] === '$') {
      // `$${` → literal `${`
      out += text.slice(i, j - 1) + '${';
      i = j + 2;
      continue;
    }
    const end = text.indexOf('}', j + 2);
    if (end < 0) throw new ExprError(`Unclosed \`\${\` in \`${text.slice(j, j + 20)}\``);
    const src = text.slice(j + 2, end);
    out += text.slice(i, j) + onValue(evaluate(src, resolve), src.trim());
    i = end + 1;
  }
  return out;
}
