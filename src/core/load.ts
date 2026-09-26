import { isNode, LineCounter, parseDocument, type Document as YamlDocument } from 'yaml';
import type { Diagnostic } from './diagnostics';
import { Document } from './schema';

/**
 * Loads DSL source (YAML, or JSON which is a YAML subset), validates it against the schema and
 * keeps enough position information to point diagnostics at the source.
 */
export interface Loaded {
  doc: Document | undefined;
  diagnostics: Diagnostic[];
  /** Adds `from`/`to`/`line`/`col` to a diagnostic that has a `path`. */
  locate: (d: Diagnostic) => Diagnostic;
  /** Adds a position to a diagnostic from a source offset. */
  at: (d: Diagnostic, from: number, to?: number) => Diagnostic;
  yaml: YamlDocument;
}

export function load(source: string): Loaded {
  const lineCounter = new LineCounter();
  const yaml = parseDocument(source, { lineCounter, prettyErrors: false, uniqueKeys: true });
  const diagnostics: Diagnostic[] = [];

  const at = (d: Diagnostic, from: number, to = from): Diagnostic => {
    const { line, col } = lineCounter.linePos(from);
    return { ...d, from, to, line, col };
  };

  const locate = (d: Diagnostic): Diagnostic => {
    if (d.from !== undefined || !d.path) return d;
    // Walk up the path until a node with a range is found.
    for (let n = d.path.length; n >= 0; n--) {
      const node = n === 0 ? yaml.contents : yaml.getIn(d.path.slice(0, n), true);
      if (isNode(node) && node.range) return at(d, node.range[0], node.range[1]);
      // Missing keys: point at the parent map's key if present.
    }
    return d;
  };

  for (const e of [...yaml.errors, ...yaml.warnings]) {
    diagnostics.push(
      at(
        {
          severity: yaml.errors.includes(e as never) ? 'error' : 'warning',
          code: `yaml-${e.code.toLowerCase().replace(/_/g, '-')}`,
          message: e.message.split('\n')[0]!,
        },
        e.pos[0],
        e.pos[1],
      ),
    );
  }
  if (yaml.errors.length) return { doc: undefined, diagnostics, locate, at, yaml };

  const result = Document.safeParse(yaml.toJS({ maxAliasCount: 1000 }));
  if (!result.success) {
    for (const issue of result.error.issues) {
      diagnostics.push(
        locate({
          severity: 'error',
          code: 'schema',
          message: issue.message,
          path: issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p)),
        }),
      );
    }
    return { doc: undefined, diagnostics, locate, at, yaml };
  }
  return { doc: result.data, diagnostics, locate, at, yaml };
}
