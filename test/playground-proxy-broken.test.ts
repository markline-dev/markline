import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute, startStub } from "./proxy-harness";

// A spec that can't be read refuses everything, even an origin in the config.

const stub = await startStub((_req, res) => res.end("reached"));
let route: Awaited<ReturnType<typeof loadRoute>>;

before(async () => {
  route = await loadRoute({ config: { name: "t", api: { baseUrl: `http://127.0.0.1:${stub.port}` } }, spec: "{ not json" });
});

after(() => {
  stub.stop();
  route.cleanup();
});

test("a failure reading the allowlist refuses", async () => {
  const { status, data } = await route.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 500);
  assert.match(String(data.error), /openapi\.json/);
  assert.deepEqual(stub.hits, []);
});

test("a config that can't be read refuses, even with a good spec", async (t) => {
  const spec = JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, servers: [{ url: `http://127.0.0.1:${stub.port}` }], paths: {} });
  const broken = await loadRoute({ config: "{ not json", spec });
  t.after(() => broken.cleanup());
  const { status, data } = await broken.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 500);
  assert.match(String(data.error), /markline\.json/);
  assert.deepEqual(stub.hits, []);
});

test("no config at all says so", async (t) => {
  const none = await loadRoute({ config: null });
  t.after(() => none.cleanup());
  const { status, data } = await none.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 403);
  assert.match(String(data.error), /found no markline\.json/);
  assert.deepEqual(stub.hits, []);
});

test('proxy: "never" turns it off', async (t) => {
  const off = await loadRoute({ config: { name: "t", api: { baseUrl: `http://127.0.0.1:${stub.port}`, playground: { proxy: "never" } } } });
  t.after(() => off.cleanup());
  const { status, data } = await off.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 403);
  assert.match(String(data.error), /never/);
  assert.deepEqual(stub.hits, []);
});

