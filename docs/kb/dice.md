# Dice syntax (as used in the sources)

Sources: Complete Guide → _Dice Syntax_, _Inline Rolls_, _Inline Labels_, _Reusing Rolls_;
Pathfinder Examples; rmacro grammar.

| Syntax | Meaning |
| --- | --- |
| `NdX`, `dX`, `dF` | Roll N X-sided dice; Fate dice |
| `cs>N`, `cs<N`, `cs=N`, `cf<N`, `cf>N` | Critical success / failure highlight thresholds (`1d20cs>19`, `1d100cs0cf0`) |
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
`$[[n]]` is display-only; it cannot be used inside another inline roll's math. If a
preceding query option contains inline rolls, the index depends on the chosen option,
so reuse after such a query is unstable.
