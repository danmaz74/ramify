import type { SubmissionError } from '../run/submissions.js';

/** Capability tasks may authorize changes to registered agreement artifacts only.
 * Compiler/runner/audit/root configuration remains guarded but this task policy
 * offers no authorization for it. The same set feeds validation and briefing. */
export function capabilityGuardedPolicy(artifacts: readonly { readonly path: string }[]): ReadonlySet<string> {
  return new Set(artifacts.map(artifact => artifact.path));
}

export function capabilityAuthorizationErrors(authorizations: readonly { readonly path: string }[] | undefined,
  supported: ReadonlySet<string>): SubmissionError[] {
  return (authorizations ?? []).flatMap((authorization, index) => supported.has(authorization.path) ? [] : [{
    path: `authorizations.${index}.path`, message: `${authorization.path} is outside the capability task's declared artifact authorization policy`,
    expected: 'a registered agreement artifact advertised by this task',
  }]);
}
