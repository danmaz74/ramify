/** A page of the client, addressed by the URL fragment. */
export type Route =
  | { readonly page: 'plans' }
  | { readonly page: 'plan'; readonly planId: string }
  | { readonly page: 'run'; readonly planId: string; readonly runId: string };

function decoded(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * The route of a fragment such as `#/plans/review-notes` or
 * `#/plans/review-notes/runs/<run-id>`; anything else is the plan list.
 */
export function parseRoute(hash: string): Route {
  const run = /^#\/plans\/([^/]+)\/runs\/([^/]+)\/?$/.exec(hash);
  if (run) {
    const planId = decoded(run[1]!);
    const runId = decoded(run[2]!);
    return planId === undefined || runId === undefined ? { page: 'plans' } : { page: 'run', planId, runId };
  }
  const match = /^#\/plans\/([^/]+)\/?$/.exec(hash);
  if (!match) return { page: 'plans' };
  const planId = decoded(match[1]!);
  return planId === undefined ? { page: 'plans' } : { page: 'plan', planId };
}

/** The fragment of a route. */
export function routeHref(route: Route): string {
  switch (route.page) {
    case 'plans': return '#/';
    case 'plan': return `#/plans/${encodeURIComponent(route.planId)}`;
    case 'run': return `#/plans/${encodeURIComponent(route.planId)}/runs/${encodeURIComponent(route.runId)}`;
  }
}
