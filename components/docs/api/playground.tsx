"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export type PlaygroundParam = { name: string; required: boolean; sample: string; description?: string; type?: string; enum?: string[] };

export type PlaygroundEndpoint = { method: string; label: string; href: string };

export type PlaygroundSpec = {
  method: string;
  path: string;
  summary?: string;
  servers: string[];
  pathParams: PlaygroundParam[];
  queryParams: PlaygroundParam[];
  headerParams: PlaygroundParam[];
  bearer: boolean;
  apiKeyHeaders: { name: string }[];
  bodySample?: string;
  /** Example responses from the spec, for the response panel's status tabs. */
  responses?: { status: string; body: string }[];
  /** All operations, for the endpoint switcher. */
  endpoints?: PlaygroundEndpoint[];
  currentHref?: string;
  proxy: "auto" | "always" | "never";
};

type Loc = "path" | "query" | "header";

type ResponseState = {
  status: number;
  statusText: string;
  durationMs: number;
  body: string;
  via: "direct" | "proxy";
} | null;

type Ctx = {
  spec: PlaygroundSpec;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  body: string;
  setBody: (v: string) => void;
  getParam: (loc: Loc, name: string) => string;
  setParam: (loc: Loc, name: string, val: string) => void;
  send: () => void;
  response: ResponseState;
  loading: boolean;
  error: string | null;
  curl: string;
  targetUrl: string;
};

const PlaygroundCtx = createContext<Ctx | null>(null);
export function usePlayground() {
  const c = useContext(PlaygroundCtx);
  if (!c) throw new Error("usePlayground must be used within PlaygroundProvider");
  return c;
}

const TOKEN_KEY = "markline-playground-token";

const METHOD_COLORS: Record<string, string> = {
  get: "#3CC88C", post: "#6E86FA", put: "#EE7A4B", patch: "#EE7A4B", delete: "#E14F4F",
};
export const methodColor = (m: string) => METHOD_COLORS[m.toLowerCase()] ?? "#7882A0";

function prettyMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
function shellQuote(s: string) {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function PlaygroundProvider({ spec, children }: { spec: PlaygroundSpec; children: React.ReactNode }) {
  const [baseUrl, setBaseUrl] = useState(spec.servers[0] ?? "");
  const [token, setToken] = useState("");
  const [pathVals, setPathVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.pathParams.map((p) => [p.name, p.sample])),
  );
  const [queryVals, setQueryVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.queryParams.filter((p) => p.required).map((p) => [p.name, p.sample])),
  );
  const [headerVals, setHeaderVals] = useState<Record<string, string>>({});
  const [body, setBody] = useState(spec.bodySample ?? "");
  const [response, setResponse] = useState<ResponseState>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TOKEN_KEY);
      if (saved) setToken(saved);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }, [token]);

  const getParam = (loc: Loc, name: string) =>
    (loc === "path" ? pathVals : loc === "query" ? queryVals : headerVals)[name] ?? "";
  const setParam = (loc: Loc, name: string, val: string) => {
    const setter = loc === "path" ? setPathVals : loc === "query" ? setQueryVals : setHeaderVals;
    setter((v) => ({ ...v, [name]: val }));
  };

  const hasBody = body.trim() !== "" && !["get", "head"].includes(spec.method.toLowerCase());

  const targetUrl = useMemo(() => {
    const p = spec.path.replace(/\{([^}]+)\}/g, (_, n) => (pathVals[n] ? encodeURIComponent(pathVals[n]) : `{${n}}`));
    const qs = Object.entries(queryVals)
      .filter(([, v]) => v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return (baseUrl.replace(/\/$/, "") || "") + p + (qs ? `?${qs}` : "");
  }, [spec.path, pathVals, queryVals, baseUrl]);

  function buildHeaders(): Record<string, string> {
    const h: Record<string, string> = {};
    for (const hp of spec.headerParams) if (headerVals[hp.name]) h[hp.name] = headerVals[hp.name];
    for (const ak of spec.apiKeyHeaders) if (headerVals[ak.name]) h[ak.name] = headerVals[ak.name];
    if (spec.bearer && token) h["Authorization"] = `Bearer ${token}`;
    if (hasBody) h["Content-Type"] = "application/json";
    return h;
  }

  const curl = useMemo(() => {
    const headers = buildHeaders();
    const lines = [`curl --request ${spec.method.toUpperCase()} \\`, `  --url ${shellQuote(targetUrl)}`];
    for (const [k, v] of Object.entries(headers)) {
      lines[lines.length - 1] += " \\";
      lines.push(`  --header ${shellQuote(`${k}: ${k === "Authorization" ? "Bearer <token>" : v}`)}`);
    }
    if (hasBody) {
      lines[lines.length - 1] += " \\";
      lines.push(`  --data ${shellQuote(body)}`);
    }
    return lines.join("\n");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUrl, headerVals, token, body, hasBody, spec.method]);

  async function direct(headers: Record<string, string>): Promise<ResponseState> {
    const start = performance.now();
    const r = await fetch(targetUrl, { method: spec.method.toUpperCase(), headers, body: hasBody ? body : undefined });
    const text = await r.text();
    return { status: r.status, statusText: r.statusText, durationMs: Math.round(performance.now() - start), body: prettyMaybeJson(text), via: "direct" };
  }
  async function viaProxy(headers: Record<string, string>): Promise<ResponseState> {
    const r = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: targetUrl, method: spec.method.toUpperCase(), headers, body: hasBody ? body : undefined }),
    });
    if (r.status === 404) throw new Error("proxy-unavailable");
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return { status: data.status, statusText: data.statusText ?? "", durationMs: data.durationMs ?? 0, body: prettyMaybeJson(typeof data.body === "string" ? data.body : JSON.stringify(data.body)), via: "proxy" };
  }

  async function send() {
    setLoading(true);
    setError(null);
    setResponse(null);
    const headers = buildHeaders();
    try {
      let result: ResponseState;
      if (spec.proxy === "always") result = await viaProxy(headers);
      else {
        try {
          result = await direct(headers);
        } catch (e) {
          if (spec.proxy === "auto") {
            try { result = await viaProxy(headers); } catch { throw e; }
          } else throw e;
        }
      }
      setResponse(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Failed to fetch") || msg === "proxy-unavailable"
          ? 'Request blocked (likely CORS) and no server proxy is available. Set api.playground.proxy to "always" on a Node/Docker deployment, or enable CORS on the API.'
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  const value: Ctx = { spec, baseUrl, setBaseUrl, token, setToken, body, setBody, getParam, setParam, send, response, loading, error, curl, targetUrl };
  return <PlaygroundCtx.Provider value={value}>{children}</PlaygroundCtx.Provider>;
}

/* ── Inline field controls (rendered in the parameter docs) ── */

const inputCls = "ml-pg-input";

export function ParamInput({ location, name, sample }: { location: Loc; name: string; sample?: string }) {
  const { getParam, setParam } = usePlayground();
  return (
    <input
      value={getParam(location, name)}
      onChange={(e) => setParam(location, name, e.target.value)}
      placeholder={sample || "value"}
      className={inputCls}
      aria-label={name}
    />
  );
}

export function AuthInput() {
  const { token, setToken } = usePlayground();
  return (
    <input
      value={token}
      onChange={(e) => setToken(e.target.value)}
      type="password"
      placeholder="bearer token…"
      className={inputCls}
      aria-label="Bearer token"
    />
  );
}

export function BodyEditor() {
  const { body, setBody } = usePlayground();
  return (
    <textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      rows={Math.min(16, Math.max(6, body.split("\n").length + 1))}
      spellCheck={false}
      className={inputCls}
      aria-label="Request body"
    />
  );
}

/* ── Rail request console (Send + live cURL + response) ── */

export function RequestConsole({ explorer = true }: { explorer?: boolean }) {
  const { spec, baseUrl, setBaseUrl, send, loading, response, error, curl } = usePlayground();
  const accent = methodColor(spec.method);
  return (
    <div className="ml-pg-console">
      <div className="ml-pg-console-head">
        <span className="ml-pg-method" style={{ background: accent }}>{spec.method}</span>
        <span className="ml-pg-path">{highlightPath(spec.path)}</span>
        {explorer && <ApiExplorer />}
        <button type="button" onClick={send} disabled={loading} className="btn btn-primary btn-sm shrink-0">
          {loading ? "Sending…" : "Send"}
        </button>
      </div>

      <label className="ml-pg-field">
        <span className="ml-pg-field-label">Server</span>
        {spec.servers.length > 1 ? (
          <select value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls}>
            {spec.servers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className={inputCls} />
        )}
      </label>

      <CodePreview code={curl} />
      <ResponseBlock response={response} error={error} />
    </div>
  );
}

function ResponseBlock({ response, error }: { response: ResponseState; error: string | null }) {
  if (!response && !error) return null;
  return (
    <div className="ml-pg-resp">
      {error && <p className="ml-pg-resp-err">{error}</p>}
      {response && (
        <>
          <div className="ml-pg-resp-head">
            <StatusPill status={response.status} />
            <span className="stext">{response.statusText}</span>
            <span className="meta">{response.durationMs}ms · {response.via}</span>
          </div>
          <pre className="ml-pg-resp-body">{response.body || "(empty response)"}</pre>
        </>
      )}
    </div>
  );
}

/* ── Centered API Explorer (roomy request builder; shares the playground state) ── */

const EXPLORER_LANGS = [
  { id: "curl", label: "cURL" },
  { id: "node", label: "Node" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
] as const;
type LangId = (typeof EXPLORER_LANGS)[number]["id"];

const VERB_CLASS: Record<string, string> = { get: "get", post: "post", put: "put", patch: "put", delete: "del" };
const verbClass = (m: string) => VERB_CLASS[m.toLowerCase()] ?? "post";

function chipFor(type?: string, hasEnum?: boolean): { cls: string; label: string } {
  const base = (type ?? "string").replace(/<.*$/, "");
  if (hasEnum && base !== "boolean") return { cls: "t-enum", label: "enum" };
  switch (base) {
    case "integer": return { cls: "t-int", label: "integer" };
    case "number": return { cls: "t-int", label: "number" };
    case "boolean": return { cls: "t-bool", label: "boolean" };
    case "object": return { cls: "t-hash", label: "object" };
    case "array": return { cls: "t-hash", label: "array" };
    default: return { cls: "t-str", label: type ?? "string" };
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * The redesigned API Explorer ("Try it") modal — a two-column request builder:
 * a flat sectioned form on the left, a soft-shade live code + response pane on
 * the right. Pass `trigger` to render your own opener (e.g. a code-card "Try it"
 * button); without it, a default expand-icon button is rendered. The modal is
 * wired to the shared playground engine, so the same proxy/SSRF rules and BYOK
 * token apply.
 */
export function ApiExplorer({ trigger }: { trigger?: (open: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);

  // Re-open after an in-explorer endpoint switch (which navigates to a new page).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("ml-explorer-open") === "1") {
        sessionStorage.removeItem("ml-explorer-open");
        setOpen(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("xp-lock");
    return () => { window.removeEventListener("keydown", onKey); document.body.classList.remove("xp-lock"); };
  }, [open]);

  const openModal = () => setOpen(true);
  return (
    <>
      {trigger ? (
        trigger(openModal)
      ) : (
        <button type="button" onClick={openModal} title="Open API Explorer" aria-label="Open API Explorer" className="ml-pg-explorer-btn">
          <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
            <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {open && typeof document !== "undefined" && createPortal(<ExplorerModal onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function ExplorerModal({ onClose }: { onClose: () => void }) {
  const pg = usePlayground();
  const { spec } = pg;
  const [lang, setLang] = useState<LangId>("curl");

  // Editable top-level body props (primitives), assembled back into the engine's
  // body JSON on each change so Send posts a valid payload.
  const initialBody = useMemo<Record<string, unknown>>(() => {
    try { return spec.bodySample ? JSON.parse(spec.bodySample) : {}; } catch { return {}; }
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
  const optQuery = spec.queryParams.filter((p) => !p.required);
  const live = pg.response;
  const showResp = !!(live || pg.error);

  const codeHtml = genCode(lang, spec, pg, bodyObj);
  const codeLines = codeHtml.split("\n");

  const clearAll = () => {
    pg.setToken("");
    for (const p of spec.pathParams) pg.setParam("path", p.name, "");
    for (const p of spec.queryParams) pg.setParam("query", p.name, "");
    for (const p of spec.headerParams) pg.setParam("header", p.name, "");
    for (const ak of spec.apiKeyHeaders) pg.setParam("header", ak.name, "");
    setBodyObj({});
    pg.setBody(spec.bodySample ?? "");
  };

  return (
    <div className="xp-scrim open" onMouseDown={onClose}>
      <div className="xp-modal" role="dialog" aria-modal="true" aria-label="API Explorer" onMouseDown={(e) => e.stopPropagation()}>
        <div className="xp-top">
          <ExplorerEndpoint />
          <div className="xp-url"><ExplorerUrl /></div>
          <CopyButton className="xp-url-copy" text={pg.targetUrl} label="Copy URL" />
          <button type="button" className="xp-clear" onClick={clearAll}>Clear</button>
          <button type="button" className={`xp-run${pg.loading ? " sending" : ""}`} onClick={pg.send} disabled={pg.loading}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            <span>{pg.loading ? "Sending…" : "Send"}</span>
          </button>
          <button type="button" className="xp-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="xp-cols">
          <div className="xp-form">
            {(spec.bearer || spec.apiKeyHeaders.length > 0) && (
              <ExplorerSection title="Authorization" count={(spec.bearer ? 1 : 0) + spec.apiKeyHeaders.length}>
                {spec.bearer && <AuthRow />}
                {spec.apiKeyHeaders.map((ak) => (
                  <ParamRow key={ak.name} loc="header" param={{ name: ak.name, required: true, sample: "", type: "string" }} />
                ))}
              </ExplorerSection>
            )}
            {spec.headerParams.length > 0 && (
              <ExplorerSection title="Headers" count={spec.headerParams.length}>
                {spec.headerParams.map((p) => <ParamRow key={p.name} loc="header" param={p} />)}
              </ExplorerSection>
            )}
            {spec.pathParams.length > 0 && (
              <ExplorerSection title="Path" count={spec.pathParams.length}>
                {spec.pathParams.map((p) => <ParamRow key={p.name} loc="path" param={p} />)}
              </ExplorerSection>
            )}
            {spec.queryParams.length > 0 && (
              <ExplorerSection title="Query" count={spec.queryParams.length}>
                {reqQuery.map((p) => <ParamRow key={p.name} loc="query" param={p} />)}
                {optQuery.map((p) => <ParamRow key={p.name} loc="query" param={p} />)}
              </ExplorerSection>
            )}
            {bodyFields.length > 0 && (
              <ExplorerSection title="Body" count={bodyFields.length}>
                {bodyFields.map(([k, v]) => (
                  <BodyRow key={k} name={k} value={String((bodyObj[k] ?? v ?? "") as string)} onChange={(val) => setBodyField(k, val)} />
                ))}
              </ExplorerSection>
            )}
          </div>

          <div className="xp-side">
            <div className="xp-pane xp-pane-code">
              <div className="xp-pane-h">
                <span className="lbl">Request</span>
                <LangSelect lang={lang} setLang={setLang} />
                <CopyButton className="xp-pane-copy" text={stripTags(codeHtml)} label="Copy code" />
              </div>
              <div className="xp-codewrap">
                <div className="xp-code">
                  <div className="ln" dangerouslySetInnerHTML={{ __html: codeLines.map((_, i) => i + 1).join("<br>") }} />
                  <div className="src" dangerouslySetInnerHTML={{ __html: codeHtml }} />
                </div>
              </div>
            </div>

            <div className={`xp-pane xp-resp${showResp ? " show" : ""}`}>
              <div className="xp-pane-h rh">
                <span className="lbl">Response</span>
                {pg.error ? (
                  <span className="st err"><span className="dot" />Error</span>
                ) : live ? (
                  <>
                    <span className={`st${live.status >= 400 ? " err" : ""}`}><span className="dot" />{live.status} {live.statusText}</span>
                    <span className="lat">{live.durationMs} ms · {live.via}</span>
                  </>
                ) : null}
              </div>
              <div className="xp-respwrap">
                {pg.error ? (
                  <pre style={{ whiteSpace: "pre-wrap" }}>{pg.error}</pre>
                ) : (
                  <pre dangerouslySetInnerHTML={{ __html: colorizeJsonHtml(live?.body ?? "") }} />
                )}
              </div>
            </div>

            {!showResp && (
              <div className="xp-empty">
                <div className="xp-empty-ic"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg></div>
                <p>Send the request to see a live response.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExplorerEndpoint() {
  const pg = usePlayground();
  const { spec } = pg;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const endpoints = spec.endpoints ?? [];
  const go = (href: string) => {
    try { sessionStorage.setItem("ml-explorer-open", "1"); } catch { /* ignore */ }
    setOpen(false);
    router.push(href);
  };
  return (
    <div className="xp-endwrap" ref={ref} style={{ position: "relative", flex: "none" }}>
      <button type="button" className={`xp-endpoint${open ? " open" : ""}`} onClick={() => endpoints.length && setOpen((o) => !o)}>
        <span className={`xp-verb ${verbClass(spec.method)}`}>{spec.method.toUpperCase()}</span>
        <span className="epname">{spec.summary ?? spec.path}</span>
        {endpoints.length > 0 && (
          <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        )}
      </button>
      {open && (
        <div className="xp-menu xp-menu-ep">
          {endpoints.map((e) => (
            <button key={e.href} type="button" className={`xp-ep-item${e.href === spec.currentHref ? " sel" : ""}`} onClick={() => go(e.href)}>
              <span className={`xp-verb ${verbClass(e.method)}`}>{e.method.toUpperCase()}</span>
              <span className="epn">{e.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplorerUrl() {
  const pg = usePlayground();
  const segs = pg.spec.path.split("/").filter(Boolean);
  return (
    <>
      <span className="u-base">{(pg.baseUrl || "").replace(/\/$/, "")}</span>
      {segs.map((s, i) => {
        const m = s.match(/^[:{]([A-Za-z0-9_]+)\}?$/);
        if (m) {
          const v = pg.getParam("path", m[1]);
          return (
            <span key={i}><span className="u-sl">/</span><span className={`u-var${v ? " set" : ""}`}>{v || `{${m[1]}}`}</span></span>
          );
        }
        return <span key={i}><span className="u-sl">/</span><span className="u-seg">{s}</span></span>;
      })}
    </>
  );
}

function ExplorerSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [closed, setClosed] = useState(false);
  return (
    <div className={`xp-card${closed ? " closed" : ""}`}>
      <button type="button" className="xp-card-h" onClick={() => setClosed((c) => !c)}>
        <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        <span className="ct-label">{title}</span>
        <span className="ct">{count}</span>
      </button>
      <div className="xp-card-body">{children}</div>
    </div>
  );
}

function RowShell({ name, chip, required, description, children }: { name: string; chip: { cls: string; label: string }; required?: boolean; description?: string; children: React.ReactNode }) {
  return (
    <div className="xp-row">
      <div className="xp-rl">
        <div className="xp-rkey">
          <span className="kname">{name}</span>
          <span className={`xp-chip ${chip.cls}`}>{chip.label}</span>
          {required ? <span className="req">required</span> : <span className="opt">optional</span>}
        </div>
        {description && <div className="xp-rdesc">{description}</div>}
      </div>
      <div className="xp-rv">{children}</div>
    </div>
  );
}

function ParamRow({ loc, param }: { loc: Loc; param: PlaygroundParam }) {
  const pg = usePlayground();
  const hasEnum = !!param.enum?.length;
  const isObject = (param.type ?? "").startsWith("object");
  const val = pg.getParam(loc, param.name);
  let control: React.ReactNode;
  if (hasEnum) {
    control = <EnumSelect value={val} options={param.enum!} onChange={(v) => pg.setParam(loc, param.name, v)} />;
  } else if (isObject && loc === "query") {
    control = <HashEditor name={param.name} />;
  } else {
    control = (
      <input className="xp-input" value={val} placeholder={`enter ${param.name}`} spellCheck={false} onChange={(e) => pg.setParam(loc, param.name, e.target.value)} aria-label={param.name} />
    );
  }
  return (
    <RowShell name={param.name} chip={chipFor(param.type, hasEnum)} required={param.required} description={param.description}>
      {control}
    </RowShell>
  );
}

function AuthRow() {
  const pg = usePlayground();
  return (
    <RowShell name="Authorization" chip={{ cls: "t-str", label: "string" }} required description="Secret API key used to authenticate the request. Use a server-side key; never expose it in client code.">
      <div className="xp-inwrap">
        <span className="xp-pre">Bearer</span>
        <input className="xp-input bare" value={pg.token} onChange={(e) => pg.setToken(e.target.value)} placeholder="enter token" type="password" spellCheck={false} aria-label="API key" />
      </div>
    </RowShell>
  );
}

function BodyRow({ name, value, onChange }: { name: string; value: string; onChange: (v: string) => void }) {
  const chip = /^-?\d+$/.test(value)
    ? { cls: "t-int", label: "integer" }
    : value === "true" || value === "false"
      ? { cls: "t-bool", label: "boolean" }
      : { cls: "t-str", label: "string" };
  return (
    <RowShell name={name} chip={chip}>
      <input className="xp-input" value={value} placeholder={`enter ${name}`} spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-label={name} />
    </RowShell>
  );
}

function EnumSelect({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  return (
    <div className={`xp-enum${open ? " open" : ""}`} ref={ref} onClick={() => setOpen((o) => !o)}>
      <span className={`ph${value ? " has" : ""}`}>{value || "Select…"}</span>
      <span className="swap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg></span>
      {open && (
        <div className="xp-menu" onClick={(e) => e.stopPropagation()}>
          {options.map((o) => (
            <button key={o} type="button" className={o === value ? "sel" : ""} onClick={() => { onChange(o); setOpen(false); }}>
              <span className="mono">{o}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HashEditor({ name }: { name: string }) {
  const pg = usePlayground();
  const setParamRef = useRef(pg.setParam);
  setParamRef.current = pg.setParam;
  const [expanded, setExpanded] = useState(false);
  const [pairs, setPairs] = useState<{ k: string; v: string }[]>([{ k: "", v: "" }]);
  const prevKeys = useRef<string[]>([]);
  useEffect(() => {
    const keys = pairs.filter((p) => p.k).map((p) => `${name}[${p.k}]`);
    for (const old of prevKeys.current) if (!keys.includes(old)) setParamRef.current("query", old, "");
    for (const p of pairs) if (p.k) setParamRef.current("query", `${name}[${p.k}]`, p.v);
    prevKeys.current = keys;
  }, [pairs, name]);
  if (!expanded) {
    return <button type="button" className="xp-hash-add" onClick={() => setExpanded(true)}>+ Add {name}</button>;
  }
  const update = (i: number, field: "k" | "v", val: string) => setPairs((ps) => ps.map((p, j) => (j === i ? { ...p, [field]: val } : p)));
  const remove = (i: number) => setPairs((ps) => (ps.length > 1 ? ps.filter((_, j) => j !== i) : ps.map((p, j) => (j === i ? { k: "", v: "" } : p))));
  return (
    <div className="xp-hash-rows">
      {pairs.map((p, i) => (
        <div className="xp-hash-pair" key={i}>
          <input className="hk" placeholder="key" spellCheck={false} value={p.k} onChange={(e) => update(i, "k", e.target.value)} />
          <span className="colon">:</span>
          <input className="hv" placeholder="value" spellCheck={false} value={p.v} onChange={(e) => update(i, "v", e.target.value)} />
          <button type="button" className="rm" aria-label="Remove" onClick={() => remove(i)}>
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ))}
      <button type="button" className="xp-hash-more" onClick={() => setPairs((ps) => [...ps, { k: "", v: "" }])}>+ add another</button>
    </div>
  );
}

function LangSelect({ lang, setLang }: { lang: LangId; setLang: (l: LangId) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  const cur = EXPLORER_LANGS.find((l) => l.id === lang) ?? EXPLORER_LANGS[0];
  return (
    <div className="xp-langsel" ref={ref}>
      <button type="button" className={`xp-langbtn${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <span className="val">{cur.label}</span>
        <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="xp-menu" style={{ right: 0, left: "auto" }}>
          {EXPLORER_LANGS.map((l) => (
            <button key={l.id} type="button" className={l.id === lang ? "sel" : ""} onClick={() => { setLang(l.id); setOpen(false); }}>
              <span className="mono">{l.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ className, text, label }: { className: string; text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`${className}${copied ? " copied" : ""}`}
      aria-label={label}
      title={label}
      onClick={() => { try { navigator.clipboard?.writeText(text); } catch { /* ignore */ } setCopied(true); setTimeout(() => setCopied(false), 1100); }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
      )}
    </button>
  );
}

/* ── live, syntax-highlighted code generation (cURL / Node / Python / Go) ── */

function colorizeJsonHtml(s: string): string {
  if (!s) return "(empty response)";
  return escHtml(s).replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="key">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      if (kw) return `<span class="k">${kw}</span>`;
      if (num) return `<span class="n">${num}</span>`;
      return m;
    },
  );
}

function sdkResource(path: string): string {
  const segs = path.split("/").filter(Boolean).filter((s) => !/^[:{]/.test(s));
  if (segs.length > 1 && /^v\d+$/.test(segs[0])) return segs[1];
  return segs[segs.length - 1] ?? "resource";
}
function sdkFn(spec: PlaygroundSpec): string {
  const m = spec.method.toLowerCase();
  const hasPath = /[:{]/.test(spec.path);
  if (m === "post") return "create";
  if (m === "put" || m === "patch") return "update";
  if (m === "delete") return "del";
  return hasPath ? "retrieve" : "list";
}
const isNum = (v: unknown) => /^-?\d+$/.test(String(v));
const cap = (s: string) => s.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
function curlVal(v: unknown) { return isNum(v) ? `<span class="n">${String(v)}</span>` : escHtml(String(v)); }
function jsVal(v: unknown) { const s = String(v); if (isNum(v)) return `<span class="n">${s}</span>`; if (s === "true" || s === "false") return `<span class="fl">${s}</span>`; return `<span class="s">'${escHtml(s)}'</span>`; }
function pyVal(v: unknown) { const s = String(v); if (isNum(v)) return `<span class="n">${s}</span>`; if (s === "true") return `<span class="fl">True</span>`; if (s === "false") return `<span class="fl">False</span>`; return `<span class="s">"${escHtml(s)}"</span>`; }
function goVal(v: unknown) { const s = String(v); return isNum(v) ? `client.<span class="f">Int</span>(<span class="n">${s}</span>)` : `client.<span class="f">String</span>(<span class="s">"${escHtml(s)}"</span>)`; }

function genCode(lang: LangId, spec: PlaygroundSpec, pg: Ctx, bodyObj: Record<string, unknown>): string {
  const method = spec.method.toUpperCase();
  const isRead = method === "GET" || method === "DELETE" || method === "HEAD";

  const headers: { k: string; v: string }[] = [];
  if (spec.bearer) headers.push({ k: "Authorization", v: pg.token ? "Bearer ••••" : "Bearer sk_live_••••" });
  for (const ak of spec.apiKeyHeaders) { const v = pg.getParam("header", ak.name); if (v) headers.push({ k: ak.name, v }); }
  for (const hp of spec.headerParams) { const v = pg.getParam("header", hp.name); if (v) headers.push({ k: hp.name, v }); }

  const writeFields = Object.entries(bodyObj).filter(([, v]) => v !== null && typeof v !== "object" && v !== "");
  const queryFields = spec.queryParams
    .map((p) => [p.name, pg.getParam("query", p.name)] as [string, string])
    .filter(([, v]) => v !== "");

  if (lang === "curl") {
    const lines: string[] = [];
    let head = `<span class="f">curl</span>`;
    if (method !== "GET" && method !== "POST") head += ` -X ${method}`;
    head += ` <span class="s">"${escHtml(pg.targetUrl)}"</span>`;
    lines.push(head);
    headers.forEach((h) => lines.push(`  -H <span class="s">"${escHtml(h.k)}: ${escHtml(h.v)}"</span>`));
    if (!isRead) writeFields.forEach(([k, v]) => lines.push(`  -d <span class="key">${escHtml(k)}</span>=${curlVal(v)}`));
    return lines.join(" \\\n");
  }

  const resource = sdkResource(spec.path);
  const fn = sdkFn(spec);
  const objFields = isRead ? queryFields : writeFields;

  if (lang === "node") {
    const head = `<span class="f">const</span> res = <span class="f">await</span> client.${escHtml(resource)}.<span class="f">${fn}</span>(`;
    const args: string[] = [];
    for (const p of spec.pathParams) { const v = pg.getParam("path", p.name); if (v) args.push(`  <span class="s">'${escHtml(v)}'</span>`); }
    if (objFields.length) args.push(`  {\n${objFields.map(([k, v]) => `    ${escHtml(k)}: ${jsVal(v)},`).join("\n")}\n  }`);
    return head + (args.length ? `\n${args.join(",\n")}\n` : "") + ")";
  }
  if (lang === "python") {
    const head = `res = client.${escHtml(resource)}.<span class="f">${fn}</span>(`;
    const inner: string[] = [];
    for (const p of spec.pathParams) { const v = pg.getParam("path", p.name); if (v) inner.push(`    <span class="s">"${escHtml(v)}"</span>,`); }
    objFields.forEach(([k, v]) => inner.push(`    ${escHtml(k)}=${pyVal(v)},`));
    return head + (inner.length ? `\n${inner.join("\n")}\n` : "") + ")";
  }
  // go
  const lines = [`res, err := client.${cap(resource)}.<span class="f">${cap(fn)}</span>(ctx, &client.${cap(resource)}Params{`];
  objFields.forEach(([k, v]) => lines.push(`    ${cap(k)}: ${goVal(v)},`));
  lines.push("})");
  return lines.join("\n");
}

function highlightPath(path: string) {
  return path.split(/(\{[^}]+\})/g).map((seg, i) =>
    seg.startsWith("{") ? <span key={i} className="var">{seg}</span> : <span key={i}>{seg}</span>,
  );
}

function CodePreview({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ml-pg-codepreview">
      <div className="ml-pg-codepreview-head">
        <span className="lbl">cURL</span>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="copy">
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre dangerouslySetInnerHTML={{ __html: colorizeCurl(code) }} />
    </div>
  );
}

function colorizeCurl(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/^curl/gm, '<span style="color:#6E86FA">curl</span>')
    .replace(/(--[a-z-]+)/g, '<span style="color:#8E959C">$1</span>')
    .replace(/(&#39;|')((?:[^&]|&(?!#39;))*?)(&#39;|')/g, '<span style="color:#3CC88C">$1$2$3</span>');
}

function StatusPill({ status }: { status: number }) {
  const s = String(status);
  const tone = s.startsWith("2")
    ? { bg: "rgba(60,200,140,0.14)", fg: "#3CC88C" }
    : s.startsWith("4")
      ? { bg: "rgba(238,122,75,0.14)", fg: "#EE7A4B" }
      : s.startsWith("5")
        ? { bg: "rgba(225,79,79,0.14)", fg: "#E14F4F" }
        : { bg: "rgba(120,130,160,0.14)", fg: "#7882A0" };
  return (
    <span className="status-pill" style={{ background: tone.bg, color: tone.fg, borderColor: `${tone.fg}44` }}>
      {status || "ERR"}
    </span>
  );
}
