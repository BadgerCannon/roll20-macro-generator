import { z } from 'zod';

/**
 * DSL schema. Source of truth for TypeScript types, runtime validation and the published JSON
 * Schema (`public/r20macro.schema.json`) that editors use for autocomplete.
 */

const Scalar = z.union([z.string(), z.number(), z.boolean()]);
export type Scalar = z.infer<typeof Scalar>;

const Vars = z
  .record(z.string(), Scalar)
  .describe('Named values usable as `${name}` in any string. Macro vars override file vars.');

const Range = z
  .string()
  .regex(/^-?\d+\s*\.\.\s*-?\d+$/)
  .describe('Inclusive integer range, e.g. `1..9`.');

/** Known roll-template fields, for editor autocomplete. Any other field name is allowed too. */
export const KNOWN_FIELDS: Record<string, string> = {
  // default (kb: roll-templates.md)
  name: '`default` template: title bar text.',
  // 5eDefault (kb: roll-templates.md, handcrafted-patterns.md)
  title: '5eDefault: card title.',
  subheader: '5eDefault: line under the title (often the character name).',
  subheader2: '5eDefault: second subheader line.',
  subheaderright: '5eDefault: right-aligned subheader (e.g. "Evocation Level 3").',
  character_name: '5eDefault: character name.',
  freetext: '5eDefault: free text block.',
  freetextname: '5eDefault: heading for the free text block.',
  weapon: '5eDefault: set to 1 for a weapon/attack card.',
  simple: '5eDefault: set to 1 for the simple attack layout.',
  rollname: '5eDefault: label for the attack roll.',
  roll1: '5eDefault: first attack roll.',
  roll2: '5eDefault: second attack roll (advantage/disadvantage).',
  showadvroll: '5eDefault: set to 1 to show roll2.',
  weapondamage: '5eDefault: damage roll.',
  weaponcritdamage: '5eDefault: extra critical damage.',
  spell: '5eDefault: set to 1 for a spell card.',
  spellshowinfoblock: '5eDefault: set to 1 to show the spell info block.',
  spellshowdesc: '5eDefault: set to 1 to show the description.',
  spellshowhealing: '5eDefault: set to 1 to show healing.',
  spellcasttime: '5eDefault: casting time.',
  spellduration: '5eDefault: duration.',
  spelltarget: '5eDefault: target.',
  spellrange: '5eDefault: range.',
  spellgainedfrom: '5eDefault: class the spell comes from.',
  spellcomponents: '5eDefault: components (V, S, M).',
  spelldescription: '5eDefault: spell description.',
  spellhealing: '5eDefault: healing roll.',
};

export interface Button {
  label: string;
  ability?: string;
  macro?: string;
  api?: string;
  send?: string;
}

const Button: z.ZodType<Button> = z
  .object({
    label: z.string().describe('Button text.'),
    ability: z
      .string()
      .optional()
      .describe('Ability to call: `name`, `selected|name` or `Character|name` → `[L](~…)`.'),
    macro: z.string().optional().describe('Collections macro to run → `[L](!&#13;#name)`.'),
    api: z
      .string()
      .optional()
      .describe('API command (without `!`). Calls, queries and rolls run when clicked.'),
    send: z
      .string()
      .optional()
      .describe('Chat text sent when clicked. Calls, queries and rolls run when clicked.'),
  })
  .strict()
  .describe('Chat button (kb: buttons.md). Set exactly one of ability, macro, api, send.')
  .meta({ id: 'Button' });

export type FieldValue =
  Scalar | null | { choose: Choose } | { button: Button } | { buttons: Button[] };

export interface OptionPatch {
  label?: string | number;
  value?: Scalar;
  fields?: Record<string, FieldValue>;
  text?: string;
}

/** An `options` item that generates one option per loop value. */
export interface LoopOption {
  for: Record<string, string | Scalar[]>;
  label?: string | number;
  value?: Scalar;
  fields?: Record<string, FieldValue>;
  text?: string;
  overrides?: Record<string, OptionPatch>;
}

export type Option =
  (OptionPatch & { label: string | number }) | { separator: true | string } | LoopOption;

export interface Choose {
  prompt: string;
  options?: Option[];
  for?: Record<string, string | Scalar[]>;
  label?: string | number;
  value?: Scalar;
  fields?: Record<string, FieldValue>;
  text?: string;
  overrides?: Record<string, OptionPatch>;
  layout?: 'pretty' | 'compact';
}

/**
 * Field maps keep their source order at runtime (`z.record`). The published JSON Schema also
 * lists the known fields as properties so editors can autocomplete them (see `jsonSchema`).
 */
const Fields: z.ZodType<Record<string, FieldValue>> = z
  .lazy(() =>
    z
      .record(z.string(), FieldValue)
      .describe(
        'Roll template fields in order, rendered as `{{key=value}}`. `null` removes an inherited field.',
      ),
  )
  .meta({ id: 'Fields' });

const FieldValue: z.ZodType<FieldValue> = z
  .lazy(() =>
    z.union([
      Scalar,
      z.null(),
      z.object({ choose: Choose }).strict(),
      z.object({ button: Button }).strict(),
      z.object({ buttons: z.array(Button) }).strict(),
    ]),
  )
  .meta({ id: 'FieldValue' });

const OptionPatch: z.ZodType<OptionPatch> = z
  .lazy(() =>
    z
      .object({
        label: z
          .union([z.string(), z.number()])
          .optional()
          .describe('Text shown in the drop-down.'),
        value: Scalar.optional().describe('Value inserted when chosen (instead of fields/text).'),
        fields: Fields.optional(),
        text: z.string().optional().describe('Text inserted after the fields when chosen.'),
      })
      .strict(),
  )
  .meta({ id: 'OptionPatch' });

const LoopFor = z
  .record(z.string(), z.union([Range, z.array(Scalar)]))
  .describe('One loop variable: `{ level: 1..9 }` or `{ action: [Dash, Hide] }`.');

const LoopOption: z.ZodType<LoopOption> = z
  .lazy(() =>
    z
      .object({
        for: LoopFor,
        label: z
          .union([z.string(), z.number()])
          .optional()
          .describe('Label of each generated option (default: the loop value).'),
        value: Scalar.optional().describe('Value of each generated option.'),
        fields: Fields.optional(),
        text: z.string().optional().describe('Text of each generated option.'),
        overrides: z
          .record(z.string(), OptionPatch)
          .optional()
          .describe('Changes for single generated options, keyed by loop value.'),
      })
      .strict()
      .describe('Generates one option per loop value, in place in the options list.'),
  )
  .meta({ id: 'LoopOption' });

const Option: z.ZodType<Option> = z
  .lazy(() =>
    z.union([
      z.object({ separator: z.union([z.literal(true), z.string()]) }).strict(),
      LoopOption,
      z
        .object({
          label: z.union([z.string(), z.number()]).describe('Text shown in the drop-down.'),
          value: Scalar.optional().describe('Value inserted when chosen (instead of fields/text).'),
          fields: Fields.optional(),
          text: z.string().optional().describe('Text inserted after the fields when chosen.'),
        })
        .strict(),
    ]),
  )
  .meta({ id: 'Option' });

const Choose: z.ZodType<Choose> = z
  .lazy(() =>
    z
      .object({
        prompt: z.string().describe('Question shown to the player.'),
        options: z
          .array(Option)
          .optional()
          .describe(
            'Options in order. Items are `{label, …}`, `{separator: true}`, or a `{for: …}` loop.',
          ),
        for: LoopFor.optional().describe(
          'Shorthand for a query that is one loop: generates options after any `options`.',
        ),
        label: z
          .union([z.string(), z.number()])
          .optional()
          .describe('Label of generated options (default: the loop value).'),
        value: Scalar.optional().describe('Value of generated options.'),
        fields: Fields.optional(),
        text: z.string().optional().describe('Text of generated options.'),
        overrides: z
          .record(z.string(), OptionPatch)
          .optional()
          .describe('Per-value changes for generated options, keyed by loop value.'),
        layout: z
          .enum(['pretty', 'compact'])
          .optional()
          .describe('`pretty` puts each option on its own line (default).'),
      })
      .strict()
      .describe(
        'Drop-down roll query whose options inject template fields or text (kb: queries.md).',
      ),
  )
  .meta({ id: 'Choose' });

const QueryDef = z.union([
  z.string().describe('Free-text query: the prompt.'),
  z
    .object({
      prompt: z.string(),
      default: Scalar.optional(),
      options: z
        .union([
          z.array(z.union([Scalar, z.object({ label: Scalar, value: Scalar }).strict()])),
          z.record(z.string(), Scalar),
        ])
        .optional()
        .describe('List of values, `{label, value}` items, or a `label: value` map.'),
    })
    .strict(),
]);
export type QueryDef = z.infer<typeof QueryDef>;

const Chat = z
  .union([
    z.enum(['roll', 'emote', 'gmroll', 'desc', 'ooc']),
    z.object({ whisper: z.string() }).strict(),
    z.object({ as: z.string() }).strict(),
    z.object({ emas: z.string() }).strict(),
    z.object({ api: z.string() }).strict(),
  ])
  .describe('Chat command prefix (kb: chat-commands.md), e.g. `emote` or `{ whisper: gm }`.');
export type Chat = z.infer<typeof Chat>;

export const Macro = z
  .object({
    description: z.string().optional(),
    extends: z.string().optional().describe('Name of a macro to inherit from.'),
    target: z
      .enum(['collection', 'ability'])
      .optional()
      .describe(
        'Where the macro is stored. Collections macros lose HTML entities when reopened (kb: html-entities.md).',
      ),
    vars: Vars.optional(),
    queries: z
      .record(z.string(), QueryDef)
      .optional()
      .describe('Named roll queries, used as `${name}`.'),
    rolls: z
      .record(z.string(), z.string())
      .optional()
      .describe('Named inline rolls. First `${name}` rolls `[[…]]`; later uses show `$[[n]]`.'),
    chat: Chat.optional(),
    template: z.string().optional().describe('Roll template name, e.g. `default`, `5eDefault`.'),
    noerror: z
      .boolean()
      .optional()
      .describe('Add `&{noerror}` to suppress missing-attribute errors.'),
    fields: Fields.optional(),
    text: z.string().optional().describe('Text after the fields (natural Roll20 syntax).'),
    choose: Choose.optional(),
    body: z
      .string()
      .optional()
      .describe('Free-form macro text in natural Roll20 syntax, placed last.'),
  })
  .strict();
export type Macro = z.infer<typeof Macro>;

export const Document = z
  .object({
    $schema: z.string().optional(),
    vars: Vars.optional(),
    macros: z.record(z.string(), Macro).describe('Macros by name.'),
  })
  .strict()
  .describe('Roll20 macro generator DSL (https://github.com/BadgerCannon/roll20-macro-generator).');
export type Document = z.infer<typeof Document>;

/** JSON Schema for editors, with known template fields listed for autocomplete. */
export function jsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(Document, { unrepresentable: 'any', cycles: 'ref' }) as {
    $defs: Record<string, Record<string, unknown>>;
  };
  const fields = schema.$defs.Fields!;
  const ref = { $ref: '#/$defs/FieldValue' };
  fields.properties = Object.fromEntries(
    Object.entries(KNOWN_FIELDS).map(([k, description]) => [k, { ...ref, description }]),
  );
  fields.additionalProperties = ref;
  delete fields.propertyNames;
  return schema;
}
