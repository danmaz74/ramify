/**
 * Re-arm the anchor-target highlight under client-side navigation.
 *
 * The stylesheet's `:target` rules cover full page loads and native
 * same-page hash jumps, but the browser only recomputes `:target` on real
 * navigations. When the SPA router pushState-navigates from another page to
 * `/glossary#term`, the heading scrolls into view without ever matching
 * `:target`, and the highlight never shows. This module mirrors the
 * pseudo-class into a real class, `anchor-target`, which the same CSS rules
 * also match, and re-applies it on every route update.
 *
 * This is a framework-lifecycle shim, which is why it lives in the site
 * shell rather than `../src`: `onRouteDidUpdate` is Docusaurus's client
 * module API. The highlight itself stays pure CSS and keeps working on
 * direct loads with this file deleted.
 */

const TARGET_CLASS = 'anchor-target';

export function onRouteDidUpdate({
  location,
}: {
  location: { hash: string };
}): void {
  for (const marked of Array.from(
    document.querySelectorAll(`.${TARGET_CLASS}`),
  )) {
    marked.classList.remove(TARGET_CLASS);
  }
  if (!location.hash) {
    return;
  }
  let id: string;
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  const target = document.getElementById(id);
  if (target === null) {
    return;
  }
  // A reflow between remove and add makes re-targeting the same heading
  // replay the flash animation instead of silently keeping the old state.
  void target.offsetWidth;
  target.classList.add(TARGET_CLASS);
}
