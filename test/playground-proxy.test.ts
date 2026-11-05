import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { forwardableHeaders, MAX_PROXY_RESPONSE_BYTES, originsOf, readCapped } from "../lib/playground-proxy";
import { loadRoute, startStub } from "./proxy-harness";

const MB = 1024 * 1024;
const closed = new Map<string, boolean>();
let seen: Record<string, string | string[] | undefined> = {};

const api = await startStub((req, res) => {
  const url = req.url ?? "";
  seen = req.headers;
  res.on("close", () => closed.set(url, !res.writableFinished));
  if (url === "/ok") return res.end("hello");
  if (url === "/redirect") {
    res.writeHead(302, { location: `http://127.0.0.1:${other.port}/secret` });
    return res.end();
  }
  if (url === "/declared-big") {
    res.writeHead(200, { "content-length": String(MAX_PROXY_RESPONSE_BYTES + 1) });
    return res.write("x"); // never finishes
  }
  if (url === "/at-cap") return res.end(Buffer.alloc(MAX_PROXY_RESPONSE_BYTES, 97));
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
    `http://localhost:${p}@127.0.0.1:${other.port}/`,
    `http://localhost@127.0.0.1:${other.port}/`,
  ]) {
    assert.equal((await route.send({ url })).status, 403, url);
  }
  assert.equal((await route.send({ url: "file:///etc/passwd" })).status, 400);
  assert.equal(other.hits.length + api.hits.length, before, "nothing was contacted");
});

test("credentials in an allowed URL aren't sent", async () => {
  const before = api.hits.length;
  const { status, data } = await route.send({ url: `http://user:pw@localhost:${api.port}/ok` });
  assert.equal(status, 502);
  assert.equal(data.body, undefined);
  assert.equal(api.hits.length, before);
});

test("a redirect isn't followed, and its target isn't returned", async () => {
  const before = other.hits.length;
  const { status, data } = await route.send({ url: at("/redirect") });
  assert.equal(status, 200);
  assert.equal(data.status, 302);
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
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(closed.get(path), true, `${path} was dropped`);
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
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(closed.get("/drip"), true);
});

test("origins are normalised, and only http(s) ones count", () => {
  assert.deepEqual(originsOf(["https://API.example.com:443/v1", "http://a.test:80/", "http://a.test:8080"]), [
    "https://api.example.com",
    "http://a.test",
    "http://a.test:8080",
  ]);
  assert.deepEqual(originsOf(["/v1", "", undefined, "file:///x", "https://{region}.api.test"]), []);
});

test("forwardableHeaders ignores case", () => {
  assert.deepEqual(forwardableHeaders({ HOST: "a", "X-FORWARDED-PROTO": "b", "PROXY-CONNECTION": "c", "X-Api-Key": "d" }), { "X-Api-Key": "d" });
});

test("readCapped decodes text and handles an empty body", async () => {
  assert.equal(await readCapped(new Response("héllo")), "héllo");
  assert.equal(await readCapped(new Response(null)), "");
  assert.equal(await readCapped(new Response("12345"), 4), null);
  assert.equal(await readCapped(new Response("12345", { headers: { "content-length": "5" } }), 4), null);
  assert.equal(await readCapped(new Response("1234"), 4), "1234");
});
