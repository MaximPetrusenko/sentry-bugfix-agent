import type { Octokit } from '@octokit/rest';

export interface BranchOptions {
  owner: string;
  repo: string;
  baseBranch: string;
  issueId: string;
  slug: string;
}

export async function createFixBranch(
  octokit: Octokit,
  options: BranchOptions,
): Promise<string> {
  const { owner, repo, baseBranch, issueId, slug } = options;

  // Get the SHA of the base branch tip
  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  const branchName = `fix/${issueId}-${sanitizeSlug(slug)}`;

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

  return branchName;
}

export async function applyDiffToBranch(
  octokit: Octokit,
  options: {
    owner: string;
    repo: string;
    branch: string;
    diff: string;
    commitMessage: string;
  },
): Promise<void> {
  const { owner, repo, branch, diff, commitMessage } = options;

  const changedFiles = parseDiffToFiles(diff);

  // Get the latest commit on the branch
  const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
  const baseTreeSha = branchData.commit.commit.tree.sha;
  const parentSha = branchData.commit.sha;

  // Build tree entries
  const treeItems: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    content?: string;
    sha?: null;
  }> = [];

  for (const [filePath, { content, deleted }] of Object.entries(changedFiles)) {
    if (deleted) {
      treeItems.push({ path: filePath, mode: '100644', type: 'blob', sha: null });
    } else {
      treeItems.push({ path: filePath, mode: '100644', type: 'blob', content });
    }
  }

  if (treeItems.length === 0) return;

  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message: commitMessage,
    tree: newTree.sha,
    parents: [parentSha],
  });

  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });
}

interface FileChange {
  content: string;
  deleted: boolean;
}

function parseDiffToFiles(diff: string): Record<string, FileChange> {
  const files: Record<string, FileChange> = {};
  const fileSections = diff.split(/^diff --git /m).filter((s) => s.trim());

  for (const section of fileSections) {
    const headerMatch = /^a\/.+ b\/(.+)\n/.exec(section);
    if (!headerMatch?.[1]) continue;
    const filePath = headerMatch[1].trim();

    const isDeleted = section.includes('\ndeleted file mode');
    const isNew = section.includes('\nnew file mode');

    if (isDeleted) {
      files[filePath] = { content: '', deleted: true };
      continue;
    }

    // Reconstruct file content from hunk
    const lines = section.split('\n');
    const contentLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('@@ ')) {
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;

      if (line.startsWith('+') && !line.startsWith('+++')) {
        contentLines.push(line.slice(1));
      } else if (!line.startsWith('-') && !line.startsWith('\\')) {
        contentLines.push(line.slice(1));
      }
    }

    files[filePath] = { content: contentLines.join('\n'), deleted: false };
  }

  return files;
}

function sanitizeSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
