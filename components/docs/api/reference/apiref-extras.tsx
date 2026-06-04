"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry, VersionEntry } from "@/lib/apiref-view";
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
export function VersionSelector({ versions, buttonLabel }: { versions: VersionEntry[]; buttonLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(buttonLabel);
  const [toast, setToast] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("markline-apiver");
      if (saved) setLabel(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function pick(v: VersionEntry) {
    setOpen(false);
    const next = v.sub ? `${v.label} · ${v.sub}` : v.label;
    if (v.href && v.href !== location.pathname) {
      router.push(v.href);
      return;
    }
    setLabel(next);
    try {
      localStorage.setItem("markline-apiver", next);
    } catch {
      /* ignore */
    }
    setToast(`Now viewing ${next}`);
  }

  return (
    <div className="api-vwrap" ref={wrapRef}>
      <button className={`api-ver${open ? " on" : ""}`} onClick={() => setOpen((o) => !o)} aria-label="API version">
        <span className="vlabel">{label}</span>
        <svg className="vchev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
        <span className="dot g" />
      </button>
      {open && (
        <div className="api-ver-menu">
          <div className="api-vlbl">API version</div>
          {versions.map((v, i) => {
            const text = v.sub ? `${v.label} · ${v.sub}` : v.label;
            const isCur = (v.sub ? `${v.label} · ${v.sub}` : v.label) === label || (i === 0 && label === buttonLabel && v.current);
            return (
              <button key={i} className="api-vi" onClick={() => pick(v)}>
                <span className="vmain">
                  <span className="vd">{text}</span>
                  {(v.current || v.sub) && <span className="vt">{v.current ? "Current spec version" : "Stable"}</span>}
                </span>
                {v.latest && <span className="badge">LATEST</span>}
                {isCur && (
                  <svg className="ck" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
      {toast && (
        <div className="ml-toast show">
          <span className="dot g" /> {toast}
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
  return (
    <div className="mdv open">
      <div className="mdv-scrim" onClick={() => setMd(null)} />
      <div className="mdv-box">
        <div className="mdv-head">
          <span className="t">
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M4 4h16v16H4z" opacity=".4" />
              <path d="M7 9l2 3 2-3M14 9v6m3-6-1.5 2L14 9" />
            </svg>{" "}
            View as Markdown
          </span>
          <span className="sp" />
          <button className={`mdv-cp${copied ? " copied" : ""}`} onClick={copy}>
            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>{" "}
            {copied ? "Copied" : "Copy"}
          </button>
          <button className="mdv-x" onClick={() => setMd(null)} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <pre className="mdv-pre">{md}</pre>
      </div>
    </div>
  );
}

/* ── doc-action Markdown generator (from a section's DOM) ── */
export function apiSecToMarkdown(sec: HTMLElement): string {
  const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();
  let md = "";
  const h = sec.querySelector("h1, h2");
  if (h) md += "# " + clean(h.textContent) + "\n\n";
  const path = sec.querySelector(".api-path");
  if (path) md += "`" + clean(path.textContent) + "`\n\n";
  const lead = sec.querySelector(".lead, .sec-lead, .api-summary");
  if (lead) md += clean(lead.textContent) + "\n\n";
  const attrs = sec.querySelectorAll(".attr");
  if (attrs.length) {
    md += (/parameter/i.test(sec.textContent || "") ? "## Parameters\n\n" : "## Attributes\n\n");
    attrs.forEach((a) => {
      const k = a.querySelector(".ak");
      const t = a.querySelector(".at");
      const req = a.querySelector(".req");
      const d = a.querySelector(".ad");
      md += "- `" + clean(k?.textContent) + "` (" + clean(t?.textContent) + (req ? ", required" : "") + ") — " + clean(d?.textContent) + "\n";
    });
    md += "\n";
  }
  const eps = sec.querySelectorAll(".ep-row");
  if (eps.length) {
    md += "## Endpoints\n\n";
    eps.forEach((r) => {
      const t = r.querySelector(".ep-title");
      const p = r.querySelector(".ep-path");
      md += "- " + clean(t?.textContent) + " — `" + clean(p?.textContent) + "`\n";
    });
    md += "\n";
  }
  const pre = sec.querySelector(".code-card pre, .ex-resp pre");
  if (pre && /object/i.test(h?.textContent || "")) md += "```json\n" + (pre.textContent || "").trim() + "\n```\n";
  return md.trim();
}

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
