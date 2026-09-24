# Roll templates

Sources: Complete Guide → _Roll Templates_; Pathfinder Examples → _Default Roll Templates_,
_Pathfinder Community Sheet Template_; the user's handcrafted macros.

## Syntax

```
&{template:default} {{name=Test Attack}} {{attack=[[1d20]]}} {{damage=[[2d6]]}}
```

- `&{template:NAME}` then any number of `{{key=value}}` fields. For `default`, each field
  is a row and `name` is the title bar. A field without `=` spans the whole row.
- **Sensitive to leading spaces**: `{{name=Dexterity}}` works, `{{ name=Dexterity}}` does not.
- Templates work in plain messages and whispers (`/w gm &{template:…}`). They do **not** work
  with `/roll`; use inline rolls `[[…]]` inside the fields.
- Outside a query, a template must stay on **one line**. Each newline starts a new chat
  message. Newlines inside query options and field text are fine (handcrafted macros).
- Markdown works inside field values: `{{attack= [[1d20]] vs **AC**}}`.
- Image in the name: `{{name=[x](URL#.png)}}`.
- Flags may sit next to the fields: `&{noerror}`, and `&{tracker}` inside an inline roll.

## Query-injects-fields pattern

This is the dominant pattern in the handcrafted macros. Static fields come first, then a
query whose options each carry complete fields. Each field's closing `}}` is escaped
(`&#125;&#125;`) because it is inside the query; the opening `{{` needs no escaping.

```
&{template:5eDefault} {{title=…}} ?{Bonus Action
|Cunning Dash,{{title=Cunning Action: Dash&#125;&#125; {{freetext=…&#125;&#125;
|Cunning Hide,{{title=Cunning Action: Hide&#125;&#125; {{freetext=…&#125;&#125;
}
```

## Field-splice pattern

A Pathfinder style where the query starts inside a field's value. Each option closes the
current field and opens more; the final field is closed by a `} }}` after the query:

```
&{template:pf_attack} {{name=?{Skill Grouping
| Athletics, Athletics Check&#125;&#125; {{[[1d20 + @{CLIMB} ]] Climb=Swim [[1d20 + @{SWIM} ]]
| Senses, Senses&#125;&#125; {{ [[1d20 + @{PERCEPTION} ]]Perception = …
 } }}
```

## `}}}` ambiguity

When a query (or anything ending in `}`) closes right before a field's `}}`, write a space
between them: `{{freetext=?{Rolled |1,…|8,…} }}` (Bron's wild table), not `…}}}`.

## Known templates

| Template | Sheet | Fields seen in sources |
| --- | --- | --- |
| `default` | any game | `name`, arbitrary `label=value` rows |
| `5eDefault` | D&D 5E by Roll20 (user's games) | `title`, `subheader`, `subheader2`, `subheaderright`, `character_name`, `freetext`, `freetextname`, `weapon`, `simple`, `rollname`, `roll1`, `roll2`, `showadvroll`, `weapondamage`, `weaponcritdamage`, `spell`, `spellshowinfoblock`, `spellshowdesc`, `spellshowhealing`, `spellcasttime`, `spellduration`, `spelltarget`, `spellrange`, `spellgainedfrom`, `spellcomponents`, `spelldescription`, `spellhealing` |
| `pf_attack`, `pf_generic`, `pf_spell`, `pf_defense` | Pathfinder Community | `name`, `color`, `subtitle`, `name_link`, `attack`, `damage`, `crit_confirm`, `crit_damage`, `attack2…`, `description`, `dc`, `sr`, `range`, `duration`, `saving_throw`, `character_name` |
| `pc` | Pathfinder by Roll20 | `type`, `name`, `attack`, `roll`, `rolldmg1`, `critconfirm`, … |
| `npcaction`, `npcatk`, `simple`, `atkdmg`, `desc` | D&D 5E by Roll20 (legacy) | `rname`, `name`, `r1`, `r2`, `always`, `description`, `mod`, `charname` (rmacro snippets) |
