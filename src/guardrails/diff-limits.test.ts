import { describe, it, expect } from 'vitest';
import { checkDiffSize, countChangedLines, diffIntroducesNewDependency } from './diff-limits.js';

function makeDiff(additions: number, deletions: number): string {
  const lines: string[] = [
    'diff --git a/src/foo.ts b/src/foo.ts',
    '--- a/src/foo.ts',
    '+++ b/src/foo.ts',
    '@@ -1,10 +1,10 @@',
  ];
  for (let i = 0; i < additions; i++) lines.push(`+const added${i} = true;`);
  for (let i = 0; i < deletions; i++) lines.push(`-const removed${i} = true;`);
  lines.push(' const unchanged = 1;');
  return lines.join('\n');
}

describe('countChangedLines', () => {
  it('counts additions', () => {
    expect(countChangedLines(makeDiff(5, 0))).toBe(5);
  });

  it('counts deletions', () => {
    expect(countChangedLines(makeDiff(0, 3))).toBe(3);
  });

  it('counts additions and deletions together', () => {
    expect(countChangedLines(makeDiff(5, 3))).toBe(8);
  });

  it('does not count diff headers (+++/---)', () => {
    const diff = '--- a/foo.ts\n+++ b/foo.ts\n+actual change\n';
    expect(countChangedLines(diff)).toBe(1);
  });

  it('returns 0 for empty diff', () => {
    expect(countChangedLines('')).toBe(0);
  });

  it('does not count context lines (space prefix)', () => {
    const diff = ' context line\n+added\n context line2\n';
    expect(countChangedLines(diff)).toBe(1);
  });
});

describe('checkDiffSize', () => {
  it('passes when changed lines are within the limit', () => {
    const result = checkDiffSize(makeDiff(10, 5), 200);
    expect(result.withinLimit).toBe(true);
    expect(result.changedLines).toBe(15);
  });

  it('fails when changed lines exceed the limit', () => {
    const result = checkDiffSize(makeDiff(150, 100), 200);
    expect(result.withinLimit).toBe(false);
    expect(result.changedLines).toBe(250);
    expect(result.reason).toContain('250');
    expect(result.reason).toContain('200');
  });

  it('passes when changed lines equal the limit exactly', () => {
    const result = checkDiffSize(makeDiff(100, 100), 200);
    expect(result.withinLimit).toBe(true);
  });

  it('includes limit and count in the result', () => {
    const result = checkDiffSize(makeDiff(10, 5), 50);
    expect(result.limit).toBe(50);
    expect(result.changedLines).toBe(15);
  });
});

describe('diffIntroducesNewDependency', () => {
  it('returns true when package.json is modified', () => {
    const diff = `diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n+  "new-lib": "^1.0.0"`;
    expect(diffIntroducesNewDependency(diff)).toBe(true);
  });

  it('returns true when requirements.txt is modified', () => {
    const diff = `--- a/requirements.txt\n+++ b/requirements.txt\n+requests==2.28.0`;
    expect(diffIntroducesNewDependency(diff)).toBe(true);
  });

  it('returns true when Gemfile is modified', () => {
    const diff = `--- a/Gemfile\n+++ b/Gemfile\n+gem 'rails'`;
    expect(diffIntroducesNewDependency(diff)).toBe(true);
  });

  it('returns false when only source files are modified', () => {
    const diff = `--- a/src/app.ts\n+++ b/src/app.ts\n+const x = 1;`;
    expect(diffIntroducesNewDependency(diff)).toBe(false);
  });

  it('returns false for an empty diff', () => {
    expect(diffIntroducesNewDependency('')).toBe(false);
  });
});
