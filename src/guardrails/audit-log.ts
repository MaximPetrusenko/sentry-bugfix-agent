import { appendFileSync } from 'fs';
import { randomUUID } from 'crypto';
import type { AuditEntry } from '../types.js';

export interface AuditLog {
  append(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;
  getPath(): string;
}

export function createAuditLog(logPath: string): AuditLog {
  return {
    async append(partialEntry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
      const entry: AuditEntry = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        ...partialEntry,
      };

      const line = JSON.stringify(entry) + '\n';
      try {
        appendFileSync(logPath, line, 'utf-8');
      } catch (err) {
        // Log to stderr but don't crash the pipeline over audit log failures
        console.error(`[audit-log] Failed to write to ${logPath}:`, err);
      }
    },

    getPath(): string {
      return logPath;
    },
  };
}
