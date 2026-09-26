import './style.css';
import { indentWithTab } from '@codemirror/commands';
import { linter, lintGutter, type Diagnostic as CmDiagnostic } from '@codemirror/lint';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { yamlSchema } from 'codemirror-json-schema/yaml';
import type { JSONSchema7 } from 'json-schema';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { compile, type CompileResult, type Diagnostic } from '../core';
import { jsonSchema } from '../core/schema';
import {
  addHistory,
  exportHistory,
  importHistory,
  listHistory,
  loadDraft,
  removeHistory,
  renameHistory,
  saveDraft,
} from './storage';

// ---------------------------------------------------------------------------------------------
// Examples bundled from examples/*.r20.yaml

const exampleFiles = import.meta.glob('../../examples/*.r20.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const examples = Object.entries(exampleFiles)
  .map(([path, source]) => ({ name: path.split('/').pop()!.replace('.r20.yaml', ''), source }))
  .sort((a, b) =>
    a.name === 'basics' ? -1 : b.name === 'basics' ? 1 : a.name.localeCompare(b.name),
  );

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
};

const status = $<HTMLSpanElement>('status');
let statusTimer: number | undefined;
function flash(message: string) {
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (status.textContent = ''), 2500);
}

// ---------------------------------------------------------------------------------------------
// Initial source: share link > saved draft > basics example

function sourceFromHash(): string | null {
  const m = /^#src=(.+)$/.exec(location.hash);
  if (!m) return null;
  return decompressFromEncodedURIComponent(m[1]!) || null;
}

const initial =
  sourceFromHash() ?? loadDraft() ?? examples.find((e) => e.name === 'basics')?.source ?? '';

// ---------------------------------------------------------------------------------------------
// Editor

let lastResult: CompileResult = compile(initial);

function toCm(d: Diagnostic, docLength: number, lineEnd: (pos: number) => number): CmDiagnostic {
  const from = Math.min(d.from ?? 0, docLength);
  // Keep underlines to one line: map-level diagnostics would otherwise cover a whole macro.
  const to = Math.max(from, Math.min(d.to ?? from, lineEnd(from), docLength));
  return {
    from,
    to,
    severity: d.severity,
    source: d.code,
    message: d.macro ? `${d.message} (${d.macro})` : d.message,
  };
}

const r20Lint = linter(
  (view) => {
    const len = view.state.doc.length;
    const lineEnd = (pos: number) => view.state.doc.lineAt(pos).to;
    return [...lastResult.diagnostics, ...lastResult.macros.flatMap((m) => m.diagnostics)].map(
      (d) => toCm(d, len, lineEnd),
    );
  },
  { delay: 250 },
);

const dark = window.matchMedia('(prefers-color-scheme: dark)');
const theme = new Compartment();

let debounce: number | undefined;
const view = new EditorView({
  parent: $('editor'),
  state: EditorState.create({
    doc: initial,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      EditorState.tabSize.of(2),
      yamlSchema(jsonSchema() as JSONSchema7),
      lintGutter(),
      r20Lint,
      theme.of(dark.matches ? oneDark : []),
      EditorView.updateListener.of((u) => {
        if (!u.docChanged) return;
        clearTimeout(debounce);
        debounce = window.setTimeout(() => {
          debounce = undefined;
          update();
        }, 200);
      }),
    ],
  }),
});
dark.addEventListener('change', () =>
  view.dispatch({ effects: theme.reconfigure(dark.matches ? oneDark : []) }),
);

function source(): string {
  return view.state.doc.toString();
}

function setSource(text: string) {
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  update();
}

function goTo(d: Diagnostic) {
  if (d.from === undefined) return;
  view.dispatch({ selection: { anchor: d.from }, scrollIntoView: true });
  view.focus();
}

// ---------------------------------------------------------------------------------------------
// Output

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = el('textarea', { value: text });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const SEV_ORDER = { error: 0, warning: 1, info: 2 } as const;

function diagList(ds: Diagnostic[]): HTMLUListElement | null {
  if (!ds.length) return null;
  const sorted = [...ds].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
  return el(
    'ul',
    { className: 'diags' },
    ...sorted.map((d) => {
      const li = el('li', { className: d.severity }, el('span', { className: 'sev' }, d.severity));
      const msg = el('span', {}, d.message + ' ');
      if (d.line !== undefined) {
        const loc = el(
          'button',
          { className: 'loc', type: 'button', title: 'Show in editor' },
          `line ${d.line}`,
        );
        loc.addEventListener('click', () => goTo(d));
        msg.append(loc);
      }
      li.append(msg);
      return li;
    }),
  );
}

function renderOutput(r: CompileResult) {
  const out = $('output');
  const docDiags = $('doc-diagnostics');
  docDiags.replaceChildren(...[diagList(r.diagnostics)].filter((x): x is HTMLUListElement => !!x));
  const cards = r.macros.map((m) => {
    const failed = m.output === undefined;
    const copyBtn = el(
      'button',
      { type: 'button', className: 'primary', disabled: failed },
      'Copy',
    );
    copyBtn.addEventListener('click', async () => {
      const ok = await copy(m.output ?? '');
      copyBtn.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
    });
    const title = el('div', { className: 'card-title' }, el('h3', {}, m.name));
    if (m.description) title.append(el('p', {}, m.description));
    const meta = el(
      'div',
      { className: 'card-meta' },
      failed ? '' : `${m.output!.length.toLocaleString()} chars`,
      copyBtn,
    );
    const card = el(
      'article',
      { className: failed ? 'card failed' : 'card' },
      el('div', { className: 'card-head' }, title, meta),
    );
    const list = diagList(m.diagnostics);
    if (list) card.append(list);
    card.append(el('pre', { tabIndex: 0 }, m.output ?? 'Not generated: fix the errors above.'));
    return card;
  });
  if (!cards.length && !r.diagnostics.length) {
    cards.push(el('p', { className: 'empty' }, 'Add a macro under `macros:` to see it here.'));
  }
  out.replaceChildren(...cards);

  const errors = [...r.diagnostics, ...r.macros.flatMap((m) => m.diagnostics)].filter(
    (d) => d.severity === 'error',
  ).length;
  $('summary').textContent =
    `${r.macros.length} macro${r.macros.length === 1 ? '' : 's'}` +
    (errors ? ` · ${errors} error${errors === 1 ? '' : 's'}` : '');
}

function update() {
  const text = source();
  lastResult = compile(text);
  renderOutput(lastResult);
  saveDraft(text);
}

// ---------------------------------------------------------------------------------------------
// Examples, share, history

const exampleSelect = $<HTMLSelectElement>('examples');
for (const e of examples) exampleSelect.append(el('option', { value: e.name }, e.name));
exampleSelect.addEventListener('change', () => {
  const e = examples.find((x) => x.name === exampleSelect.value);
  exampleSelect.value = '';
  if (!e) return;
  if (source().trim() && !confirm(`Replace the editor contents with the "${e.name}" example?`))
    return;
  setSource(e.source);
  flash(`Loaded example "${e.name}"`);
});

$('share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#src=${compressToEncodedURIComponent(source())}`;
  history.replaceState(null, '', url);
  flash((await copy(url)) ? 'Share link copied' : 'Share link is in the address bar');
});

const drawer = $<HTMLElement>('history');
const toggle = $<HTMLButtonElement>('history-toggle');
function openHistory(open: boolean) {
  drawer.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  if (open) renderHistory();
}
toggle.addEventListener('click', () => openHistory(drawer.hidden !== false));
$('history-close').addEventListener('click', () => openHistory(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !drawer.hidden) openHistory(false);
});

function defaultTitle(): string {
  const names = lastResult.macros.map((m) => m.name);
  if (!names.length) return 'Untitled';
  return names.length > 2
    ? `${names.slice(0, 2).join(', ')} +${names.length - 2}`
    : names.join(', ');
}

function storageWorks(): boolean {
  try {
    const k = 'r20m:v1:probe';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Runs a pending debounced update now, so actions see what is in the editor. */
function flush() {
  if (debounce === undefined) return;
  clearTimeout(debounce);
  debounce = undefined;
  update();
}

$('save').addEventListener('click', () => {
  flush();
  const entry = addHistory(defaultTitle(), source());
  flash(entry ? `Saved "${entry.title}"` : 'Could not save: browser storage is not available');
  if (!drawer.hidden) renderHistory();
});

function renderHistory() {
  const entries = listHistory();
  $('storage-warning').hidden = storageWorks();
  $('history-empty').hidden = entries.length > 0;
  $('history-list').replaceChildren(
    ...entries.map((e) => {
      const restore = el('button', { type: 'button', className: 'primary' }, 'Restore');
      restore.addEventListener('click', () => {
        if (source() !== e.source && !confirm(`Replace the editor contents with "${e.title}"?`))
          return;
        setSource(e.source);
        openHistory(false);
        flash(`Restored "${e.title}"`);
      });
      const rename = el('button', { type: 'button' }, 'Rename');
      rename.addEventListener('click', () => {
        const title = prompt('New name', e.title)?.trim();
        if (title) renameHistory(e.id, title);
        renderHistory();
      });
      const del = el('button', { type: 'button' }, 'Delete');
      del.addEventListener('click', () => {
        if (!confirm(`Delete "${e.title}" from history?`)) return;
        removeHistory(e.id);
        renderHistory();
      });
      return el(
        'li',
        {},
        el('div', { className: 'title' }, e.title),
        el(
          'time',
          { dateTime: new Date(e.savedAt).toISOString() },
          new Date(e.savedAt).toLocaleString(),
        ),
        el('div', { className: 'row' }, restore, rename, del),
      );
    }),
  );
}

$('history-export').addEventListener('click', () => {
  const blob = new Blob([exportHistory()], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'r20m-history.json' });
  a.click();
  URL.revokeObjectURL(a.href);
});

$<HTMLInputElement>('history-import').addEventListener('change', async (ev) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const n = importHistory(await file.text());
    flash(`Imported ${n} entr${n === 1 ? 'y' : 'ies'}`);
  } catch (e) {
    flash(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  renderHistory();
});

renderOutput(lastResult);
