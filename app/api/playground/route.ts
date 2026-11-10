import { NextResponse } from "next/server";
import {
  BufferBudget,
  forwardableHeaders,
  isCrossSite,
  jsonFits,
  MAX_PROXY_REPLY_BYTES,
  MAX_PROXY_REQUEST_BYTES,
  MAX_PROXY_RESPONSE_BYTES,
  OVER_BUDGET,
  parsePayload,
  PROXY_BUFFERED,
  readCapped,
  readCappedBytes,
  REQUEST_READ_TIMEOUT_MS,
  untilAborted,
  UPSTREAM_TIMEOUT_MS,
} from "@/lib/playground-proxy";
import { isTextualMediaType } from "@/lib/openapi-media";
import { readProxySettings, type ProxySettings } from "@/scripts/proxy-settings.mjs";

// Server-side proxy for the API playground — used when a request can't be sent
// directly from the browser (CORS). Only present on a Node/Docker/Vercel
// deployment; static export omits API routes, and the client falls back to a
// direct fetch.
//
// It only forwards to the origins of api.baseUrl and the absolute servers of the
// OpenAPI specs (every version's), and with none of those it forwards nothing.

export const dynamic = "force-dynamic";


const refuse = (status: number, error: string) => NextResponse.json({ error }, { status });

const megabytes = (bytes: number) => bytes / (1024 * 1024);

const BUSY = "The proxy is handling too much data right now. Try again shortly.";

/** next.config.mjs bakes these in at build time: a standalone server has no content
 *  folder. Without a build, as in the tests, they're read here. */
function settings(): ProxySettings {
  const built = process.env.MARKLINE_PROXY_SETTINGS;
  return built ? (JSON.parse(built) as ProxySettings) : readProxySettings();
}

export async function POST(req: Request) {
  if (isCrossSite(req.headers)) return refuse(403, "The proxy only accepts requests from this site.");

  const { origins, mode, found, problem } = settings();
  if (mode === "never") return refuse(403, 'The proxy is turned off (api.playground.proxy is "never").');
  if (problem) return refuse(500, `The proxy can't tell which API it may call: ${problem} when the site was built.`);

  const budget = new BufferBudget(PROXY_BUFFERED);
  try {
    return await forward(req, origins, found, budget);
  } finally {
    budget.release();
  }
}

async function forward(req: Request, origins: string[], found: boolean, budget: BufferBudget) {
  let raw: Awaited<ReturnType<typeof readCapped>>;
  try {
    raw = await untilAborted(
      readCapped(req, MAX_PROXY_REQUEST_BYTES, budget),
      AbortSignal.any([AbortSignal.timeout(REQUEST_READ_TIMEOUT_MS), req.signal]),
    );
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return refuse(408, "The request took too long to arrive.");
    return refuse(400, "The request was cut off.");
  }
  if (raw === OVER_BUDGET) return refuse(503, BUSY);
  if (raw === null) return refuse(413, `The request is larger than the ${megabytes(MAX_PROXY_REQUEST_BYTES)} MB the proxy accepts.`);

  const payload = parsePayload(raw);
  if ("error" in payload) return refuse(400, payload.error);
  const { url, method, headers, body, bodyBase64 } = payload;

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return refuse(400, "Invalid url");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") return refuse(400, "Only http(s) targets are allowed");
  if (target.username || target.password) return refuse(400, "The url can't include credentials");

  if (origins.length === 0) {
    return refuse(
      403,
      found
        ? "The proxy has no API origin to forward to. Set api.baseUrl in markline.json, or an absolute URL in the spec's servers."
        : "The proxy found no markline.json when the site was built, so it has no API origin to forward to.",
    );
  }
  if (!origins.includes(target.origin)) return refuse(403, `Target ${target.origin} is not an allowed API origin`);

  // GET and HEAD send no body, of either kind.
  let sendBody: string | Uint8Array | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    if (bodyBase64 === undefined) sendBody = body;
    else {
      // parsePayload has checked it's strict base64 within the upload cap.
      const upload = Buffer.from(bodyBase64, "base64");
      if (!budget.take(upload.byteLength)) return refuse(503, BUSY);
      sendBody = upload;
    }
  }

  const start = Date.now();
  const request = new AbortController();
  try {
    const upstream = await fetch(target.toString(), {
      method,
      headers: forwardableHeaders(headers),
      body: sendBody,
      redirect: "manual",
      // Over the cap, out of time, or the reader has gone.
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS), req.signal]),
      // Never Next's data cache: these are one reader's calls, and caching one would
      // buffer the whole response first, whatever the cap below says.
      cache: "no-store",
    });
    const reply = { status: upstream.status, statusText: upstream.statusText };
    // A redirect isn't followed, so its body, which often names the target, isn't shown.
    if (upstream.status >= 300 && upstream.status < 400) {
      request.abort();
      return NextResponse.json({ ...reply, durationMs: Date.now() - start, body: "" });
    }
    // Audio, images and other bytes go back as base64; text (or no Content-Type) as text.
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!isTextualMediaType(contentType)) return await binaryReply(upstream, request, budget, { ...reply, contentType }, start);
    const text = await readCapped(upstream, MAX_PROXY_RESPONSE_BYTES, budget);
    if (text === OVER_BUDGET) {
      request.abort();
      return refuse(503, BUSY);
    }
    if (text === null) {
      request.abort();
      return refuse(413, `The response is larger than the ${megabytes(MAX_PROXY_RESPONSE_BYTES)} MB the proxy returns.`);
    }
    if (!jsonFits(text)) return refuse(413, `The response is larger than the ${megabytes(MAX_PROXY_REPLY_BYTES)} MB the proxy returns once encoded.`);
    return NextResponse.json({ ...reply, contentType, durationMs: Date.now() - start, body: text });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") return refuse(504, `The API didn't finish responding within ${UPSTREAM_TIMEOUT_MS / 1000} s.`);
    // Only a system error code: fetch's messages can repeat a header's value.
    const code = (e as { cause?: { code?: unknown } })?.cause?.code;
    return refuse(502, `The API couldn't be reached${typeof code === "string" && /^[A-Z_]+$/.test(code) ? ` (${code})` : ""}.`);
  }
}

/** Room in the reply for everything but the base64: status, type, timing. */
const REPLY_ENVELOPE_BYTES = 64 * 1024;

async function binaryReply(
  upstream: Response,
  request: AbortController,
  budget: BufferBudget,
  reply: { status: number; statusText: string; contentType: string },
  start: number,
) {
  let bytes = await readCappedBytes(upstream, MAX_PROXY_RESPONSE_BYTES, budget);
  if (bytes === OVER_BUDGET) {
    request.abort();
    return refuse(503, BUSY);
  }
  if (bytes === null) {
    request.abort();
    return refuse(413, `The response is larger than the ${megabytes(MAX_PROXY_RESPONSE_BYTES)} MB the proxy returns.`);
  }
  // Base64 is a third bigger, and ASCII, so the reply's size is known before it's built.
  const encodedSize = Math.ceil(bytes.byteLength / 3) * 4;
  if (encodedSize + REPLY_ENVELOPE_BYTES > MAX_PROXY_REPLY_BYTES) {
    return refuse(413, `The response is larger than the ${megabytes(MAX_PROXY_REPLY_BYTES)} MB the proxy returns once encoded.`);
  }
  if (!budget.take(encodedSize)) return refuse(503, BUSY);
  const bodyBase64 = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
  bytes = null; // the raw bytes can go before the reply is built
  return NextResponse.json({ ...reply, durationMs: Date.now() - start, bodyBase64 });
}
