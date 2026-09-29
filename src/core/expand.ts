import type { Diagnostic } from './diagnostics';
import { ExprError, interpolate, type Value } from './expr';
import { literalMarker, rollDefMarker, rollReuseMarker } from './r20/parse';
import type {
  Button,
  Chat,
  Choose,
  Document,
  FieldValue,
  LoopOption,
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

/**
 * Per-macro limits. Vars and queries can reference each other without a cycle and still grow
 * exponentially (`a: '${b}${b}'`, `b: '${c}${c}'`, …). Shared links compile on page load, so
 * these keep a small crafted document from freezing the browser.
 */
export const MAX_WORK = 200_000; // `${…}` references resolved + options generated
export const MAX_OUTPUT = 100_000; // characters of expanded text

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
  private varStack: string[] = [];
  private work = 0;

  /** Counts expansion work; throws once the macro exceeds `MAX_WORK`. */
  private spend(path: Path) {
    if (++this.work > MAX_WORK) {
      throw new ExpandError(
        'expansion-limit',
        `Expansion is too large: more than ${MAX_WORK.toLocaleString('en')} references and options. Check for vars or queries that repeat each other many times`,
        path,
      );
    }
  }

  /** Throws when expanded text exceeds `MAX_OUTPUT` characters. */
  private sized(text: string, path: Path): string {
    if (text.length > MAX_OUTPUT) {
      throw new ExpandError(
        'expansion-limit',
        `Expanded text is too large: ${text.length.toLocaleString('en')} characters (limit ${MAX_OUTPUT.toLocaleString('en')})`,
        path,
      );
    }
    return text;
  }
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
      this.spend(path);
      const loop = own(scope, id);
      if (loop !== undefined) return loop;
      const v = this.variable(id, scope);
      if (v !== undefined) return v;
      const q = own(this.macro.queries, id);
      if (q !== undefined) return this.query(id, q, scope);
      const r = own(this.macro.rolls, id);
      if (r !== undefined) return this.roll(id, r, scope);
      return undefined;
    };
    try {
      return this.sized(interpolate(text, resolve), path);
    } catch (e) {
      if (e instanceof ExpandError) throw e;
      if (e instanceof ExprError) throw new ExpandError(e.code, e.message, path);
      throw e;
    }
  }

  /**
   * File or macro variable. String values are interpolated too, so one var can build on another
   * (`beams: ${cantrip_dice}`).
   */
  private variable(id: string, scope: Record<string, Value>): Value | undefined {
    const inMacro = own(this.macro.vars, id);
    const v = inMacro ?? own(this.doc.vars, id);
    if (typeof v !== 'string' || !v.includes('${')) return v;
    const path = inMacro !== undefined ? [...this.base, 'vars', id] : ['vars', id];
    if (this.varStack.includes(id)) {
      throw new ExpandError(
        'var-cycle',
        `Variable \`${id}\` refers to itself: ${[...this.varStack, id].join(' → ')}`,
        path,
      );
    }
    this.varStack.push(id);
    try {
      return this.str(v, path, scope);
    } finally {
      this.varStack.pop();
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
    (c.options ?? []).forEach((o, i) =>
      opts.push(...this.option(o, [...path, 'options', i], scope)),
    );
    // Top-level `for` is shorthand for one loop item after the explicit options.
    if (c.for) opts.push(...this.loop({ ...c, for: c.for }, path, scope));

    // A single option shows a text box, not a drop-down; add an empty option (kb: queries.md).
    if (opts.length === 1) opts.push(',');

    const prompt = this.str(c.prompt, [...path, 'prompt'], scope);
    const pretty = (c.layout ?? 'pretty') === 'pretty';
    return this.sized(
      pretty
        ? `?{${prompt}${opts.map((o) => '\n|' + o).join('')}\n}`
        : `?{${prompt}${opts.map((o) => '|' + o).join('')}}`,
      path,
    );
  }

  private option(o: Option, path: Path, scope: Record<string, Value>): string[] {
    if ('separator' in o) {
      return [o.separator === true ? SEPARATOR : this.str(o.separator, path, scope)];
    }
    if ('for' in o) return this.loop(o, path, scope);
    this.spend(path);
    return [this.single(o, path, scope)];
  }

  /** Expands a loop into one option per value (kb: handcrafted-patterns.md). */
  private loop(l: LoopOption, path: Path, scope: Record<string, Value>): string[] {
    const entries = Object.entries(l.for);
    if (entries.length !== 1) {
      throw new ExpandError('choose-for', '`for` must have exactly one loop variable', [
        ...path,
        'for',
      ]);
    }
    const [varName, spec] = entries[0]!;
    const values = loopValues(spec, [...path, 'for', varName]);
    const base: OptionPatch = {
      label: l.label ?? `\${${varName}}`,
      ...(l.value !== undefined && { value: l.value }),
      ...(l.fields && { fields: l.fields }),
      ...(l.text !== undefined && { text: l.text }),
    };
    const out = values.map((v) => {
      const ov: OptionPatch = own(l.overrides, String(v)) ?? {};
      const merged = {
        ...base,
        ...ov,
        label: ov.label ?? base.label!,
        fields: mergeFields(base.fields, ov.fields),
      };
      this.spend(path);
      return this.single(merged, path, { ...scope, [varName]: v });
    });
    const keys = values.map(String);
    for (const k of Object.keys(l.overrides ?? {})) {
      if (!keys.includes(k)) {
        this.diagnostics.push({
          severity: 'warning',
          code: 'override-unused',
          message: `Override \`${k}\` does not match any \`for\` value`,
          macro: this.name,
          path: [...path, 'overrides', k],
        });
      }
    }
    return out;
  }

  private single(
    o: OptionPatch & { label: string | number },
    path: Path,
    scope: Record<string, Value>,
  ): string {
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
    return this.sized(chatPrefix(m.chat) + parts.join(' '), b);
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
    .replace(/\]\]/g, ']&#93;')
    .replace(/:/g, '&#58;');
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
  /** The macro with its `extends` chain merged in. */
  macro: Macro;
}

export function expandMacro(doc: Document, name: string): Expanded {
  const macro = resolveMacro(doc, name);
  const ex = new Expander(doc, macro, name);
  return { text: ex.macroText(), diagnostics: ex.diagnostics, macro };
}
