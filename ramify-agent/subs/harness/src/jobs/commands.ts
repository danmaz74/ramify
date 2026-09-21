import { createHash } from 'node:crypto';
import type { ErrorCode } from '../interfaces/protocol/errors.js';
import type { AcceptedCommand, Receipt } from '../interfaces/protocol/jobs.js';

/**
 * Any command the harness serves: a client-chosen ID, the version of the
 * subject it expects, and the content that is hashed with it. The rules
 * below are the same for a mapping command and for a run command, so they
 * are stated once, over this shape.
 */
export interface CommandLike {
  readonly commandId: string;
  readonly expectedVersion: number;
}

/*
 * Accepting a command, which is decided before the command has any effect.
 * Three rules hold for every command the harness serves:
 *
 *   1. A command whose ID and content match an accepted command returns that
 *      command's receipt and does nothing more, whatever the job's version
 *      now is.
 *   2. A reused ID with other content is a conflict.
 *   3. A new command whose expected version is not the job's is stale, and
 *      the rejection carries the current version.
 */

/** A command the harness refused, with the protocol's error code. */
export class CommandRejection extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly currentVersion?: number) {
    super(message);
    this.name = 'CommandRejection';
  }
}

/** What admitting a command decided: a repeat of one already accepted, or a new command. */
export type Admission =
  | { readonly kind: 'repeat'; readonly receipt: Receipt }
  | { readonly kind: 'new'; readonly contentHash: string };

/**
 * The commands this harness has accepted, by ID. It is rebuilt on load from
 * the events that record them, so a client that retries after a restart
 * receives the same receipt it would have received before.
 */
export class CommandLedger {
  private readonly accepted = new Map<string, AcceptedCommand>();

  /** Remembers a command an event records as accepted. */
  remember(command: AcceptedCommand): void {
    this.accepted.set(command.commandId, command);
  }

  /** Rules 1 and 2, before the command has any effect. */
  admit(command: CommandLike): Admission {
    const contentHash = commandHash(command);
    const earlier = this.accepted.get(command.commandId);
    if (!earlier) return { kind: 'new', contentHash };
    if (earlier.contentHash === contentHash) return { kind: 'repeat', receipt: earlier.receipt };
    throw new CommandRejection('conflict', `Command ID "${command.commandId}" was already used for a different command`);
  }

  /** Rule 3. `message` replaces the default for a command that creates its own subject. */
  requireVersion(command: CommandLike, current: number, message?: string): void {
    if (command.expectedVersion === current) return;
    throw new CommandRejection('stale-version', message ?? `The job is at version ${current}, not ${command.expectedVersion}`, current);
  }

  /**
   * The record of a command accepted now. The caller appends the event that
   * holds it and only then remembers it, so a command is accepted exactly
   * when its event is in the log.
   */
  accept(command: CommandLike, contentHash: string, jobId: string, sequence: number, at: Date): AcceptedCommand {
    const receipt: Receipt = { commandId: command.commandId, jobId, sequence, acceptedAt: at.toISOString() };
    return { commandId: command.commandId, contentHash, receipt };
  }
}

/** The SHA-256 of a command without its ID, over JSON with sorted keys. */
export function commandHash(command: CommandLike): string {
  const { commandId: _id, ...content } = command;
  return createHash('sha256').update(canonicalJson(content)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
