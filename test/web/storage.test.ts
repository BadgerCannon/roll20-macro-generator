import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addHistory, importHistory, listHistory, removeHistory } from '../../src/web/storage';

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
});

const entry = (id: string, savedAt = 1_700_000_000_000) => ({
  id,
  title: id,
  source: 'macros: {}',
  savedAt,
});

describe('importHistory (review fixes)', () => {
  it('rejects timestamps a Date cannot represent', () => {
    const n = importHistory(
      JSON.stringify({ entries: [entry('ok'), entry('huge', 1e300), entry('nan', NaN)] }),
    );
    expect(n).toBe(1);
    const list = listHistory();
    expect(list.map((e) => e.id)).toEqual(['ok']);
    expect(() => list.map((e) => new Date(e.savedAt).toISOString())).not.toThrow();
  });

  it('keeps only the first of duplicate ids within one file', () => {
    const n = importHistory(JSON.stringify({ entries: [entry('a'), entry('a', 1), entry('b')] }));
    expect(n).toBe(2);
    expect(
      listHistory()
        .map((e) => e.id)
        .sort(),
    ).toEqual(['a', 'b']);
    removeHistory('a');
    expect(listHistory().map((e) => e.id)).toEqual(['b']);
  });

  it('skips ids that already exist', () => {
    const saved = addHistory('mine', 'x')!;
    expect(importHistory(JSON.stringify({ entries: [{ ...saved, title: 'theirs' }] }))).toBe(0);
    expect(listHistory().map((e) => e.title)).toEqual(['mine']);
  });
});
