import micromatch from 'micromatch';

export interface PathRulesConfig {
  allowedPaths: string[];
  deniedPaths: string[];
}

export interface PathCheckResult {
  allowed: boolean;
  reason: string;
}

export function createPathChecker(config: PathRulesConfig): (filePath: string) => PathCheckResult {
  return function checkPath(filePath: string): PathCheckResult {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\//, '');

    // Denied paths take absolute precedence
    for (const pattern of config.deniedPaths) {
      if (micromatch.isMatch(normalized, pattern, { dot: true })) {
        return {
          allowed: false,
          reason: `File "${normalized}" matches denied pattern "${pattern}"`,
        };
      }
    }

    // Must match at least one allowed pattern
    for (const pattern of config.allowedPaths) {
      if (micromatch.isMatch(normalized, pattern, { dot: true })) {
        return { allowed: true, reason: `File "${normalized}" matches allowed pattern "${pattern}"` };
      }
    }

    return {
      allowed: false,
      reason: `File "${normalized}" does not match any allowed path pattern`,
    };
  };
}

/**
 * Parse a unified diff and return all file paths mentioned in it.
 */
export function extractPathsFromDiff(diff: string): string[] {
  const paths = new Set<string>();
  for (const line of diff.split('\n')) {
    // +++ b/src/foo.ts  or  --- a/src/foo.ts
    const match = /^(?:\+\+\+|---) [ab]\/(.+)$/.exec(line);
    if (match?.[1] && match[1] !== '/dev/null') {
      paths.add(match[1]);
    }
  }
  return [...paths];
}
