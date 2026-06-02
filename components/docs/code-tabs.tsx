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

const panelStyle: React.CSSProperties = {
  background: "rgb(var(--c-panel-bg))",
  borderColor: "rgb(var(--c-panel-border))",
};

const headerStyle: React.CSSProperties = {
  background: "rgb(var(--c-panel-bg))",
  borderBottom: "1px solid rgb(var(--c-panel-border))",
};

/**
 * Generic code tabs UI. Receives pre-highlighted HTML from a server component
 * so we never run Shiki in the browser.
 */
export function CodeTabs({
  snippets,
  title,
  maxHeight,
  className = "my-6",
}: {
  snippets: HighlightedSnippet[];
  title?: string;
  maxHeight?: string;
  className?: string;
}) {
  const [active, setActive] = useState(snippets[0]?.lang ?? "");
  const snippet = snippets.find((s) => s.lang === active) ?? snippets[0];
  if (!snippet) return null;

  return (
    <div className={`rounded-3 overflow-hidden border shadow-elev-2 ${className}`} style={panelStyle}>
      <div className="flex items-center justify-between px-3" style={headerStyle}>
        <div className="flex items-center gap-3">
          {title && (
            <span
              className="font-mono text-11 tracking-[0.04em] uppercase pl-1"
              style={{ color: "rgb(var(--c-panel-muted))" }}
            >
              {title}
            </span>
          )}
          <div className="flex gap-0.5">
            {snippets.map((s) => (
              <button
                key={s.lang}
                onClick={() => setActive(s.lang)}
                className="relative px-3 py-2.5 font-mono text-12 cursor-pointer bg-transparent border-0 transition-colors"
                style={{
                  color:
                    snippet.lang === s.lang
                      ? "rgb(var(--c-panel-fg))"
                      : "rgb(var(--c-panel-muted))",
                }}
              >
                {s.label}
                {snippet.lang === s.lang && (
                  <span aria-hidden className="absolute left-2 right-2 -bottom-px h-[2px] rounded-t-sm bg-brand" />
                )}
              </button>
            ))}
          </div>
        </div>
        <CopyButton text={snippet.code} />
      </div>
      <pre
        className="bg-transparent border-0 m-0 p-4 text-12 leading-[1.65] overflow-auto font-mono"
        style={{ color: "rgb(var(--c-panel-fg))", maxHeight }}
        dangerouslySetInnerHTML={{ __html: snippet.html }}
      />
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
    <div className="rounded-3 overflow-hidden border shadow-elev-2" style={panelStyle}>
      <div className="flex items-center justify-between px-3" style={headerStyle}>
        <div className="flex gap-0.5">
          {tabs.map((t) => (
            <button
              key={t.status}
              onClick={() => setActive(t.status)}
              className="relative px-3 py-2.5 font-mono text-11 cursor-pointer bg-transparent border-0"
              style={{
                color:
                  tab.status === t.status
                    ? statusColor(t.status)
                    : "rgb(var(--c-panel-muted))",
              }}
            >
              {t.status}
              {tab.status === t.status && (
                <span
                  aria-hidden
                  className="absolute left-2 right-2 -bottom-px h-[2px] rounded-t-sm"
                  style={{ background: statusColor(t.status) }}
                />
              )}
            </button>
          ))}
        </div>
        <CopyButton text={tab.code} />
      </div>
      <pre
        className="bg-transparent border-0 m-0 p-4 text-12 leading-[1.65] overflow-auto font-mono"
        style={{ color: "rgb(var(--c-panel-fg))", maxHeight }}
        dangerouslySetInnerHTML={{ __html: tab.html }}
      />
    </div>
  );
}
