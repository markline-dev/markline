/**
 * Hierarchical OpenAPI tag parsing.
 *
 * NestJS controllers commonly use slash-separated `@ApiTags` ("billing/invoices",
 * "admin/api/keys"). Markline derives a nested sidebar from them while
 * keeping each leaf tag a routable resource page at `/api-reference/<full-slug>`.
 * URLs never change — the slug is always `tagSlug` of the *full* raw tag; only
 * the navigation becomes a tree.
 *
 * These helpers are pure and deterministic (no spec/FS access) so they can be
 * unit-tested in isolation.
 */

/**
 * URL slug for a tag — lowercased, runs of non-alphanumerics collapsed to a
 * single dash. Computed from the *full* raw tag, so existing links keep working
 * ("billing/invoices" → "billing-invoices").
 */
export function tagSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Small acronym map so segments read naturally ("fx" → "FX", "api" → "API"). */
const ACRONYMS: Record<string, string> = {
  api: "API", sdk: "SDK", url: "URL", id: "ID", ip: "IP", fx: "FX",
  kyc: "KYC", otp: "OTP", pin: "PIN", sms: "SMS", us: "US", uk: "UK", eu: "EU",
  ngn: "NGN", usd: "USD", gbp: "GBP", eur: "EUR",
};

/**
 * Title-case a single tag *segment* — splits camelCase / kebab / snake and
 * applies the acronym map. Operates on one segment, never the slashed path
 * ("invoices" → "Invoices", "payment-methods" → "Payment Methods", "fx" → "FX").
 */
export function segmentDisplayName(seg: string): string {
  const words = seg
    .replace(/[-_]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return seg;
  return words
    .map((w) => ACRONYMS[w.toLowerCase()] ?? w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export type ParsedTag = {
  /** Original tag, e.g. "billing/invoices". */
  raw: string;
  /** Path segments, e.g. ["billing", "invoices"]. */
  segments: string[];
  /** Parent path or null, e.g. "billing" / "admin/api" / null. */
  parentPath: string | null;
  /** Last segment, e.g. "invoices". */
  leaf: string;
  /** URL slug of the full raw tag, e.g. "billing-invoices". */
  slug: string;
  /** Display name of the leaf segment, e.g. "Invoices". */
  displayName: string;
  /** Display names of the parent segments, e.g. ["Tools"] (deepest last). */
  parentDisplayNames: string[];
};

export function parseOpenApiTag(raw: string): ParsedTag {
  const segments = raw.split("/").map((s) => s.trim()).filter(Boolean);
  const leaf = segments.length ? segments[segments.length - 1] : raw;
  const parents = segments.slice(0, -1);
  return {
    raw,
    segments,
    parentPath: parents.length ? parents.join("/") : null,
    leaf,
    slug: tagSlug(raw),
    displayName: segmentDisplayName(leaf),
    parentDisplayNames: parents.map(segmentDisplayName),
  };
}

/**
 * A node in the derived tag tree. A node is a `leaf` (a routable resource page)
 * when it has no children, a `group` (nav-only accordion) when it does. A node
 * can be a real tag *and* a group at once — a tag that is also the prefix of
 * others — in which case `tag` is set and `children` is non-empty.
 */
export type TagTreeNode = {
  type: "group" | "leaf";
  /** Display name of this node's last segment. */
  name: string;
  /** Full slash path of this node ("billing" / "billing/invoices"). */
  path: string;
  /** URL slug of `path` (equals the tag's slug when this node is a real tag). */
  slug: string;
  /** The raw OpenAPI tag, when this node corresponds to a real tag. */
  tag?: string;
  children: TagTreeNode[];
};

/**
 * Build a nav tree from raw tag names, grouping by shared slash-prefix.
 * Preserves input order (spec `tags` order); a group first appears at the
 * position of its first child. Synthetic parents (a prefix with no tag of its
 * own, e.g. "billing") become nav-only groups.
 */
export function buildTagTree(tagNames: string[]): TagTreeNode[] {
  const roots: TagTreeNode[] = [];
  const byPath = new Map<string, TagTreeNode>();

  const ensure = (segments: string[]): TagTreeNode => {
    const path = segments.join("/");
    const existing = byPath.get(path);
    if (existing) return existing;
    const node: TagTreeNode = {
      type: "group",
      name: segmentDisplayName(segments[segments.length - 1]),
      path,
      slug: tagSlug(path),
      children: [],
    };
    byPath.set(path, node);
    if (segments.length === 1) roots.push(node);
    else ensure(segments.slice(0, -1)).children.push(node);
    return node;
  };

  for (const raw of tagNames) {
    const segments = raw.split("/").map((s) => s.trim()).filter(Boolean);
    if (!segments.length) continue;
    ensure(segments).tag = raw;
  }
  // A node with children is a group; without, a leaf (a group may also be a
  // real tag, when `tag` is set).
  for (const node of byPath.values()) {
    node.type = node.children.length ? "group" : "leaf";
  }
  return roots;
}
