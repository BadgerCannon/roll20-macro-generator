# Golden files

`<example>.<macro>.roll` is the expected output of macro `<macro>` in
`examples/<example>.r20.yaml`. Each file is a copy of the matching handcrafted macro in
`Handcrafted_macros/`, with line endings normalised to LF. The comparison ignores whitespace;
the exact generator output is snapshotted in `__snapshots__/`.

## Fixes applied to the handcrafted macros

`guiding-bolt.guiding-bolt.roll` (from `Guiding bolt at level template.roll`):

- The first option was labelled `2`; it is now `1`.
- Option 4 said "Evocation Level 3"; it now says "Evocation Level 4".
- Option 5 said "Evocation Level 4"; it now says "Evocation Level 5".
- Option 9 rolled `[[8+3]]d6`; it now rolls `[[9+3]]d6` (twice).

The linter reports the first bug as `duplicate-option-label` when it is run on the original.
