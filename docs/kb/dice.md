# Dice syntax (as used in the sources)

Sources: Complete Guide → _Dice Syntax_, _Inline Rolls_, _Inline Labels_, _Reusing Rolls_;
Pathfinder Examples; rmacro grammar.

| Syntax | Meaning |
| --- | --- |
| `NdX`, `dX`, `dF` | Roll N X-sided dice; Fate dice |
| `cs>N`, `cs<N`, `cs=N`, `cf<N`, `cf>N` | Critical success / failure highlight thresholds. `cs>N` is inclusive (sourced): `1d20cs>19` highlights 19 or 20, `1d20cs>20` only a natural 20 (5e). The other `<`/`>` forms are assumed inclusive by symmetry (see Crit ranges). `1d100cs0cf0` turns highlights off |
| `khN`, `klN`, `dhN`, `dlN` | Keep / drop highest / lowest |
| `!`, `!!`, `!p` | Exploding, compounding, penetrating |
| `rN`, `roN` | Reroll (once) |
| `>N`, `<N` | Count successes |
| `{a, b}kh1` | Grouped roll: `[[ 1d8 + ( { 5 , @{Level} }kl1) ]]` |
| `floor() ceil() round() abs()` | Math functions |
| `+ - * / %` and `(…)` | Arithmetic |
| `2d10+5[Fire Damage]` | Inline label (shown on hover) |
| `1t[table]` | Rollable table |

## Inline rolls `[[ … ]]`

- Allowed in any chat message and in template fields; only the total is shown (hover shows
  the breakdown). Crits are highlighted green, fumbles red, both blue.
- Evaluated before `/roll`, so they can act as random variables.
- **Nested inline rolls** compute dice counts: `[[ [[1+3]]d6 + @{bonus} ]]`, or
  `[[ [[ {10, @{CasterLevel} }kl1 ]]d6 ]]`. There must be no space between `]]` and `d6`.

## Reusing rolls `$[[n]]`

After inline rolls run, `$[[n]]` displays the result of inline roll `n`. Numbering is in
evaluation order, innermost first and then left to right:

```
&{template:default} [[ [[1d20]] + [[1d6]] + [[6]] ]] {{name=My Attack}} {{$[[0]] + $[[1]] + $[[2]]==$[[3]]}}
```

Here 1d20 is `$[[0]]`, 1d6 is `$[[1]]`, 6 is `$[[2]]` and the outer sum is `$[[3]]`.
**Numbering rule used by the generator: deepest nesting level first, across the whole
message, then left to right.** Both readings agree on the wiki example above. The rmacro
sample settles the difference: in
`/em hits … [[?{Level cast at|…}+2]] magic missiles. Total damage is: [[[[1d4+1]]*?{Level cast at}]] Each missile does $[[0]] force damage.`
`$[[0]]` is the nested `1d4+1`, not the first top-level roll. Each line of a macro is a
separate message with its own numbering.

`$[[n]]` is display-only; it cannot be used inside another inline roll's math. If a
preceding query option contains inline rolls, the index depends on the chosen option,
so reuse after such a query is unstable.

## Crit ranges

Source: Pathfinder Examples → _Calculating Crits_: "`1d20cs>19` will display the result with a
green critical highlight on a 19 or 20. `1d20cs>15`, on a 15-20". So `cs>N` includes `N`.
For D&D 5e (crit only on a natural 20) use `1d20cs>20`, as in the handcrafted Guiding Bolt.

The sources quote no example for `cs<N`, `cf<N` or `cf>N`. These notes assume all four `<`/`>`
forms include `N`, by symmetry with `cs>N`; confirm in Roll20 before relying on an edge value.
