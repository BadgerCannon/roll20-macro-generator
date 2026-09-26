/**
 * Per-browser persistence in localStorage. Every access is guarded: storage can be disabled,
 * full, or throw in private windows. The app keeps working without it.
 */

const KEY_DRAFT = 'r20m:v1:draft';
const KEY_HISTORY = 'r20m:v1:history';
export const HISTORY_LIMIT = 50;
/** Largest timestamp a JavaScript `Date` accepts (±100,000,000 days from 1970). */
const MAX_DATE_MS = 8.64e15;

export interface HistoryEntry {
  id: string;
  title: string;
  source: string;
  savedAt: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(): string | null {
  return read(KEY_DRAFT);
}

export function saveDraft(source: string): boolean {
  return write(KEY_DRAFT, source);
}

function isEntry(x: unknown): x is HistoryEntry {
  const e = x as HistoryEntry;
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof e.id === 'string' &&
    typeof e.title === 'string' &&
    typeof e.source === 'string' &&
    typeof e.savedAt === 'number' &&
    // Must be a time `Date` can represent, or rendering the history list throws.
    Number.isFinite(e.savedAt) &&
    Math.abs(e.savedAt) <= MAX_DATE_MS
  );
}

export function listHistory(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(read(KEY_HISTORY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function store(entries: HistoryEntry[]): boolean {
  const sorted = [...entries].sort((a, b) => b.savedAt - a.savedAt).slice(0, HISTORY_LIMIT);
  return write(KEY_HISTORY, JSON.stringify(sorted));
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Saves a snapshot, newest first. Returns the entry, or `null` if storage failed. */
export function addHistory(title: string, source: string): HistoryEntry | null {
  const entry: HistoryEntry = { id: newId(), title, source, savedAt: Date.now() };
  return store([entry, ...listHistory()]) ? entry : null;
}

export function renameHistory(id: string, title: string): boolean {
  return store(listHistory().map((e) => (e.id === id ? { ...e, title } : e)));
}

export function removeHistory(id: string): boolean {
  return store(listHistory().filter((e) => e.id !== id));
}

export function exportHistory(): string {
  return JSON.stringify({ format: 'r20m-history', version: 1, entries: listHistory() }, null, 2);
}

/** Merges exported history into the current one. Returns the number of entries added. */
export function importHistory(json: string): number {
  const data = JSON.parse(json) as { entries?: unknown };
  const incoming = Array.isArray(data.entries) ? data.entries.filter(isEntry) : [];
  const current = listHistory();
  const ids = new Set(current.map((e) => e.id));
  const added: HistoryEntry[] = [];
  for (const e of incoming) {
    if (ids.has(e.id)) continue; // also drops repeats within the imported file
    ids.add(e.id);
    added.push(e);
  }
  if (!store([...current, ...added])) throw new Error('Browser storage is not available');
  return added.length;
}
