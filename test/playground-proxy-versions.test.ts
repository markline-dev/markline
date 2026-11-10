import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute, startStub } from "./proxy-harness";

// A version's servers count, even when the default version's spec has none.

const stub = await startStub((_req, res) => res.end("reached"));
const other = await startStub((_req, res) => res.end("other"));
let route: Awaited<ReturnType<typeof loadRoute>>;

const spec = (servers: object[]) => JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, servers, paths: {} });

before(async () => {
  route = await loadRoute({
    config: { name: "t", versions: [{ id: "v1", label: "v1" }, { id: "v2", label: "v2" }] },
    spec: spec([{ url: "/v1" }]),
    versionSpecs: { v2: spec([{ url: `http://127.0.0.1:${stub.port}/v2` }]) },
  });
});

after(() => {
  stub.stop();
  other.stop();
  route.cleanup();
});

test("a non-default version's absolute server is allowed", async () => {
  const { status, data } = await route.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 200);
  assert.equal(data.body, "reached");
});

test("other origins are still refused", async () => {
  assert.equal((await route.send({ url: `http://127.0.0.1:${other.port}/` })).status, 403);
  assert.deepEqual(other.hits, []);
});
