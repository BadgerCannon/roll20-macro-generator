import type { Diagnostic } from './diagnostics';
import { ExprError, interpolate, type Value } from './expr';
import { literalMarker, rollDefMarker, rollReuseMarker } from './r20/parse';
import type {
  Button,
  Chat,
  Choose,
  Document,
  FieldValue,
  Macro,
  Option,
  OptionPatch,
  QueryDef,
  Scalar,
} from './schema';

/**
 * Expands a DSL macro into natural (unescaped) Roll20 text. Escaping happens later, in the
 * renderer, once the text has been parsed.
 */

type Path = (string | number)[];

/** Own-property lookup, so names like `toString` never resolve to inherited members. */
function own<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** Most options one `for` loop may generate; guards against freezing on `1..999999999`. */
export const MAX_LOOP_VALUES = 1000;

/** Private-use characters the expander uses as markers (see r20/parse.ts). */
const RESERVED = /[\uE000\uE001]/;

export class ExpandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path: Path,
  ) {
    super(message);
  }
}

/** Resolves `extends` chains and merges parents into children. */
export function resolveMacro(doc: Document, name: string, seen: string[] = []): Macro {
  const m = own(doc.macros, name);
  if (!m) throw new ExpandError('unknown-macro', `Unknown macro \`${name}\``, ['macros', name]);
  if (!m.extends) return m;
  if (seen.includes(name)) {
    throw new ExpandError('extends-cycle', `\`extends\` cycle: ${[...seen, name].join(' → ')}`, [
      'macros',
      name,
      'extends',
    ]);
  }
  if (!own(doc.macros, m.extends)) {
    throw new ExpandError('unknown-macro', `\`extends\` names unknown macro \`${m.extends}\``, [
      'macros',
      name,
      'extends',
    ]);
  }
  const p = resolveMacro(doc, m.extends, [...seen, name]);
  const { extends: _ignored, ...child } = m;
  return {
    ...p,
    ...child,
    vars: { ...p.vars, ...m.vars },
    queries: { ...p.queries, ...m.queries },
    rolls: { ...p.rolls, ...m.rolls },
    fields: mergeFields(p.fields, m.fields),
  };
}

/** Merges field maps keeping the parent's order; `null` in the child removes a field. */
function mergeFields(
  parent: Record<string, FieldValue> | undefined,
  child: Record<string, FieldValue> | undefined,
): Record<string, FieldValue> | undefined {
  if (!parent) return child;
  if (!child) return parent;
  const out: Record<string, FieldValue> = { ...parent };
  for (const [k, v] of Object.entries(child)) out[k] = v;
  for (const [k, v] of Object.entries(out)) if (v === null) delete out[k];
  return out;
}

const SEPARATOR = '-----------------------';

class Expander {
  private usedRolls = new Set<string>();
  private queryStack: string[] = [];
  readonly diagnostics: Diagnostic[] = [];

  constructor(
    private readonly doc: Document,
    private readonly macro: Macro,
    private readonly name: string,
  ) {}

  private get base(): Path {
    return ['macros', this.name];
  }

  /** Interpolates `${…}` in a DSL string. `scope` holds loop variables. */
  str(text: Scalar, path: Path, scope: Record<string, Value> = {}): string {
    if (typeof text !== 'string') return String(text);
    if (RESERVED.test(text)) {
      throw new ExpandError(
        'reserved-char',
        'Text contains a reserved private-use character (U+E000 or U+E001)',
        path,
      );
    }
    const resolve = (id: string): Value | undefined => {
      const v = own(scope, id) ?? own(this.macro.vars, id) ?? own(this.doc.vars, id);
      if (v !== undefined) return v;
      const q = own(this.macro.queries, id);
      if (q !== undefined) return this.query(id, q, scope);
      const r = own(this.macro.rolls, id);
      if (r !== undefined) return this.roll(id, r, scope);
      return undefined;
    };
    try {
      return interpolate(text, resolve);
    } catch (e) {
      if (e instanceof ExpandError) throw e;
      if (e instanceof ExprError) throw new ExpandError(e.code, e.message, path);
      throw e;
    }
  }

  private query(id: string, q: QueryDef, scope: Record<string, Value>): string {
    const path = [...this.base, 'queries', id];
    if (this.queryStack.includes(id)) {
      throw new ExpandError(
        'query-cycle',
        `Query \`${id}\` refers to itself: ${[...this.queryStack, id].join(' → ')}`,
        path,
      );
    }
    this.queryStack.push(id);
    try {
      if (typeof q === 'string') return `?{${this.str(q, path, scope)}}`;
      let out = '?{' + this.str(q.prompt, [...path, 'prompt'], scope);
      if (q.default !== undefined) out += '|' + this.str(q.default, [...path, 'default'], scope);
      const opts = q.options;
      if (Array.isArray(opts)) {
        opts.forEach((o, i) => {
          const p = [...path, 'options', i];
          out +=
            typeof o === 'object'
              ? `|${this.str(o.label, p, scope)},${this.str(o.value, p, scope)}`
              : `|${this.str(o, p, scope)}`;
        });
      } else if (opts) {
        for (const [label, value] of Object.entries(opts)) {
          out += `|${this.str(label, [...path, 'options'], scope)},${this.str(value, [...path, 'options', label], scope)}`;
        }
      }
      return out + '}';
    } finally {
      this.queryStack.pop();
    }
  }

  private roll(id: string, body: string, scope: Record<string, Value>): string {
    if (this.usedRolls.has(id)) return rollReuseMarker(id);
    this.usedRolls.add(id);
    return rollDefMarker(id) + '[[' + this.str(body, [...this.base, 'rolls', id], scope) + ']]';
  }

  fields(
    fields: Record<string, FieldValue> | undefined,
    path: Path,
    scope: Record<string, Value> = {},
  ): string {
    if (!fields) return '';
    const parts: string[] = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v === null) continue;
      parts.push(`{{${this.str(k, path, scope)}=${this.fieldValue(v, [...path, k], scope)}}}`);
    }
    return parts.join(' ');
  }

  private fieldValue(v: FieldValue, path: Path, scope: Record<string, Value>): string {
    if (v === null) return '';
    if (typeof v !== 'object') return this.str(v, path, scope);
    if ('choose' in v) return this.choose(v.choose, [...path, 'choose'], scope);
    if ('button' in v) return this.button(v.button, [...path, 'button'], scope);
    return v.buttons.map((b, i) => this.button(b, [...path, 'buttons', i], scope)).join(' ');
  }

  /** Chat buttons (kb: buttons.md). Targets are made opaque so the parser keeps them intact. */
  private button(b: Button, path: Path, scope: Record<string, Value>): string {
    const label = this.str(b.label, [...path, 'label'], scope);
    const set = [b.ability, b.macro, b.api, b.send].filter((x) => x !== undefined).length;
    if (set !== 1) {
      throw new ExpandError(
        'button-target',
        'A button needs exactly one of `ability`, `macro`, `api`, `send`',
        path,
      );
    }
    let target: string;
    if (b.ability !== undefined) target = '~' + this.str(b.ability, [...path, 'ability'], scope);
    else if (b.macro !== undefined)
      target = '!&#13;#' + this.str(b.macro, [...path, 'macro'], scope);
    else if (b.api !== undefined) target = '!' + defer(this.str(b.api, [...path, 'api'], scope));
    else target = '!&#13;' + defer(this.str(b.send!, [...path, 'send'], scope));
    return literalMarker(`[${label}](${target.replace(/\)/g, '&#41;')})`);
  }

  choose(c: Choose, path: Path, scope: Record<string, Value> = {}): string {
    const opts: string[] = [];
    (c.options ?? []).forEach((o, i) => opts.push(this.option(o, [...path, 'options', i], scope)));

    if (c.for) {
      const entries = Object.entries(c.for);
      if (entries.length !== 1) {
        throw new ExpandError('choose-for', '`for` must have exactly one loop variable', [
          ...path,
          'for',
        ]);
      }
      const [varName, spec] = entries[0]!;
      for (const v of loopValues(spec, [...path, 'for', varName])) {
        const s = { ...scope, [varName]: v };
        const ov: OptionPatch = own(c.overrides, String(v)) ?? {};
        const base: OptionPatch = {
          label: c.label ?? `\${${varName}}`,
          ...(c.value !== undefined && { value: c.value }),
          ...(c.fields && { fields: c.fields }),
          ...(c.text !== undefined && { text: c.text }),
        };
        const merged = {
          ...base,
          ...ov,
          label: ov.label ?? base.label!,
          fields: mergeFields(base.fields, ov.fields),
        };
        opts.push(this.option(merged, path, s));
      }
      for (const k of Object.keys(c.overrides ?? {})) {
        if (!loopValues(spec, []).map(String).includes(k)) {
          this.diagnostics.push({
            severity: 'warning',
            code: 'override-unused',
            message: `Override \`${k}\` does not match any \`for\` value`,
            macro: this.name,
            path: [...path, 'overrides', k],
          });
        }
      }
    }
    // A single option shows a text box, not a drop-down; add an empty option (kb: queries.md).
    if (opts.length === 1) opts.push(',');

    const prompt = this.str(c.prompt, [...path, 'prompt'], scope);
    const pretty = (c.layout ?? 'pretty') === 'pretty';
    return pretty
      ? `?{${prompt}${opts.map((o) => '\n|' + o).join('')}\n}`
      : `?{${prompt}${opts.map((o) => '|' + o).join('')}}`;
  }

  private option(o: Option, path: Path, scope: Record<string, Value>): string {
    if ('separator' in o)
      return o.separator === true ? SEPARATOR : this.str(o.separator, path, scope);
    const label = this.str(o.label, [...path, 'label'], scope);
    let value: string;
    if (o.value !== undefined) value = this.str(o.value, [...path, 'value'], scope);
    else {
      value = [
        this.fields(o.fields, [...path, 'fields'], scope),
        o.text && this.str(o.text, [...path, 'text'], scope),
      ]
        .filter(Boolean)
        .join(' ');
    }
    return value === '' ? label : `${label},${value}`;
  }

  macroText(): string {
    const m = this.macro;
    const b = this.base;
    const parts: string[] = [];
    if (m.template) parts.push(`&{template:${this.str(m.template, [...b, 'template'])}}`);
    if (m.noerror) parts.push('&{noerror}');
    const f = this.fields(m.fields, [...b, 'fields']);
    if (f) parts.push(f);
    if (m.text !== undefined) parts.push(this.str(m.text, [...b, 'text']));
    if (m.choose) parts.push(this.choose(m.choose, [...b, 'choose']));
    if (m.body !== undefined) parts.push(this.str(m.body, [...b, 'body']));
    return chatPrefix(m.chat) + parts.join(' ');
  }
}

function loopValues(spec: string | Scalar[], path: Path): Scalar[] {
  if (Array.isArray(spec)) return spec;
  const m = /^(-?\d+)\s*\.\.\s*(-?\d+)$/.exec(spec);
  if (!m) throw new ExpandError('choose-for', `Bad range \`${spec}\` (use \`1..9\`)`, path);
  const a = Number(m[1]);
  const z = Number(m[2]);
  if (Math.abs(z - a) + 1 > MAX_LOOP_VALUES) {
    throw new ExpandError(
      'choose-for',
      `Range \`${spec}\` has ${Math.abs(z - a) + 1} values; the limit is ${MAX_LOOP_VALUES}`,
      path,
    );
  }
  const step = a <= z ? 1 : -1;
  const out: number[] = [];
  for (let i = a; step > 0 ? i <= z : i >= z; i += step) out.push(i);
  return out;
}

/** Keeps calls, queries and rolls in a button target from running until clicked (kb: buttons.md). */
export function defer(s: string): string {
  return s
    .replace(/@\{/g, '&#64;{')
    .replace(/%\{/g, '&#37;{')
    .replace(/\?\{/g, '&#63;{')
    .replace(/\[\[/g, '&#91;[')
    .replace(/\]\]/g, ']&#93;');
}

function quoteName(n: string): string {
  return /\s/.test(n) ? `"${n}"` : n;
}

/** kb: chat-commands.md */
export function chatPrefix(chat: Chat | undefined): string {
  if (!chat) return '';
  if (typeof chat === 'string') {
    return { roll: '/r ', emote: '/em ', gmroll: '/gr ', desc: '/desc ', ooc: '/ooc ' }[chat];
  }
  if ('whisper' in chat) return `/w ${quoteName(chat.whisper)} `;
  if ('as' in chat) return `/as "${chat.as}" `;
  if ('emas' in chat) return `/emas ${chat.emas} `;
  return `!${chat.api} `;
}

export interface Expanded {
  text: string;
  diagnostics: Diagnostic[];
}

export function expandMacro(doc: Document, name: string): Expanded {
  const macro = resolveMacro(doc, name);
  const ex = new Expander(doc, macro, name);
  return { text: ex.macroText(), diagnostics: ex.diagnostics };
}
