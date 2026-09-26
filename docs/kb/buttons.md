# Buttons and chat menus

Sources: Complete Guide → _Chat Buttons_, _API Command Buttons_, _Styling with CSS_;
Macros → _Ability Command Buttons_.

## Ability command buttons

```
[Label](~Character|ability)   [Dex Check](~selected|dexterity_save)
[Label](~ability)             (when saved on a sheet tab; keyword may be omitted)
[Dex Check](~selected|repeating_attack_$0_attack)
```

The keyword is `selected`, `target`, a character name or a character id. The ability runs
when clicked, so its contents are **not** expanded or escaped when the menu is posted.

## API command buttons

Clicking a button needs no Pro account. What the button does depends on its target:

- `!&#13;#macro` and `!&#13;&#37;{…}` run a macro or ability, so they work in any game.
- A plain API command such as `!attackroll` only does something if a Mod (API) script that
  handles that command is installed in the game, which needs a Pro-subscriber game.

```
[Attack Roll](!attackroll)
[Roll NPC HP](!&#13;#NPC-HP)                call a macro: !&#13; then #name
[Label](!&#13;&#37;{selected|ability})       call an ability: !&#13; then &#37;{…}
```

`!&#13;` fools the parser into treating the button as an API command, then inserts a carriage
return so the rest runs as normal chat.

To keep attributes, queries and rolls **unevaluated until the button is clicked**, escape
them in the button target:

```
[Attack Roll](!attackroll &#64;{target|token_id} &#91;[1d6+&#63;{Bonus|0}]&#93;)
```

The deferred set is `@`→`&#64;`, `?`→`&#63;`, `[`→`&#91;`, `]`→`&#93;`, `%`→`&#37;`,
`)`→`&#41;` and `:`→`&#58;` (colons may alternatively be preceded by `/` on the same line).

## Styling

A button's target can carry CSS:
`[Macro1](~Macro1" style="border:none;background-color:transparent;padding:0px;color:#3452eb;font-weight:bold;)`.

## Chat menus

A macro that posts a template full of buttons, one per action, as an alternative to a
complex nested query:

```
&{template:default} {{name=Chat Menu: @{selected|character_name} }}
{{Rolls=[Initiative](~selected|INITIATIVE) }} {{[STR](~selected|STR) @{selected|strength}=  }}
```
