"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { openAskPanel } from "./ai/ask-dock";

/* ──────────────────────────────────────────────────────────────────────────
 * Docs page AI/affordance row (the design's .doc-ai): rendered below the lede.
 * - "Ask AI about this page"  → opens the docked Ask-AI panel (gated on AI).
 * - "Copy for LLM"            → copies a Markdown rendering of the page DOM.
 * - "View as Markdown"        → opens the shared View-as-Markdown modal.
 * Both Markdown actions use the page's own Markdown, served at <page>.md
 * (scripts/llms.mjs), once it has loaded; it's fetched when the pointer or
 * focus first reaches the row. Until then, or where there's no .md file, they
 * fall back to rendering the .docs-prose DOM, so they stay bound to the real
 * page content (no fabricated text). The menu also links the .md file.
 *
 * `layout.pageActions: "menu"` shows them as one "Copy for LLM" button with
 * the others in a dropdown, beside the last-updated date.
 * ────────────────────────────────────────────────────────────────────────── */

const SparkIcon = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" />
  </svg>
);
const CopyIcon = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
const CopiedIcon = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const MarkdownIcon = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
    <path d="M4 4h16v16H4z" opacity=".4" />
    <path d="M7 9l2 3 2-3M14 9v6m3-6-1.5 2L14 9" />
  </svg>
);

/** Render the current docs page (title + lede + prose) to Markdown from the DOM. */
function pageToMarkdown(title: string): string {
  const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
  let md = `# ${clean(title)}\n\n`;
  const lead = document.querySelector(".docs-shell .docs-lead");
  if (lead) md += clean(lead.textContent) + "\n\n";

  const prose = document.querySelector(".docs-shell .docs-prose");
  if (!prose) return md.trim();

  // Walk top-level prose nodes and emit a faithful-enough Markdown view.
  prose.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = clean(el.textContent);
    if (!text && tag !== "hr") return;
    switch (tag) {
      case "h2": md += `## ${text}\n\n`; break;
      case "h3": md += `### ${text}\n\n`; break;
      case "p": md += `${text}\n\n`; break;
      case "ul":
      case "ol": {
        el.querySelectorAll(":scope > li").forEach((li) => {
          md += `- ${clean(li.textContent)}\n`;
        });
        md += "\n";
        break;
      }
      case "pre": md += "```\n" + (el.textContent || "").trim() + "\n```\n\n"; break;
      case "hr": md += "---\n\n"; break;
      default: {
        // Code panels, callouts, steps, cards — flatten to text.
        if (text) md += `${text}\n\n`;
      }
    }
  });
  return md.trim();
}

/** The current page's .md URL (scripts/llms.mjs markdownPath). */
function markdownUrl(pathname: string): string {
  const base = process.env.NEXT_PUBLIC_MARKLINE_BASE_PATH ?? "";
  const p = pathname.replace(/\/$/, "");
  return `${base}${p ? p : "/index"}.md`;
}

function openMarkdownModal(md: string) {
  window.dispatchEvent(new CustomEvent("ml-mdv-open", { detail: { md } }));
}

const ChevronDown = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export function DocAiRow({
  title,
  aiEnabled,
  variant = "inline",
  lastUpdated,
}: {
  title: string;
  aiEnabled: boolean;
  variant?: "inline" | "menu";
  lastUpdated?: string;
}) {
  const [copied, setCopied] = useState(false);
  const pathname = usePathname() ?? "/";
  const mdUrl = markdownUrl(pathname);
  // The fetched .md text: undefined until asked for, null when there's none.
  const source = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    source.current = undefined;
  }, [mdUrl]);
  const prefetch = () => {
    if (source.current !== undefined) return;
    source.current = null;
    fetch(mdUrl)
      .then((r) => (r.ok && !(r.headers.get("content-type") ?? "").includes("html") ? r.text() : null))
      .then((t) => {
        source.current = t;
      })
      .catch(() => {});
  };
  const markdown = () => source.current || pageToMarkdown(title);

  const copyForLlm = () => {
    const md = markdown();
    navigator.clipboard?.writeText(md).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1300);
      },
      () => {},
    );
  };

  if (variant === "menu") {
    return (
      <div className="doc-ai doc-ai--menu" onPointerEnter={prefetch} onFocus={prefetch}>
        <span className="date">{lastUpdated}</span>
        <ActionMenu
          copied={copied}
          onCopy={copyForLlm}
          items={[
            { label: "View as Markdown", icon: MarkdownIcon, run: () => openMarkdownModal(markdown()) },
            { label: "Open Markdown file", icon: MarkdownIcon, run: () => window.open(mdUrl, "_blank", "noopener") },
            ...(aiEnabled ? [{ label: "Ask AI about this page", icon: SparkIcon, run: () => openAskPanel(title) }] : []),
          ]}
        />
      </div>
    );
  }

  return (
    <div className="doc-ai" onPointerEnter={prefetch} onFocus={prefetch}>
      {aiEnabled && (
        <button type="button" className="ask" onClick={() => openAskPanel(title)}>
          {SparkIcon} Ask AI about this page
        </button>
      )}
      <button type="button" className={copied ? "copied" : undefined} onClick={copyForLlm}>
        {copied ? CopiedIcon : CopyIcon} {copied ? "Copied" : "Copy for LLM"}
      </button>
      <button type="button" onClick={() => openMarkdownModal(markdown())}>
        {MarkdownIcon} View as Markdown
      </button>
    </div>
  );
}

type MenuItem = { label: string; icon: React.ReactNode; run: () => void };

/** "Copy for LLM" with a chevron that opens the other actions. */
function ActionMenu({ copied, onCopy, items }: { copied: boolean; onCopy: () => void; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="doc-ai-split" ref={ref}>
      <button type="button" className={`main${copied ? " copied" : ""}`} onClick={onCopy}>
        {copied ? CopiedIcon : CopyIcon} {copied ? "Copied" : "Copy for LLM"}
      </button>
      <button
        type="button"
        className="more"
        aria-label="More page actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {ChevronDown}
      </button>
      {open && (
        <div className="doc-ai-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                it.run();
              }}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Sidebar "Ask AI" button (the design's .docs-ask). Gated on AI being enabled. */
export function SidebarAskButton() {
  return (
    <button type="button" className="docs-ask" onClick={() => openAskPanel("this page")}>
      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" />
      </svg>
      Ask AI
    </button>
  );
}

/** Sidebar search trigger (the design's .docs-search). Opens the topbar ⌘K palette. */
export function SidebarSearchTrigger() {
  return (
    <button
      type="button"
      className="docs-search-trigger"
      onClick={() => window.dispatchEvent(new CustomEvent("ml-docs-search-open"))}
    >
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      Search docs
      <span className="kbd">⌘K</span>
    </button>
  );
}
