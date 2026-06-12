import { execSync } from 'child_process';
import type { GitCommit } from '../types.js';

export interface GitHistoryOptions {
  repoRoot: string;
  filePaths: string[];
  maxCommits?: number;
}

export function getGitHistory(options: GitHistoryOptions): GitCommit[] {
  const { repoRoot, filePaths, maxCommits = 10 } = options;
  if (filePaths.length === 0) return [];

  const commits: GitCommit[] = [];
  const seen = new Set<string>();

  for (const filePath of filePaths.slice(0, 5)) {
    try {
      const output = execSync(
        `git log --format="%H|||%s|||%an|||%ai" -${maxCommits} -- "${filePath}"`,
        { cwd: repoRoot, encoding: 'utf-8', timeout: 10_000 },
      );

      for (const line of output.trim().split('\n')) {
        if (!line.trim()) continue;
        const parts = line.split('|||');
        if (parts.length < 4) continue;

        const [sha, message, author, date] = parts;
        if (!sha || seen.has(sha)) continue;
        seen.add(sha);

        const filesChanged = getFilesChangedInCommit(repoRoot, sha);
        commits.push({
          sha: sha.trim(),
          message: (message ?? '').trim(),
          author: (author ?? '').trim(),
          date: (date ?? '').trim(),
          filesChanged,
        });
      }
    } catch {
      // git not available or file not tracked — skip
    }
  }

  // Sort by date descending, deduplicated across files
  return commits
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, maxCommits);
}

function getFilesChangedInCommit(repoRoot: string, sha: string): string[] {
  try {
    const output = execSync(`git diff-tree --no-commit-id -r --name-only "${sha}"`, {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}
