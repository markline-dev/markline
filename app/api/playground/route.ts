import { NextResponse } from "next/server";
import { loadConfig } from "@/lib/config";
import { loadOpenApi } from "@/lib/openapi";

// Server-side proxy for the API playground — used when a request can't be sent
// directly from the browser (CORS). Only present on a Node/Docker/Vercel
// deployment; static export omits API routes, and the client falls back to a
// direct fetch.
//
// SSRF mitigation: only forward to origins declared in the config baseUrl or
// the OpenAPI spec's servers. This route is enabled by the docs operator, but
// we still refuse arbitrary targets.

export const dynamic = "force-dynamic";

function allowedOrigins(): string[] {
  const origins = new Set<string>();
  try {
    const cfg = loadConfig();
    if (cfg.api.baseUrl) origins.add(new URL(cfg.api.baseUrl).origin);
  } catch {
    /* ignore */
  }
  try {
    for (const s of loadOpenApi().servers) {
      try {
        origins.add(new URL(s.url).origin);
      } catch {
        /* relative server url — skip */
      }
    }
  } catch {
    /* ignore */
  }
  return [...origins];
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
  if (allowed.length > 0 && !allowed.includes(target.origin)) {
    return NextResponse.json(
      { error: `Target ${target.origin} is not an allowed API origin` },
      { status: 403 },
    );
  }

  const start = Date.now();
  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : body,
      redirect: "manual",
    });
    const text = await upstream.text();
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
