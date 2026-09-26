import type { Diagnostic } from './diagnostics';
import { ExpandError, expandMacro } from './expand';
import { lintMacro, lintYaml } from './lint';
import { load } from './load';
import { parse } from './r20/parse';
import { render } from './r20/render';
import type { Document } from './schema';

export interface CompiledMacro {
  name: string;
  description?: string;
  /** Copy-paste-ready Roll20 macro, or `undefined` if it failed to build. */
  output: string | undefined;
  diagnostics: Diagnostic[];
}

export interface CompileResult {
  doc: Document | undefined;
  macros: CompiledMacro[];
  /** Document-level diagnostics (YAML / schema). */
  diagnostics: Diagnostic[];
}

/** Turns DSL source into Roll20 macros. Browser-safe. */
export function compile(source: string): CompileResult {
  const loaded = load(source);
  const { doc, locate } = loaded;
  if (!doc) return { doc, macros: [], diagnostics: loaded.diagnostics };

  const macros: CompiledMacro[] = Object.keys(doc.macros).map((name) => {
    const at = (d: Omit<Diagnostic, 'macro'>): Diagnostic =>
      locate({ ...d, macro: name, path: d.path ?? ['macros', name] });
    const description = doc.macros[name]!.description;
    try {
      const expanded = expandMacro(doc, name);
      const parsed = parse(expanded.text);
      const rendered = render(parsed.nodes);
      const diagnostics = [
        ...expanded.diagnostics.map(at),
        ...parsed.problems.map((p) => at({ severity: 'error', code: p.code, message: p.message })),
        ...rendered.problems.map((p) =>
          at({ severity: p.severity, code: p.code, message: p.message }),
        ),
        ...lintMacro({
          macro: expanded.macro,
          expanded: expanded.text,
          nodes: parsed.nodes,
          output: rendered.text,
        }).map(at),
      ];
      return { name, description, output: rendered.text, diagnostics };
    } catch (e) {
      if (!(e instanceof ExpandError)) throw e;
      return {
        name,
        description,
        output: undefined,
        diagnostics: [at({ severity: 'error', code: e.code, message: e.message, path: e.path })],
      };
    }
  });
  return { doc, macros, diagnostics: [...loaded.diagnostics, ...lintYaml(loaded.yaml, loaded.at)] };
}

export type { Diagnostic } from './diagnostics';
