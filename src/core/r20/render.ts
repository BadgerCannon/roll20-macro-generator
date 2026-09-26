import type { Node, QueryNode, RollNode } from './ast';

/**
 * Renders the IR to Roll20 text, adding HTML-entity escaping for nested queries and computing
 * `$[[n]]` indices for named rolls.
 * kb: html-entities.md, queries.md, dice.md, roll-templates.md
 */

const ENTITY: Record<string, string> = { '|': '124', ',': '44', '}': '125' };

/**
 * Encodes a query-syntax character for `level` enclosing queries.
 * Level 0 is the raw char, level 1 is `&#124;`, level 2 is `&amp;#124;`, and so on.
 */
export function encodeChar(c: string, level: number): string {
  const code = ENTITY[c];
  if (level <= 0 || code === undefined) return c;
  return '&' + 'amp;'.repeat(level - 1) + '#' + code + ';';
}

function encodeText(v: string, level: number, commaLevel = level): string {
  if (level <= 0 && commaLevel <= 0) return v;
  let out = '';
  for (const c of v) out += encodeChar(c, c === ',' ? commaLevel : level);
  return out;
}

export interface RenderProblem {
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

interface RollInfo {
  node: RollNode;
  depth: number;
  order: number;
  message: number;
}

/** Walks the tree in document order, collecting inline rolls and top-level message breaks. */
function collectRolls(nodes: Node[]) {
  const rolls: RollInfo[] = [];
  const unstableMessages = new Set<number>();
  const reuses: { name: string; message: number; inRoll: boolean }[] = [];
  let order = 0;
  let message = 0;

  const walk = (ns: Node[], rollDepth: number, inQuery: boolean, top: boolean) => {
    for (const n of ns) {
      switch (n.k) {
        case 'text':
          // Each top-level line is a separate chat message (kb: chat-commands.md).
          if (top) message += n.v.split('\n').length - 1;
          break;
        case 'roll':
          if (inQuery) unstableMessages.add(message);
          else rolls.push({ node: n, depth: rollDepth, order: order++, message });
          walk(n.body, rollDepth + 1, inQuery, false);
          break;
        case 'query':
          walk(n.prompt, rollDepth, true, false);
          for (const o of n.options) {
            walk(o.label, rollDepth, true, false);
            if (o.value) walk(o.value, rollDepth, true, false);
          }
          break;
        case 'reuse':
          reuses.push({ name: n.name, message, inRoll: rollDepth > 0 });
          break;
        case 'call':
          break;
      }
    }
  };
  walk(nodes, 0, false, true);
  return { rolls, unstableMessages, reuses };
}

/**
 * Roll20 numbers inline rolls in evaluation order: the most deeply nested rolls first, then
 * left to right (kb: order-of-operations.md step 6, dice.md "Reusing rolls").
 */
export function assignRollIndices(nodes: Node[]): {
  index: Map<string, number>;
  problems: RenderProblem[];
} {
  const { rolls, unstableMessages, reuses } = collectRolls(nodes);
  const index = new Map<string, number>();
  const nameMessage = new Map<string, number>();
  const problems: RenderProblem[] = [];
  const byMessage = new Map<number, RollInfo[]>();
  for (const r of rolls) {
    const list = byMessage.get(r.message) ?? [];
    list.push(r);
    byMessage.set(r.message, list);
  }
  for (const list of byMessage.values()) {
    list.sort((a, b) => b.depth - a.depth || a.order - b.order);
    list.forEach((r, i) => {
      if (r.node.name !== undefined) {
        index.set(r.node.name, i);
        nameMessage.set(r.node.name, r.message);
      }
    });
  }
  for (const u of reuses) {
    if (!index.has(u.name)) {
      problems.push({
        code: 'reuse-undefined',
        severity: 'error',
        message: `Roll \`${u.name}\` is reused before it is rolled`,
      });
    } else if (nameMessage.get(u.name) !== u.message) {
      problems.push({
        code: 'reuse-other-message',
        severity: 'error',
        message: `Roll \`${u.name}\` is reused on a different line (each line is a separate chat message)`,
      });
    }
    if (u.inRoll) {
      problems.push({
        code: 'reuse-in-roll',
        severity: 'error',
        message: `\`$[[n]]\` for roll \`${u.name}\` is display-only and cannot be used inside another inline roll`,
      });
    }
    if (unstableMessages.has(u.message)) {
      problems.push({
        code: 'reuse-unstable',
        severity: 'warning',
        message: `Reusing roll \`${u.name}\` on a line where query options contain inline rolls; the index depends on the option chosen`,
      });
    }
  }
  return { index, problems };
}

export function render(nodes: Node[]): { text: string; problems: RenderProblem[] } {
  const { index, problems } = assignRollIndices(nodes);

  const seq = (ns: Node[], level: number): string => {
    let out = '';
    ns.forEach((n, i) => {
      out += one(n, level);
      // `}}}` is ambiguous: separate a query's closing brace from a following `}`.
      // kb: roll-templates.md "}}} ambiguity"
      const next = ns[i + 1];
      if (n.k === 'query' && next?.k === 'text' && next.v.startsWith('}')) out += ' ';
    });
    return out;
  };

  const query = (q: QueryNode, level: number): string => {
    // Prompt commas are not option separators, so they only need the enclosing level.
    let out = '?{' + seqPrompt(q.prompt, level);
    for (const o of q.options) {
      out += encodeChar('|', level) + seq(o.label, level + 1);
      if (o.value) out += encodeChar(',', level) + seq(o.value, level + 1);
    }
    return out + encodeChar('}', level);
  };

  const seqPrompt = (ns: Node[], level: number): string =>
    ns
      .map((n) => (n.k === 'text' ? encodeText(n.v, level + 1, level) : one(n, level + 1)))
      .join('');

  const one = (n: Node, level: number): string => {
    switch (n.k) {
      case 'text':
        return encodeText(n.v, level);
      case 'call':
        return n.v; // never escaped (kb: order-of-operations.md)
      case 'query':
        return query(n, level);
      case 'roll':
        return '[[' + seq(n.body, level) + ']]';
      case 'reuse':
        return `$[[${index.get(n.name) ?? '?'}]]`;
    }
  };

  return { text: seq(nodes, 0), problems };
}
