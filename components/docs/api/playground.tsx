"use client";

import { useEffect, useMemo, useState } from "react";

export type PlaygroundParam = { name: string; required: boolean; sample: string; description?: string };

export type PlaygroundSpec = {
  method: string;
  path: string;
  /** Candidate base URLs (config override first, then the spec's servers). */
  servers: string[];
  pathParams: PlaygroundParam[];
  queryParams: PlaygroundParam[];
  headerParams: PlaygroundParam[];
  bearer: boolean;
  apiKeyHeaders: { name: string }[];
  bodySample?: string;
  proxy: "auto" | "always" | "never";
};

type ResponseState = {
  status: number;
  statusText: string;
  durationMs: number;
  body: string;
  via: "direct" | "proxy";
} | null;

const TOKEN_KEY = "markline-playground-token";

const METHOD_COLORS: Record<string, string> = {
  get: "#3CC88C", post: "#6E86FA", put: "#EE7A4B", patch: "#EE7A4B", delete: "#E14F4F",
};
const methodColor = (m: string) => METHOD_COLORS[m.toLowerCase()] ?? "#7882A0";

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

export function Playground({ spec }: { spec: PlaygroundSpec }) {
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
  const [resp, setResp] = useState<ResponseState>(null);
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

  // Live cURL that mirrors exactly what Send will issue.
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
    const r = await fetch(targetUrl, {
      method: spec.method.toUpperCase(),
      headers,
      body: hasBody ? body : undefined,
    });
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
    setResp(null);
    const headers = buildHeaders();
    try {
      let result: ResponseState;
      if (spec.proxy === "always") {
        result = await viaProxy(headers);
      } else {
        try {
          result = await direct(headers);
        } catch (e) {
          if (spec.proxy === "auto") {
            try { result = await viaProxy(headers); } catch { throw e; }
          } else throw e;
        }
      }
      setResp(result);
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

  const accent = methodColor(spec.method);
  const requiredQuery = spec.queryParams.filter((p) => p.required);
  const optionalQuery = spec.queryParams.filter((p) => !p.required);
  const headerLike = [...spec.headerParams, ...spec.apiKeyHeaders];

  return (
    <div className="mb-5 rounded-3 border border-slate-3 overflow-hidden bg-paper">
      {/* Request line */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-paper-2 border-b border-slate-3">
        <span
          className="font-mono text-10 font-bold uppercase tracking-[0.04em] px-1.5 py-1 rounded-1 text-white"
          style={{ background: accent }}
        >
          {spec.method}
        </span>
        <span className="font-mono text-12 text-slate-7 truncate flex-1 min-w-0">
          {highlightPath(spec.path)}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={loading}
          className="btn btn-primary btn-sm disabled:opacity-60 shrink-0"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="flex flex-col">
        <Field label="Server">
          {spec.servers.length > 1 ? (
            <select value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={inputCls}>
              {spec.servers.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com" className={inputCls} />
          )}
        </Field>

        {(spec.bearer || spec.apiKeyHeaders.length > 0) && (
          <Section title="Authorization" defaultOpen>
            {spec.bearer && (
              <Row name="Bearer token" required>
                <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="paste token…" className={inputCls} />
              </Row>
            )}
            {spec.apiKeyHeaders.map((ak) => (
              <Row key={ak.name} name={ak.name} required>
                <input value={headerVals[ak.name] ?? ""} onChange={(e) => setHeaderVals((v) => ({ ...v, [ak.name]: e.target.value }))} className={inputCls} />
              </Row>
            ))}
          </Section>
        )}

        {spec.pathParams.length > 0 && (
          <Section title="Path" count={spec.pathParams.length} defaultOpen>
            {spec.pathParams.map((p) => (
              <Row key={p.name} name={p.name} required={p.required}>
                <input value={pathVals[p.name] ?? ""} onChange={(e) => setPathVals((v) => ({ ...v, [p.name]: e.target.value }))} placeholder={p.sample} className={inputCls} />
              </Row>
            ))}
          </Section>
        )}

        {spec.queryParams.length > 0 && (
          <Section title="Query" count={spec.queryParams.length} defaultOpen={requiredQuery.length > 0}>
            {requiredQuery.map((p) => (
              <Row key={p.name} name={p.name} required>
                <input value={queryVals[p.name] ?? ""} onChange={(e) => setQueryVals((v) => ({ ...v, [p.name]: e.target.value }))} placeholder={p.sample} className={inputCls} />
              </Row>
            ))}
            <Optional items={optionalQuery} values={queryVals} onChange={(name, val) => setQueryVals((v) => ({ ...v, [name]: val }))} />
          </Section>
        )}

        {headerLike.length > spec.apiKeyHeaders.length && (
          <Section title="Headers" count={spec.headerParams.length}>
            {spec.headerParams.map((p) => (
              <Row key={p.name} name={p.name} required={p.required}>
                <input value={headerVals[p.name] ?? ""} onChange={(e) => setHeaderVals((v) => ({ ...v, [p.name]: e.target.value }))} placeholder={p.sample} className={inputCls} />
              </Row>
            ))}
          </Section>
        )}

        {spec.bodySample !== undefined && (
          <Section title="Body" defaultOpen>
            <div className="px-3 pb-3">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                spellCheck={false}
                className={`${inputCls} h-auto py-2 font-mono text-12 leading-[1.55] resize-y`}
              />
            </div>
          </Section>
        )}
      </div>

      {/* Live request preview */}
      <CodePreview code={curl} />

      {/* Response */}
      {(resp || error) && (
        <div className="border-t" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
          {error && <p className="px-3 py-3 text-12 text-[#E14F4F] leading-[1.5]">{error}</p>}
          {resp && (
            <>
              <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgb(var(--c-panel-bg))" }}>
                <StatusPill status={resp.status} />
                <span className="text-12" style={{ color: "rgb(var(--c-panel-muted))" }}>{resp.statusText}</span>
                <span className="ml-auto font-mono text-11" style={{ color: "rgb(var(--c-panel-muted))" }}>{resp.durationMs}ms · {resp.via}</span>
              </div>
              <pre className="m-0 px-3 py-3 overflow-x-auto text-12 leading-[1.55] font-mono max-h-[40vh]" style={{ background: "rgb(var(--c-panel-bg))", color: "rgb(var(--c-panel-fg))" }}>
                {resp.body || "(empty response)"}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── pieces ── */

const inputCls =
  "w-full h-8 px-2.5 bg-paper border border-slate-4 rounded-1 text-12 text-ink placeholder:text-slate-5 focus:outline-none focus:border-brand";

function highlightPath(path: string) {
  return path.split(/(\{[^}]+\})/g).map((seg, i) =>
    seg.startsWith("{") ? (
      <span key={i} className="text-brand font-medium">{seg}</span>
    ) : (
      <span key={i}>{seg}</span>
    ),
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 px-3 py-3 border-b border-slate-3">
      <span className="font-mono text-10 uppercase tracking-[0.06em] text-slate-5">{label}</span>
      {children}
    </label>
  );
}

function Section({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-slate-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-2">
        <Chevron open={open} />
        <span className="text-12 font-semibold text-ink">{title}</span>
        {count !== undefined && <span className="font-mono text-10 text-slate-5">{count}</span>}
      </button>
      {open && <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>}
    </div>
  );
}

function Row({ name, required, children }: { name: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-11 text-slate-7">
        {name}
        {required && <span className="text-[#E14F4F]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Optional({ items, values, onChange }: { items: PlaygroundParam[]; values: Record<string, string>; onChange: (name: string, val: string) => void }) {
  const [show, setShow] = useState(false);
  if (items.length === 0) return null;
  if (!show) {
    return (
      <button type="button" onClick={() => setShow(true)} className="self-start font-mono text-11 text-brand hover:underline">
        + {items.length} optional
      </button>
    );
  }
  return (
    <>
      {items.map((p) => (
        <Row key={p.name} name={p.name}>
          <input value={values[p.name] ?? ""} onChange={(e) => onChange(p.name, e.target.value)} placeholder={p.sample} className={inputCls} />
        </Row>
      ))}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className={`text-slate-5 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
      <path d="m6 4 4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CodePreview({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "rgb(var(--c-panel-bg))" }} className="border-t" >
      <div className="flex items-center px-3 py-2 border-b" style={{ borderColor: "rgb(var(--c-panel-border))" }}>
        <span className="font-mono text-10 uppercase tracking-[0.08em]" style={{ color: "rgb(var(--c-panel-muted))" }}>cURL</span>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="ml-auto font-mono text-10"
          style={{ color: "rgb(var(--c-panel-muted))" }}
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="m-0 px-3 py-3 overflow-x-auto text-12 leading-[1.6] font-mono" style={{ color: "rgb(var(--c-panel-fg))" }}
        dangerouslySetInnerHTML={{ __html: colorizeCurl(code) }} />
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
