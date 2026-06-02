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

function methodColor(method: string): string {
  const m = method.toLowerCase();
  return (
    { get: "#3CC88C", post: "#6E86FA", put: "#EE7A4B", patch: "#EE7A4B", delete: "#E14F4F" } as Record<string, string>
  )[m] ?? "#7882A0";
}

function prettyMaybeJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
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

  // Persist the bearer token across operations / reloads.
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

  const targetUrl = useMemo(() => {
    let p = spec.path.replace(/\{([^}]+)\}/g, (_, n) => encodeURIComponent(pathVals[n] || `{${n}}`));
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
    const hasBody = body.trim() && !["get", "head"].includes(spec.method.toLowerCase());
    if (hasBody) h["Content-Type"] = "application/json";
    return h;
  }

  async function direct(headers: Record<string, string>): Promise<ResponseState> {
    const hasBody = body.trim() && !["get", "head"].includes(spec.method.toLowerCase());
    const start = performance.now();
    const r = await fetch(targetUrl, {
      method: spec.method.toUpperCase(),
      headers,
      body: hasBody ? body : undefined,
    });
    const text = await r.text();
    return {
      status: r.status,
      statusText: r.statusText,
      durationMs: Math.round(performance.now() - start),
      body: prettyMaybeJson(text),
      via: "direct",
    };
  }

  async function viaProxy(headers: Record<string, string>): Promise<ResponseState> {
    const hasBody = body.trim() && !["get", "head"].includes(spec.method.toLowerCase());
    const r = await fetch("/api/playground", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: targetUrl,
        method: spec.method.toUpperCase(),
        headers,
        body: hasBody ? body : undefined,
      }),
    });
    if (r.status === 404) throw new Error("proxy-unavailable");
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return {
      status: data.status,
      statusText: data.statusText ?? "",
      durationMs: data.durationMs ?? 0,
      body: prettyMaybeJson(typeof data.body === "string" ? data.body : JSON.stringify(data.body)),
      via: "proxy",
    };
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
            try {
              result = await viaProxy(headers);
            } catch {
              throw e; // surface the original (likely CORS) error
            }
          } else {
            throw e;
          }
        }
      }
      setResp(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Failed to fetch") || msg === "proxy-unavailable"
          ? "Request blocked (likely CORS) and no server proxy is available. Set api.playground.proxy to \"always\" on a Node/Docker deployment, or enable CORS on the API."
          : msg,
      );
    } finally {
      setLoading(false);
    }
  }

  const accent = methodColor(spec.method);

  return (
    <div className="mb-5 rounded-2 border border-slate-3 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-paper-2 border-b border-slate-3">
        <span className="font-mono text-11 font-semibold uppercase" style={{ color: accent }}>
          {spec.method}
        </span>
        <span className="font-mono text-11 text-slate-6 truncate">Try it</span>
        <button
          type="button"
          onClick={send}
          disabled={loading}
          className="ml-auto btn btn-primary btn-sm disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        <Field label="Base URL">
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            className={inputCls}
          />
        </Field>

        {spec.bearer && (
          <Field label="Bearer token">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token…"
              type="password"
              className={inputCls}
            />
          </Field>
        )}

        {spec.pathParams.map((p) => (
          <Field key={p.name} label={`Path · ${p.name}`} required={p.required}>
            <input
              value={pathVals[p.name] ?? ""}
              onChange={(e) => setPathVals((v) => ({ ...v, [p.name]: e.target.value }))}
              placeholder={p.sample}
              className={inputCls}
            />
          </Field>
        ))}

        {spec.queryParams.map((p) => (
          <Field key={p.name} label={`Query · ${p.name}`} required={p.required}>
            <input
              value={queryVals[p.name] ?? ""}
              onChange={(e) => setQueryVals((v) => ({ ...v, [p.name]: e.target.value }))}
              placeholder={p.sample}
              className={inputCls}
            />
          </Field>
        ))}

        {[...spec.headerParams, ...spec.apiKeyHeaders].map((p) => (
          <Field key={p.name} label={`Header · ${p.name}`}>
            <input
              value={headerVals[p.name] ?? ""}
              onChange={(e) => setHeaderVals((v) => ({ ...v, [p.name]: e.target.value }))}
              className={inputCls}
            />
          </Field>
        ))}

        {spec.bodySample !== undefined && (
          <Field label="Body (JSON)">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              spellCheck={false}
              className={`${inputCls} font-mono text-12 leading-[1.5] resize-y`}
            />
          </Field>
        )}
      </div>

      {(resp || error) && (
        <div className="border-t border-slate-3">
          {error && <p className="px-3 py-3 text-12 text-[#E14F4F]">{error}</p>}
          {resp && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 bg-paper-2">
                <StatusPill status={resp.status} />
                <span className="text-12 text-slate-5">{resp.statusText}</span>
                <span className="ml-auto font-mono text-11 text-slate-5">
                  {resp.durationMs}ms · {resp.via}
                </span>
              </div>
              <pre className="m-0 px-3 py-3 overflow-x-auto text-12 leading-[1.5] font-mono text-ink max-h-[40vh]">
                {resp.body || "(empty response)"}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputCls =
  "w-full h-8 px-2.5 bg-paper border border-slate-4 rounded-1 text-12 text-ink focus:outline-none focus:border-slate-7";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-10 uppercase tracking-[0.06em] text-slate-5">
        {label}
        {required && <span className="text-[#E14F4F]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: number }) {
  const s = String(status);
  const tone = s.startsWith("2")
    ? { bg: "rgba(60,200,140,0.12)", fg: "#3CC88C" }
    : s.startsWith("4")
      ? { bg: "rgba(238,122,75,0.12)", fg: "#EE7A4B" }
      : s.startsWith("5")
        ? { bg: "rgba(225,79,79,0.12)", fg: "#E14F4F" }
        : { bg: "rgba(120,130,160,0.12)", fg: "#7882A0" };
  return (
    <span
      className="font-mono text-11 px-2 py-0.5 rounded-1 font-medium"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}33` }}
    >
      {status || "ERR"}
    </span>
  );
}
