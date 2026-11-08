import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  base64Size,
  BufferBudget,
  MAX_PROXY_REPLY_BYTES,
  MAX_PROXY_REQUEST_BYTES,
  MAX_PROXY_RESPONSE_BYTES,
  MAX_PROXY_UPLOAD_BYTES,
  OVER_BUDGET,
  parsePayload,
  readCappedBytes,
} from "../lib/playground-proxy";
import { loadRoute, startStub } from "./proxy-harness";

// Binary responses and uploads through app/api/playground/route.ts.

const MB = 1024 * 1024;
const closed = new Map<string, boolean>();
let uploadArrived = () => {};
let release = Promise.resolve();
let received: { method?: string; type?: string; size: number; sha: string } = { size: 0, sha: "" };

/** Bytes that aren't valid UTF-8, so a text round trip would corrupt them. */
const pattern = (size: number) => {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 151 + 7) & 0xff;
  return b;
};
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const AT_CAP = pattern(MAX_PROXY_RESPONSE_BYTES);

const api = await startStub((req, res) => {
  const url = req.url ?? "";
  res.on("close", () => closed.set(url, !res.writableFinished));
  if (url === "/audio") {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    return res.end(pattern(1000));
  }
  if (url === "/audio-at-cap") {
    res.writeHead(200, { "content-type": "audio/mpeg; codec=mp3" });
    return res.end(AT_CAP);
  }
  if (url === "/audio-declared-big") {
    res.writeHead(200, { "content-type": "audio/mpeg", "content-length": String(MAX_PROXY_RESPONSE_BYTES + 1) });
    return res.write("x"); // never finishes
  }
  if (url === "/audio-chunked-big") {
    res.writeHead(200, { "content-type": "application/zip" });
    res.write(AT_CAP);
    return res.end(Buffer.alloc(1));
  }
  if (url === "/audio-drip") {
    res.writeHead(200, { "content-type": "audio/mpeg" });
    const send = () => {
      if (res.destroyed) return;
      res.write(pattern(MB));
      setTimeout(send, 5); // no Content-Length, and it never ends on its own
    };
    return send();
  }
  if (url === "/json") {
    res.writeHead(200, { "content-type": "application/problem+json" });
    return res.end('{"ok":true}');
  }
  if (url === "/untyped") return res.end(Buffer.from([0x68, 0x69]));
  if (url === "/five-mb") return res.end(Buffer.alloc(5 * MB, 97));
  if (url === "/upload-hold") {
    req.resume();
    req.on("end", () => {
      uploadArrived();
      release.then(() => res.end("ok"));
    });
    return;
  }
  if (url === "/upload") {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const all = Buffer.concat(chunks);
      received = { method: req.method, type: req.headers["content-type"], size: all.length, sha: sha(all) };
      res.end("ok");
    });
    return;
  }
  res.statusCode = 404;
  res.end();
});

let route: Awaited<ReturnType<typeof loadRoute>>;
const at = (p: string) => `http://localhost:${api.port}${p}`;

before(async () => {
  route = await loadRoute({ config: { name: "t", api: { baseUrl: `http://localhost:${api.port}` } } });
});

after(() => {
  api.stop();
  route.cleanup();
});

test("a binary response comes back intact, as base64, with its type", async () => {
  const { status, data } = await route.send({ url: at("/audio") });
  assert.equal(status, 200);
  assert.equal(data.contentType, "audio/mpeg");
  assert.equal(data.body, undefined);
  assert.equal(sha(Buffer.from(data.bodyBase64 as string, "base64")), sha(pattern(1000)));
});

test("a binary response at the cap fits the reply limit", { timeout: 60_000 }, async () => {
  const res = await route.sendRaw({ body: JSON.stringify({ url: at("/audio-at-cap") }) });
  assert.equal(res.status, 200);
  const encoded = res.data.bodyBase64 as string;
  assert.equal(sha(Buffer.from(encoded, "base64")), sha(AT_CAP));
  const replySize = Buffer.byteLength(JSON.stringify(res.data));
  assert.ok(replySize <= MAX_PROXY_REPLY_BYTES, `${replySize} bytes`);
});

test("a binary response over the cap is a 413 and the upstream is dropped", { timeout: 60_000 }, async () => {
  for (const path of ["/audio-declared-big", "/audio-chunked-big", "/audio-drip"]) {
    const { status, data } = await route.send({ url: at(path) });
    assert.equal(status, 413, path);
    assert.match(String(data.error), /25 MB/);
    assert.equal(data.bodyBase64, undefined);
    if (path !== "/audio-chunked-big") {
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(closed.get(path), true, `${path} was dropped`);
    }
  }
});

test("the base64 counts against the shared budget, which recovers", { timeout: 60_000 }, async () => {
  // Two at-cap binaries fit the budget as bytes (50 MB) but not with their base64 (117 MB).
  const results = await Promise.all([route.send({ url: at("/audio-at-cap") }), route.send({ url: at("/audio-at-cap") })]);
  const statuses = results.map((r) => r.status);
  assert.ok(statuses.includes(503), statuses.join());
  assert.equal((await route.send({ url: at("/audio-at-cap") })).status, 200);
});

test("text responses, typed or untyped, still come back as text", async () => {
  const json = await route.send({ url: at("/json") });
  assert.equal(json.data.body, '{"ok":true}');
  assert.equal(json.data.contentType, "application/problem+json");
  assert.equal(json.data.bodyBase64, undefined);
  const untyped = await route.send({ url: at("/untyped") });
  assert.equal(untyped.data.body, "hi");
  assert.equal(untyped.data.bodyBase64, undefined);
});

test("an upload is forwarded byte for byte, with its Content-Type", async () => {
  const bytes = pattern(5000);
  const type = "multipart/form-data; boundary=xyz";
  const { status } = await route.send({ url: at("/upload"), method: "POST", headers: { "Content-Type": type }, bodyBase64: bytes.toString("base64") });
  assert.equal(status, 200);
  assert.deepEqual(received, { method: "POST", type, size: 5000, sha: sha(bytes) });
});

test("an upload at the cap fits the request limit, JSON and all", { timeout: 60_000 }, async () => {
  const bytes = pattern(MAX_PROXY_UPLOAD_BYTES);
  const payload = JSON.stringify({
    url: at("/upload"),
    method: "POST",
    headers: { "Content-Type": "multipart/form-data; boundary=----markline0123456789", "xi-api-key": "k".repeat(200) },
    bodyBase64: bytes.toString("base64"),
  });
  assert.ok(payload.length < MAX_PROXY_REQUEST_BYTES, `${payload.length} bytes`);
  const { status } = await route.sendRaw({ body: payload });
  assert.equal(status, 200);
  assert.equal(received.size, MAX_PROXY_UPLOAD_BYTES);
  assert.equal(received.sha, sha(bytes));
});

test("a decoded upload counts against the shared budget", { timeout: 60_000 }, async () => {
  // Held: its request (33 MB of base64) and its decoded bytes (25 MB) leave too little for 5 MB more.
  let done = () => {};
  release = new Promise<void>((r) => (done = r));
  const arrived = new Promise<void>((r) => (uploadArrived = r));
  const held = route.send({ url: at("/upload-hold"), method: "POST", bodyBase64: pattern(MAX_PROXY_UPLOAD_BYTES).toString("base64") });
  await arrived;
  assert.equal((await route.send({ url: at("/five-mb") })).status, 503);
  done();
  assert.equal((await held).status, 200);
  assert.equal((await route.send({ url: at("/five-mb") })).status, 200);
});

test("an upload over the cap is refused, however its request is sized", { timeout: 60_000 }, async () => {
  const before = received;
  const { status, data } = await route.send({ url: at("/upload"), method: "POST", bodyBase64: pattern(MAX_PROXY_UPLOAD_BYTES + 1).toString("base64") });
  assert.equal(status, 400);
  assert.match(String(data.error), /25 MB/);
  assert.equal(received, before, "nothing was forwarded");
});

test("bad bodyBase64 is a 400, and nothing is forwarded", async () => {
  const before = received;
  for (const payload of [
    { bodyBase64: "abc" }, // not a multiple of 4
    { bodyBase64: "ab$=" },
    { bodyBase64: "a=bc" },
    { bodyBase64: "ab-_" }, // URL-safe alphabet
    { bodyBase64: "YWJj\nZGVm" },
    { bodyBase64: 12 },
    { bodyBase64: "YWJj", body: "abc" },
  ]) {
    const { status } = await route.send({ url: at("/upload"), method: "POST", ...payload });
    assert.equal(status, 400, JSON.stringify(payload));
  }
  assert.equal(received, before);
});

test("GET and HEAD send no body, of either kind", async () => {
  for (const method of ["GET", "HEAD"]) {
    const { status } = await route.send({ url: at("/upload"), method, bodyBase64: "YWJj" });
    assert.equal(status, 200, method);
    assert.equal(received.method, method);
    assert.equal(received.size, 0, method);
  }
});

test("parsePayload checks bodyBase64", () => {
  assert.deepEqual(parsePayload(JSON.stringify({ url: "https://x.test", bodyBase64: "YWJj" })), {
    url: "https://x.test",
    method: "GET",
    headers: {},
    bodyBase64: "YWJj",
  });
  assert.match((parsePayload(JSON.stringify({ url: "https://x.test", body: "", bodyBase64: "" })) as { error: string }).error, /not both/);
  // null means absent, as it does for body.
  assert.equal("error" in parsePayload(JSON.stringify({ url: "https://x.test", body: "a", bodyBase64: null })), false);
});

test("base64Size is exact and strict", () => {
  assert.equal(base64Size(""), 0);
  assert.equal(base64Size("YQ=="), 1);
  assert.equal(base64Size("YWI="), 2);
  assert.equal(base64Size("YWJj"), 3);
  for (const bad of ["Y", "YQ=", "Y===", "=YWJ", "YW=j", "YWJj ", "YW\nJj", "YW-_"]) assert.equal(base64Size(bad), null, bad);
  for (const n of [0, 1, 2, 3, 4, 5, 1000, 1001]) assert.equal(base64Size(pattern(n).toString("base64")), n);
});

test("readCappedBytes keeps bytes that aren't text, and honours the cap and budget", async () => {
  const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x80]);
  assert.deepEqual(await readCappedBytes(new Response(bytes)), bytes);
  assert.equal(await readCappedBytes(new Response(bytes), 3), null);
  assert.equal(await readCappedBytes(new Response(bytes), 100, new BufferBudget({ bytes: 0 }, 3)), OVER_BUDGET);
  assert.deepEqual(await readCappedBytes(new Response(null)), new Uint8Array(0));
});
