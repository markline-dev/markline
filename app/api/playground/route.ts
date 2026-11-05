import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { loadOpenApi } from "@/lib/openapi";
import { forwardableHeaders, MAX_PROXY_RESPONSE_BYTES, originsOf, readCapped } from "@/lib/playground-proxy";

// Server-side proxy for the API playground — used when a request can't be sent
// directly from the browser (CORS). Only present on a Node/Docker/Vercel
// deployment; static export omits API routes, and the client falls back to a
// direct fetch.
//
// It only forwards to the origins of api.baseUrl and the OpenAPI spec's absolute
// servers, and with neither set it forwards nothing.

export const dynamic = "force-dynamic";

function allowedOrigins(): string[] {
  try {
    return originsOf([loadConfig().api.baseUrl, ...loadOpenApi().servers.map((s) => s.url)]);
  } catch {
    return []; // can't tell what's allowed, so nothing is
  }
}

export async function POST(req: Request) {
  let payload: { url?: string; method?: string; headers?: Record<string, string>; body?: string };
  try {
    payload = await req.json();
  } catch {
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
      signal: request.signal,
      cache: "no-store",
    });
    const text = await readCapped(upstream);
    if (text === null) {
      request.abort();
      return NextResponse.json(
        { error: `The response is larger than the ${MAX_PROXY_RESPONSE_BYTES / (1024 * 1024)} MB the proxy returns.` },
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
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upstream request failed" },
      { status: 502 },
    );
  }
}
