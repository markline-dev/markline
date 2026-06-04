"use client";

import { useState } from "react";
import { CopyButton } from "@/components/copy-button";

export type HighlightedSnippet = {
  lang: string;
  label: string;
  /** Raw code, used for the Copy button. */
  code: string;
  /** Pre-highlighted HTML from Shiki (inner spans, no outer <pre>/<code>). */
  html: string;
};

/**
 * Generic code tabs UI. Receives pre-highlighted HTML from a server component
 * so we never run Shiki in the browser.
 *
 * `margin` is an optional CSS margin override from the caller. Default keeps
 * the previous 24px block spacing; the API request panel uses a tighter
 * bottom-only margin.
 */
export function CodeTabs({
  snippets,
  title,
  maxHeight,
  margin = "24px 0",
}: {
  snippets: HighlightedSnippet[];
  title?: string;
  maxHeight?: string;
  margin?: string;
}) {
  const [active, setActive] = useState(snippets[0]?.lang ?? "");
  const snippet = snippets.find((s) => s.lang === active) ?? snippets[0];
  if (!snippet) return null;

  return (
    <div className="ml-codepanel" style={{ margin }}>
      <div className="ml-codepanel-head">
        <div className="ml-codepanel-tabs">
          {title && <span className="ml-codepanel-title">{title}</span>}
          <div className="ml-codepanel-tablist">
            {snippets.map((s) => (
              <button
                key={s.lang}
                onClick={() => setActive(s.lang)}
                className={`ml-codepanel-tab${snippet.lang === s.lang ? " active" : ""}`}
              >
                {s.label}
                {snippet.lang === s.lang && <span aria-hidden className="underline" />}
              </button>
            ))}
          </div>
        </div>
        <CopyButton text={snippet.code} />
      </div>
      <pre style={{ maxHeight }} dangerouslySetInnerHTML={{ __html: snippet.html }} />
    </div>
  );
}

/**
 * Response-side variant: status-code tabs with semantic coloring.
 */
export function ResponseTabs({
  tabs,
  maxHeight,
}: {
  tabs: { status: string; description?: string; code: string; html: string }[];
  maxHeight?: string;
}) {
  const [active, setActive] = useState(tabs[0]?.status ?? "");
  const tab = tabs.find((t) => t.status === active) ?? tabs[0];
  if (!tab) return null;

  const statusColor = (s: string) => {
    if (s.startsWith("2")) return "#3CC88C";
    if (s.startsWith("4")) return "#EE7A4B";
    if (s.startsWith("5")) return "#E14F4F";
    return "#7882A0";
  };

  return (
    <div className="ml-codepanel">
      <div className="ml-codepanel-head">
        <div className="ml-codepanel-tablist">
          {tabs.map((t) => (
            <button
              key={t.status}
              onClick={() => setActive(t.status)}
              className="ml-codepanel-tab"
              style={{ color: tab.status === t.status ? statusColor(t.status) : undefined }}
            >
              {t.status}
              {tab.status === t.status && (
                <span aria-hidden className="underline" style={{ background: statusColor(t.status) }} />
              )}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} />
      </div>
      <pre style={{ maxHeight }} dangerouslySetInnerHTML={{ __html: tab.html }} />
    </div>
  );
}
