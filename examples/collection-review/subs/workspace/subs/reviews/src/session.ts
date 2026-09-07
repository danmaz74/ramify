import type { RevisionScope } from '../../contracts/src/interfaces/vocabulary.js';

/**
 * The review-session table.
 *
 * A client that opens an MCP session can bind that session to a revision
 * scope, and every later request of that session is reviewed under it. The
 * table is the whole of that state: which scope each session is bound to, and
 * which binding operation set it.
 *
 * It is a factory rather than a module-level map so that every instance is
 * explicit. The application creates exactly one, at assembly, and shares it
 * across the per-connection MCP servers; a test creates its own.
 */

/** What one session is currently bound to. */
export interface SessionBinding {
  readonly scope: RevisionScope;
  /**
   * Which binding operation of this table produced it, counting from one.
   * A counter rather than a clock: it makes an invocation snapshot say exactly
   * which binding it used, which a timestamp could not.
   */
  readonly boundAt: number;
}

/** The scope a caller asks a session to be bound to. */
export interface SessionBindingRequest {
  readonly scope: RevisionScope;
}

/** Bindings by session id, with a default for every session that has none. */
export interface SessionTable {
  /** Binds one session and returns the binding that is now in force. */
  bind(sessionId: string | null, binding: SessionBindingRequest): SessionBinding;
  /** The binding in force for one session; the default binding when it has none. */
  resolveBinding(sessionId: string | null): SessionBinding;
}

/**
 * What an unbound session reviews: the whole recorded chain. `boundAt` is zero
 * because no binding operation produced it.
 */
const defaultBinding: SessionBinding = Object.freeze({
  scope: Object.freeze({ kind: 'all' as const }),
  boundAt: 0,
});

/**
 * A new, empty table. A transport without a session of its own arrives with a
 * null id; that is one key like any other, and it resolves to the default
 * binding until something binds it.
 */
export function createSessionTable(): SessionTable {
  const bindings = new Map<string | null, SessionBinding>();
  let bindingCount = 0;

  return {
    bind(sessionId, binding) {
      bindingCount += 1;

      // The table keeps its own frozen copy, so a caller that later changes
      // the object it passed cannot change what a session is bound to.
      const stored: SessionBinding = Object.freeze({
        scope: Object.freeze({ ...binding.scope }),
        boundAt: bindingCount,
      });

      bindings.set(sessionId, stored);

      return stored;
    },

    resolveBinding(sessionId) {
      return bindings.get(sessionId) ?? defaultBinding;
    },
  };
}
