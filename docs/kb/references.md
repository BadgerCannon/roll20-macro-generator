# References: attributes, abilities, macros, tables

Sources: Complete Guide → _Token_, _Journal_, _Roll Table_; Macros → _Attribute Macros_,
_Repeating Attributes_, _Token_.

## Attributes `@{…}`

```
@{attr}                         (inside an ability / sheet button: current character)
@{Character Name|attr}
@{Character Name|attr|max}      max value (also attr_max for sheet attributes)
@{selected|attr}                selected token (or its linked character)
@{target|attr}                  prompts for a target token
@{target|Label|attr}            named target; same label = same token, asked once
@{target|Label|attr|max}        max on target REQUIRES a label
@{tracker|Name}                 Turn Tracker value
```

- Token variables: `bar1`, `bar2`, `bar3`, `token_name`, `token_id`. **Token bar max must be
  `@{selected|bar1|max}`**; `bar1_max` does not work.
- Pseudo-attributes: `character_name`, `character_id`, `character_avatar`.
- Names are case-insensitive.
- Repeating sections: `@{selected|repeating_items_$1_itembonus}` (0-based row index) or
  `@{selected|repeating_items_-KC0zCLum1Rq3V5wssyE_itembonus}` (row ID).
- **Auto-calc attributes** show their formula as text; wrap them in an inline roll:
  `[[@{selected|action_points}]]`.
- Attributes can be used in labels: `@{selected|str}[str]`.

## Abilities `%{…}`

```
%{Character Name|ability}      %{selected|ability}      %{ability} (same sheet)
```

They also call sheet roll buttons (`%{selected|repeating_weapon_$0_attack-roll}`).

## Macros `#name`

`#name` expands a Collections-tab macro. Inside a query it needs a trailing space
(`,#str |`). It is expanded before queries run.

## Rollable tables

`1t[fumble]`, `/roll 2t[crit-failure]`, inline `[[1t[table-name]]]` (inline shows only one).
