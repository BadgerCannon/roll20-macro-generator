import type { Node, QueryNode, QueryOption, RollNode } from './ast';

/**
 * Parser for Roll20 macro text written in natural syntax: nested queries are written with plain
 * `|`, `,` and `}` and matched by brace counting. The renderer adds the escaping later.
 * Pre-escaped input (hand-written macros) is also accepted and passes through unchanged.
 * kb: queries.md, html-entities.md
 */

/** Private-use markers the expander inserts for named DSL rolls. */
export const MARK_OPEN = '';
export const MARK_CLOSE = '';
export const rollDefMarker = (name: string) => `${MARK_OPEN}D:${name}${MARK_CLOSE}`;
export const rollReuseMarker = (name: string) => `${MARK_OPEN}R:${name}${MARK_CLOSE}`;
/** Text the parser must not interpret (button targets). It is still escaped when nested. */
export const literalMarker = (text: string) => `${MARK_OPEN}T:${text}${MARK_CLOSE}`;

export interface ParseProblem {
  code: string;
  message: string;
  offset: number;
}

export interface ParseResult {
  nodes: Node[];
  problems: ParseProblem[];
}

interface SeqOpts {
  /** Inside a query: stop at depth-0 `|` and `}`. */
  query: boolean;
  /** Also stop at depth-0 `,` (while reading an option label). */
  comma: boolean;
  /** Inside an inline roll: stop at `]]`. */
  roll: boolean;
}

const TOP: SeqOpts = { query: false, comma: false, roll: false };

class Parser {
  pos = 0;
  problems: ParseProblem[] = [];
  private pendingRollName: string | undefined;

  constructor(readonly src: string) {}

  parse(): Node[] {
    const nodes = this.seq(TOP);
    if (this.pos < this.src.length) {
      nodes.push({ k: 'text', v: this.src.slice(this.pos) });
      this.pos = this.src.length;
    }
    return nodes;
  }

  private seq(opts: SeqOpts): Node[] {
    const nodes: Node[] = [];
    let text = '';
    let braces = 0;
    let labels = 0;
    const flush = () => {
      if (text) nodes.push({ k: 'text', v: text });
      text = '';
    };
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos]!;
      const next = s[this.pos + 1];
      if (opts.roll && c === ']' && next === ']' && labels === 0) break;
      if (opts.query && braces === 0 && (c === '|' || c === '}')) break;
      if (opts.comma && braces === 0 && c === ',') break;

      if (c === MARK_OPEN && s.includes(MARK_CLOSE, this.pos)) {
        const end = s.indexOf(MARK_CLOSE, this.pos);
        const body = s.slice(this.pos + 1, end);
        const start = this.pos;
        this.pos = end + 1;
        if (body.startsWith('D:')) {
          this.pendingRollName = body.slice(2);
        } else if (body.startsWith('T:')) {
          text += body.slice(2);
        } else {
          flush();
          nodes.push({ k: 'reuse', name: body.slice(2), start });
        }
        continue;
      }
      if (c === '?' && next === '{' && !this.preEscapedQuery()) {
        flush();
        nodes.push(this.query());
        continue;
      }
      if ((c === '@' || c === '%') && next === '{') {
        flush();
        nodes.push({ k: 'call', v: this.call() });
        continue;
      }
      if (c === '$' && next === '[' && s[this.pos + 2] === '[') {
        // Literal `$[[n]]` written by the user: keep as text.
        const m = /^\$\[\[\d+\]\]/.exec(s.slice(this.pos));
        if (m) {
          text += m[0];
          this.pos += m[0].length;
          continue;
        }
      }
      if (c === '[' && next === '[') {
        flush();
        nodes.push(this.roll());
        continue;
      }
      if (c === '{' && next === '{') {
        // Treat `{{` as a unit so a pre-escaped `{{x=y&#125;&#125;}` cannot borrow the
        // query's closing brace for its second `{`.
        if (!opts.query || this.closes(this.pos)) braces += 2;
        text += '{{';
        this.pos += 2;
        continue;
      }
      if (opts.roll && c === '[') labels++;
      else if (opts.roll && c === ']' && labels > 0) labels--;
      else if (c === '{' && (!opts.query || this.closes(this.pos))) braces++;
      else if (c === '}' && braces > 0) braces--;
      text += c;
      this.pos++;
    }
    flush();
    return nodes;
  }

  /**
   * In natural syntax a `{` inside a query option only nests if it is closed before the option
   * ends. Pre-escaped input (`{{title=x&#125;&#125;`) leaves `{{` unclosed; those must not
   * swallow the following `|`.
   */
  private closes(pos: number): boolean {
    return this.findClose(pos, true) >= 0;
  }

  private findClose(pos: number, stopAtPipe: boolean): number {
    const s = this.src;
    let depth = 0;
    for (let i = pos; i < s.length; i++) {
      const c = s[i];
      if (c === MARK_OPEN) {
        const end = s.indexOf(MARK_CLOSE, i);
        if (end >= 0) i = end;
        continue;
      }
      if ((c === '?' || c === '@' || c === '%') && s[i + 1] === '{') {
        const j = this.findClose(i + 1, false);
        if (j < 0) return -1;
        i = j;
      } else if (c === '{') depth++;
      else if (c === '}') {
        if (--depth === 0) return i;
      } else if (c === '|' && stopAtPipe) return -1;
    }
    return -1;
  }

  /**
   * `?{Modifier&#124;0&#125;` is a query somebody already escaped for nesting. Roll20 treats it
   * as text until the enclosing query decodes it, so we do too.
   */
  private preEscapedQuery(): boolean {
    const s = this.src;
    let i = this.pos + 2;
    while (i < s.length && s[i] !== '|' && s[i] !== '}') i++;
    return /&(amp;)*#(124|125|44);/.test(s.slice(this.pos + 2, i));
  }

  private query(): QueryNode {
    const start = this.pos;
    this.pos += 2; // ?{
    const prompt = this.seq({ query: true, comma: false, roll: false });
    const options: QueryOption[] = [];
    while (this.src[this.pos] === '|') {
      this.pos++;
      const label = this.seq({ query: true, comma: true, roll: false });
      let value: Node[] | null = null;
      if (this.src[this.pos] === ',') {
        this.pos++;
        value = this.seq({ query: true, comma: false, roll: false });
      }
      options.push({ label, value });
    }
    if (this.src[this.pos] === '}') this.pos++;
    else
      this.problems.push({
        code: 'unclosed-query',
        message: 'Roll query `?{` is never closed with `}`',
        offset: start,
      });
    return { k: 'query', prompt, options, start };
  }

  private roll(): RollNode {
    const start = this.pos;
    const name = this.pendingRollName;
    this.pendingRollName = undefined;
    this.pos += 2; // [[
    const body = this.seq({ query: false, comma: false, roll: true });
    if (this.src.startsWith(']]', this.pos)) this.pos += 2;
    else
      this.problems.push({
        code: 'unclosed-roll',
        message: 'Inline roll `[[` is never closed with `]]`',
        offset: start,
      });
    const node: RollNode = { k: 'roll', body, start };
    if (name !== undefined) node.name = name;
    return node;
  }

  private call(): string {
    const start = this.pos;
    let depth = 0;
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]!;
      this.pos++;
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return this.src.slice(start, this.pos);
    }
    this.problems.push({
      code: 'unclosed-call',
      message: `\`${this.src.slice(start, start + 2)}\` reference is never closed with \`}\``,
      offset: start,
    });
    return this.src.slice(start);
  }
}

export function parse(src: string): ParseResult {
  const p = new Parser(src);
  const nodes = p.parse();
  return { nodes, problems: p.problems };
}
