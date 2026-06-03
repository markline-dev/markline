"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type PlaygroundParam = { name: string; required: boolean; sample: string; description?: string; type?: string };

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

const inputCls =
  "w-full h-8 px-2.5 bg-paper border border-slate-4 rounded-1 text-12 font-mono text-ink placeholder:text-slate-5 focus:outline-none focus:border-brand";

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
      className={`${inputCls} h-auto py-2 leading-[1.55] resize-y mb-2`}
      aria-label="Request body"
    />
  );
}

/* ── Rail request console (Send + live cURL + response) ── */

export function RequestConsole({ explorer = true }: { explorer?: boolean }) {
  const { spec, baseUrl, setBaseUrl, send, loading, response, error, curl } = usePlayground();
  const accent = methodColor(spec.method);
  return (
    <div className="mb-5 rounded-3 border border-slate-3 overflow-hidden bg-paper sticky" style={{ top: 8 }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-paper-2 border-b border-slate-3">
        <span className="font-mono text-10 font-bold uppercase tracking-[0.04em] px-1.5 py-1 rounded-1 text-white" style={{ background: accent }}>
          {spec.method}
        </span>
        <span className="font-mono text-12 text-slate-7 truncate flex-1 min-w-0">{highlightPath(spec.path)}</span>
        {explorer && <ApiExplorer />}
        <button type="button" onClick={send} disabled={loading} className="btn btn-primary btn-sm disabled:opacity-60 shrink-0">
          {loading ? "Sending…" : "Send"}
        </button>
      </div>

      <label className="flex flex-col gap-1 px-3 py-3 border-b border-slate-3">
        <span className="font-mono text-10 uppercase tracking-[0.06em] text-slate-5">Server</span>
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
    <div className="border-t" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
      {error && <p className="px-3 py-3 text-12 text-[#E14F4F] leading-[1.5]">{error}</p>}
      {response && (
        <>
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgb(var(--c-panel-bg))" }}>
            <StatusPill status={response.status} />
            <span className="text-12" style={{ color: "rgb(var(--c-panel-muted))" }}>{response.statusText}</span>
            <span className="ml-auto font-mono text-11" style={{ color: "rgb(var(--c-panel-muted))" }}>{response.durationMs}ms · {response.via}</span>
          </div>
          <pre className="m-0 px-3 py-3 overflow-x-auto text-12 leading-[1.55] font-mono max-h-[40vh]" style={{ background: "rgb(var(--c-panel-bg))", color: "rgb(var(--c-panel-fg))" }}>
            {response.body || "(empty response)"}
          </pre>
        </>
      )}
    </div>
  );
}

/* ── Centered API Explorer (roomy request builder; shares the playground state) ── */

export function ApiExplorer() {
  const pg = usePlayground();
  const { spec } = pg;
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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const requiredQuery = spec.queryParams.filter((p) => p.required);
  const optionalQuery = spec.queryParams.filter((p) => !p.required);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open API Explorer"
        aria-label="Open API Explorer"
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-1 text-slate-5 hover:text-ink hover:bg-slate-2"
      >
        <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45" onMouseDown={() => setOpen(false)}>
          <div
            className="w-[min(1200px,96vw)] h-[min(88vh,880px)] bg-paper rounded-3 border border-slate-3 shadow-elev-2 flex flex-col overflow-hidden"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* top bar: endpoint selector · url bar · send · close */}
            <div className="flex items-center gap-3 px-3 h-16 border-b border-slate-3 bg-paper-2 shrink-0">
              <EndpointSelector spec={spec} />
              <UrlBar method={spec.method} path={spec.path} />
              <button type="button" onClick={pg.send} disabled={pg.loading} className="btn btn-primary btn-sm disabled:opacity-60 shrink-0 inline-flex items-center gap-1.5">
                {pg.loading ? "Running…" : <>Send <svg width={11} height={11} viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M3 2.5 13.5 8 3 13.5 5 8 3 2.5Z" /></svg></>}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-1 text-slate-6 hover:bg-slate-2">
                <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="flex-1 flex min-h-0 explorer-body">
              <style>{`@media (max-width: 820px){ .explorer-body{ flex-direction:column } .explorer-body > div{ width:100% !important } }`}</style>
              {/* request builder */}
              <div className="w-[54%] overflow-y-auto px-5 py-4">
                <ExplorerField label="Server">
                  {spec.servers.length > 1 ? (
                    <select value={pg.baseUrl} onChange={(e) => pg.setBaseUrl(e.target.value)} className={inputCls}>
                      {spec.servers.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input value={pg.baseUrl} onChange={(e) => pg.setBaseUrl(e.target.value)} className={inputCls} />
                  )}
                </ExplorerField>

                {(spec.bearer || spec.apiKeyHeaders.length > 0) && (
                  <ExplorerSection title="Authorization">
                    {spec.bearer && <ExplorerRow name="Authorization" type="string<bearer>" required><AuthInput /></ExplorerRow>}
                    {spec.apiKeyHeaders.map((ak) => (
                      <ExplorerRow key={ak.name} name={ak.name} type="string" required><ParamInput location="header" name={ak.name} /></ExplorerRow>
                    ))}
                  </ExplorerSection>
                )}
                {spec.pathParams.length > 0 && (
                  <ExplorerSection title="Path">
                    {spec.pathParams.map((p) => (
                      <ExplorerRow key={p.name} name={p.name} type={p.type} required={p.required} description={p.description}><ParamInput location="path" name={p.name} sample={p.sample} /></ExplorerRow>
                    ))}
                  </ExplorerSection>
                )}
                {spec.queryParams.length > 0 && (
                  <ExplorerSection title="Query">
                    {requiredQuery.map((p) => (
                      <ExplorerRow key={p.name} name={p.name} type={p.type} required description={p.description}><ParamInput location="query" name={p.name} sample={p.sample} /></ExplorerRow>
                    ))}
                    {optionalQuery.map((p) => (
                      <ExplorerRow key={p.name} name={p.name} type={p.type} description={p.description}><ParamInput location="query" name={p.name} sample={p.sample} /></ExplorerRow>
                    ))}
                  </ExplorerSection>
                )}
                {spec.headerParams.length > 0 && (
                  <ExplorerSection title="Headers">
                    {spec.headerParams.map((p) => (
                      <ExplorerRow key={p.name} name={p.name} type={p.type} required={p.required} description={p.description}><ParamInput location="header" name={p.name} sample={p.sample} /></ExplorerRow>
                    ))}
                  </ExplorerSection>
                )}
                {spec.bodySample !== undefined && (
                  <ExplorerSection title="Body" defaultOpen>
                    <BodyEditor />
                  </ExplorerSection>
                )}
              </div>

              {/* code + response */}
              <div className="w-[46%] overflow-y-auto p-4 flex flex-col gap-4 border-l border-slate-3" style={{ background: "rgb(var(--c-panel-bg))" }}>
                <Panel title={spec.summary ?? "Request"}>
                  <CodeHeader code={pg.curl} />
                  <pre className="m-0 px-4 py-3 overflow-x-auto text-12 leading-[1.6] font-mono" style={{ color: "rgb(var(--c-panel-fg))" }} dangerouslySetInnerHTML={{ __html: colorizeCurl(pg.curl) }} />
                </Panel>
                <ResponseTabs responses={spec.responses} live={pg.response} error={pg.error} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MethodTag({ method, small }: { method: string; small?: boolean }) {
  return (
    <span
      className={`font-mono font-bold uppercase tracking-[0.03em] rounded-1 text-white shrink-0 ${small ? "text-9 px-1 py-0.5" : "text-10 px-1.5 py-1"}`}
      style={{ background: methodColor(method) }}
    >
      {method}
    </span>
  );
}

function EndpointSelector({ spec }: { spec: PlaygroundSpec }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const endpoints = spec.endpoints ?? [];
  const filtered = endpoints.filter((e) => e.label.toLowerCase().includes(q.toLowerCase()));
  const go = (href: string) => {
    try { sessionStorage.setItem("ml-explorer-open", "1"); } catch { /* ignore */ }
    setOpen(false);
    router.push(href);
  };
  if (endpoints.length === 0) {
    return (
      <div className="flex items-center gap-2 h-9 px-2.5 shrink-0">
        <MethodTag method={spec.method} />
        <span className="text-13 font-medium text-ink truncate max-w-[200px]">{spec.summary}</span>
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 h-9 px-2.5 rounded-2 border border-slate-3 bg-paper hover:border-slate-4 min-w-[220px] max-w-[300px]">
        <MethodTag method={spec.method} />
        <span className="text-13 font-medium text-ink truncate flex-1 text-left">{spec.summary}</span>
        <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} className="text-slate-5" aria-hidden><path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-[340px] max-h-[420px] bg-paper border border-slate-3 rounded-2 shadow-elev-2 z-10 flex flex-col overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
          <div className="p-2 border-b border-slate-3">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for endpoint…" className="w-full h-8 px-2.5 bg-paper-2 border border-slate-3 rounded-1 text-13 text-ink placeholder:text-slate-5 focus:outline-none focus:border-brand" />
          </div>
          <div className="overflow-y-auto py-1">
            {filtered.map((e) => {
              const active = e.href === spec.currentHref;
              return (
                <button key={e.href} type="button" onClick={() => go(e.href)} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left ${active ? "bg-slate-2" : "hover:bg-slate-2"}`}>
                  <MethodTag method={e.method} />
                  <span className={`text-13 truncate ${active ? "text-brand font-medium" : "text-slate-7"}`}>{e.label}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <p className="px-3 py-3 text-12 text-slate-5">No endpoints match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function UrlBar({ method, path }: { method: string; path: string }) {
  const segs = path.split("/").filter(Boolean);
  return (
    <div className="flex items-center gap-2 h-9 px-2.5 rounded-2 border border-slate-3 bg-paper flex-1 min-w-0 overflow-x-auto">
      <MethodTag method={method} />
      <span className="font-mono text-12 flex items-center whitespace-nowrap">
        {segs.map((s, i) => (
          <span key={i} className="flex items-center">
            <span className="text-slate-4 px-1">/</span>
            {s.startsWith("{") ? (
              <span className="px-1.5 py-0.5 rounded-1 text-brand font-medium" style={{ background: "color-mix(in oklab, rgb(var(--c-brand)) 16%, transparent)" }}>{s}</span>
            ) : (
              <span className="text-slate-7">{s}</span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

function ExplorerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 pb-4 mb-2 border-b border-slate-3">
      <span className="font-mono text-10 uppercase tracking-[0.06em] text-slate-5">{label}</span>
      {children}
    </label>
  );
}

function ExplorerSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-slate-3 last:border-0">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 py-3 text-left">
        <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className={`text-slate-5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden><path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="text-13 font-semibold text-ink">{title}</span>
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function ExplorerRow({ name, type, required, description, children }: { name: string; type?: string; required?: boolean; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-5 items-start py-3 border-t border-slate-3 first:border-t-0 explorer-row">
      <style>{`@media (max-width: 560px){ .explorer-row{ flex-direction:column } .explorer-row > .er-input{ width:100% !important } }`}</style>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-12 font-medium text-ink">{name}</code>
          {type && <span className="font-mono text-11 text-slate-5">{type}</span>}
          {required && <span className="font-mono text-10 uppercase tracking-[0.04em] text-[#E14F4F]">required</span>}
        </div>
        {description && <p className="text-12 text-slate-6 leading-[1.5] mt-1.5">{description}</p>}
      </div>
      <div className="er-input w-[44%] shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2 overflow-hidden border" style={{ borderColor: "rgb(var(--c-panel-border))", background: "rgb(var(--c-panel-bg))" }}>
      <div className="px-4 py-2.5 border-b text-12 font-semibold" style={{ borderColor: "rgb(var(--c-panel-border))", color: "rgb(var(--c-panel-fg))" }}>{title}</div>
      {children}
    </div>
  );
}

function CodeHeader({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center px-4 py-2 border-b" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
      <span className="font-mono text-10 uppercase tracking-[0.08em]" style={{ color: "rgb(var(--c-panel-muted))" }}>cURL</span>
      <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="ml-auto font-mono text-10" style={{ color: "rgb(var(--c-panel-muted))" }}>{copied ? "copied" : "copy"}</button>
    </div>
  );
}

function ResponseTabs({ responses, live, error }: { responses?: { status: string; body: string }[]; live: ResponseState; error: string | null }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tabs = responses ?? [];
  const liveMode = !!(live || error);
  const statuses = liveMode ? [live ? String(live.status) : "ERR"] : tabs.map((t) => t.status);
  const bodyText = liveMode ? (error ?? live?.body ?? "") : (tabs[active]?.body ?? "");
  const copy = () => { navigator.clipboard?.writeText(bodyText); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  if (!liveMode && tabs.length === 0) return null;
  return (
    <div className="rounded-2 overflow-hidden border" style={{ borderColor: "rgb(var(--c-panel-border))", background: "rgb(var(--c-panel-bg))" }}>
      <div className="flex items-center gap-4 px-4 border-b" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
        {statuses.map((s, i) => {
          const isActive = liveMode || i === active;
          return (
            <button key={s + i} type="button" onClick={() => !liveMode && setActive(i)} className="py-2.5 -mb-px border-b-2 font-mono text-12 font-medium" style={{ borderColor: isActive ? statusColor(s) : "transparent", color: isActive ? statusColor(s) : "rgb(var(--c-panel-muted))" }}>
              {s}
            </button>
          );
        })}
        {live && <span className="ml-2 font-mono text-11" style={{ color: "rgb(var(--c-panel-muted))" }}>{live.durationMs}ms · {live.via}</span>}
        <button type="button" onClick={copy} className="ml-auto font-mono text-10" style={{ color: "rgb(var(--c-panel-muted))" }}>{copied ? "copied" : "copy"}</button>
      </div>
      {error ? (
        <p className="px-4 py-3 text-12 text-[#E14F4F] leading-[1.5]">{error}</p>
      ) : (
        <pre className="m-0 px-4 py-3 overflow-auto text-12 leading-[1.6] font-mono max-h-[50vh]" style={{ color: "rgb(var(--c-panel-fg))" }} dangerouslySetInnerHTML={{ __html: colorizeJson(bodyText || "(empty response)") }} />
      )}
    </div>
  );
}

function statusColor(s: string) {
  return s.startsWith("2") ? "#3CC88C" : s.startsWith("4") ? "#EE7A4B" : s.startsWith("5") ? "#E14F4F" : "#7882A0";
}

function colorizeJson(s: string): string {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc.replace(
    /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (m, str, colon, kw, num) => {
      if (str) return colon ? `<span style="color:#9CDCFE">${str}</span>${colon}` : `<span style="color:#3CC88C">${str}</span>`;
      if (kw) return `<span style="color:#C792EA">${kw}</span>`;
      if (num) return `<span style="color:#E8951F">${num}</span>`;
      return m;
    },
  );
}

function highlightPath(path: string) {
  return path.split(/(\{[^}]+\})/g).map((seg, i) =>
    seg.startsWith("{") ? <span key={i} className="text-brand font-medium">{seg}</span> : <span key={i}>{seg}</span>,
  );
}

function CodePreview({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "rgb(var(--c-panel-bg))" }}>
      <div className="flex items-center px-3 py-2 border-b" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
        <span className="font-mono text-10 uppercase tracking-[0.08em]" style={{ color: "rgb(var(--c-panel-muted))" }}>cURL</span>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="ml-auto font-mono text-10" style={{ color: "rgb(var(--c-panel-muted))" }}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="m-0 px-3 py-3 overflow-x-auto text-12 leading-[1.6] font-mono" style={{ color: "rgb(var(--c-panel-fg))" }} dangerouslySetInnerHTML={{ __html: colorizeCurl(code) }} />
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
    <span className="font-mono text-11 px-2 py-0.5 rounded-1 font-medium" style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}44` }}>
      {status || "ERR"}
    </span>
  );
}
