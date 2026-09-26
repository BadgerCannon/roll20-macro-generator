import { isScalar, visit, type Document as YamlDocument } from 'yaml';
import type { Diagnostic, Severity } from './diagnostics';
import type { Node, QueryNode } from './r20/ast';
import type { Macro } from './schema';

/**
 * Lint rules for Roll20 macros. Each rule cites the knowledge-base note it enforces.
 * Rules run on the parsed IR and the rendered output of one macro.
 */

type Finding = { severity: Severity; code: string; message: string };

export interface LintInput {
  macro: Macro;
  /** Expanded natural text, before escaping. */
  expanded: string;
  nodes: Node[];
  output: string;
}

const text = (ns: Node[]): string =>
  ns
    .map((n) =>
      n.k === 'text' || n.k === 'call'
        ? n.v
        : n.k === 'roll'
          ? `[[${text(n.body)}]]`
          : n.k === 'query'
            ? `?{${text(n.prompt)}}`
            : '$[[?]]',
    )
    .join('');

function queries(ns: Node[], out: QueryNode[] = []): QueryNode[] {
  for (const n of ns) {
    if (n.k === 'query') {
      out.push(n);
      queries(n.prompt, out);
      for (const o of n.options) {
        queries(o.label, out);
        if (o.value) queries(o.value, out);
      }
    } else if (n.k === 'roll') queries(n.body, out);
  }
  return out;
}

function calls(ns: Node[], out: string[] = []): string[] {
  for (const n of ns) {
    if (n.k === 'call') out.push(n.v);
    else if (n.k === 'roll') calls(n.body, out);
    else if (n.k === 'query') {
      calls(n.prompt, out);
      for (const o of n.options) {
        calls(o.label, out);
        if (o.value) calls(o.value, out);
      }
    }
  }
  return out;
}

export function lintMacro({ macro, expanded, nodes, output }: LintInput): Finding[] {
  const f: Finding[] = [];
  const qs = queries(nodes);

  // kb: queries.md — two options with one label cannot be told apart in the drop-down.
  for (const q of qs) {
    const seen = new Set<string>();
    for (const o of q.options) {
      const label = text(o.label).trim();
      if (label === '' || /^-+$/.test(label)) continue;
      if (seen.has(label)) {
        f.push({
          severity: 'error',
          code: 'duplicate-option-label',
          message: `Query "${text(q.prompt).trim()}" has two options labelled "${label}"`,
        });
      }
      seen.add(label);
    }
  }

  // kb: queries.md — a repeated prompt is asked once; differing options are silently ignored.
  const byPrompt = new Map<string, string>();
  for (const q of qs) {
    const prompt = text(q.prompt).trim();
    const opts = q.options
      .map((o) => text(o.label) + (o.value ? ',' + text(o.value) : ''))
      .join('|');
    if (!q.options.length) continue;
    const prev = byPrompt.get(prompt);
    if (prev !== undefined && prev !== opts) {
      f.push({
        severity: 'warning',
        code: 'conflicting-query',
        message: `Query "${prompt}" appears with different options; Roll20 asks once and reuses the first answer`,
      });
    }
    byPrompt.set(prompt, opts);
  }

  // kb: queries.md — no space after the comma before a command, query or macro call.
  for (const q of qs) {
    for (const o of q.options) {
      const v = o.value ? text(o.value) : '';
      if (/^\s+(\/|\?\{|#|!)/.test(v)) {
        f.push({
          severity: 'warning',
          code: 'space-after-comma',
          message: `Option "${text(o.label).trim()}" starts its value with a space before a command; Roll20 then ignores the command`,
        });
      }
    }
  }

  // kb: queries.md, references.md — `#macro` needs a space before `|` or `}`.
  const macroCall = /(?:^|[\s,])#([A-Za-z][\w-]*)(?=[|},])/gm;
  for (const m of output.matchAll(macroCall)) {
    f.push({
      severity: 'warning',
      code: 'macro-call-space',
      message: `Macro call "#${m[1]}" must be followed by a space inside a query`,
    });
  }

  // kb: roll-templates.md — `{{ name=…}}` with a leading space is ignored.
  for (const m of output.matchAll(/\{\{\s+([\w-]+)=/g)) {
    f.push({
      severity: 'warning',
      code: 'template-leading-space',
      message: `Template field "{{ ${m[1]}=" has a leading space; Roll20 ignores it (write "{{${m[1]}=")`,
    });
  }

  // kb: roll-templates.md — templates do not work with /roll.
  for (const line of output.split('\n')) {
    if (/^\s*\/(r|roll)\s/.test(line) && line.includes('&{template:')) {
      f.push({
        severity: 'error',
        code: 'template-with-roll',
        message: 'Roll templates do not work with /roll; use inline rolls [[…]] in the fields',
      });
    }
  }

  // kb: roll-templates.md, chat-commands.md — each top-level line is a new message.
  let templateSeen = false;
  for (const n of nodes) {
    if (n.k !== 'text') continue;
    const i = n.v.indexOf('&{template:');
    if (i >= 0) templateSeen = true;
    if (templateSeen && n.v.slice(Math.max(i, 0)).includes('\n')) {
      f.push({
        severity: 'warning',
        code: 'template-newline',
        message:
          'A new line outside a query ends the roll template; the rest is sent as a separate message',
      });
      break;
    }
  }

  // kb: references.md — @{target|attr|max} needs a target label; token bars need |max.
  for (const c of calls(nodes)) {
    const parts = c.slice(2, -1).split('|');
    if (parts[0]?.toLowerCase() === 'target' && parts.length === 3 && parts[2] === 'max') {
      f.push({
        severity: 'error',
        code: 'target-max-label',
        message: `${c}: the max flag on a target needs a target label, e.g. @{target|Foe|${parts[1]}|max}`,
      });
    }
    if (/\|bar[123]_max\}$/i.test(c)) {
      f.push({
        severity: 'error',
        code: 'bar-max',
        message: `${c}: token bar max values need "|max" (e.g. @{selected|bar1|max}), not "_max"`,
      });
    }
  }

  // Natural syntax is escaped by the generator; hand-escaped query chars get double-escaped
  // meaning when nested. kb: html-entities.md
  const withoutLiterals = expanded.replace(/T:[^]*/g, '');
  if (/&(amp;)*#(124|125|44);/.test(withoutLiterals)) {
    f.push({
      severity: 'info',
      code: 'pre-escaped',
      message:
        'Input already contains &#124; / &#125; / &#44;. Write plain | } , and let the generator escape them',
    });
  }

  // kb: html-entities.md — Collections macros lose their entities when reopened.
  if (macro.target !== 'ability' && /&(amp;)*#\d+;/.test(output)) {
    f.push({
      severity: macro.target === 'collection' ? 'warning' : 'info',
      code: 'entities-in-collection',
      message:
        'Output contains HTML entities. Save it as a character ability: a Collections macro loses them when reopened and saved',
    });
  }

  return f;
}

/**
 * kb: roll-templates.md — in YAML an unquoted ` #word` starts a comment, silently cutting a
 * macro call such as `/w gm #attack` from the value.
 */
export function lintYaml(
  yaml: YamlDocument,
  at: (d: Diagnostic, from: number) => Diagnostic,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  visit(yaml, {
    Scalar(_key, node) {
      if (!isScalar(node) || node.type !== 'PLAIN' || !node.comment || !node.range) return;
      if (/^[A-Za-z][\w-]*/.test(node.comment)) {
        out.push(
          at(
            {
              severity: 'warning',
              code: 'yaml-comment-trap',
              message: `"#${node.comment.split(/\s/)[0]}" after an unquoted value is a YAML comment, not a macro call. Quote the value`,
            },
            node.range[1],
          ),
        );
      }
    },
  });
  return out;
}
