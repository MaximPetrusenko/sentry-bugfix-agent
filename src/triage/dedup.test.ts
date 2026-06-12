import { describe, it, expect } from 'vitest';
import { createInMemoryDedupStore } from './dedup.js';

describe('createInMemoryDedupStore', () => {
  it('returns false for an unseen issue', () => {
    const store = createInMemoryDedupStore();
    expect(store.hasProcessed('issue-1')).toBe(false);
  });

  it('returns true after marking an issue as processed', () => {
    const store = createInMemoryDedupStore();
    store.markProcessed('issue-1');
    expect(store.hasProcessed('issue-1')).toBe(true);
  });

  it('does not affect other issue IDs', () => {
    const store = createInMemoryDedupStore();
    store.markProcessed('issue-1');
    expect(store.hasProcessed('issue-2')).toBe(false);
  });

  it('is idempotent — marking twice does not break anything', () => {
    const store = createInMemoryDedupStore();
    store.markProcessed('issue-1');
    store.markProcessed('issue-1');
    expect(store.hasProcessed('issue-1')).toBe(true);
  });

  it('evicts oldest entries when maxSize is exceeded', () => {
    const store = createInMemoryDedupStore(3);
    store.markProcessed('a');
    store.markProcessed('b');
    store.markProcessed('c');
    store.markProcessed('d'); // evicts 'a'
    expect(store.hasProcessed('a')).toBe(false);
    expect(store.hasProcessed('b')).toBe(true);
    expect(store.hasProcessed('d')).toBe(true);
  });
});
