import type { DocSection, DocLink } from "./nav";
import { loadOpenApi, operationHref } from "@/lib/openapi";

const DOC_SECTIONS: DocSection[] = [
  {
    title: "Get started",
    links: [
      { href: "/", label: "Welcome" },
      { href: "/quickstart", label: "Quickstart" },
      { href: "/authentication", label: "Authentication" },
      { href: "/first-request", label: "First API call" },
    ],
  },
  {
    title: "Concepts",
    links: [
      { href: "/concepts/ledger", label: "Ledger & accounts" },
      { href: "/concepts/payments", label: "Payment collection" },
      { href: "/concepts/payouts", label: "Payouts & settlement" },
      { href: "/concepts/compliance", label: "Compliance & KYC" },
      { href: "/concepts/errors", label: "Errors & retries" },
    ],
  },
  {
    title: "Operations",
    links: [
      { href: "/ops/webhooks", label: "Webhooks" },
      { href: "/ops/idempotency", label: "Idempotency" },
      { href: "/ops/rate-limits", label: "Rate limits" },
      { href: "/ops/status", label: "Status & uptime" },
    ],
  },
];

const GUIDE_SECTIONS: DocSection[] = [
  {
    title: "Guides",
    links: [
      { href: "/guides/onboarding", label: "Onboarding a business" },
      { href: "/guides/collecting-payments", label: "Collecting payments" },
      { href: "/guides/payout-flow", label: "Payout flow" },
      { href: "/guides/reconciliation", label: "Reconciliation" },
      { href: "/guides/webhooks", label: "Webhook integration" },
    ],
  },
];

const CHANGELOG_SECTIONS: DocSection[] = [
  {
    title: "Changelog",
    links: [{ href: "/changelog", label: "Recent changes" }],
  },
];

function buildApiSections(): DocSection[] {
  const api = loadOpenApi();
  return [
    {
      title: "Overview",
      links: [{ href: "/api-reference", label: "Introduction" }],
    },
    ...api.tags.map((tag) => ({
      title: tag.name,
      links: tag.operations.map<DocLink>((op) => ({
        href: operationHref(op),
        label: op.summary ?? op.operationId,
        method: op.method,
      })),
    })),
  ];
}

export type DocsTab = {
  id: string;
  label: string;
  href: string;
  /** Pathname prefixes that activate this tab. Use "__default__" for the fallback tab. */
  matchPrefixes: string[];
  sections: DocSection[];
};

export function getDocsTabs(): DocsTab[] {
  return [
    {
      id: "documentation",
      label: "Documentation",
      href: "/",
      matchPrefixes: ["__default__"],
      sections: DOC_SECTIONS,
    },
    {
      id: "guides",
      label: "Guides",
      href: "/guides/onboarding",
      matchPrefixes: ["/guides"],
      sections: GUIDE_SECTIONS,
    },
    {
      id: "api-reference",
      label: "API reference",
      href: "/api-reference",
      matchPrefixes: ["/api-reference"],
      sections: buildApiSections(),
    },
    {
      id: "changelog",
      label: "Changelog",
      href: "/changelog",
      matchPrefixes: ["/changelog"],
      sections: CHANGELOG_SECTIONS,
    },
  ];
}

/** Pick the active tab for a pathname. */
export function pickActiveTab(tabs: DocsTab[], pathname: string): DocsTab {
  for (const t of tabs) {
    if (t.matchPrefixes.includes("__default__")) continue;
    if (t.matchPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname === p)) {
      return t;
    }
  }
  return tabs.find((t) => t.matchPrefixes.includes("__default__")) ?? tabs[0];
}
