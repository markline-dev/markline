import { NextResponse } from "next/server";
import { loadConfig, nonDefaultVersionIds } from "@/lib/config";
import { loadOpenApi } from "@/lib/openapi";
import {
  forwardableHeaders,
  MAX_PROXY_REQUEST_BYTES,
  MAX_PROXY_RESPONSE_BYTES,
  originsOf,
  readCapped,
  UPSTREAM_TIMEOUT_MS,
} from "@/lib/playground-proxy";

// Server-side proxy for the API playground — used when a request can't be sent
// directly from the browser (CORS). Only present on a Node/Docker/Vercel
// deployment; static export omits API routes, and the client falls back to a
// direct fetch.
//
// It only forwards to the origins of api.baseUrl and the absolute servers of the
// OpenAPI specs (every version's), and with none of those it forwards nothing.

export const dynamic = "force-dynamic";

const megabytes = (bytes: number) => bytes / (1024 * 1024);

function allowedOrigins(): string[] {
  try {
    const config = loadConfig();
    const specs = [undefined, ...nonDefaultVersionIds(config)].map((id) => loadOpenApi(id));
    return originsOf([config.api.baseUrl, ...specs.flatMap((spec) => spec.servers.map((s) => s.url))]);
  } catch {
    return []; // can't tell what's allowed, so nothing is
  }
}

export async function POST(req: Request) {
  const raw = await readCapped(req, MAX_PROXY_REQUEST_BYTES);
  if (raw === null) {
    return NextResponse.json({ error: `The request is larger than the ${megabytes(MAX_PROXY_REQUEST_BYTES)} MB the proxy accepts.` }, { status: 413 });
  }
  let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const { url, method = "GET", headers = {}, body } = payload;
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) targets are allowed" }, { status: 400 });
  }

  const allowed = allowedOrigins();
  if (allowed.length === 0) {
    return NextResponse.json(
      { error: "The proxy has no API origin to forward to. Set api.baseUrl in markline.json, or an absolute URL in the spec's servers." },
      { status: 403 },
    );
  }
  if (!allowed.includes(target.origin)) {
    return NextResponse.json(
      { error: `Target ${target.origin} is not an allowed API origin` },
      { status: 403 },
    );
  }

  const start = Date.now();
  const request = new AbortController();
  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers: forwardableHeaders(headers),
      body: ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : body,
      redirect: "manual",
      // Over the cap, out of time, or the reader has gone.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), req.signal]),
      // Never Next's data cache: these are one reader's calls, and caching one would
      // buffer the whole response first, whatever the cap below says.
      cache: "no-store",
    });
    const text = await readCapped(upstream);
    if (text === null) {
      request.abort();
      return NextResponse.json(
        { error: `The response is larger than the ${megabytes(MAX_PROXY_RESPONSE_BYTES)} MB the proxy returns.` },
        { status: 413 },
      );
    }
    return NextResponse.json({
      status: upstream.status,
      statusText: upstream.statusText,
      durationMs: Date.now() - start,
      body: text,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return NextResponse.json({ error: `The API didn't finish responding within ${UPSTREAM_TIMEOUT_MS / 1000} s.` }, { status: 504 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upstream request failed" },
      { status: 502 },
    );
  }
}
