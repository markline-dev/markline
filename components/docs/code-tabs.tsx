"use client";

import { Children, useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { codeGroupStorageKey } from "@/lib/code-group";

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

/* ── <CodeGroup> (components/docs/code-group.tsx) ── */

/** Fired on window when a reader picks a tab, so every group on the same
 *  sync channel follows. */
const SYNC_EVENT = "ml-code-group";

function readChoice(key: string): string | null {
  try {
    return window.localStorage.getItem(codeGroupStorageKey(key));
  } catch {
    return null; // storage blocked (private mode, sandboxed iframe)
  }
}

function saveChoice(key: string, label: string) {
  try {
    window.localStorage.setItem(codeGroupStorageKey(key), label);
  } catch {
    // not persisted; the page still syncs through the event
  }
}

/**
 * Tabs over already-rendered code panels (the MDX <pre> of each fence). Every
 * panel is in the HTML, the first one showing, so the server render has code
 * in it before any script runs. After hydration a group on a sync channel
 * shows the reader's saved pick for it, if it has that tab.
 */
export function CodeGroupTabs({
  labels,
  codes,
  syncKey,
  children,
}: {
  labels: string[];
  codes: string[];
  syncKey: string | null;
  children: React.ReactNode;
}) {
  const panels = Children.toArray(children);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!syncKey) return;
    const show = (label: string | null) => {
      const i = label == null ? -1 : labels.indexOf(label);
      if (i >= 0) setActive(i);
    };
    show(readChoice(syncKey));
    const onPick = (e: Event) => {
      const d = (e as CustomEvent<{ key: string; label: string }>).detail;
      if (d?.key === syncKey) show(d.label);
    };
    // Another browser tab picked one.
    const onStorage = (e: StorageEvent) => {
      if (e.key === codeGroupStorageKey(syncKey)) show(e.newValue);
    };
    window.addEventListener(SYNC_EVENT, onPick);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SYNC_EVENT, onPick);
      window.removeEventListener("storage", onStorage);
    };
  }, [syncKey, labels.join("\u0000")]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (i: number) => {
    setActive(i);
    if (!syncKey) return;
    saveChoice(syncKey, labels[i]);
    window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key: syncKey, label: labels[i] } }));
  };

  return (
    <div className="ml-codepanel ml-codegroup">
      <div className="ml-codepanel-head">
        <div className="ml-codepanel-tablist" role="tablist">
          {labels.map((label, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === active}
              onClick={() => pick(i)}
              className={`ml-codepanel-tab${i === active ? " active" : ""}`}
            >
              {label}
              {i === active && <span aria-hidden className="underline" />}
            </button>
          ))}
        </div>
        <CopyButton text={codes[active] ?? ""} />
      </div>
      {panels.map((panel, i) => (
        <div key={i} role="tabpanel" aria-label={labels[i]} hidden={i !== active}>
          {panel}
        </div>
      ))}
    </div>
  );
}
