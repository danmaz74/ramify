/** A page of the client, addressed by the URL fragment. */
export type Route =
  | { readonly page: 'plans' }
  | {
    readonly page: 'plan';
    readonly planId: string;
    readonly view: 'plan' | 'map';
    /** On the Map view, the saved revision chosen; the latest when absent. */
    readonly revision?: number | undefined;
  };

/**
 * The route of a fragment such as `#/plans/review-notes/map` or
 * `#/plans/review-notes/map/2`; anything else is the plan list.
 */
export function parseRoute(hash: string): Route {
  const match = /^#\/plans\/([^/]+)(?:\/(map)(?:\/([1-9]\d{0,8}))?)?\/?$/.exec(hash);
  if (!match) return { page: 'plans' };
  let planId: string;
  try {
    planId = decodeURIComponent(match[1]!);
  } catch {
    return { page: 'plans' };
  }
  if (match[2] !== 'map') return { page: 'plan', planId, view: 'plan' };
  return match[3] === undefined ? { page: 'plan', planId, view: 'map' } : { page: 'plan', planId, view: 'map', revision: Number(match[3]) };
}

/** The fragment of a route. */
export function routeHref(route: Route): string {
  if (route.page === 'plans') return '#/';
  const base = `#/plans/${encodeURIComponent(route.planId)}`;
  if (route.view === 'plan') return base;
  return route.revision === undefined ? `${base}/map` : `${base}/map/${route.revision}`;
}
