"use client";

import { createContext, Fragment, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ApiRefView, AttrView, EndpointView, EventColors, EventView, NavTreeNode, NavParent } from "@/lib/apiref-view";
import type { AiPublicConfig } from "@/lib/config";
import { ApiExplorer, PlaygroundProvider, usePlayground } from "../playground";
import { AskDock, openAskPanel } from "../../ai/ask-dock";
import { SectionRate } from "../../feedback";
import { SiteCredit } from "@/components/site-credit";
import {
  SearchPalette,
  VersionSelector,
  MarkdownModal,
  openSearch,
  openMarkdown,
  apiSecToMarkdown,
} from "./apiref-extras";

/**
 * API reference — a full-takeover page implemented from the Claude
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
/* ── event-dot coloring ────────────────────────────────────────────────────
 * Status mode lets the CSS tone class (.g/.r/.n) color the dot. Palette mode
 * maps each event to a stable color (hash of name → palette entry) so the same
 * event reads the same color in the overview, sidebar, trigger chip and card.
 * None forces neutral. Returns an inline style that overrides the tone class. */
const EventColorsContext = createContext<EventColors>({ mode: "status", palette: [], colors: {} });

function hashName(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function eventDotStyle(name: string, ec: EventColors): React.CSSProperties | undefined {
  if (ec.mode === "palette" && ec.palette.length) {
    // Server resolves a per-resource color by position; hash is a fallback for
    // any name not in that map (shouldn't happen on a resource page).
    return { background: ec.colors[name] ?? ec.palette[hashName(name) % ec.palette.length] };
  }
  if (ec.mode === "none") return { background: "var(--ink-4)" };
  return undefined; // status → the tone class colors it
}

/** For dot sites rendered inside <EventColorsContext.Provider>. Sites in the top
 *  component (above the provider) must call eventDotStyle(name, view.eventColors). */
function useEventDot(): (name: string) => React.CSSProperties | undefined {
  const ec = useContext(EventColorsContext);
  return (name: string) => eventDotStyle(name, ec);
}

export function MarklineApiRef({
  view,
  summary,
  ai,
  feedbackEnabled = false,
  feedbackEndpoint,
  siteName,
  year,
}: {
  view: ApiRefView;
  /** Server-rendered per-resource MDX summary (api/sections/<tag>.mdx), if any. */
  summary?: React.ReactNode;
  /** Sanitized AI config; when present the docked Ask-AI panel is mounted and
   *  the Ask-AI affordances render. Null/undefined → no AI UI at all. */
  ai?: AiPublicConfig | null;
  /** Whether the per-section "Was this helpful?" widget renders (feedback opt-in). */
  feedbackEnabled?: boolean;
  /** Endpoint for the per-section "Was this helpful?" widget (config.feedback.endpoint). */
  feedbackEndpoint?: string;
  /** Site name + current year for the "built with Markline" credit footer. */
  siteName: string;
  year: number;
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

    /* collapsible webhook event cards — JS drives the height so it survives the
       engine's CSS reset (inline max-height !important, ported from the handoff). */
    const setEvtOpen = (card: Element | null, open: boolean) => {
      if (!card) return;
      const body = card.querySelector<HTMLElement>(".evt-body");
      const inner = body?.firstElementChild as HTMLElement | null;
      card.classList.toggle("open", open);
      card.querySelector("[data-evt-toggle]")?.setAttribute("aria-expanded", open ? "true" : "false");
      if (body) body.style.setProperty("max-height", open ? `${inner?.scrollHeight ?? 1600}px` : "0px", "important");
    };
    const openEventAt = (id: string) => {
      const sec = el.querySelector(`#${CSS.escape(id)}`);
      const card = sec?.matches("[data-evt]") ? sec : sec?.querySelector("[data-evt]");
      if (card) setEvtOpen(card, true);
    };

    /* click delegation */
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      /* webhook event card accordion */
      const evtToggle = target.closest("[data-evt-toggle]");
      if (evtToggle) {
        const card = evtToggle.closest("[data-evt]");
        setEvtOpen(card, !card?.classList.contains("open"));
        return;
      }

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


      /* endpoint-list rows + sidebar anchors → smooth-scroll to the section */
      const jump = target.closest<HTMLElement>("[data-jump]");
      if (jump) {
        e.preventDefault();
        const id = jump.getAttribute("data-jump")!;
        const sec = el.querySelector(`#${CSS.escape(id)}`);
        if (sec) {
          history.replaceState(null, "", `#${id}`);
          openEventAt(id); // a jump to an event auto-expands its card
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
      // PlaygroundProvider — see TryItCards / ApiExplorer — so no delegation here.
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

    /* batch long attribute lists into a "More attributes" reveal (ported from the
       handoff). Skipped inside event cards — those nest in a fixed-height body. */
    const DEFAULT_LIMIT = 4;
    el.querySelectorAll<HTMLElement>(".attr-h").forEach((h) => {
      if (h.closest("[data-evt]")) return;
      const attrs: HTMLElement[] = [];
      let n = h.nextElementSibling as HTMLElement | null;
      while (n && n.classList.contains("attr")) {
        attrs.push(n);
        n = n.nextElementSibling as HTMLElement | null;
      }
      const scope = h.closest<HTMLElement>("[data-attr-limit]");
      const limit = scope ? parseInt(scope.getAttribute("data-attr-limit") || "", 10) || DEFAULT_LIMIT : DEFAULT_LIMIT;
      const hidden = attrs.slice(limit);
      if (hidden.length < 2) return; // only batch when it meaningfully declutters
      const wrap = document.createElement("div");
      wrap.className = "attr-more";
      attrs[limit].parentNode!.insertBefore(wrap, attrs[limit]);
      hidden.forEach((a) => wrap.appendChild(a));
      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "attr-more-bar";
      bar.setAttribute("aria-expanded", "false");
      bar.innerHTML =
        '<span class="amb-label">More attributes</span><span class="amb-count">' +
        hidden.length +
        '</span><svg class="amb-chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>';
      wrap.parentNode!.insertBefore(bar, wrap);
      bar.addEventListener("click", () => {
        const open = !bar.classList.contains("open");
        bar.classList.toggle("open", open);
        bar.setAttribute("aria-expanded", open ? "true" : "false");
        wrap.style.setProperty("max-height", open ? `${wrap.scrollHeight}px` : "0px", "important");
      });
    });

    /* a deep link to an event opens its card on load */
    if (location.hash.startsWith("#event-")) openEventAt(location.hash.slice(1));

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
   <EventColorsContext.Provider value={view.eventColors}>
    <div className="ml-apiref" ref={root}>
      {/* NAV is the shared <SiteNav/> rendered once in app/layout.tsx. The mobile
          drawer toggle for the API sidebar lives in the api-tools row below. */}
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
              buttonLabel={view.version && view.version !== view.versionLabel ? `${view.versionLabel} · ${view.version}` : view.versionLabel}
            />
          </div>

          {view.nav.map((n) => (
            <NavNodeView key={n.slug} node={n} base={view.base} />
          ))}
        </aside>

        {/* ============ DOC ============ */}
        <main className="api-doc">
          {/* 1 · Resource header */}
          <section className="api-sec" id={r.slug}>
            <div className="api-l api-resource">
              {r.crumbs.length > 0 && <div className="api-crumbs">{r.crumbs.join(" / ")}</div>}
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
              {feedbackEnabled && <SectionRate endpoint={feedbackEndpoint} target={r.slug} />}
            </div>
            <div className="api-r">
              <AiActions resource={r.name} markdown aiEnabled={aiOn} />
              <div className="ep-card">
                <div className="ep-tabs" data-tabs data-tabs-scope={`#ep-panels-${r.slug}`}>
                  <button className="ep-tab active" data-tab="endpoints">
                    Endpoints
                  </button>
                  {r.events.length > 0 && (
                    <button className="ep-tab" data-tab="events">
                      Events
                    </button>
                  )}
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
                  {r.events.length > 0 && (
                    <div data-panel="events">
                      {r.events.map((ev) => (
                        <div className="ep-row ep-row-event" data-jump={ev.id} key={ev.id}>
                          <div>
                            <div className="ep-title">
                              <span className={`edot ${ev.tone}`} style={eventDotStyle(ev.name, view.eventColors)} />
                              <span className="ep-event-name">{ev.name}</span>
                            </div>
                            {ev.summary && <div className="ep-evtdesc">{ev.summary}</div>}
                          </div>
                          <Ico d="m9 6 6 6-6 6" cls="chev" w={16} />
                        </div>
                      ))}
                    </div>
                  )}
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

          {/* Webhook events — collapsible cards at the foot of the resource */}
          {r.events.map((ev, i) => (
            <EventSection key={ev.id} ev={ev} resourceName={r.name} aiEnabled={aiOn} first={i === 0} />
          ))}
        </main>
      </div>

      <SiteCredit name={siteName} year={year} />

      <SearchPalette index={view.search} aiEnabled={aiOn} />
      <MarkdownModal />
      {ai && (
        <AskDock
          ai={ai}
          suggestions={[
            "How do I authenticate requests?",
            `How do I use the ${r.name} API?`,
            "What does an error response look like?",
          ]}
        />
      )}
    </div>
   </EventColorsContext.Provider>
  );
}

/* ── sidebar nav (nested, derived from slash-separated tags) ─────────────── */
function NavNodeView({ node, base }: { node: NavTreeNode; base: string }) {
  const eventDot = useEventDot();
  if (node.kind === "group") return <NavParentView node={node} base={base} />;

  // A resource leaf. Inactive → a quiet link to its page. Active → expanded with
  // its in-page operation jumps.
  if (!node.active) {
    return (
      <div className="api-grp dim">
        <Link className="gt" href={`${base}/${node.slug}`} style={{ textDecoration: "none" }}>
          {node.name}
          <Ico d="m9 6 6 6-6 6" cls="chev" w={14} />
        </Link>
      </div>
    );
  }
  return (
    <div className="api-grp">
      <div className="gt" style={{ fontWeight: 600 }}>
        {node.name}
        <Ico d="m6 9 6 6 6-6" cls="chev" w={14} />
      </div>
      <div className="api-sub-nav">
        {node.ops.map((op, i) => (
          <Fragment key={op.id + i}>
            {op.evt && !node.ops[i - 1]?.evt && <div className="nav-evt-h">Events</div>}
            <a className={i === 0 ? "on" : undefined} data-jump={op.id}>
              {op.evt ? (
                <span className={`ndot ${op.evt}`} style={eventDot(op.name)} />
              ) : (
                op.verb && <span className={`verb ${verbClass(op.verb)}`}>{op.verb}</span>
              )}
              <span className="nm">{op.name}</span>
            </a>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

/** A parent group: an accordion of nested resources/sub-groups. Opens by default
 *  when it contains the active resource. When the prefix is itself a real tag,
 *  the label links to its page and a chevron toggles the children. */
function NavParentView({ node, base }: { node: NavParent; base: string }) {
  const [open, setOpen] = useState(node.expanded);
  const chevron = <Ico d="m9 6 6 6-6 6" cls="chev" w={14} />;
  return (
    <div className={`api-grp api-parent${open ? " open" : ""}${node.active ? " on" : ""}`}>
      {node.tag ? (
        <Link className="gt" href={`${base}/${node.slug}`} style={{ textDecoration: "none" }}>
          {node.name}
          <button
            type="button"
            className="gt-toggle"
            aria-label={open ? "Collapse" : "Expand"}
            onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
          >
            {chevron}
          </button>
        </Link>
      ) : (
        <button type="button" className="gt" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {node.name}
          {chevron}
        </button>
      )}
      {open && (
        <div className="api-grp-children">
          {node.children.map((c) => (
            <NavNodeView key={c.slug} node={c} base={base} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── webhook event section (collapsible card) ──────────────────────────── */
function EventSection({
  ev,
  resourceName,
  aiEnabled,
  first,
}: {
  ev: EventView;
  resourceName: string;
  aiEnabled: boolean;
  first?: boolean;
}) {
  const lead = ev.description || ev.summary;
  const eventDot = useEventDot();
  return (
    <section className={`api-sec evt-sec${first ? " evt-first" : ""}`} id={ev.id}>
      <div className="evt-card" data-evt>
        <button className="evt-head" type="button" data-evt-toggle aria-expanded="false">
          <span className={`edot ${ev.tone}`} style={eventDot(ev.name)} />
          <span className="evt-hname">{ev.name}</span>
          {ev.summary && <span className="evt-hdesc">{ev.summary}</span>}
          <Ico d="m9 6 6 6-6 6" cls="evt-chev" w={16} />
        </button>
        <div className="evt-body">
          <div className="evt-inner">
            <div className="evt-grid">
              <div className="evt-col-l">
                {lead && <p className="evt-lead">{lead}</p>}
                {ev.guideHref && (
                  <Link className="evt-guide" href={ev.guideHref}>
                    Full guide <Ico d="M5 12h14M13 6l6 6-6 6" w={15} />
                  </Link>
                )}
                {ev.emittedBy.length > 0 && (
                  <div className="evt-emit">
                    <span className="lbl">Emitted by</span>
                    {ev.emittedBy.map((e) => (
                      <a key={e.id} className="evt-chip" data-jump={e.id}>
                        <span className={`verb ${verbClass(e.verb)}`}>{e.verb}</span> {e.title}
                      </a>
                    ))}
                  </div>
                )}
                {ev.attrs.length > 0 && (
                  <>
                    <div className="attr-h">Payload</div>
                    {ev.attrs.map((a) => (
                      <Attr key={a.name} attr={a} />
                    ))}
                  </>
                )}
              </div>
              <div className="evt-col-r">
                <AiActions resource={`${resourceName} ${ev.name}`} aiEnabled={aiEnabled} />
                <div className="code-card">
                  <div className="cc-head">
                    <span className="cc-title">Example payload</span>
                    <button className="cc-copy" data-copy={textFromHtml(ev.sampleHtml)} data-copy-icon aria-label="Copy">
                      <CopyIco />
                    </button>
                  </div>
                  <pre dangerouslySetInnerHTML={{ __html: ev.sampleHtml }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── endpoint section ──────────────────────────────────────────────────── */
function EndpointSection({ ep, aiEnabled }: { ep: EndpointView; aiEnabled: boolean }) {
  const eventDot = useEventDot();
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
        {ep.triggers.length > 0 && (
          <div className="trig-row">
            <span className="trig-lbl">Triggers</span>
            {ep.triggers.map((t) => (
              <a key={t.id} className="trig-chip" data-jump={t.id}>
                <span className={`tdot ${t.tone}`} style={eventDot(t.name)} />
                {t.name}
              </a>
            ))}
          </div>
        )}
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
        {ep.playground ? (
          <PlaygroundProvider spec={ep.playground}>
            <TryItCards ep={ep} />
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
            {ep.code.tabs.map((t, i) => (
              <button key={t.key} className={`cc-lang${i === 0 ? " active" : ""}`} data-tab={t.key}>
                {t.label}
              </button>
            ))}
          </div>
          <button className="cc-copy" data-copy={textFromHtml(ep.code.tabs[0]?.html ?? "")} data-copy-icon aria-label="Copy">
            <CopyIco />
          </button>
        </div>
        <CodePanels code={ep.code} id={`code-${ep.opId}`} />
      </div>
      <ResponseCard ep={ep} />
    </>
  );
}

/**
 * The Response card. With one documented response it shows a single status pill;
 * with several (success + errors) it shows a status-code switcher whose tabs swap
 * the body in place. Always sits on the light "response" surface (`.resp`).
 */
function ResponseCard({ ep }: { ep: EndpointView }) {
  const rs = ep.responses;
  if (rs.length === 0) return null;
  if (rs.length === 1) {
    const r = rs[0];
    return (
      <div className="code-card resp">
        <div className="cc-head">
          <span className="cc-title">Response</span>
          <span className="cc-status">
            <span className={`dot ${r.tone}`} /> {r.label}
          </span>
          <button className="cc-copy" data-copy={textFromHtml(r.html)} data-copy-icon aria-label="Copy">
            <CopyIco />
          </button>
        </div>
        <pre dangerouslySetInnerHTML={{ __html: r.html }} />
      </div>
    );
  }
  const scope = `resp-${ep.opId}`;
  return (
    <div className="code-card resp">
      <div className="cc-head">
        <span className="cc-title">Response</span>
        <div className="cc-codes" data-tabs data-tabs-scope={`#${scope}`}>
          {rs.map((r, i) => (
            <button key={r.status} className={`cc-code${i === 0 ? " active" : ""}`} data-tab={r.status}>
              <span className={`dot ${r.tone}`} />
              {r.status}
            </button>
          ))}
        </div>
        <button className="cc-copy" data-copy={textFromHtml(rs[0].html)} data-copy-icon aria-label="Copy">
          <CopyIco />
        </button>
      </div>
      <div id={scope}>
        {rs.map((r, i) => (
          <div key={r.status} data-panel={r.status} className={i === 0 ? "active" : undefined}>
            <pre dangerouslySetInnerHTML={{ __html: r.html }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The design's inline proxy explorer, driven by the real playground engine
 * (PlaygroundProvider / usePlayground). The chrome is the handoff's .explorer;
 * the state, the cURL, the Send and the response come from the shared engine
 * that powers the per-operation playground — so the same proxy/SSRF rules and
 * BYOK token apply. Fully React-controlled (no click delegation).
 */
/**
 * The design's read-style code rail + Response card, plus a "Try it" play
 * button that opens the {@link ApiExplorer} modal. Used for every endpoint that
 * has a playground spec (the explorer is modal-only now). When a request has
 * been sent, the Response card swaps the example for the live result.
 */
function TryItCards({ ep }: { ep: EndpointView }) {
  const pg = usePlayground();
  const live = pg.response;
  const tabs = ep.code.tabs;
  return (
    <>
      <div className="code-card">
        <div className="cc-langs-head cc-head">
          <div className="cc-langs" data-tabs data-tabs-scope={`#code-${ep.opId}`}>
            {tabs.map((t, i) => (
              <button key={t.key} className={`cc-lang${i === 0 ? " active" : ""}`} data-tab={t.key}>
                {t.label}
              </button>
            ))}
          </div>
          <ApiExplorer
            trigger={(open) => (
              <button type="button" className="cc-play" onClick={open}>
                <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg> Try it
              </button>
            )}
          />
          <button className="cc-copy" data-copy={textFromHtml(tabs[0]?.html ?? "")} data-copy-icon aria-label="Copy">
            <CopyIco />
          </button>
        </div>
        <CodePanels code={ep.code} id={`code-${ep.opId}`} />
      </div>

      {live ? (
        <div className="code-card resp">
          <div className="cc-head">
            <span className="cc-title">Response</span>
            <span className="cc-status">
              <span className={`dot ${live.status < 400 ? "g" : "r"}`} /> {live.status} {live.statusText} · {live.durationMs} ms
            </span>
          </div>
          <pre dangerouslySetInnerHTML={{ __html: colorizeJsonString(live.body) }} />
        </div>
      ) : pg.error ? (
        <div className="code-card resp">
          <div className="cc-head">
            <span className="cc-title">Response</span>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", color: "#e6868a" }}>{pg.error}</pre>
        </div>
      ) : (
        <ResponseCard ep={ep} />
      )}
    </>
  );
}

function CodePanels({ code, id }: { code: EndpointView["code"]; id: string }) {
  return (
    <div id={id}>
      {code.tabs.map((t, i) => (
        <div key={t.key} data-panel={t.key} className={i === 0 ? "active" : undefined}>
          <pre dangerouslySetInnerHTML={{ __html: t.html }} />
        </div>
      ))}
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
