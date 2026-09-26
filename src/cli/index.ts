#!/usr/bin/env node
/**
 * r20m: command-line front end for the macro generator.
 *
 *   r20m build <file> [--macro <name>] [--json]   print generated macros
 *   r20m check <file...> [--json]                 report diagnostics, exit 1 on errors
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { compile, type Diagnostic } from '../core';

const USAGE = `Usage:
  r20m build <file> [--macro <name>] [--json]
  r20m check <file...> [--json]

Options:
  -m, --macro <name>  only output this macro
      --json          machine-readable output
  -q, --quiet         hide info-level diagnostics
  -h, --help          show this help`;

function format(file: string, d: Diagnostic): string {
  const pos = d.line !== undefined ? `:${d.line}:${d.col}` : '';
  const macro = d.macro ? ` [${d.macro}]` : '';
  return `${file}${pos}: ${d.severity} ${d.code}: ${d.message}${macro}`;
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      macro: { type: 'string', short: 'm' },
      json: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [cmd, ...files] = positionals;
  if (values.help || !cmd || !files.length || !['build', 'check'].includes(cmd)) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }
  const shown = (d: Diagnostic) => !(values.quiet && d.severity === 'info');

  let failed = false;
  const report: unknown[] = [];
  for (const file of cmd === 'build' ? files.slice(0, 1) : files) {
    const result = compile(readFileSync(file, 'utf8'));
    const macros = result.macros.filter((m) => !values.macro || m.name === values.macro);
    // Only the document and the macros being output decide the exit status.
    const diagnostics = [...result.diagnostics, ...macros.flatMap((m) => m.diagnostics)].filter(
      shown,
    );
    if (diagnostics.some((d) => d.severity === 'error')) failed = true;

    if (cmd === 'check') {
      if (values.json) report.push({ file, diagnostics });
      else for (const d of diagnostics) console.error(format(file, d));
      continue;
    }

    if (values.macro && !macros.length) {
      console.error(`${file}: no macro named "${values.macro}"`);
      return 1;
    }
    if (values.json) {
      report.push({
        file,
        diagnostics: result.diagnostics.filter(shown),
        macros: macros.map((m) => ({ ...m, diagnostics: m.diagnostics.filter(shown) })),
      });
      continue;
    }
    for (const d of result.diagnostics.filter(shown)) console.error(format(file, d));
    for (const m of macros) {
      for (const d of m.diagnostics.filter(shown)) console.error(format(file, d));
      if (macros.length > 1 || values.macro === undefined) console.log(`### ${m.name}`);
      console.log(m.output ?? '(not generated: see errors)');
      if (macros.length > 1) console.log();
    }
  }
  if (values.json) console.log(JSON.stringify(cmd === 'build' ? report[0] : report, null, 2));
  return failed ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 2;
}
