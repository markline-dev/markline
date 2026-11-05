import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { loadRoute, startStub } from "./proxy-harness";

// With no absolute URL configured there's nothing to forward to.

const stub = await startStub((_req, res) => res.end("reached"));
let route: Awaited<ReturnType<typeof loadRoute>>;

before(async () => {
  const spec = JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, servers: [{ url: "/v1" }, { url: "https://{region}.api.test" }], paths: {} });
  route = await loadRoute({ config: { name: "t" }, spec });
});

after(() => {
  stub.stop();
  route.cleanup();
});

test("no api.baseUrl and only relative servers: nothing is forwarded", async () => {
  const { status, data } = await route.send({ url: `http://127.0.0.1:${stub.port}/` });
  assert.equal(status, 403);
  assert.match(String(data.error), /api\.baseUrl/);
  assert.equal(data.body, undefined);
  assert.deepEqual(stub.hits, []);
});
