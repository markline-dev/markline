/**
 * Keeping the API reference's serialized props small. Large generated specs
 * (hundreds of operations) otherwise ship the same data many times over in
 * every page's RSC payload. Pure, so it can be unit-tested.
 */

/** Longest command-palette snippet. The palette shows two lines; the rest of
 *  a long description is dead weight on every page. */
export const SNIPPET_MAX = 200;

/** Collapse whitespace and cut at a word boundary, with an ellipsis. */
export function clipSnippet(text: string, max = SNIPPET_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

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
