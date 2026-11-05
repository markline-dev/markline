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
  assert.equal(status, 403);
  assert.match(String(data.error), /api\.baseUrl/);
  assert.deepEqual(stub.hits, []);
});
