export interface DiffLimitResult {
  withinLimit: boolean;
  changedLines: number;
  limit: number;
  reason: string;
}

export function checkDiffSize(diff: string, maxLines: number): DiffLimitResult {
  const changedLines = countChangedLines(diff);
  if (changedLines <= maxLines) {
    return {
      withinLimit: true,
      changedLines,
      limit: maxLines,
      reason: `Diff has ${changedLines} changed lines, within limit of ${maxLines}`,
    };
  }
  return {
    withinLimit: false,
    changedLines,
    limit: maxLines,
    reason: `Diff has ${changedLines} changed lines, exceeding limit of ${maxLines} — filing for human review`,
  };
}

export function countChangedLines(diff: string): number {
  let count = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) count++;
    if (line.startsWith('-') && !line.startsWith('---')) count++;
  }
  return count;
}

/**
 * Check if the diff introduces any new dependencies.
 * Looks for changes to dependency manifest files.
 */
export function diffIntroducesNewDependency(diff: string): boolean {
  const dependencyFiles = [
    'package.json',
    'requirements.txt',
    'Pipfile',
    'Gemfile',
    'go.mod',
    'Cargo.toml',
    'pom.xml',
    'build.gradle',
    'pyproject.toml',
  ];

  // Check if any dependency manifest file appears in the diff header
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      for (const depFile of dependencyFiles) {
        if (line.includes(depFile)) return true;
      }
    }
  }

  return false;
}
