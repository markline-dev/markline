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
// served as a static asset — it must not be resolved by the bundler.
async function loadPagefind(): Promise<Pagefind | null> {
  try {
    // @ts-expect-error - runtime-only module, served from /pagefind after build
    const pf: Pagefind = await import(/* webpackIgnore: true */ "/pagefind/pagefind.js");
    await pf.init?.();
    return pf;
  } catch {
    return null;
  }
}

export function DocsSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PagefindResult[]>([]);
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<boolean | null>(null);
  const pagefindRef = useRef<Pagefind | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Global ⌘K / Ctrl+K to open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search docs"
        className="docs-search relative w-[360px] h-[34px] hidden md:flex items-center pl-[34px] pr-14 bg-paper-2 border border-slate-4 rounded-2 text-13 text-slate-5 hover:border-slate-6"
      >
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-5"
          width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="m11 11 3 3" />
        </svg>
        Search docs…
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-11 px-1.5 py-0.5 border border-slate-3 rounded text-slate-5">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/40"
          onMouseDown={() => setOpen(false)}
        >
          <div
            className="w-full max-w-[600px] bg-paper border border-slate-3 rounded-3 shadow-elev-2 overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 border-b border-slate-3">
              <svg className="text-slate-5" width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <circle cx="7" cy="7" r="4.5" />
                <path d="m11 11 3 3" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                placeholder="Search documentation…"
                className="flex-1 h-12 bg-transparent text-15 text-ink placeholder:text-slate-5 focus:outline-none"
              />
              <kbd className="font-mono text-11 px-1.5 py-0.5 border border-slate-3 rounded text-slate-5">esc</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto py-2">
              {ready === false && (
                <p className="px-4 py-6 text-13 text-slate-5">
                  Search index not found. Run <code className="font-mono">npm run search</code> (or a full build).
                </p>
              )}
              {ready !== false && query.trim() && results.length === 0 && (
                <p className="px-4 py-6 text-13 text-slate-5">No results for “{query}”.</p>
              )}
              {results.map((r, i) => (
                <button
                  key={r.url}
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.url)}
                  className={`w-full text-left px-4 py-2.5 flex flex-col gap-0.5 ${
                    i === active ? "bg-slate-2" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-14 text-ink font-medium">{r.meta?.title ?? r.url}</span>
                    {r.meta?.section && (
                      <span className="font-mono text-10 uppercase tracking-[0.06em] text-slate-5">{r.meta.section}</span>
                    )}
                  </span>
                  {r.excerpt && (
                    <span
                      className="text-12 text-slate-6 line-clamp-1 [&_mark]:bg-transparent [&_mark]:text-ink [&_mark]:font-medium"
                      dangerouslySetInnerHTML={{ __html: r.excerpt }}
                    />
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
