import { describe, it, expect } from 'vitest';
import { createPathChecker, extractPathsFromDiff } from './path-rules.js';

const config = {
  allowedPaths: ['src/**', 'tests/**', 'lib/**'],
  deniedPaths: ['infra/**', '.github/**', '**/*.lock', '**/package-lock.json', '.env*'],
};

const checker = createPathChecker(config);

describe('createPathChecker', () => {
  it('allows a file matching an allowed pattern', () => {
    expect(checker('src/app/index.ts').allowed).toBe(true);
  });

  it('allows a nested file in an allowed directory', () => {
    expect(checker('tests/unit/auth.test.ts').allowed).toBe(true);
  });

  it('denies a file matching a denied pattern', () => {
    const result = checker('infra/terraform/main.tf');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('infra/**');
  });

  it('denied pattern takes precedence over allowed pattern', () => {
    // If someone had src/**/*.lock, denied should win
    const mixedConfig = {
      allowedPaths: ['**'],
      deniedPaths: ['**/*.lock'],
    };
    const check = createPathChecker(mixedConfig);
    expect(check('yarn.lock').allowed).toBe(false);
  });

  it('denies .github files', () => {
    expect(checker('.github/workflows/ci.yml').allowed).toBe(false);
  });

  it('denies package-lock.json', () => {
    expect(checker('package-lock.json').allowed).toBe(false);
  });

  it('denies .env files', () => {
    expect(checker('.env').allowed).toBe(false);
    expect(checker('.env.local').allowed).toBe(false);
  });

  it('denies a file not in any allowed pattern', () => {
    const result = checker('scripts/deploy.sh');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not match any allowed path');
  });

  it('handles Windows-style paths by normalizing backslashes', () => {
    expect(checker('src\\app\\index.ts').allowed).toBe(true);
  });

  it('handles leading slash by stripping it', () => {
    expect(checker('/src/app/index.ts').allowed).toBe(true);
  });
});

describe('extractPathsFromDiff', () => {
  const diff = `
diff --git a/src/app.ts b/src/app.ts
index abc..def 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
+import foo from './foo';
 const x = 1;
diff --git a/tests/app.test.ts b/tests/app.test.ts
--- a/tests/app.test.ts
+++ b/tests/app.test.ts
@@ -1,1 +1,2 @@
+// test
  `.trim();

  it('extracts all file paths from a diff', () => {
    const paths = extractPathsFromDiff(diff);
    expect(paths).toContain('src/app.ts');
    expect(paths).toContain('tests/app.test.ts');
  });

  it('deduplicates paths that appear as both +++ and ---', () => {
    const paths = extractPathsFromDiff(diff);
    const count = paths.filter((p) => p === 'src/app.ts').length;
    expect(count).toBe(1);
  });

  it('returns empty array for empty diff', () => {
    expect(extractPathsFromDiff('')).toEqual([]);
  });

  it('excludes /dev/null', () => {
    const newFileDiff = `--- /dev/null\n+++ b/src/new.ts`;
    const paths = extractPathsFromDiff(newFileDiff);
    expect(paths).not.toContain('/dev/null');
    expect(paths).toContain('src/new.ts');
  });
});
