/**
 * Keeping the API reference's serialized props small. Large generated specs
 * (hundreds of operations) otherwise ship the same data many times over in
 * every page's RSC payload. Pure, so it can be unit-tested.
 */

/**
 * Lift the spec-wide endpoint list (the Try it switcher) out of each section's
 * playground spec, so a page sends it once rather than once per operation.
 * The client puts it back with `withEndpoints`.
 */
export function hoistEndpoints<E, S extends { playground?: { endpoints?: E[] } }>(
  sections: S[],
): { sections: S[]; endpoints: E[] } {
  let endpoints: E[] = [];
  const out = sections.map((s) => {
    if (!s.playground?.endpoints) return s;
    if (!endpoints.length) endpoints = s.playground.endpoints;
    const { endpoints: _drop, ...playground } = s.playground;
    return { ...s, playground };
  });
  return { sections: out, endpoints };
}

/** Re-attach the shared endpoint list to one section's playground spec. */
export function withEndpoints<P extends object, E>(playground: P, endpoints: E[]): P & { endpoints: E[] } {
  return { ...playground, endpoints };
}

/**
 * Whether docs pages can land in an OpenAPI tab, so its sidebar shows on them:
 * it matches something outside the reference, or it's where unmatched pages
 * fall back to (`__default__`, else the first tab; see pickActiveTabId in
 * components/docs/nav.tsx). The reference renders its own sidebar, so any other
 * OpenAPI tab can leave operations out of docs pages' navigation data.
 */
export function apiTabHoldsDocs(tab: { match?: string[] }, tabs: { match?: string[] }[]): boolean {
  const outside = (tab.match ?? []).some((p) => p !== "/api-reference" && !p.startsWith("/api-reference/"));
  if (outside) return true;
  return tabs[0] === tab && !tabs.some((t) => t.match?.includes("__default__"));
}

/** The summary of the operation an `/api-reference/<operationId>` link points at. */
export function apiOperationLabel(
  href: string,
  operationsById: Record<string, { summary?: string; operationId: string }>,
): string | undefined {
  const m = /^\/api-reference\/([^/#?]+)/.exec(href);
  if (!m || !Object.prototype.hasOwnProperty.call(operationsById, m[1])) return undefined;
  const op = operationsById[m[1]];
  return op.summary ?? op.operationId;
}
