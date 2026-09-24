# Handcrafted macro patterns

Analysis of [`Handcrafted_macros/`](../../Handcrafted_macros). These are the macros the
generator must reproduce. They all target the `5eDefault` roll template.

## Common shape

```
&{template:5eDefault} <static fields> [<call>] ?{<prompt>
|<label>,<fields for this option, closing braces escaped as &#125;&#125;>
|<label>,…
}
```

- **Static fields** are shared by every option (title, subheader, spell info block…).
- A **query injects option-specific fields**. `{{` is left as-is; each `}}` becomes
  `&#125;&#125;`; commas in prose become `&#44;`.
- **Pretty layout**: each option starts on its own line with `|`, and the closing `}` sits on
  its own line or at the end of the last option.
- Calls such as `@{Alveriel|classactionspellcast}` and `@{Alveriel|wisdom_mod}` are left
  unescaped inside options.

## Per-file notes

| File | Pattern | Repetition | Hand-made mistakes |
| --- | --- | --- | --- |
| `Healing at level.roll` | Two macros (Healing Word, Cure Wounds). Static spell fields plus a query over spell level 1–9 injecting `spelldescription`, `subheaderright`, `spellhealing` | Options differ only by level `L`: `[[L]] d4`, `Level L`, `[[Ld4 + … + L]]`. The two spells share about 90% of their static fields | None; level 9 has a joke suffix |
| `Guiding bolt at level template.roll` | Attack card: static fields plus a level query injecting `subheaderright`, `roll1`, `roll2`, `showadvroll`, `weapondamage`, `weaponcritdamage` | Level `L` → `[[ [[L+3]]d6 + … ]]` | Label `2` used twice (the first should be `1`), "Level 3" on option 4, "Level 4" on option 5, `8+3` on level 9 (should be `9+3`) |
| `IrisBonus.roll` | Bonus-action picker. Each option is a different card (attack vs. text); labels contain spaces | No loop; hand-written options | None |
| `Bron_wildtable.roll` | Query **inside a field value** (`{{freetext=?{Rolled |…} }}`); options are long multi-line prose with inline rolls; commas escaped as `&#44;` | Labels 1–8, values `**Rolled: N**` plus text | Option 1 contains no commas, so it has none to escape. The trailing `} }}` avoids `}}}` |

## DSL constructs derived from these

- `vars:` for the character name used in every `@{Alveriel|…}` call.
- `template:` + `fields:` for the static fields.
- `choose:` (query that injects fields/text) with a `for:` loop over levels, `${level}`
  expressions such as `${level + 3}`, and `overrides:` for one-off changes (level 9 jokes).
- `extends:` so Cure Wounds reuses Healing Word's fields.
- A query placed inside a field value (Bron) with automatic comma escaping and `} }}` spacing.
- Lint rule **duplicate option label** (catches the Guiding Bolt `2`/`2` bug).
