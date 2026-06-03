"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type PlaygroundParam = { name: string; required: boolean; sample: string; description?: string };

export type PlaygroundSpec = {
  method: string;
  path: string;
  servers: string[];
  pathParams: PlaygroundParam[];
  queryParams: PlaygroundParam[];
  headerParams: PlaygroundParam[];
  bearer: boolean;
  apiKeyHeaders: { name: string }[];
  bodySample?: string;
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
    const p = spec.path.replace(/\{([^}]+)\}/g, (_, n) => encodeURIComponent(pathVals[n] || `{${n}}`));
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

export function RequestConsole() {
  const { spec, baseUrl, setBaseUrl, send, loading, response, error, curl } = usePlayground();
  const accent = methodColor(spec.method);
  return (
    <div className="mb-5 rounded-3 border border-slate-3 overflow-hidden bg-paper sticky" style={{ top: 8 }}>
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-paper-2 border-b border-slate-3">
        <span className="font-mono text-10 font-bold uppercase tracking-[0.04em] px-1.5 py-1 rounded-1 text-white" style={{ background: accent }}>
          {spec.method}
        </span>
        <span className="font-mono text-12 text-slate-7 truncate flex-1 min-w-0">{highlightPath(spec.path)}</span>
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

      {(response || error) && (
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
      )}
    </div>
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
