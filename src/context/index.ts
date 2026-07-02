import { resolve } from 'path';
import type { TriageResult, IssueContext, SentryIssueDetails } from '../types.js';
import type { GitHubRepoMapping } from '../config.js';
import type { SentryClientInterface } from './sentry-client.js';
import { createFrameMapper } from './frame-mapper.js';
import { getGitHistory } from './git-history.js';

export interface ContextAssembler {
  assemble(triageResult: TriageResult): Promise<IssueContext>;
}

export function createContextAssembler(
  sentryClient: SentryClientInterface,
  repoMapping: GitHubRepoMapping,
  repoRoot?: string,
): ContextAssembler {
  const frameMapper = createFrameMapper();
  const root = repoRoot ?? process.cwd();

  return {
    async assemble(triageResult: TriageResult): Promise<IssueContext> {
      const { event, issueId } = triageResult;

      // Fetch full issue details from Sentry in parallel
      const [issue, eventCount24h] = await Promise.all([
        sentryClient.getIssue(issueId),
        sentryClient.getEventCount24h(issueId),
      ]);

      const sentryDetails: SentryIssueDetails = {
        issue,
        latestEvent: event,
        eventCount24h,
      };

      // Map stack frames to actual files in the repo
      const allFrames = event.stackTrace;
      const relevantFiles = frameMapper.mapFramesToFiles(allFrames, root);

      // Collect git history for the relevant files
      const filePaths = relevantFiles.map((f) => f.path);
      const gitHistory = getGitHistory({
        repoRoot: root,
        filePaths,
        maxCommits: 10,
      });

      return {
        triageResult,
        relevantFiles,
        gitHistory,
        sentryDetails,
      };
    },
  };
}
