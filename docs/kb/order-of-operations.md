# Order of operations

Source: Complete Guide to Macros & Rolls → _Order of Operations_.

1. **Abilities** are expanded (`%{char|ability}` → its body).
2. **Macros** are expanded (`#macro-name` → its body).
3. **Attribute calls** are resolved (`@{attr}` → value).
4. Steps 1–3 repeat up to 99 levels deep until nothing is left to expand.
5. **Roll queries** are executed (up to 99 levels deep). The player's answer is substituted
   where the query appears.
   - 5b. **HTML entities within roll queries are decoded once after each roll query**
     (`&#125;` becomes `}`, but `&amp;#125;` becomes `&#125;`).
6. **Inline rolls** are executed, most deeply nested first, working outward. Each result is
   substituted in place.
7. The remaining roll is executed (dice rolled, results substituted).
8. Math functions (`floor()`, `ceil()`, …) run.
9. The remaining formula is evaluated with normal math precedence.
10. Custom Roll Parsing (Pro).
11. HTML entities are processed once.
12. The message is sent to the text chat and the API sandbox.

## Consequences the generator relies on

- `@{…}`, `%{…}` and `#macro` are resolved **before** queries. Their characters must
  never be entity-escaped, even inside a nested query. An escaped call such as
  `@{target&#124;token_name&#125;` is broken. _(Macros → "NEVER REPLACE ATTRIBUTES")_
- If a called attribute, ability or macro **expands to** text containing `|`, `,` or `}`,
  that text breaks an enclosing query. The generator cannot see those values, so the
  linter warns when a call sits inside a query option.
- Because entities are decoded once per query level, each extra nesting level needs one
  more layer of `&amp;` (see [html-entities.md](html-entities.md)).
- Inline rolls are numbered in evaluation order (innermost first, then left to right).
  `$[[n]]` refers to that index (see [dice.md](dice.md)).
