"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Wordmark } from "./wordmark";

/**
 * Markline marketing home — a self-contained landing implemented from the
 * Claude Design handoff (steel/blueprint, Geist + Instrument Serif, 8-color
 * categorical palette). All styles live in app/home.css, scoped under
 * `.ml-home`; the framework topbar is hidden for this page via that stylesheet.
 *
 * Interactions (terminal typing, reveal-on-scroll, copy, theme toggle) are
 * ported from the prototype's markline.js and scoped to this component's root.
 */
export function MarklineHome() {
  const root = useRef<HTMLDivElement>(null);

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

    /* click delegation: copy buttons + theme toggle */
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const copy = target.closest<HTMLElement>("[data-copy]");
      if (copy) {
        const text = copy.getAttribute("data-copy") || "";
        const restore = copy.innerHTML;
        const done = () => {
          copy.classList.add("copied");
          copy.innerHTML =
            '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg>';
          after(1300, () => {
            copy.innerHTML = restore;
            copy.classList.remove("copied");
          });
        };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
        else done();
        return;
      }
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
      }
    };
    el.addEventListener("click", onClick);

    /* hero terminal */
    const term = el.querySelector<HTMLElement>("[data-terminal]");
    let stopped = false;
    if (term) runTerminal(term);

    function runTerminal(node: HTMLElement) {
      const lines = [
        { t: "cmd", s: "npx create-markline@latest docs" },
        { t: "dim", s: "◇  Scaffolding project in ./docs" },
        { t: "ok", s: "✓  OpenAPI detected — generating reference" },
        { t: "ok", s: "✓  Static search index built · 0 services" },
        { t: "dim", s: "◇  Self-hostable build → ./dist" },
        { t: "done", s: "Local:  http://localhost:4242  ·  MIT" },
        { t: "cmd", s: "git push  # you own the whole thing" },
      ];
      const out = node.querySelector<HTMLElement>("[data-term-out]");
      if (!out) return;
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const renderLine = (l: { t: string; s: string }) => {
        if (l.t === "cmd") return '<div class="term-row term-cmd"><span class="term-pr">$</span><span class="term-tx">' + esc(l.s) + "</span></div>";
        if (l.t === "done") return '<div class="term-row term-done">' + esc(l.s) + "</div>";
        return '<div class="term-row ' + (l.t === "ok" ? "term-ok" : "term-dim") + '">' + esc(l.s) + "</div>";
      };
      if (reduce) {
        out.innerHTML = lines.map(renderLine).join("");
        return;
      }
      const scroll = () => {
        out.scrollTop = out.scrollHeight;
      };
      let li = 0;
      const nextLine = () => {
        if (stopped) return;
        if (li >= lines.length) {
          after(4200, () => {
            out.innerHTML = "";
            li = 0;
            nextLine();
          });
          return;
        }
        const l = lines[li];
        if (l.t === "cmd") {
          typeLine(l, () => {
            li++;
            after(420, nextLine);
          });
        } else {
          out.insertAdjacentHTML("beforeend", renderLine(l));
          li++;
          after(360, nextLine);
        }
        scroll();
      };
      const typeLine = (l: { s: string }, cb: () => void) => {
        const row = document.createElement("div");
        row.className = "term-row term-cmd";
        row.innerHTML = '<span class="term-pr">$</span><span class="term-tx"></span><span class="term-cur"></span>';
        out.appendChild(row);
        const tx = row.querySelector<HTMLElement>(".term-tx")!;
        let i = 0;
        const type = () => {
          if (stopped) return;
          if (i <= l.s.length) {
            tx.textContent = l.s.slice(0, i);
            i++;
            scroll();
            after(34, type);
          } else {
            row.querySelector(".term-cur")?.remove();
            cb();
          }
        };
        type();
      };
      after(600, nextLine);
    }

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      io?.disconnect();
      el.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div className="ml-home" ref={root}>
      {/* NAV is the shared <SiteNav/> rendered once in app/layout.tsx. */}

      {/* ===== HERO ===== */}
      <section className="hero grid-bg">
        <div className="wrap">
          <div className="hero-frame frame">
            <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
            <div className="hero-inner">
              <h1>
                The docs framework<br />you actually <span className="soft">own.</span>
              </h1>
              <p className="hero-sub">
                Everything Scalar and Mintlify do — first-class OpenAPI, a live playground, instant search, and AI on your
                own key — open source and self-hostable. No SaaS. No seats. No lock-in.
              </p>
              <div className="hero-cta">
                <Link className="btn btn-primary" href="/quickstart">
                  Get started
                  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
                <Link className="btn btn-ghost" href="/quickstart">Read the docs</Link>
              </div>

              <div className="term-wrap reveal">
                <div className="term" data-terminal>
                  <div className="term-head">
                    <div className="dots"><i /><i /><i /></div>
                    <span className="ttl">markline — zsh — 80×24</span>
                  </div>
                  <div className="term-body"><div data-term-out /></div>
                </div>
              </div>

              <div className="compat">
                <div className="kicker" style={{ justifyContent: "center" }}>
                  <span className="bk">//</span> WORKS WITH WHAT YOU ALREADY SHIP
                </div>
                <div className="compat-row">
                  <span>OpenAPI 3.1</span><span>Markdown</span><span>MDX</span><span>React</span>
                  <span>Vercel</span><span>Netlify</span><span>Cloudflare</span><span>Docker</span>
                </div>
              </div>
            </div>
            <div className="barcode" style={{ marginTop: 18 }} />
          </div>
        </div>
      </section>

      {/* ===== STAT BAND ===== */}
      <section className="stats grid-bg">
        <div className="wrap">
          <div className="stats-grid">
            <div className="stat"><div className="n">1<span className="u">×</span></div><div className="l">One command to ship</div><div className="s">npx create-markline</div></div>
            <div className="stat"><div className="n">0</div><div className="l">Vendor lock-in</div><div className="s">your repo, your host</div></div>
            <div className="stat"><div className="n">100<span className="u">%</span></div><div className="l">Static output</div><div className="s">deploy anywhere</div></div>
            <div className="stat"><div className="n">MIT</div><div className="l">Open source license</div><div className="s">fork it forever</div></div>
          </div>
        </div>
      </section>

      {/* ===== PRODUCT — API REFERENCE ===== */}
      <section className="sec section">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>This is the API reference.<br />Generated from your OpenAPI. Hosted by you.</h2>
            <p>
              Point Markline at an <span className="mono" style={{ color: "var(--ink)" }}>openapi.json</span> and it builds a
              three-pane reference with a working request explorer and copy-paste samples in every language — no dashboard,
              no proxy, no per-call billing.
            </p>
          </div>

          <div className="product reveal frame">
            <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
            <div className="win">
              <div className="win-bar">
                <div className="win-dots"><i /><i /><i /></div>
                <div className="win-addr">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  docs.acme.dev/reference
                </div>
              </div>
              <div className="apiref">
                <div className="col ar-nav">
                  <div className="grp">Core</div>
                  <a className="on"><span className="verb post">POST</span> Create payment</a>
                  <a><span className="verb get">GET</span> Get payment</a>
                  <a><span className="verb get">GET</span> List payments</a>
                  <a><span className="verb del">DEL</span> Cancel payment</a>
                  <div className="grp">Customers</div>
                  <a><span className="verb post">POST</span> Create customer</a>
                  <a><span className="verb put">PUT</span> Update customer</a>
                  <a><span className="verb get">GET</span> List customers</a>
                  <div className="grp">Webhooks</div>
                  <a><span className="verb post">POST</span> Register endpoint</a>
                </div>
                <div className="col ar-main">
                  <div className="ar-bc">Core / Payments</div>
                  <div className="ar-h"><span className="verb post">POST</span> Create payment</div>
                  <div className="ar-route"><span className="verb post">POST</span> https://api.acme.dev/v1/payments</div>
                  <p className="ar-p">
                    Creates a payment and returns the resulting object. Idempotent on{" "}
                    <span className="mono" style={{ color: "var(--ink)" }}>Idempotency-Key</span>.
                  </p>
                  <div className="ar-sub">Body parameters</div>
                  <div className="ar-param"><div><span className="pk">amount</span><span className="ar-req">required</span></div><div><div className="pt">integer</div><div className="pd">Amount in the smallest currency unit.</div></div></div>
                  <div className="ar-param"><div><span className="pk">currency</span><span className="ar-req">required</span></div><div><div className="pt">string · ISO 4217</div><div className="pd">Three-letter currency code.</div></div></div>
                  <div className="ar-param"><div><span className="pk">customer</span></div><div><div className="pt">string</div><div className="pd">ID of the customer to charge.</div></div></div>
                  <div className="ar-param"><div><span className="pk">metadata</span></div><div><div className="pt">object</div><div className="pd">Set of key-value pairs.</div></div></div>
                </div>
                <div className="col ar-try">
                  <div className="tt">Try it <button className="send">Send ▸</button></div>
                  <div className="ar-langs">
                    <span className="ar-lang on">cURL</span><span className="ar-lang">JS</span><span className="ar-lang">Python</span><span className="ar-lang">Go</span>
                  </div>
                  <div className="ar-code">
                    <span className="c"># request</span>{"\n"}
                    <span className="f">curl</span> -X POST \{"\n"}
                    {"  "}https://api.acme.dev<span className="s">/v1/payments</span> \{"\n"}
                    {"  "}-H <span className="s">"Authorization: Bearer ••••"</span> \{"\n"}
                    {"  "}-d <span className="s">{`'{ "amount": 2400,`}</span>{"\n"}
                    <span className="s">{`      "currency": "usd" }'`}</span>
                  </div>
                  <div className="ar-resp">
                    <div className="rh"><span className="ok">●</span> 200 OK <span style={{ marginLeft: "auto" }}>42 ms</span></div>
                    <div className="rb">
                      <span style={{ color: "var(--ink-4)" }}>{"{"}</span>{"\n"}
                      {"  "}<span className="mono" style={{ color: "#82aaff" }}>"id"</span>: <span style={{ color: "#a5d6a7" }}>"pay_3Nk…"</span>,{"\n"}
                      {"  "}<span className="mono" style={{ color: "#82aaff" }}>"status"</span>: <span style={{ color: "#a5d6a7" }}>"succeeded"</span>{"\n"}
                      <span style={{ color: "var(--ink-4)" }}>{"}"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="product-cap reveal">
            <span>Live in every Markline build · paired light &amp; dark</span>
            <span className="theme-pills"><i style={{ background: "#0a0a0b" }} /><i style={{ background: "#f6f6f4" }} /><i style={{ background: "var(--c-purple)" }} /></span>
            <span>11 named themes · your CSS variables</span>
          </div>
        </div>
      </section>

      {/* ===== BENTO ===== */}
      <section className="sec section grid-bg rule-t rule-b">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>Everything they do.<br />Fully open.</h2>
            <p>The features that made hosted docs platforms worth paying for — rebuilt as a framework you run yourself.</p>
          </div>

          <div className="bento">
            <article className="cell c-wide reveal k-cyan">
              <Link className="card-link" href="/api-reference" aria-label="OpenAPI reference" />
              <div className="tex tex-fade">
                <div className="tex-grid" style={{ position: "absolute", inset: 0 }} />
                <div className="mini-doc">
                  <div className="ln"><span style={{ color: "var(--ink-4)" }}>#</span> <span className="b">openapi.json</span> → reference</div>
                  <div className="ln"><span style={{ color: "var(--c-green)" }}>POST</span> /v1/payments      <span style={{ color: "var(--ink-4)" }}>✓ generated</span></div>
                  <div className="ln"><span style={{ color: "var(--c-cyan)" }}>GET</span>{" "}/v1/payments/{"{id}"} <span style={{ color: "var(--ink-4)" }}>✓ generated</span></div>
                  <div className="ln"><span style={{ color: "var(--c-red)" }}>DEL</span>{" "}/v1/payments/{"{id}"} <span style={{ color: "var(--ink-4)" }}>✓ generated</span></div>
                </div>
              </div>
              <div className="body">
                <h3>OpenAPI, done right</h3>
                <p>Drop in a spec and get a full three-pane reference — endpoints, schemas, auth, and a request explorer — regenerated on every build.</p>
              </div>
            </article>

            <article className="cell c-third reveal k-purple">
              <Link className="card-link" href="/api-reference" aria-label="Try-it playground" />
              <div className="tex tex-grad" />
              <div className="body">
                <h3>Try-it playground</h3>
                <p>Real requests, right in the page. Auth, variables, and responses — no Postman round-trip.</p>
              </div>
            </article>

            <article className="cell c-third reveal k-green">
              <Link className="card-link" href="/quickstart" aria-label="Static search docs" />
              <div className="tex">
                <div className="tex-dots" style={{ position: "absolute", inset: 0, opacity: 0.5 }} />
                <div className="mini-search">
                  <div className="bar"><span style={{ color: "var(--ink-4)" }}>⌘K</span> install hosting<span style={{ marginLeft: "auto", color: "var(--accent-ink)" }}>|</span></div>
                  <div className="res on">Deployment → Self-host</div>
                  <div className="res">Deployment → Docker</div>
                </div>
              </div>
              <div className="body">
                <h3>Instant static search</h3>
                <p>A prebuilt index ships with your site. Fast, offline-capable, zero services to run.</p>
              </div>
            </article>

            <article className="cell c-third reveal k-orange">
              <Link className="card-link" href="/deployment" aria-label="Self-hosting docs" />
              <div className="tex tex-lines tex-fade" />
              <div className="body">
                <h3>Self-host anywhere</h3>
                <p>Static output to any CDN, your own box, or a single Docker image. Your data never leaves.</p>
              </div>
            </article>

            <article className="cell c-third reveal k-pink">
              <Link className="card-link" href="/theming" aria-label="Theming docs" />
              <div className="tex tex-lines-w tex-fade" />
              <div className="body">
                <h3>Theme is a feature</h3>
                <p>CSS-variable design tokens, 11 named presets, and real light/dark — branded without forking.</p>
              </div>
            </article>

            <article className="cell c-third reveal k-tan">
              <Link className="card-link" href="/components" aria-label="Components and MDX docs" />
              <div className="tex tex-grid tex-fade" />
              <div className="body">
                <h3>Components &amp; MDX</h3>
                <p>Callouts, tabs, code groups, and your own React components — inline in Markdown.</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ===== AI / BYOK ===== */}
      <section className="sec section" id="ai">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>Bring your own key.<br />We bring the engine.</h2>
            <p>
              Markline ships the AI layer the hosted platforms meter — Ask-AI answers, Copy-for-LLM,{" "}
              <span className="mono" style={{ color: "var(--ink)" }}>llms.txt</span>, semantic search — wired straight to your
              provider. Your key, your data, your bill. Nothing routes through us.
            </p>
          </div>

          <div className="ai">
            <div className="reveal">
              <div className="ai-feats">
                <div className="ai-feat k-purple">
                  <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" /><path d="M19 14l.8 2 2 .8-2 .8L19 20l-.8-2.4-2-.8 2-.8.8-2z" /></svg></span>
                  <div><h4>Ask AI</h4><p>Natural-language answers grounded in your docs, with citations back to the source page.</p></div>
                </div>
                <div className="ai-feat k-cyan">
                  <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg></span>
                  <div><h4>Copy for LLM</h4><p>One click turns any page into clean, prompt-ready context for your own model.</p></div>
                </div>
                <div className="ai-feat k-green">
                  <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h10" /></svg></span>
                  <div><h4>llms.txt &amp; Markdown</h4><p>Machine-readable docs by default — every page available as raw Markdown and an llms.txt index.</p></div>
                </div>
                <div className="ai-feat k-pink">
                  <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg></span>
                  <div><h4>Semantic search</h4><p>Embeddings-based search that matches meaning, not just keywords — generated at build time.</p></div>
                </div>
              </div>
              <div className="byok">
                <div className="lbl">Bring your own key</div>
                <div className="byok-row">
                  <span className="byok-chip"><span className="d" style={{ background: "var(--c-green)" }} /> OpenAI</span>
                  <span className="byok-chip"><span className="d" style={{ background: "var(--c-orange)" }} /> Anthropic</span>
                  <span className="byok-chip"><span className="d" style={{ background: "var(--c-cyan)" }} /> Mistral</span>
                  <span className="byok-chip"><span className="d" style={{ background: "var(--c-purple)" }} /> Ollama · local</span>
                  <span className="byok-chip"><span className="d" style={{ background: "var(--c-pink)" }} /> Azure</span>
                </div>
              </div>
            </div>

            <div className="askai reveal">
              <div className="askai-bar">
                <span className="spark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5 10.1 10.9 5.5 9l4.6-1.4L12 3z" /></svg></span>
                <span className="q">How do I deploy to my own server?</span>
                <span className="esc">ESC</span>
              </div>
              <div className="askai-body">
                <div className="ans">
                  Run <code>markline build</code> to emit a static <code>./dist</code>, then serve it with any web server or
                  the bundled <b>Docker image</b>. No runtime services are required — the search index and API reference are
                  prebuilt.<span className="cur" />
                </div>
                <div className="cites">
                  <span className="cite"><span className="n">01</span> Deployment → Self-hosting</span>
                  <span className="cite"><span className="n">02</span> Deployment → Docker</span>
                </div>
              </div>
              <div className="askai-foot"><span className="d" /> Answered by your model · BYOK · 0 tokens billed to Markline</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COMPARISON ===== */}
      <section className="sec section rule-t" id="own">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>Markline vs the SaaS docs platforms</h2>
            <p>Scalar and Mintlify are excellent — and they&apos;re services. The difference isn&apos;t features. It&apos;s who holds the keys.</p>
          </div>

          <div className="cmp reveal">
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th className="col mecol me">Markline</th>
                  <th className="col">Scalar</th>
                  <th className="col">Mintlify</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Open source (MIT)", "yes", ["partial", "core"], "no"],
                  ["Self-host anywhere", "yes", ["partial", "partial"], "no"],
                  ["No vendor lock-in", "yes", ["partial", "partial"], "no"],
                  ["No seat / page pricing", "yes", "no", "no"],
                  ["First-class OpenAPI reference", "yes", "yes", "yes"],
                  ["Interactive request playground", "yes", "yes", "yes"],
                  ["Static search, no services", "yes", ["partial", "hosted"], ["partial", "hosted"]],
                  ["Light / dark + themeable tokens", "yes", "yes", ["partial", "partial"]],
                  ["AI answers on your own key (BYOK)", "yes", "no", ["partial", "metered"]],
                  ["Copy-for-LLM · llms.txt · Markdown", "yes", ["partial", "partial"], "yes"],
                  ["You own the data & the build", "yes", "no", "no"],
                ].map((row, i) => {
                  const cell = (v: string | string[]) => {
                    if (Array.isArray(v)) return <span className="partial">{v[1]}</span>;
                    if (v === "yes") return <span className="yes">●</span>;
                    return <span className="no">—</span>;
                  };
                  return (
                    <tr key={i}>
                      <td>{row[0] as string}</td>
                      <td className="col mecol">{cell(row[1] as string | string[])}</td>
                      <td className="col">{cell(row[2] as string | string[])}</td>
                      <td className="col">{cell(row[3] as string | string[])}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="cmp-note reveal">// Reflects publicly documented capabilities · June 2026 · corrections welcome via PR.</p>
        </div>
      </section>

      {/* ===== PROOF ===== */}
      <section className="sec section grid-bg rule-t" id="made">
        <div className="wrap">
          <div className="sec-head reveal">
            <h2>Run by the people who read the source</h2>
            <p>No logo wall yet — just an open repo, a permissive license, and sites already shipping on Markline.</p>
          </div>

          <div className="proof-grid">
            <div className="gh-card reveal">
              <div className="gh-top">
                <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                markline-dev/markline
              </div>
              <div className="gh-star"><span className="star">★</span><span className="v">4,212</span></div>
              <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>stars · growing every week</div>
              <div className="gh-spark">
                {[24, 31, 28, 42, 55, 49, 68, 74, 90, 100].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="gh-meta">
                <div><b>128</b>contributors</div>
                <div><b>MIT</b>license</div>
                <div><b>v1.4</b>latest</div>
              </div>
              <a className="btn btn-ghost" style={{ marginTop: 20 }} href="https://github.com/markline-dev/markline" target="_blank" rel="noopener noreferrer">
                Star on GitHub
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M7 17 17 7M9 7h8v8" /></svg>
              </a>
            </div>

            <div className="made">
              {[
                ["markline.dev — home, dark", "Markline.dev", "self-hosted"],
                ["API reference, light theme", "Acme API docs", "/reference"],
                ["SDK guide — three-pane", "Tomoul SDK", "docs site"],
                ["changelog + versioning", "Hyphen", "changelog"],
              ].map((s, i) => (
                <div className="made-shot reveal" key={i}>
                  <div className="ph"><div className="lbl">[ product shot ]<br />{s[0]}</div></div>
                  <div className="cap">{s[1]} <span className="u">{s[2]}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== CLOSING ===== */}
      <section className="closing grid-bg rule-t">
        <div className="wrap">
          <div className="closing-in frame">
            <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
            <h2>Own your docs.</h2>
            <p>One command to scaffold. One repo to keep. Zero services to depend on.</p>
            <div className="cmd-copy">
              <span className="pr">$</span><span>npx create-markline@latest</span>
              <button data-copy="npx create-markline@latest" data-copy-icon aria-label="Copy command">
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
              </button>
            </div>
            <div className="closing-cta">
              <Link className="btn btn-primary" href="/quickstart">Get started</Link>
              <Link className="btn btn-ghost" href="/api-reference">See the API reference</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="footer">
        <div className="wrap">
          <div className="footer-in">
            <div>
              <Link className="brand" href="/" aria-label="Markline home" style={{ marginBottom: 14, display: "inline-flex" }}><Wordmark /></Link>
              <p style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 260, marginTop: 4 }}>
                The docs framework you actually own. MIT-licensed, self-hostable, no lock-in.
              </p>
            </div>
            <div>
              <h5>Product</h5>
              <ul>
                <li><Link href="/quickstart">Documentation</Link></li>
                <li><Link href="/api-reference">API reference</Link></li>
                <li><Link href="/#own">Why Markline</Link></li>
                <li><Link href="/#made">Showcase</Link></li>
              </ul>
            </div>
            <div>
              <h5>Resources</h5>
              <ul>
                <li><Link href="/quickstart">Getting started</Link></li>
                <li><Link href="/configuration">Configuration</Link></li>
                <li><Link href="/deployment">Deployment</Link></li>
                <li><Link href="/theming">Theming</Link></li>
              </ul>
            </div>
            <div>
              <h5>Open source</h5>
              <ul>
                <li><a href="https://github.com/markline-dev/markline" target="_blank" rel="noopener noreferrer">GitHub ↗</a></li>
                <li><a href="https://github.com/markline-dev/markline/releases" target="_blank" rel="noopener noreferrer">Releases</a></li>
                <li><a href="https://github.com/markline-dev/markline/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">Contributing</a></li>
                <li><a href="https://github.com/markline-dev/markline/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">MIT license</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Markline · MIT</span>
            <span>markline.dev · built with Markline</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
