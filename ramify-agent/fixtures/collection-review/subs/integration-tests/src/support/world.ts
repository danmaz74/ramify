import { World, setWorldConstructor } from '@cucumber/cucumber';

import { createTestSystem } from '../../../../src/tests/setup.js';

/**
 * What one scenario works with: the assembled system, what it has read from it
 * so far, and the MCP sessions it has opened.
 *
 * The system is the same one every other test in this package uses. The root
 * defines `createTestSystem` in its `src/tests/` and exposes it to its
 * descendants; this module is a separate owner, so that exposure is its only
 * way in, and the symbol's `[testing, dispatch]` tags are why this module's
 * header carries both. The setup's own result types are not exposed, so they
 * are read off the exposed function below. A scenario therefore drives the
 * real tRPC client and the real MCP server rather than anything written for
 * Cucumber.
 *
 * Sessions are kept so the `After` hook can close them. A scenario that leaves
 * one open would keep the runner's process alive after its last step.
 */

/** The configured system, as the root's exposed setup hands it out. */
type TestSystem = ReturnType<typeof createTestSystem>;

/** One MCP session of that system. */
export type McpSession = Awaited<ReturnType<TestSystem['connectMcpSession']>>;

/** What `catalog.get` answers, as the typed client infers it. */
type RecordSummary = Awaited<ReturnType<TestSystem['client']['catalog']['get']['query']>>;

/** What `reviews.run` answers, likewise. */
type ReviewOutcome = Awaited<ReturnType<TestSystem['client']['reviews']['run']['mutate']>>;

/**
 * The revision scope a session is bound to, as a step states it. The neutral
 * vocabulary that defines this shape belongs to `contracts` and travels down
 * from `workspace`, so this owner cannot import it and describes the small
 * part it needs itself.
 */
export interface BoundScope {
  readonly kind: string;
  readonly count?: number;
}

export class CollectionReviewWorld extends World {
  private assembled: TestSystem | null = null;
  private lastSummaries: readonly RecordSummary[] = [];
  private lastReview: ReviewOutcome | null = null;
  private lastBinding: BoundScope | null = null;
  private readonly openedSessions: McpSession[] = [];

  /** Assembles the system this scenario runs against. */
  configure(): void {
    this.assembled = createTestSystem();
  }

  get system(): TestSystem {
    if (this.assembled === null) {
      throw new Error('This scenario has not configured the collection-review system yet.');
    }

    return this.assembled;
  }

  recordSummaries(summaries: readonly RecordSummary[]): void {
    this.lastSummaries = summaries;
  }

  get summaries(): readonly RecordSummary[] {
    return this.lastSummaries;
  }

  recordReview(outcome: ReviewOutcome): void {
    this.lastReview = outcome;
  }

  get review(): ReviewOutcome {
    if (this.lastReview === null) {
      throw new Error('This scenario has run no review through the typed client yet.');
    }

    return this.lastReview;
  }

  /** Opens one MCP session and keeps it for `closeAll` to close. */
  async openMcpSession(sessionId: string): Promise<McpSession> {
    const session = await this.system.connectMcpSession(sessionId);

    this.openedSessions.push(session);

    return session;
  }

  /** The session opened last, which the remaining MCP steps go on using. */
  get mcpSession(): McpSession {
    const session = this.openedSessions.at(-1);

    if (!session) {
      throw new Error('This scenario has opened no MCP session.');
    }

    return session;
  }

  recordBinding(scope: BoundScope): void {
    this.lastBinding = scope;
  }

  get binding(): BoundScope {
    if (this.lastBinding === null) {
      throw new Error('This scenario has bound no session to a revision scope.');
    }

    return this.lastBinding;
  }

  /** Closes every session this scenario opened. The `After` hook calls it. */
  async closeAll(): Promise<void> {
    for (const session of this.openedSessions.splice(0)) {
      await session.close();
    }
  }
}

setWorldConstructor(CollectionReviewWorld);
