import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  BufferBudget,
  forwardableHeaders,
  isCrossSite,
  jsonFits,
  MAX_PROXY_REQUEST_BYTES,
  MAX_PROXY_RESPONSE_BYTES,
  OVER_BUDGET,
  parsePayload,
  readCapped,
  REQUEST_READ_TIMEOUT_MS,
  UPSTREAM_TIMEOUT_MS,
} from "../lib/playground-proxy";
import { originsOf } from "../scripts/proxy-settings.mjs";
import { loadRoute, startStub, until } from "./proxy-harness";

const MB = 1024 * 1024;
const closed = new Map<string, boolean>();
/** Callers to /at-cap-held, released together. */
const held = { expected: 0, arrived: 0, release: () => {}, all: Promise.resolve() };
let seen: Record<string, string | string[] | undefined> = {};

const api = await startStub((req, res) => {
  const url = req.url ?? "";
  seen = req.headers;
  res.on("close", () => closed.set(url, !res.writableFinished));
  if (url === "/ok") return res.end("hello");
  if (url === "/hang") return; // headers never come
  if (url === "/stall") {
    res.writeHead(200);
    return res.write("partial"); // the body never finishes
  }
  if (url === "/echo-size") {
    let size = 0;
    req.on("data", (c: Buffer) => (size += c.length));
    req.on("end", () => res.end(String(size)));
    return;
  }
  if (url === "/redirect") {
    res.writeHead(302, { location: `http://127.0.0.1:${other.port}/secret` });
    return res.end(`Redirecting to http://127.0.0.1:${other.port}/secret?token=abc`);
  }
  if (url === "/declared-big") {
    res.writeHead(200, { "content-length": String(MAX_PROXY_RESPONSE_BYTES + 1) });
    return res.write("x"); // never finishes
  }
  if (url === "/reset") return req.socket.destroy();
  if (url === "/echo-request") {
    let size = 0;
    req.on("data", (c: Buffer) => (size += c.length));
    req.on("end", () => res.end(JSON.stringify({ method: req.method, size })));
    return;
  }
  if (url === "/control-bytes") return res.end(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES, 1));
  if (url === "/at-cap") return res.end(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES, 97));
  if (url === "/at-cap-held") {
    // Half now, the rest once every caller has arrived: none can finish, and free
    // its share of the budget, before they all hold some of it.
    res.write(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES / 2, 97));
    held.arrived += 1;
    if (held.arrived === held.expected) held.release();
    held.all.then(() => res.end(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES / 2, 97)));
    return;
  }
  if (url === "/chunked-big") {
    res.write(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES, 97));
    return res.end(Buffer.alloc(MB, 97));
  }
  if (url === "/drip") {
    const send = () => {
      if (res.destroyed) return;
      res.write(Buffer.alloc(MB, 97));
      setTimeout(send, 5); // no Content-Length, and it never ends on its own
    };
    return send();
  }
  res.statusCode = 404;
  res.end();
});
const other = await startStub((_req, res) => res.end("other"));

let route: Awaited<ReturnType<typeof loadRoute>>;
const at = (p: string) => `http://localhost:${api.port}${p}`;

before(async () => {
  route = await loadRoute({ config: { name: "t", api: { baseUrl: `http://localhost:${api.port}/v1` } } });
});

after(() => {
  api.stop();
  other.stop();
  route.cleanup();
});

test("the upstream call never uses Next's data cache", async (t) => {
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  let cache: RequestCache | undefined;
  globalThis.fetch = (input, init) => {
    cache = init?.cache;
    return realFetch(input, init);
  };
  await route.send({ url: at("/ok") });
  assert.equal(cache, "no-store");
});

test("an allowed origin is forwarded", async () => {
  const { status, data } = await route.send({ url: at("/ok") });
  assert.equal(status, 200);
  assert.equal(data.status, 200);
  assert.equal(data.body, "hello");
});

test("the origin check holds however the URL is written", async () => {
  const p = api.port;
  for (const url of [`http://LOCALHOST:${p}/ok`, `HTTP://localhost:${p}/ok`]) {
    assert.equal((await route.send({ url })).data.body, "hello", url);
  }
  const before = other.hits.length + api.hits.length;
  for (const url of [
    `http://127.0.0.1:${other.port}/`,
    `http://localhost:${other.port}/`,
    `http://localhost.:${p}/ok`,
    `https://localhost:${p}/ok`,
  ]) {
    assert.equal((await route.send({ url })).status, 403, url);
  }
  for (const url of [`http://localhost:${p}@127.0.0.1:${other.port}/`, `http://localhost@127.0.0.1:${other.port}/`]) {
    assert.equal((await route.send({ url })).status, 400, url);
  }
  assert.equal((await route.send({ url: "file:///etc/passwd" })).status, 400);
  assert.equal(other.hits.length + api.hits.length, before, "nothing was contacted");
});

test("credentials in an allowed URL aren't sent or repeated", async () => {
  const before = api.hits.length;
  const { status, data } = await route.send({ url: `http://user:pw-secret@localhost:${api.port}/ok` });
  assert.equal(status, 400);
  assert.doesNotMatch(JSON.stringify(data), /pw-secret/);
  assert.equal(api.hits.length, before);
});

test("error messages don't repeat what was sent", async () => {
  const { status, data } = await route.send({ url: at("/ok"), headers: { Authorization: "Bearer SECRET-abc\ndef" } });
  assert.equal(status, 400);
  assert.doesNotMatch(JSON.stringify(data), /SECRET/);

  const failed = await route.send({ url: at("/reset"), headers: { Authorization: "Bearer SECRET" } });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(failed.data), /SECRET/);
  assert.match(String(failed.data.error), /couldn't be reached/);
});

test("bad input is a 400", async () => {
  const before = api.hits.length;
  for (const extra of [
    { method: 1 },
    { method: "BAD METHOD" },
    { method: "CONNECT" },
    { method: "trace" },
    { method: "TRACK" },
    { headers: "cookie: x" },
    { headers: ["a"] },
    { headers: { a: 1 } },
    { body: { a: 1 } },
    { url: 5 },
  ]) {
    assert.equal((await route.send({ url: at("/ok"), ...extra })).status, 400, JSON.stringify(extra));
  }
  assert.equal(api.hits.length, before);
});

test("a method is normalised, and GET and HEAD send no body", async () => {
  const send = async (method: string) => JSON.parse(String((await route.send({ url: at("/echo-request"), method, body: "12345" })).data.body ?? "{}"));
  assert.deepEqual(await send("post"), { method: "POST", size: 5 });
  assert.deepEqual(await send("get"), { method: "GET", size: 0 });
  assert.deepEqual(await send("GET"), { method: "GET", size: 0 });
  assert.equal((await route.send({ url: at("/echo-request"), method: "head", body: "12345" })).status, 200);
});

test("a request from another site is refused, and nothing is forwarded", async () => {
  const before = api.hits.length;
  const body = JSON.stringify({ url: at("/ok"), method: "DELETE" });
  const requests: Record<string, string>[] = [
    { "sec-fetch-site": "cross-site" },
    { origin: "https://elsewhere.test", host: "docs.test" },
    { origin: "null", host: "docs.test" },
    { origin: "not a url", host: "docs.test" },
  ];
  for (const headers of requests) {
    assert.equal((await route.sendRaw({ headers, body })).status, 403, JSON.stringify(headers));
  }
  assert.equal(api.hits.length, before);
});

test("a request from this site, or from no browser, is allowed", async () => {
  const body = JSON.stringify({ url: at("/ok") });
  const requests: Record<string, string>[] = [
    {},
    { "sec-fetch-site": "same-origin", origin: "https://docs.test", host: "docs.test" },
    { origin: "https://docs.test", host: "internal:3000", "x-forwarded-host": "docs.test" },
    { "sec-fetch-site": "none" },
    // A reverse proxy that rewrites Host and adds nothing: only the browser's word is left.
    { "sec-fetch-site": "same-origin", origin: "https://docs.test", host: "internal:3000" },
  ];
  for (const headers of requests) {
    assert.equal((await route.sendRaw({ headers, body })).status, 200, JSON.stringify(headers));
  }
});

test("an older browser behind a Host-rewriting proxy is refused, which the docs note covers", () => {
  assert.equal(isCrossSite(new Headers({ origin: "https://docs.test", host: "internal:3000" })), true);
  assert.equal(isCrossSite(new Headers({ "sec-fetch-site": "same-site", origin: "https://docs.test", host: "internal:3000" })), true);
});

test("isCrossSite reads the two headers", () => {
  assert.equal(isCrossSite(new Headers()), false);
  assert.equal(isCrossSite(new Headers({ "sec-fetch-site": "same-site", origin: "https://a.docs.test", host: "docs.test" })), true);
});

test("a redirect isn't followed, and its target isn't returned", async () => {
  const before = other.hits.length;
  const { status, data } = await route.send({ url: at("/redirect") });
  assert.equal(status, 200);
  assert.equal(data.status, 302);
  assert.equal(data.body, "");
  assert.equal(other.hits.length, before);
  assert.doesNotMatch(JSON.stringify(data), new RegExp(String(other.port)));
});

test("connection and session headers are dropped, the API's own kept", async () => {
  await route.send({
    url: at("/ok"),
    headers: {
      Host: "elsewhere.test",
      Cookie: "session=1",
      "X-Forwarded-For": "1.2.3.4",
      "x-forwarded-host": "elsewhere.test",
      "Proxy-Authorization": "x",
      Forwarded: "for=1.2.3.4",
      "X-Real-IP": "1.2.3.4",
      Authorization: "Bearer token",
      "X-Api-Key": "key",
      "xi-api-key": "key2",
      "X-Custom": "value",
    },
  });
  assert.equal(seen.host, `localhost:${api.port}`);
  for (const name of ["cookie", "x-forwarded-for", "x-forwarded-host", "proxy-authorization", "forwarded", "x-real-ip"]) {
    assert.equal(seen[name], undefined, name);
  }
  assert.equal(seen.authorization, "Bearer token");
  assert.equal(seen["x-api-key"], "key");
  assert.equal(seen["xi-api-key"], "key2");
  assert.equal(seen["x-custom"], "value");
});

test("a response at the cap is returned", async () => {
  const { status, data } = await route.send({ url: at("/at-cap") });
  assert.equal(status, 200);
  assert.equal((data.body as string).length, MAX_PROXY_RESPONSE_BYTES);
});

test("over the cap is a 413 and the upstream is dropped", { timeout: 30_000 }, async () => {
  for (const path of ["/declared-big", "/chunked-big", "/drip"]) {
    const { status, data } = await route.send({ url: at(path) });
    assert.equal(status, 413, path);
    assert.match(String(data.error), /25 MB/);
    assert.equal(data.body, undefined);
    if (path !== "/chunked-big") {
      await until(() => closed.get(path) === true, `${path} was dropped`);
    }
  }
});

test("over the cap still drops the upstream when the body has been cloned", { timeout: 30_000 }, async (t) => {
  // Next's patched fetch tees response bodies: cancelling one copy then waits for
  // the other, which nothing here reads.
  const realFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
  });
  globalThis.fetch = async (input, init) => {
    const res = await realFetch(input, init);
    if (!res.body) return res;
    const [copy] = res.body.tee();
    return new Response(copy, { status: res.status, headers: res.headers });
  };
  closed.delete("/drip");
  const { status } = await route.send({ url: at("/drip") });
  assert.equal(status, 413);
  await until(() => closed.get("/drip") === true, `/drip was dropped`);
});

test("an upstream that takes too long is a 504 and is dropped", { timeout: 30_000 }, async (t) => {
  const real = AbortSignal.timeout;
  t.after(() => {
    AbortSignal.timeout = real;
  });
  const asked: number[] = [];
  AbortSignal.timeout = (ms) => {
    asked.push(ms);
    return real.call(AbortSignal, 100);
  };
  for (const path of ["/hang", "/stall"]) {
    const { status, data } = await route.send({ url: at(path) });
    assert.equal(status, 504, path);
    assert.match(String(data.error), /120 s/);
    await until(() => closed.get(path) === true, `${path} was dropped`);
  }
  assert.ok(asked.includes(UPSTREAM_TIMEOUT_MS));
  assert.equal(UPSTREAM_TIMEOUT_MS, 120_000);
});

test("the upstream is dropped when the client leaves", { timeout: 30_000 }, async () => {
  closed.delete("/stall");
  const client = new AbortController();
  const sent = route.send({ url: at("/stall") }, client.signal);
  while (!api.hits.includes("/stall")) await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 50));
  client.abort();
  await sent;
  await until(() => closed.get("/stall") === true, `/stall was dropped`);
});

const streamOf = (total: number, chunk = 4 * 1024 * 1024) => {
  let sent = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= total) return controller.close();
      sent += chunk;
      controller.enqueue(new Uint8Array(chunk));
    },
  });
};
const overCap = MAX_PROXY_REQUEST_BYTES + 8 * 1024 * 1024;

test("a request over the cap is a 413, however it's labelled", { timeout: 30_000 }, async () => {
  const before = api.hits.length;
  const cases: [string, RequestInit][] = [
    ["declared too big", { headers: { "content-length": String(overCap) }, body: "{}" }],
    ["no Content-Length", { body: streamOf(overCap), duplex: "half" } as RequestInit],
    ["Content-Length too small", { headers: { "content-length": "10" }, body: streamOf(overCap), duplex: "half" } as RequestInit],
  ];
  for (const [name, init] of cases) {
    const { status, data } = await route.sendRaw(init);
    assert.equal(status, 413, name);
    assert.match(String(data.error), /35 MB/, name);
  }
  assert.equal(api.hits.length, before, "nothing was forwarded");
});

test("a request with 25 MB of base64 in it fits", { timeout: 30_000 }, async () => {
  const base64 = "a".repeat(Math.ceil((25 * 1024 * 1024 * 4) / 3));
  const payload = JSON.stringify({ url: at("/echo-size"), method: "POST", body: base64 });
  assert.ok(payload.length < MAX_PROXY_REQUEST_BYTES);
  const { status, data } = await route.sendRaw({ body: payload });
  assert.equal(status, 200);
  assert.equal(data.body, String(base64.length));
});

test("a request that never finishes arriving is a 408", { timeout: 30_000 }, async (t) => {
  const real = AbortSignal.timeout;
  t.after(() => {
    AbortSignal.timeout = real;
  });
  const asked: number[] = [];
  AbortSignal.timeout = (ms) => {
    asked.push(ms);
    return real.call(AbortSignal, 100);
  };
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
    },
  });
  const { status } = await route.sendRaw({ headers: { "content-length": "1000" }, body: stalled, duplex: "half" } as RequestInit);
  assert.equal(status, 408);
  assert.deepEqual(asked, [REQUEST_READ_TIMEOUT_MS]);
});

test("a client leaving during its request is handled", { timeout: 30_000 }, async () => {
  const client = new AbortController();
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(10));
    },
  });
  const sent = route.sendRaw({ body: stalled, duplex: "half", signal: client.signal } as RequestInit);
  setTimeout(() => client.abort(), 50);
  assert.equal((await sent).status, 400);
});

test("a reply that JSON would blow up is a 413, and doesn't hold memory for long", { timeout: 30_000 }, async () => {
  const { status, data } = await route.send({ url: at("/control-bytes") });
  assert.equal(status, 413);
  assert.match(String(data.error), /encoded/);
  assert.equal(jsonFits("a".repeat(100), 102), true);
  assert.equal(jsonFits("a".repeat(100), 101), false);
  for (const text of ['"', "\\", "\n", "\u0001", "é", "€", "😀", 'a"\n\u0001é€😀z']) {
    const size = Buffer.byteLength(JSON.stringify(text));
    assert.equal(jsonFits(text, size), true, text);
    assert.equal(jsonFits(text, size - 1), false, text);
  }
});

test("large responses at once are limited with a 503, and the limit recovers", { timeout: 60_000 }, async () => {
  // Five at the cap need 125 MB together, and each is held until all have arrived.
  held.expected = 5;
  held.arrived = 0;
  held.all = new Promise<void>((r) => (held.release = r));
  const results = await Promise.all(Array.from({ length: 5 }, () => route.send({ url: at("/at-cap-held") })));
  const statuses = results.map((r) => r.status);
  assert.ok(statuses.includes(503), statuses.join());
  assert.ok(statuses.includes(200), statuses.join());
  assert.equal((await route.send({ url: at("/at-cap") })).status, 200);
});

test("BufferBudget shares a limit, and releases what it held", () => {
  const pool = { bytes: 0 };
  const a = new BufferBudget(pool, 100);
  const b = new BufferBudget(pool, 100);
  assert.equal(a.take(60), true);
  assert.equal(b.take(50), false);
  assert.equal(b.take(40), true);
  a.release();
  assert.equal(pool.bytes, 40);
  a.release();
  assert.equal(pool.bytes, 40);
  assert.equal(b.take(60), true);
});

test("readCapped reports going over the budget", async () => {
  const budget = new BufferBudget({ bytes: 0 }, 3);
  assert.equal(await readCapped(new Response("12345"), 100, budget), OVER_BUDGET);
});

test("parsePayload reads a call", () => {
  assert.deepEqual(parsePayload('{"url":"http://a","method":"post","body":null}'), { url: "http://a", method: "POST", headers: {}, body: undefined });
  assert.deepEqual(parsePayload('{"url":"http://a"}'), { url: "http://a", method: "GET", headers: {}, body: undefined });
  assert.ok("error" in parsePayload("{}"));
});

test("a request that isn't a JSON object is a 400", async () => {
  for (const body of ["nope", "null", "[]", "1"]) {
    assert.equal((await route.sendRaw({ body })).status, 400, body);
  }
});

test("origins are normalised, and only http(s) ones count", () => {
  assert.deepEqual(originsOf(["https://API.example.com:443/v1", "http://a.test:80/", "http://a.test:8080"]), [
    "https://api.example.com",
    "http://a.test",
    "http://a.test:8080",
  ]);
  assert.deepEqual(originsOf(["/v1", "", undefined, "file:///x", "https://{region}.api.test", "https://api.{region}.test/v1", "{scheme}://a.test"]), []);
  assert.deepEqual(originsOf(["https://api.test/{base}", "https://b.test?x={y}"]), ["https://api.test", "https://b.test"]);
});

test("every dropped header is dropped, in any case", () => {
  const dropped = [
    "host", "cookie", "content-length", "connection", "keep-alive", "te", "trailer", "transfer-encoding", "upgrade",
    "forwarded", "via", "x-forwarded", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto", "x-real-ip",
    "true-client-ip", "x-client-ip", "cf-connecting-ip", "x-cluster-client-ip", "proxy-authorization", "proxy-connection",
    "x-original-url", "x-rewrite-url", "x-envoy-original-path", "x-http-method-override", "x-middleware-subrequest",
    "x-nextjs-data", "x-invoke-path", "x-matched-path", "rsc", "next-action",
  ];
  for (const name of dropped) {
    assert.deepEqual(forwardableHeaders({ [name]: "v" }), {}, name);
    assert.deepEqual(forwardableHeaders({ [name.toUpperCase()]: "v" }), {}, name.toUpperCase());
  }
  const kept = { Authorization: "a", "X-Api-Key": "b", "xi-api-key": "c", "Content-Type": "d", Accept: "e", "x-forwardedness": "f", "X-Request-Id": "g" };
  assert.deepEqual(forwardableHeaders(kept), kept);
});

test("readCapped decodes text and handles an empty body", async () => {
  assert.equal(await readCapped(new Response("héllo")), "héllo");
  assert.equal(await readCapped(new Response(null)), "");
  assert.equal(await readCapped(new Response("12345"), 4), null);
  assert.equal(await readCapped(new Response("12345", { headers: { "content-length": "5" } }), 4), null);
  assert.equal(await readCapped(new Response("1234"), 4), "1234");
});
