"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ApiRefView, AttrView, EndpointView, NavGroup } from "@/lib/apiref-view";
import type { AiPublicConfig } from "@/lib/config";
import { PlaygroundProvider, usePlayground } from "../playground";
import { AskDock, openAskPanel } from "../../ai/ask-dock";
import {
  SearchPalette,
  VersionSelector,
  MarkdownModal,
  openSearch,
  openMarkdown,
  apiSecToMarkdown,
} from "./apiref-extras";

/**
 * Stripe-style API reference — a full-takeover page implemented from the Claude
 * Design handoff (api.css / aichat / search / versions / docactions). Bound to
 * the project's real OpenAPI doc via the server-built ApiRefView. All styling is
 * scoped under .ml-apiref (app/api-reference.css), which also hides the
 * framework topbar + sidebar for this route — the same takeover the home uses.
 *
 * Phase 1 wires the static layout + the read-time interactions ported from the
 * prototype's markline.js (theme toggle, tabs, copy, scroll-spy, helpful Y/N,
 * the simulated explorer Send). The real proxy explorer, docked AI chat, search
 * palette and version selector land in later phases.
 */
export function MarklineApiRef({
  view,
  summary,
  githubUrl,
  stars,
  ai,
}: {
  view: ApiRefView;
  /** Server-rendered per-resource MDX summary (api/sections/<tag>.mdx), if any. */
  summary?: React.ReactNode;
  githubUrl?: string;
  stars?: string;
  /** Sanitized AI config; when present the docked Ask-AI panel is mounted and
   *  the Ask-AI affordances render. Null/undefined → no AI UI at all. */
  ai?: AiPublicConfig | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const aiOn = !!ai;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) => {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    };

    /* reveal-on-scroll */
    let io: IntersectionObserver | null = null;
    const reveals = el.querySelectorAll<HTMLElement>(".reveal");
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add("in");
              io?.unobserve(en.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
      );
      reveals.forEach((r) => io!.observe(r));
    } else {
      reveals.forEach((r) => r.classList.add("in"));
    }

    /* click delegation */
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      /* theme toggle — framework contract (data-theme + .dark + docs-theme) */
      const toggle = target.closest("[data-theme-toggle]");
      if (toggle) {
        e.preventDefault();
        const html = document.documentElement;
        const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
        html.setAttribute("data-theme", next);
        html.classList.toggle("dark", next === "dark");
        try {
          localStorage.setItem("docs-theme", next);
        } catch {}
        return;
      }

      /* doc actions — Copy for LLM / View as Markdown (generated from the section) */
      const docAction = target.closest<HTMLElement>("[data-doc-action]");
      if (docAction) {
        e.preventDefault();
        const sec = docAction.closest<HTMLElement>(".api-sec");
        if (!sec) return;
        const md = apiSecToMarkdown(sec);
        if (docAction.getAttribute("data-doc-action") === "view-md") {
          openMarkdown(md);
          return;
        }
        // copy-llm: copy + flash
        const restore = docAction.getAttribute("data-label-html") ?? docAction.innerHTML;
        docAction.setAttribute("data-label-html", restore);
        const done = () => {
          docAction.classList.add("copied");
          docAction.innerHTML =
            '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg> Copied';
          after(1300, () => {
            docAction.innerHTML = restore;
            docAction.classList.remove("copied");
          });
        };
        if (navigator.clipboard) navigator.clipboard.writeText(md).then(done, done);
        else done();
        return;
      }

      /* copy buttons */
      const copy = target.closest<HTMLElement>("[data-copy]");
      if (copy) {
        const text = copy.getAttribute("data-copy") || "";
        const restore = copy.getAttribute("data-label-html") ?? copy.innerHTML;
        copy.setAttribute("data-label-html", restore);
        const done = () => {
          copy.classList.add("copied");
          if (copy.hasAttribute("data-copy-icon")) {
            copy.innerHTML =
              '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>';
          } else {
            copy.textContent = "Copied";
          }
          after(1300, () => {
            copy.innerHTML = restore;
            copy.classList.remove("copied");
          });
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
        else done();
        return;
      }

      /* generic tabs: [data-tabs] > [data-tab]; panels [data-panel] within scope */
      const tab = target.closest<HTMLElement>("[data-tab]");
      if (tab) {
        const group = tab.closest<HTMLElement>("[data-tabs]");
        if (group) {
          const scopeSel = group.getAttribute("data-tabs-scope");
          const container = scopeSel ? el.querySelector(scopeSel) : group.parentElement;
          const key = tab.getAttribute("data-tab");
          group.querySelectorAll("[data-tab]").forEach((t) => t.classList.toggle("active", t === tab));
          (container || el).querySelectorAll<HTMLElement>("[data-panel]").forEach((p) => {
            p.classList.toggle("active", p.getAttribute("data-panel") === key);
          });
          return;
        }
      }

      /* helpful Yes/No */
      const yn = target.closest<HTMLElement>(".helpful .yn button");
      if (yn) {
        const wrap = yn.closest(".yn");
        wrap?.querySelectorAll("button").forEach((b) => b.classList.toggle("picked", b === yn));
        return;
      }

      /* endpoint-list rows + sidebar anchors → smooth-scroll to the section */
      const jump = target.closest<HTMLElement>("[data-jump]");
      if (jump) {
        e.preventDefault();
        const id = jump.getAttribute("data-jump")!;
        const sec = el.querySelector(`#${CSS.escape(id)}`);
        if (sec) {
          history.replaceState(null, "", `#${id}`);
          sec.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      /* mobile drawer */
      if (target.closest("[data-docnav-toggle]")) {
        document.body.classList.toggle("docnav-open");
        return;
      }
      if (target.closest("[data-docnav-close]") || target.classList.contains("docnav-scrim")) {
        document.body.classList.remove("docnav-open");
        return;
      }
      // The proxy explorer (Send + fields + response) is React-driven via
      // PlaygroundProvider — see DesignExplorer — so no delegation here.
    };
    el.addEventListener("click", onClick);

    /* scroll-spy: highlight the active sidebar anchor */
    const links = Array.from(el.querySelectorAll<HTMLElement>(".api-sub-nav a[data-jump]"));
    const map = new Map<string, HTMLElement>();
    links.forEach((a) => map.set(a.getAttribute("data-jump")!, a));
    let spy: IntersectionObserver | null = null;
    if (links.length) {
      spy = new IntersectionObserver(
        (entries) => {
          entries.forEach((en) => {
            const a = map.get(en.target.id);
            if (en.isIntersecting && a) {
              links.forEach((l) => l.classList.remove("on"));
              a.classList.add("on");
            }
          });
        },
        { rootMargin: "-12% 0px -72% 0px", threshold: 0 },
      );
      map.forEach((_, id) => {
        const sec = el.querySelector(`#${CSS.escape(id)}`);
        if (sec) spy!.observe(sec);
      });
    }

    return () => {
      timers.forEach(clearTimeout);
      el.removeEventListener("click", onClick);
      io?.disconnect();
      spy?.disconnect();
      document.body.classList.remove("docnav-open");
    };
  }, []);

  const r = view.resource;

  return (
    <div className="ml-apiref" ref={root}>
      {/* ============ NAV ============ */}
      <header className="nav">
        <div className="wrap nav-in" style={{ maxWidth: "none", paddingInline: 22 }}>
          <button className="btn btn-ghost btn-sm docnav-toggle" data-docnav-toggle aria-label="Open navigation" style={{ padding: 8 }}>
            <Ico d="M3 6h18M3 12h18M3 18h18" />
          </button>
          <Link className="brand" href="/">
            {view.title.split(" ")[0] || "Markline"}
            <span className="caret" />
          </Link>
          <nav className="nav-links">
            <Link href="/">Documentation</Link>
            <Link href="/api-reference" className="active">
              API reference
            </Link>
          </nav>
          <div className="nav-right">
            {githubUrl && (
              <a className="ghbadge" href={githubUrl} target="_blank" rel="noopener noreferrer">
                <Gh />
                {stars && (
                  <>
                    <span className="star">★</span>
                    <span className="lbl">{stars}</span>
                  </>
                )}
              </a>
            )}
            <button className="theme-btn" data-theme-toggle aria-label="Toggle theme">
              <svg className="ico moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
              <svg className="ico sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
              </svg>
            </button>
            <Link className="btn btn-primary btn-sm" href="/">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <div className="docnav-scrim" data-docnav-close />

      <div className="api">
        {/* ============ LEFT NAV ============ */}
        <aside className="api-side">
          <div className="api-tools">
            <div className="api-toolrow">
              <div className="api-search" onClick={() => openSearch()} role="button" tabIndex={0}>
                <Ico d="M0 0" search />
                <span className="lbl">Find anything</span>
                <span className="kbd">/</span>
              </div>
              {aiOn && (
                <button className="api-ask" type="button" onClick={() => openAskPanel(r.name)}>
                  <Spark />
                  {ai?.label ?? "Ask AI"}
                </button>
              )}
            </div>
            <VersionSelector
              versions={view.versions}
              buttonLabel={`${view.versionLabel}${view.version ? ` · ${view.version}` : ""}`}
            />
          </div>

          {view.nav.map((g) => (
            <NavGroupView key={g.slug} group={g} />
          ))}
        </aside>

        {/* ============ DOC ============ */}
        <main className="api-doc">
          {/* 1 · Resource header */}
          <section className="api-sec" id={r.slug}>
            <div className="api-l api-resource">
              <h1>{r.name}</h1>
              {summary ? (
                <div className="api-summary">{summary}</div>
              ) : r.lead ? (
                <p className="lead">{r.lead}</p>
              ) : (
                <p className="lead">
                  The <code>{r.name}</code> resource and its endpoints.
                </p>
              )}
              <Helpful />
            </div>
            <div className="api-r">
              <AiActions resource={r.name} markdown aiEnabled={aiOn} />
              <div className="ep-card">
                <div className="ep-tabs" data-tabs data-tabs-scope={`#ep-panels-${r.slug}`}>
                  <button className="ep-tab active" data-tab="endpoints">
                    Endpoints
                  </button>
                </div>
                <div id={`ep-panels-${r.slug}`}>
                  <div data-panel="endpoints" className="active">
                    {r.endpoints.map((ep) => (
                      <div className="ep-row" data-jump={ep.id} key={ep.id}>
                        <div>
                          <div className="ep-title">{ep.title}</div>
                          <div className="ep-path">
                            <span className={`verb ${verbClass(ep.verb)}`}>{ep.verb}</span> {ep.path}
                          </div>
                        </div>
                        <Ico d="m9 6 6 6-6 6" cls="chev" w={16} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2 · The object */}
          {r.object && (
            <section className="api-sec" id={`${r.slug}-object`}>
              <div className="api-l">
                <h2>{r.object.name}</h2>
                <p className="sec-lead">Returned by the {r.name.toLowerCase()} endpoints.</p>
                <div className="attr-h">Attributes</div>
                {r.object.attrs.map((a) => (
                  <Attr key={a.name} attr={a} />
                ))}
              </div>
              <div className="api-r">
                <AiActions resource={r.object.name} aiEnabled={aiOn} />
                <div className="code-card">
                  <div className="cc-head">
                    <span className="cc-title">{r.object.name}</span>
                    <button className="cc-copy" data-copy={textFromHtml(r.object.sampleHtml)} data-copy-icon aria-label="Copy">
                      <CopyIco />
                    </button>
                  </div>
                  <pre dangerouslySetInnerHTML={{ __html: r.object.sampleHtml }} />
                </div>
              </div>
            </section>
          )}

          {/* 3..N · Endpoints */}
          {r.sections.map((ep) => (
            <EndpointSection key={ep.opId} ep={ep} aiEnabled={aiOn} />
          ))}
        </main>
      </div>

      <SearchPalette index={view.search} aiEnabled={aiOn} />
      <MarkdownModal />
      {ai && <AskDock ai={ai} />}
    </div>
  );
}

/* ── sidebar group ─────────────────────────────────────────────────────── */
function NavGroupView({ group }: { group: NavGroup }) {
  if (!group.active) {
    return (
      <div className="api-grp dim">
        <Link className="gt" href={`/api-reference/${group.slug}`} style={{ textDecoration: "none" }}>
          {group.name}
          <Ico d="m9 6 6 6-6 6" cls="chev" w={14} />
        </Link>
      </div>
    );
  }
  return (
    <div className="api-grp">
      <div className="gt">
        {group.name}
        <Ico d="m6 9 6 6 6-6" cls="chev" w={14} />
      </div>
      <div className="api-sub-nav">
        {group.ops.map((op, i) => (
          <a key={op.id + i} className={i === 0 ? "on" : undefined} data-jump={op.id}>
            {op.verb && <span className={`verb ${verbClass(op.verb)}`}>{op.verb}</span>}
            <span className="nm">{op.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── endpoint section ──────────────────────────────────────────────────── */
function EndpointSection({ ep, aiEnabled }: { ep: EndpointView; aiEnabled: boolean }) {
  return (
    <section className="api-sec" id={ep.id}>
      <div className="api-l">
        <h2>{ep.summary}</h2>
        <div className="api-path">
          <span className={`verb ${verbClass(ep.verb)}`}>{ep.verb}</span>{" "}
          <span>
            <span className="u">{ep.baseUrl}</span>
            <span className="seg">{ep.path}</span>
          </span>
        </div>
        {ep.lead && <p className="sec-lead">{ep.lead}</p>}
        {ep.groups.map((g) => (
          <div key={g.title}>
            <div className="attr-h">{g.title}</div>
            {g.attrs.map((a) => (
              <Attr key={a.name} attr={a} showReqOpt />
            ))}
          </div>
        ))}
      </div>
      <div className="api-r">
        <AiActions resource={ep.summary} markdown aiEnabled={aiEnabled} />
        {ep.explorer && ep.playground ? (
          <PlaygroundProvider spec={ep.playground}>
            <DesignExplorer ep={ep} />
          </PlaygroundProvider>
        ) : (
          <ReadCards ep={ep} />
        )}
      </div>
    </section>
  );
}

function ReadCards({ ep }: { ep: EndpointView }) {
  return (
    <>
      <div className="code-card">
        <div className="cc-langs-head cc-head">
          <div className="cc-langs" data-tabs data-tabs-scope={`#code-${ep.opId}`}>
            <button className="cc-lang active" data-tab="curl">
              cURL
            </button>
            <button className="cc-lang" data-tab="js">
              Node
            </button>
            <button className="cc-lang" data-tab="py">
              Python
            </button>
            <button className="cc-lang" data-tab="go">
              Go
            </button>
          </div>
          <button className="cc-copy" data-copy={textFromHtml(ep.code.curl)} data-copy-icon aria-label="Copy">
            <CopyIco />
          </button>
        </div>
        <CodePanels code={ep.code} id={`code-${ep.opId}`} />
      </div>
      {ep.response && (
        <div className="code-card">
          <div className="cc-head">
            <span className="cc-title">Response</span>
            <span className="cc-status">
              <span className="dot g" /> {ep.response.label}
            </span>
          </div>
          <pre dangerouslySetInnerHTML={{ __html: ep.response.html }} />
        </div>
      )}
    </>
  );
}

const LANGS = [
  { key: "curl", label: "cURL", field: "curl" },
  { key: "js", label: "Node", field: "node" },
  { key: "py", label: "Python", field: "python" },
  { key: "go", label: "Go", field: "go" },
] as const;

/**
 * The design's inline proxy explorer, driven by the real playground engine
 * (PlaygroundProvider / usePlayground). The chrome is the handoff's .explorer;
 * the state, the cURL, the Send and the response come from the shared engine
 * that powers the per-operation playground — so the same proxy/SSRF rules and
 * BYOK token apply. Fully React-controlled (no click delegation).
 */
function DesignExplorer({ ep }: { ep: EndpointView }) {
  const pg = usePlayground();
  const { spec } = pg;
  const [lang, setLang] = useState<(typeof LANGS)[number]["key"]>("curl");

  // Editable top-level body props (primitives), assembled back into the engine's
  // body JSON on each change so Send posts a valid payload.
  const initialBody = useMemo<Record<string, unknown>>(() => {
    try {
      return spec.bodySample ? JSON.parse(spec.bodySample) : {};
    } catch {
      return {};
    }
  }, [spec.bodySample]);
  const [bodyObj, setBodyObj] = useState<Record<string, unknown>>(initialBody);
  const bodyFields = Object.entries(initialBody).filter(([, v]) => v === null || typeof v !== "object");
  const setBodyField = (k: string, raw: string) => {
    const orig = initialBody[k];
    const val = typeof orig === "number" && raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
    const next = { ...bodyObj, [k]: val };
    setBodyObj(next);
    pg.setBody(JSON.stringify(next, null, 2));
  };

  const reqQuery = spec.queryParams.filter((p) => p.required);
  const activeCode = ep.code[LANGS.find((l) => l.key === lang)!.field];
  const live = pg.response;
  const showLive = !!(live || pg.error);

  return (
    <div className="explorer">
      <div className="ex-top">
        <span className="et">Try it</span>
        <span className="live">
          <span className="dot g" /> {live ? live.via : spec.proxy === "always" ? "proxy" : "live"}
        </span>
        <button className={`ex-send${pg.loading ? " sending" : ""}`} onClick={pg.send} disabled={pg.loading} type="button">
          <Ico d="M5 12h14M13 6l6 6-6 6" cls="ico" /> {pg.loading ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="ex-auth">
        {spec.bearer && (
          <ExRow label="Authorization">
            <span className="pre">Bearer</span>
            <input
              value={pg.token}
              onChange={(e) => pg.setToken(e.target.value)}
              placeholder="sk_live_…"
              spellCheck={false}
              aria-label="API key"
            />
          </ExRow>
        )}
        {spec.apiKeyHeaders.map((ak) => (
          <ExRow key={ak.name} label={ak.name}>
            <input
              value={pg.getParam("header", ak.name)}
              onChange={(e) => pg.setParam("header", ak.name, e.target.value)}
              spellCheck={false}
              aria-label={ak.name}
            />
          </ExRow>
        ))}
        {spec.pathParams.map((p) => (
          <ExRow key={p.name} label={`Path · ${p.name}`}>
            <input
              value={pg.getParam("path", p.name)}
              onChange={(e) => pg.setParam("path", p.name, e.target.value)}
              placeholder={p.sample || p.name}
              spellCheck={false}
              aria-label={p.name}
            />
          </ExRow>
        ))}
        {reqQuery.map((p) => (
          <ExRow key={p.name} label={`Query · ${p.name}`}>
            <input
              value={pg.getParam("query", p.name)}
              onChange={(e) => pg.setParam("query", p.name, e.target.value)}
              placeholder={p.sample || p.name}
              spellCheck={false}
              aria-label={p.name}
            />
          </ExRow>
        ))}
        {bodyFields.map(([k, v]) => (
          <ExRow key={k} label={`Body · ${k}`}>
            <input
              value={String((bodyObj[k] ?? v) as string | number)}
              onChange={(e) => setBodyField(k, e.target.value)}
              spellCheck={false}
              aria-label={k}
            />
          </ExRow>
        ))}
      </div>

      <div className="ex-langbar">
        <div className="cc-langs">
          {LANGS.map((l) => (
            <button key={l.key} className={`cc-lang${lang === l.key ? " active" : ""}`} onClick={() => setLang(l.key)} type="button">
              {l.label}
            </button>
          ))}
        </div>
        <button className="cc-copy" data-copy={textFromHtml(activeCode)} data-copy-icon aria-label="Copy">
          <CopyIco />
        </button>
      </div>
      <div>
        <pre dangerouslySetInnerHTML={{ __html: activeCode }} />
      </div>

      <div className={`ex-resp${showLive ? " show" : ""}`}>
        {pg.error ? (
          <>
            <div className="rh">
              <span className="dot r" />
              <span className="st" style={{ color: "var(--c-red)" }}>
                Request failed
              </span>
            </div>
            <pre style={{ color: "#e6868a", whiteSpace: "pre-wrap" }}>{pg.error}</pre>
          </>
        ) : live ? (
          <>
            <div className="rh">
              <span className={`dot ${live.status < 400 ? "g" : "r"}`} />
              <span className="st" style={live.status >= 400 ? { color: "var(--c-red)" } : undefined}>
                {live.status} {live.statusText}
              </span>
              <span className="lat">
                {live.durationMs} ms · {live.via}
              </span>
            </div>
            <pre dangerouslySetInnerHTML={{ __html: colorizeJsonString(live.body) }} />
          </>
        ) : ep.response ? (
          <>
            <div className="rh">
              <span className="dot g" />
              <span className="st">{ep.response.label}</span>
              <span className="lat">example</span>
            </div>
            <pre dangerouslySetInnerHTML={{ __html: ep.response.html }} />
          </>
        ) : null}
      </div>

      <div className="ex-foot">
        <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Runs via your proxy · no key leaves your domain
      </div>
    </div>
  );
}

function ExRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ex-row">
      <label>{label}</label>
      <div className="ex-in">{children}</div>
    </div>
  );
}

function CodePanels({ code, id }: { code: EndpointView["code"]; id: string }) {
  return (
    <div id={id}>
      <div data-panel="curl" className="active">
        <pre dangerouslySetInnerHTML={{ __html: code.curl }} />
      </div>
      <div data-panel="js">
        <pre dangerouslySetInnerHTML={{ __html: code.node }} />
      </div>
      <div data-panel="py">
        <pre dangerouslySetInnerHTML={{ __html: code.python }} />
      </div>
      <div data-panel="go">
        <pre dangerouslySetInnerHTML={{ __html: code.go }} />
      </div>
    </div>
  );
}

/** Colorize a JSON string into the design's code-rail span classes. */
function colorizeJsonString(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="key">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      if (kw) return `<span class="k">${kw}</span>`;
      if (num) return `<span class="n">${num}</span>`;
      return m;
    },
  );
}

/* ── small pieces ──────────────────────────────────────────────────────── */
function Attr({ attr, showReqOpt }: { attr: AttrView; showReqOpt?: boolean }) {
  return (
    <div className="attr">
      <div className="ah">
        <span className="ak">{attr.name}</span>
        <span className="at">{attr.type}</span>
        {showReqOpt && attr.required && <span className="req">required</span>}
        {showReqOpt && !attr.required && attr.optional && <span className="opt">optional</span>}
      </div>
      <div className="ad">
        {attr.description || "—"}
        {attr.enums && attr.enums.length > 0 && (
          <span className="enum">
            {attr.enums.map((v) => (
              <code key={v}>{v}</code>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function AiActions({ resource, markdown, aiEnabled }: { resource: string; markdown?: boolean; aiEnabled?: boolean }) {
  return (
    <div className="ai-actions">
      {aiEnabled && (
        <a className="ai-action ask" onClick={() => openAskPanel(resource)}>
          <Spark />
          Ask about this section
        </a>
      )}
      <a className="ai-action" data-doc-action="copy-llm">
        <CopyIco />
        Copy for LLM
      </a>
      {markdown && (
        <a className="ai-action" data-doc-action="view-md">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 4h16v16H4z" opacity=".4" />
            <path d="M7 9l2 3 2-3M14 9v6m3-6-1.5 2L14 9" />
          </svg>
          View as Markdown
        </a>
      )}
    </div>
  );
}

function Helpful() {
  return (
    <div className="helpful">
      Was this section helpful?{" "}
      <span className="yn">
        <button>Yes</button>
        <button>No</button>
      </span>
    </div>
  );
}

/* ── icons ─────────────────────────────────────────────────────────────── */
function Ico({ d, cls = "", w = 24, search }: { d: string; cls?: string; w?: number; search?: boolean }) {
  if (search) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    );
  }
  return (
    <svg className={cls} width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={d} />
    </svg>
  );
}
function Spark() {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" />
    </svg>
  );
}
function CopyIco() {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function Gh() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ── helpers ───────────────────────────────────────────────────────────── */
function verbClass(verb: string): string {
  const v = verb.toLowerCase();
  if (v === "del") return "del";
  return v;
}

/** Strip the colorizing spans back to plain text for the copy payload. */
function textFromHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
