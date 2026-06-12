import { existsSync, readFileSync } from 'fs';
import { resolve, extname } from 'path';
import type { StackFrame, RepoFile } from '../types.js';

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rs': 'rust',
  '.cs': 'csharp',
  '.php': 'php',
};

export interface FrameMapper {
  mapFramesToFiles(frames: StackFrame[], repoRoot: string): RepoFile[];
}

export function createFrameMapper(): FrameMapper {
  return {
    mapFramesToFiles(frames: StackFrame[], repoRoot: string): RepoFile[] {
      const seen = new Set<string>();
      const files: RepoFile[] = [];

      // Process in-app frames first, most recent last (deepest in stack)
      const inApp = frames.filter((f) => f.inApp && f.filename);
      const outOfApp = frames.filter((f) => !f.inApp && f.filename);
      const ordered = [...inApp, ...outOfApp];

      for (const frame of ordered) {
        if (!frame.filename) continue;

        const normalized = normalizeFilename(frame.filename);
        if (seen.has(normalized)) continue;
        seen.add(normalized);

        const absolutePath = resolve(repoRoot, normalized);
        if (!existsSync(absolutePath)) continue;

        try {
          const content = readFileSync(absolutePath, 'utf-8');
          const ext = extname(normalized);
          const language = EXTENSION_TO_LANGUAGE[ext] ?? 'text';
          files.push({ path: normalized, content, language });
        } catch {
          // Skip unreadable files
        }
      }

      return files;
    },
  };
}

function normalizeFilename(filename: string): string {
  // Strip common prefixes added by bundlers/transpilers
  return filename
    .replace(/^\.\//, '')
    .replace(/^\/app\//, '')
    .replace(/^app\//, '')
    .replace(/^\/?src\//, 'src/')
    .replace(/\?.*$/, ''); // Strip query strings from webpack/bundler paths
}
