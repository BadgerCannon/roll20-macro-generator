# Roll queries

Sources: Complete Guide → _Roll Queries_, _Drop-down Queries_; Macros → _Drop-Down Prompts_,
_Advanced Usage_; Pathfinder Examples → _Drop-Down Queries_, spellbook examples.

## Syntax

```
?{Prompt}                       free text
?{Prompt|default}               free text with default
?{Prompt|Opt1|Opt2|Opt3}        drop-down, value = label
?{Prompt|Label 1,Value1|Label 2,Value2}   drop-down with separate labels
```

- **Repeated prompts are asked once.** Any later `?{Same prompt}` (even without options)
  reuses the first answer:
  `{{damage=[[2d6+?{Extra Damage?|0}]]}} {{Crit damage=[[12+?{Extra Damage?|0}]]}}`.
- Whitespace matters. Put **no space after the `,`** when the value starts with a command or
  a query: `?{Attack|Just roll,/r d20+5|…}` works, `?{Attack|Just roll, /r d20+5|…}` does not.
- A **macro call inside a query needs a trailing space** so Roll20 knows where the name ends,
  with no space between `,` and `#`: `?{Which macro?|Attack,#use-sword |Defend,#use-shield }`.
- Queries may span several lines for readability: `?{Choose|\n Melee,3[STR] |\n Ranged,2[DEX] }`.
- **Single-option drop-down.** `?{P|x}` is a text prompt with default `x`. To force a
  drop-down with one entry, add an empty option: `?{P|Label,value|,}` (Pathfinder spellbook
  "`|,` is only needed if the spell level template only has a single entry").
- **Separator rows** are just options whose label is a rule, e.g. `| -----------------------`.
- A query may appear inside an inline roll: `[[ ?{Attack Type|Standard, 1d20|Advantage, 2d20kh1} ]]`.

## Nesting

Characters that belong to a query **nested inside another query's option** (`|`, `,`, `}`)
must be entity-escaped at the nesting depth ([html-entities.md](html-entities.md)).
Calls (`@{}`, `%{}`, `#macro`) are never escaped.

```
?{Choose a Roll|
   STR,/roll 1d20 + @{STR} + ?{Bonus&#124;0&#125; |
   DEX,/roll 1d20 + @{DEX} + ?{Bonus&#124;0&#125; |
   CON,/roll 1d20 + @{CON} + ?{Bonus&#124;0&#125; }
```

Characters in option *text* (not a nested query) that collide with query syntax also need
escaping at depth 1. Examples: commas in prose (Bron's wild table uses `&#44;`), commas in
grouped rolls `{5&#44; @{level} &#125;kl1`, and `}` of injected template fields `&#125;&#125;`.

An alternative Pathfinder style escapes the **opening** brace of an inner query
(`?&#123;Spell Level?&#125;`), so the inner query is only recognised after the outer
query's entities are decoded.

## Simplify where possible

Hoist parts common to every option out of the query, so no escaping is needed:

```
/roll 1d20+ ?{Choose an Attack|Melee,@{STR} |Ranged,@{DEX} |Psychic,@{WIS} } + ?{Bonus|0}
```

## Chat menus as an alternative

Large nested queries are hard to maintain; see [buttons.md](buttons.md) for chat menus.
