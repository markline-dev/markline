"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SearchEntry, VersionEntry } from "@/lib/apiref-view";
import { versionTarget } from "@/lib/apiref-version";
import { openAskPanel } from "../../ai/ask-dock";

/* ── event helpers (let the toolrow / doc-action buttons drive these) ── */
export function openSearch() {
  window.dispatchEvent(new CustomEvent("ml-search-open"));
}
export function openMarkdown(md: string) {
  window.dispatchEvent(new CustomEvent("ml-mdv-open", { detail: { md } }));
}

/* ═══════════════════════ ⌘K / "/" search palette ═══════════════════════ */
export function SearchPalette({ index, aiEnabled }: { index: SearchEntry[]; aiEnabled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return index.slice(0, 6);
    const scored: { it: SearchEntry; score: number }[] = [];
    for (const it of index) {
      const t = it.title.toLowerCase();
      const s = it.snippet.toLowerCase();
      const c = it.crumbs.join(" ").toLowerCase();
      let score = -1;
      if (t.indexOf(query) === 0) score = 0;
      else if (t.indexOf(query) > 0) score = 1;
      else if (c.indexOf(query) >= 0) score = 2;
      else if (s.indexOf(query) >= 0) score = 3;
      if (score >= 0) scored.push({ it, score });
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.slice(0, 7).map((x) => x.it);
  }, [q, index]);

  // rows = results + (optional) Ask-Assistant row
  const rowCount = results.length + (aiEnabled ? 1 : 0);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName || "") || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("ml-search-open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("ml-search-open", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  function navigate(href: string) {
    const [file, hash] = href.split("#");
    setOpen(false);
    if (hash && file === location.pathname) {
      const el = document.getElementById(hash);
      if (el) {
        history.replaceState(null, "", `#${hash}`);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    // Client-side navigation — keeps Home ↔ Docs ↔ API reference instant.
    router.push(href);
  }

  function choose(i: number) {
    if (aiEnabled && i === results.length) {
      const query = q.trim();
      setOpen(false);
      openAskPanel();
      if (query) setTimeout(() => window.dispatchEvent(new CustomEvent("ml-ai-prefill", { detail: { q: query } })), 90);
      return;
    }
    const it = results[i];
    if (it) navigate(it.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rowCount - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;
  return (
    <div className="spx open">
      <div className="spx-scrim" onClick={() => setOpen(false)} />
      <div className="spx-box" role="dialog" aria-label="Search">
        <div className="spx-head">
          <span className="mag">
            <SearchIco big />
          </span>
          <input
            ref={inputRef}
            className="spx-in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search docs, endpoints…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
          />
          <button className="spx-esc" onClick={() => setOpen(false)}>
            ESC
          </button>
        </div>
        <div className="spx-results">
          {results.length > 0 ? (
            <>
              <div className="spx-grouplbl">Results</div>
              {results.map((it, i) => (
                <div
                  key={it.href + i}
                  className={`spx-row${active === i ? " active" : ""}`}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span className="hash">{it.verb ? <span className={`verb ${it.verb}`}>{it.verb.toUpperCase()}</span> : <HashIco />}</span>
                  <div className="spx-rmain">
                    <div className="spx-crumb">
                      {it.crumbs.map((c, j) => (
                        <span key={j}>
                          {j > 0 && <b>›</b>} {c}
                        </span>
                      ))}
                    </div>
                    <div className="spx-title" dangerouslySetInnerHTML={{ __html: highlight(it.title, q) }} />
                    <div className="spx-snip" dangerouslySetInnerHTML={{ __html: highlight(it.snippet, q) }} />
                  </div>
                  <span className="spx-go">
                    <Chevron />
                  </span>
                </div>
              ))}
            </>
          ) : (
            <div className="spx-empty">No matches for “{q}”</div>
          )}
          {aiEnabled && (
            <>
              <div className="spx-grouplbl">Ask Assistant</div>
              <div
                className={`spx-row spx-ask${active === results.length ? " active" : ""}`}
                onMouseMove={() => setActive(results.length)}
                onClick={() => choose(results.length)}
              >
                <span className="hash">
                  <SparkIco />
                </span>
                <div className="spx-rmain">
                  <div className="spx-title">Can you tell me about “{q || "this"}”?</div>
                  <div className="spx-snip">Get an AI answer grounded in the docs · on your key</div>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="spx-foot">
          <span className="k">
            <kbd>↑</kbd>
            <kbd>↓</kbd> Navigate
          </span>
          <span className="k">
            <kbd>↵</kbd> Go
          </span>
          <span className="sp">Markline search</span>
        </div>
      </div>
    </div>
  );
}

function highlight(s: string, q: string): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const query = q.trim();
  if (!query) return esc(s);
  const i = s.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return esc(s);
  return esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + query.length)) + "</mark>" + esc(s.slice(i + query.length));
}

/* ═══════════════════════ version selector ═══════════════════════ */
/**
 * The reference's version picker, shown only with two or more configured
 * versions. Like the header's picker, it goes to the same page in the other
 * version, or to that version's reference when the page doesn't exist there.
 */
export function VersionSelector({ versions }: { versions: VersionEntry[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = versions.find((v) => v.current) ?? versions[0];

  useEffect(() => {
    if (!open) return;
    // Start on the version shown, so arrows move from there.
    menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (versions.length < 2) return null;

  const pick = async (id: string) => {
    setOpen(false);
    if (id === current.id) return;
    const base = process.env.NEXT_PUBLIC_MARKLINE_BASE_PATH ?? "";
    const exists = async (path: string) => (await fetch(`${base}${path}`, { method: "HEAD" })).ok;
    const dest = await versionTarget(pathname, id, versions, exists);
    // The anchor only means something on the same page.
    router.push(dest.same ? dest.path + location.hash : dest.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Tabbing out of the menu closes it, as clicking elsewhere does.
    if (e.key === "Tab" && open) {
      setOpen(false);
      return;
    }
    if (e.key === "Escape" && open) {
      setOpen(false);
      wrapRef.current?.querySelector<HTMLElement>(".api-ver")?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    if (!open) return setOpen(true);
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>(".api-vi") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="api-vwrap" ref={wrapRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        className={`api-ver${open ? " on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Version: ${current.label}`}
      >
        <span className="vlabel">{current.label}</span>
        <svg className="vchev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="api-ver-menu" role="menu" ref={menuRef}>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              role="menuitemradio"
              className="api-vi"
              aria-checked={v.current}
              onClick={() => pick(v.id)}
            >
              <span className="vmain">
                <span className="vd">{v.label}</span>
              </span>
              {v.current && (
                <svg className="ck" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════ View-as-Markdown modal ═══════════════════════ */
export function MarkdownModal() {
  const [md, setMd] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => setMd((e as CustomEvent).detail?.md ?? "");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMd(null);
    window.addEventListener("ml-mdv-open", onOpen as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("ml-mdv-open", onOpen as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (md === null) return null;
  const copy = () => {
    navigator.clipboard?.writeText(md).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1300);
      },
      () => {},
    );
  };
  // Named after the page, like the file you'd save: "Set up hand-off.md".
  const file = `${(md.match(/^# (.+)$/m)?.[1] ?? "page").trim()}.md`;
  return (
    <div className="mdv open">
      <div className="mdv-scrim" onClick={() => setMd(null)} />
      <div className="mdv-box" role="dialog" aria-modal="true" aria-label={file}>
        <div className="mdv-head">
          <span className="t">
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5M9 13h6M9 17h4" />
            </svg>
            <span>{file}</span>
          </span>
          <button className="mdv-x" onClick={() => setMd(null)} aria-label="Close" autoFocus>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <pre className="mdv-pre">{md}</pre>
        <div className="mdv-foot">
          <button className={`mdv-cp${copied ? " copied" : ""}`} onClick={copy}>
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
              {copied ? (
                <path d="M20 6 9 17l-5-5" />
              ) : (
                <>
                  <rect x="9" y="9" width="11" height="11" rx="2" />
                  <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </>
              )}
            </svg>{" "}
            {copied ? "Copied" : "Copy markdown"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════ Expanded code (a card's Expand) ═══════════════════════ */
type CodeOpen = { html: string; label: string };
let codeOpener: HTMLElement | null = null;

/** Open the code dialog on a card's showing code; focus returns to `opener` on close. */
export function openCodeDialog({ html, label, opener }: CodeOpen & { opener: HTMLElement }) {
  codeOpener = opener;
  window.dispatchEvent(new CustomEvent<CodeOpen>("ml-code-open", { detail: { html, label } }));
}

/** "1\n2\n…" for every line of the code (its HTML keeps the code's newlines). */
function lineNumbers(html: string): string {
  const lines = (html.match(/\n/g)?.length ?? 0) + (html.endsWith("\n") ? 0 : 1);
  return Array.from({ length: lines }, (_, i) => i + 1).join("\n");
}

/**
 * A card's code at full height, in a modal `<dialog>`: Escape and the close button
 * shut it, Tab stays inside, and focus goes back to the Expand button. The HTML is
 * the card's own rendered code, so a body too big to colour stays uncoloured.
 */
export function CodeDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const [code, setCode] = useState<CodeOpen | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => setCode((e as CustomEvent<CodeOpen>).detail);
    window.addEventListener("ml-code-open", onOpen);
    return () => window.removeEventListener("ml-code-open", onOpen);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!code || !d || d.open) return;
    d.showModal();
    // showModal focuses the first control (Copy); start on Close instead.
    d.querySelector<HTMLElement>("[data-dlg-close]")?.focus();
  }, [code]);

  const onClose = () => {
    setCode(null);
    setCopied(false);
    codeOpener?.focus();
    codeOpener = null;
  };
  const copy = () => {
    navigator.clipboard?.writeText(pre.current?.textContent ?? "").then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1300);
      },
      () => {},
    );
  };
  // A modal dialog makes the page inert; this keeps Tab from leaving for the browser's UI too.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>("button, [tabindex]:not([tabindex='-1'])")];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <dialog
      ref={ref}
      className="code-dlg"
      aria-label={code?.label}
      onClose={onClose}
      onKeyDown={onKeyDown}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {code && (
        <div className="code-card code-dlg-card">
          <div className="cc-head">
            <span className="cc-title code-dlg-title">{code.label}</span>
            <span className="cc-tools">
              <button type="button" className={`cc-copy${copied ? " copied" : ""}`} onClick={copy} aria-label="Copy" title="Copy">
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
                  {copied ? (
                    <path d="M20 6 9 17l-5-5" />
                  ) : (
                    <>
                      <rect x="9" y="9" width="11" height="11" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </>
                  )}
                </svg>
              </button>
              <button type="button" className="cc-copy" onClick={() => ref.current?.close()} aria-label="Close" title="Close" data-dlg-close>
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </span>
          </div>
          <div className="code-dlg-body">
            {/* Line numbers live only here, built on the client, so pages carry none. */}
            <pre className="code-dlg-ln" aria-hidden="true">
              {lineNumbers(code.html)}
            </pre>
            {/* Our own rendered, escaped code, taken from the card. */}
            <pre ref={pre} tabIndex={0} dangerouslySetInnerHTML={{ __html: code.html }} />
          </div>
        </div>
      )}
    </dialog>
  );
}

export { apiSecToMarkdown } from "@/lib/apiref-markdown";

/* ── icons ── */
function SearchIco({ big }: { big?: boolean }) {
  const n = big ? 18 : 14;
  return (
    <svg width={n} height={n} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function HashIco() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />
    </svg>
  );
}
function SparkIco() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" />
    </svg>
  );
}
function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
