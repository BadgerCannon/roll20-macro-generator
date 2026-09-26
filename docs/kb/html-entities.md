# HTML entities

Source: Complete Guide → _HTML replacement_; Macros → _Roll Query Troubleshooting_.

`|`, `}` and `,` are the characters that most often need replacing in nested macros.

| Char | Entity | Char | Entity |
| --- | --- | --- | --- |
| `\|` | `&#124;` (`&vert;`) | `,` | `&#44;` (`&comma;`) |
| `{` | `&#123;` (`&lbrace;`) | `}` | `&#125;` (`&rbrace;`) |
| `&` | `&#38;` (`&amp;`) | space | `&#160;` (`&nbsp;`) |
| `=` | `&#61;` | `_` | `&#95;` |
| `(` | `&#40;` | `)` | `&#41;` |
| `[` | `&#91;` | `]` | `&#93;` |
| `<` | `&#60;` | `>` | `&#62;` |
| `` ` `` | `&#96;` | `*` | `&#42;` |
| `!` | `&#33;` | `"` | `&#34;` |
| `#` | `&#35;` | `-` | `&#45;` |
| `@` | `&#64;` | `%` | `&#37;` |
| `?` | `&#63;` | `:` | `&#58;` |
| CR | `&#13;` (used in buttons) | | |

## Nesting levels

Replace **only** characters that belong to the nested query, never the outer one.
Starting at the second level, the `&` of the entity is itself written as `&amp;`:

| Level | Pipe | Closing brace | Comma |
| --- | --- | --- | --- |
| 0 | `\|` | `}` | `,` |
| 1 | `&#124;` | `&#125;` | `&#44;` |
| 2 | `&amp;#124;` | `&amp;#125;` | `&amp;#44;` |
| 3 | `&amp;amp;#124;` | `&amp;amp;#125;` | `&amp;amp;#44;` |

Generator rule: at depth `d ≥ 1`, write `&#NNN;`, then replace the leading `&` with
`&amp;` `d − 1` times.

Wiki example (Macros → Nesting Queries):

```
?{Name of Query|
   Label 1,?{value1&#124;
      Label 1A&#44;?{value1A&amp;#124;
         Label 1Ai&amp;#44; value1Ai &amp;#124;
         Label 1Aii&amp;#44; value1Aii
      &amp;#125; &#124;
      Label 1B&#44;?{value1B&amp;#124;
         Label 1Bi&amp;#44; value1Bi &amp;#124;
         Label 1Bii&amp;#44; value1Bii
      &amp;#125;
   &#125; |
   Label 2,?{value2&#124;value2&#125;
}
```

## Storage warning

Reopening a macro saved in the **Collections tab** reverts its HTML entities, and saving it
again keeps the reverted characters. Abilities on a character sheet do not do this, which is
why people keep entity-heavy macros on a "Macro Character Sheet". The generator warns when
output contains entities and the target is `collection`.
