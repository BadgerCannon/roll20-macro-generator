/**
 * IR for Roll20 macro text written in natural (unescaped) syntax.
 * kb: queries.md, dice.md, references.md
 */
export type Node = TextNode | CallNode | QueryNode | RollNode | ReuseNode;

/** Plain text. Characters `|`, `,` and `}` are escaped by the renderer when nested. */
export interface TextNode {
  k: 'text';
  v: string;
}

/** `@{…}` or `%{…}`: expanded before queries, so never escaped (kb: order-of-operations.md). */
export interface CallNode {
  k: 'call';
  v: string;
}

export interface QueryOption {
  label: Node[];
  /** `null` when the option has no `,value` part (value = label). */
  value: Node[] | null;
}

/** `?{prompt|opt|label,value}`. `options` is empty for a free-text query without default. */
export interface QueryNode {
  k: 'query';
  prompt: Node[];
  options: QueryOption[];
  start: number;
}

/** Inline roll `[[ … ]]`. `name` is set when it is the first use of a named DSL roll. */
export interface RollNode {
  k: 'roll';
  body: Node[];
  name?: string;
  start: number;
}

/** Reuse of a named DSL roll, rendered as `$[[n]]`. */
export interface ReuseNode {
  k: 'reuse';
  name: string;
  start: number;
}
