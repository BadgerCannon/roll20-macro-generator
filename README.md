# roll20-macro-generator

Write Roll20 macros in a small YAML language and get copy-paste-ready macro text back.

The generator does the fiddly parts for you:

- **Escaping.** Write nested queries and template fields in plain Roll20 syntax. The generator
  adds `&#124;`, `&#125;`, `&#44;` (and `&amp;#…` for deeper levels) exactly where Roll20
  needs them, and never inside `@{…}` or `%{…}` calls.
- **Repetition.** Generate one drop-down option per spell level with a `for` loop instead of
  copying the same text nine times.
- **Bookkeeping.** Named rolls are rolled once and shown again as `$[[n]]` with the right `n`.
- **Linting.** Duplicate option labels, `{{ name=` with a leading space, `#macro` without a
  trailing space, `@{target|attr|max}` without a target label, and more.

The knowledge behind these rules is in [`docs/kb/`](docs/kb/README.md).

## Quick example

```yaml
# yaml-language-server: $schema=https://badgercannon.github.io/roll20-macro-generator/r20macro.schema.json
vars:
  char: Alveriel

macros:
  guiding-bolt:
    template: 5eDefault
    fields:
      title: Guiding Bolt
      subheader: ${char}
      weapon: 1
      roll1: '[[1d20 + @{wis_attack_roll_bonus}]]'
    choose:
      prompt: Cast at level
      for: { level: 1..9 }
      fields:
        subheaderright: Evocation Level ${level}
        weapondamage: '[[ [[${level}+3]]d6 ]] Radiant damage'
```

Output (first two of nine options shown):

```
&{template:5eDefault} {{title=Guiding Bolt}} {{subheader=Alveriel}} {{weapon=1}} {{roll1=[[1d20 + @{wis_attack_roll_bonus}]]}} ?{Cast at level
|1,{{subheaderright=Evocation Level 1&#125;&#125; {{weapondamage=[[ [[1+3]]d6 ]] Radiant damage&#125;&#125;
|2,{{subheaderright=Evocation Level 2&#125;&#125; {{weapondamage=[[ [[2+3]]d6 ]] Radiant damage&#125;&#125;
…
}
```

More in [`examples/`](examples). Each file there reproduces one of the hand-written macros in
[`Handcrafted_macros/`](Handcrafted_macros).

## Using it

### In the browser

Open **<https://badgercannon.github.io/roll20-macro-generator/>**. Type or paste DSL on the left;
the macros appear on the right as you type, each with a **Copy** button.

- **Examples** loads any file from [`examples/`](examples).
- **Save** keeps a snapshot in **History**, which stays in this browser (localStorage). From
  History you can restore, rename, delete, and export or import snapshots as JSON.
- Your current text is kept as a draft between visits.
- **Share** copies a link that contains the DSL itself; nothing is uploaded.

### Command line

```sh
npm install
npm run r20m -- build examples/healing.r20.yaml            # all macros in the file
npm run r20m -- build examples/healing.r20.yaml -m cure-wounds
npm run r20m -- check examples/*.r20.yaml                  # diagnostics only; exit 1 on errors
```

Add `--json` for machine-readable output and `-q` to hide info-level notes.

### Editor support

Put this line at the top of a `.r20.yaml` file:

```yaml
# yaml-language-server: $schema=https://badgercannon.github.io/roll20-macro-generator/r20macro.schema.json
```

VS Code (with the Red Hat YAML extension) and JetBrains IDEs then autocomplete keys and known
template fields, and show errors as you type.

### Pasting into Roll20

If the output contains HTML entities (any `&#…;`), save it as an **ability** on a character
sheet, not as a Collections macro. Roll20 decodes the entities when a Collections macro is
reopened, which breaks it. The generator reminds you with an `entities-in-collection` note.
Set `target: ability` on a macro to silence the note.

## DSL reference

A file has optional `vars` and a map of `macros`. Every string may use `${expr}` (see
[Expressions](#expressions)). Write Roll20 syntax as you would in chat: plain `|`, `,` and `}`.

| Key | Meaning |
| --- | --- |
| `description` | Free text shown in tools. |
| `extends` | Name of another macro to inherit from. Fields merge in order; `null` removes a field. |
| `target` | `collection` or `ability`. Controls the entity warning above. |
| `vars` | Values for `${name}`. Macro vars override file vars. A var may use other vars, e.g. `beams: ${cantrip_dice}`. Names inside a var are looked up where it is used: a file var that uses `${x}` sees the macro's own `x` (or a `for` loop's `x`) if there is one. |
| `queries` | Named roll queries, used as `${name}`. A string is a free-text prompt; an object has `prompt`, `default`, `options` (list, `{label, value}` items, or a `label: value` map). |
| `rolls` | Named inline rolls. The first `${name}` rolls `[[…]]`; later uses show `$[[n]]`. |
| `chat` | Prefix: `roll`, `emote`, `gmroll`, `desc`, `ooc`, `{whisper: gm}`, `{as: Name}`, `{emas: Name}`, `{api: command}`. |
| `template` | Roll template name, e.g. `default`, `5eDefault`. |
| `noerror` | `true` adds `&{noerror}`. |
| `fields` | Template fields in order, rendered as `{{key=value}}`. A value may also be `{choose: …}`, `{button: …}` or `{buttons: […]}`. |
| `text` | Text placed after the fields. |
| `choose` | A drop-down query placed after `text` (see below). |
| `body` | Free-form text placed last. Use it alone for macros without a template. |

### `choose`: drop-downs that insert fields or text

| Key | Meaning |
| --- | --- |
| `prompt` | Question shown to the player. |
| `options` | The options, in order. Each item is one of the three kinds below. |
| `layout` | `pretty` (default, one option per line) or `compact`. |

Items in `options`:

| Item | Meaning |
| --- | --- |
| `{label, value}` or `{label, fields, text}` | One option. |
| `{separator: true}` | A divider row (or give it your own text). |
| `{for, label, value, fields, text, overrides}` | A loop: one option per value, placed where the item is. |

In a loop item:

- `for` names one loop variable, such as `{level: 1..9}` or `{action: [Dash, Hide]}`.
- `label`, `value`, `fields` and `text` are the template for each option. `label` defaults to the
  loop value.
- `overrides` changes single options, keyed by loop value: `{9: {fields: {…}}}`.

```yaml
choose:
  prompt: Bonus Action
  options:
    - label: Off-hand attack
      fields: { title: Off-hand attack }
    - for: { action: [Dash, Disengage, Hide] }
      label: Cunning ${action}
      fields: { title: 'Cunning Action: ${action}' }
```

If a query is nothing but one loop, you can write the loop keys directly under `choose` instead
of wrapping them in `options` (see `examples/healing.r20.yaml`). Those options come after any
`options` items.

A drop-down with a single option gets an empty second option, so Roll20 shows a drop-down
rather than a text box.

### Buttons

```yaml
fields:
  Actions:
    buttons:
      - { label: Initiative, ability: selected|INITIATIVE }   # [Initiative](~selected|INITIATIVE)
      - { label: HP, macro: NPC-HP }                          # [HP](!&#13;#NPC-HP)
      - { label: Hit, api: 'attack @{target|token_id}' }      # runs the API command on click
      - { label: Say, send: '/w gm [[1d20]]' }                # sends chat text on click
```

In `api` and `send`, calls, queries and rolls run when the button is clicked, not when the menu
is posted.

### Expressions

`${…}` accepts names (vars, loop variables, named queries and rolls), numbers, `+ - * / %`,
parentheses, and `floor ceil round abs min max`. Write `$${` for a literal `${`.

### Limits

To keep a shared link from freezing the page, one macro may resolve at most 200,000 `${…}`
references and generated options, and expand to at most 100,000 characters. A `for` range may
have at most 1,000 values. Going over any of these gives an `expansion-limit` or `choose-for`
error.

### YAML tips

- Quote values that start with `@`, `&`, `[`, `{`, `?`, `!`, `%` or `*`.
- ` #word` after an unquoted value is a YAML **comment**. `body: /w gm #attack` loses
  `#attack`. Quote the value; the linter warns about this.
- Use `>-` for long text that should be one line, and `|-` to keep line breaks.

## Development

```sh
npm test             # vitest (unit, golden and CLI tests)
npm run typecheck
npm run lint         # eslint + prettier --check
npm run gen:schema   # regenerate public/r20macro.schema.json
npm run build:cli    # dist/cli/index.js
npm run dev          # web app with hot reload
npm run build:web    # static site in dist/web (deployed to GitHub Pages from main)
npm run test:e2e     # Playwright tests against the built site
```

`test:e2e` needs Playwright's Chromium: `npx playwright install --with-deps chromium`.

See [`CLAUDE.md`](CLAUDE.md) for the project layout.

## Licence

GPL-3.0-or-later. Knowledge-base notes summarise the Roll20 Wiki (CC BY-NC-SA) with attribution.
