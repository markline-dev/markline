"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type PagefindResult = {
  url: string;
  meta?: { title?: string; section?: string };
  excerpt?: string;
};

type Pagefind = {
  init?: () => Promise<void>;
  search: (q: string) => Promise<{ results: { data: () => Promise<PagefindResult> }[] }>;
};

// The Pagefind bundle is generated into /public/pagefind at build time and
// served as a static asset — it must not be resolved by the bundler. Respect a
// configured base path so it resolves under sub-path deployments.
async function loadPagefind(): Promise<Pagefind | null> {
  try {
    const base = process.env.NEXT_PUBLIC_MARKLINE_BASE_PATH || "";
    // Runtime-only module, served from <base>/pagefind after build.
    const pf: Pagefind = await import(/* webpackIgnore: true */ `${base}/pagefind/pagefind.js`);
    await pf.init?.();
    return pf;
  } catch {
    return null;
  }
}

export function DocsSearch({ triggerless = false }: { triggerless?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const pagefindRef = useRef<Pagefind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K to open, plus an explicit open event from the docs
  // sidebar search trigger.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("ml-docs-search-open", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("ml-docs-search-open", onOpenEvent);
    };
  }, []);

  // Lazy-load the index the first time the modal opens.
  useEffect(() => {
    if (!open || pagefindRef.current) return;
    let cancelled = false;
    loadPagefind().then((pf) => {
      if (cancelled) return;
      pagefindRef.current = pf;
      setReady(pf !== null);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }, [open]);

  // Debounced search.
  useEffect(() => {
    const pf = pagefindRef.current;
    if (!pf || !query.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const search = await pf.search(query);
      const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()));
      setResults(data);
      setActive(0);
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback(
    (url: string) => {
      setOpen(false);
      router.push(url.replace(/\.html$/, ""));
    },
    [router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active].url);
    }
  }

  return (
    <>
      {!triggerless && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search docs"
          className="ml-search-trigger"
        >
          <svg
            className="s-ico"
            width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m11 11 3 3" />
          </svg>
          Search docs…
          <kbd className="s-kbd">⌘K</kbd>
        </button>
      )}

      {open && (
        <div className="ml-search-scrim" onMouseDown={() => setOpen(false)}>
          <div className="ml-search-box" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ml-search-inrow">
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="7" cy="7" r="4.5" />
                <path d="m11 11 3 3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search documentation…"
              />
              <kbd className="ml-search-kbd">esc</kbd>
            </div>

            <div className="ml-search-results">
              {ready === false && (
                <p className="ml-search-msg">
                  Search index not found. Run <code>npm run search</code> (or a full build).
                </p>
              )}
              {ready !== false && query.trim() && results.length === 0 && (
                <p className="ml-search-msg">No results for “{query}”.</p>
              )}
              {results.map((r, i) => (
                <button
                  key={r.url}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.url)}
                  className={`ml-search-row${i === active ? " active" : ""}`}
                >
                  <span className="r-top">
                    <span className="r-title">{r.meta?.title ?? r.url}</span>
                    {r.meta?.section && <span className="r-section">{r.meta.section}</span>}
                  </span>
                  {r.excerpt && (
                    <span className="r-excerpt" dangerouslySetInnerHTML={{ __html: r.excerpt }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
