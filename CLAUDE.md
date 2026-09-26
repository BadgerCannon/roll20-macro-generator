# roll20-macro-generator

Generates copy-paste-ready Roll20 macros from a YAML DSL. It adds all the escaping for nested
queries, chat buttons and `$[[n]]` reuse, and lints macros for common mistakes.

- **Spec / domain knowledge:** `docs/kb/`. Read the relevant note before touching escaping,
  parsing or lint rules, and cite it in code comments (`// kb: html-entities.md`).
- **Test fixtures from the user:** `Handcrafted_macros/*.roll`, the macros the generator must
  reproduce. Their analysis is in `docs/kb/handcrafted-patterns.md`.
- Layout: `src/core` (browser-safe engine, no Node APIs), `src/web` (GitHub Pages app),
  `src/cli` (thin Node CLI), `test/`.

## Commands

```
npm test            # vitest
npm run typecheck
npm run lint        # eslint + prettier --check
npm run gen:schema  # regenerate public/r20macro.schema.json (CI checks it is fresh)
npm run r20m -- build examples/basics.r20.yaml
```
