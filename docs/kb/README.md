# Roll20 macro knowledge base

Distilled reference notes that act as the **spec** for the generator. Code comments and
tests cite these files. Each note summarises the upstream sources and quotes only short
examples.

| File | Topic |
| --- | --- |
| [order-of-operations.md](order-of-operations.md) | How Roll20 expands and evaluates a macro |
| [html-entities.md](html-entities.md) | Entity replacement table and nesting levels |
| [queries.md](queries.md) | Roll queries, drop-downs, nesting rules |
| [roll-templates.md](roll-templates.md) | `&{template:…}` syntax, query-injected fields, known templates |
| [chat-commands.md](chat-commands.md) | Slash commands, API commands, roll flags |
| [references.md](references.md) | `@{}` attributes, `%{}` abilities, `#` macros, tables |
| [buttons.md](buttons.md) | Ability / API command buttons and chat menus |
| [dice.md](dice.md) | Dice syntax used in the sources, inline rolls, `$[[n]]` reuse |
| [handcrafted-patterns.md](handcrafted-patterns.md) | Analysis of the macros in `Handcrafted_macros/` |

## Sources

- Roll20 Wiki, _Complete Guide to Macros & Rolls_ (rev. 2025-11-30) —
  <https://wiki.roll20.net/Complete_Guide_to_Macros_%26_Rolls>
- Roll20 Wiki, _Macros_ (rev. 2024-10-17) — <https://wiki.roll20.net/Macros>
- Roll20 Wiki, _Macros/Pathfinder Examples_ — <https://wiki.roll20.net/Macros/Pathfinder_Examples>
- Roll20 Wiki, _Roll Query/Nested_, _Order of Operations_, _HTML Entities_, _Chat Menus_
  (linked from the pages above)
- anduh/rmacro — VS Code syntax support for Roll20 macros (MIT) — <https://github.com/anduh/rmacro>
- The user's handcrafted macros in [`Handcrafted_macros/`](../../Handcrafted_macros)

Roll20 Wiki content is available under Creative Commons Attribution Non-Commercial Share
Alike. These notes are summaries with attribution; consult the wiki for full text.
