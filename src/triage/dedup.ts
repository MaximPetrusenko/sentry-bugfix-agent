export interface DedupStore {
  hasProcessed(issueId: string): boolean;
  markProcessed(issueId: string): void;
}

/**
 * In-memory dedup store. In production deployments, swap for a Redis/DB-backed
 * implementation via the DedupStore interface.
 */
export function createInMemoryDedupStore(maxSize = 50_000): DedupStore {
  const processed = new Set<string>();
  const insertionOrder: string[] = [];

  return {
    hasProcessed(issueId: string): boolean {
      return processed.has(issueId);
    },

    markProcessed(issueId: string): void {
      if (processed.has(issueId)) return;

      processed.add(issueId);
      insertionOrder.push(issueId);

      // Evict oldest entries when we exceed maxSize
      while (insertionOrder.length > maxSize) {
        const oldest = insertionOrder.shift();
        if (oldest !== undefined) processed.delete(oldest);
      }
    },
  };
}
