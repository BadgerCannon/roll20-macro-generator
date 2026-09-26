/**
 * Writes public/r20macro.schema.json from the Zod schema.
 * `--check` fails instead of writing when the committed file is stale (used in CI).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { jsonSchema } from '../src/core/schema';

const file = 'public/r20macro.schema.json';
const schema = {
  $id: 'https://badgercannon.github.io/roll20-macro-generator/r20macro.schema.json',
  title: 'Roll20 macro generator DSL',
  ...(jsonSchema() as object),
};
const text = JSON.stringify(schema, null, 2) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(file, 'utf8');
  } catch {
    // missing file counts as stale
  }
  if (current !== text) {
    console.error(`${file} is stale. Run \`npm run gen:schema\` and commit the result.`);
    process.exit(1);
  }
  console.log(`${file} is up to date.`);
} else {
  mkdirSync('public', { recursive: true });
  writeFileSync(file, text);
  console.log(`Wrote ${file}`);
}
