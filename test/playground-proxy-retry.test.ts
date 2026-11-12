import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { isConnectionReset, PROXY_BUFFERED } from "../lib/playground-proxy";
import { loadRoute } from "./proxy-harness";

// A dropped connection under the proxy's fetch: once for GET and HEAD, never for
// anything else, and never once a reply has started.

/** Requests seen per path, with the size of each one's body. */
const seen = new Map<string, { method: string; bodyBytes: number }[]>();
/** Paths whose next N requests are dropped before any reply. */
const dropNext = new Map<string, number>();
/** Silent short keep-alive: drops an idle connection after this many ms, without saying so. */
const IDLE_MS = 300;

function reply(sock: net.Socket, body: string, keepAlive = true) {
  sock.write(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\n${keepAlive ? "Connection: keep-alive\r\n" : ""}\r\n${body}`);
}

const upstream = net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  let idle: NodeJS.Timeout | undefined;
  const arm = () => {
    clearTimeout(idle);
    idle = setTimeout(() => sock.destroy(), IDLE_MS);
  };
  arm();
  sock.on("error", () => {});
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const end = buf.indexOf("\r\n\r\n");
    if (end < 0) return;
    const head = buf.subarray(0, end).toString();
    const [method, path] = head.split(" ");
    const length = Number(/content-length:\s*(\d+)/i.exec(head)?.[1] ?? 0);
    if (buf.length < end + 4 + length) return;
    buf = buf.subarray(end + 4 + length);
    const list = seen.get(path) ?? [];
    list.push({ method, bodyBytes: length });
    seen.set(path, list);
    const drops = dropNext.get(path) ?? 0;
    if (drops > 0) {
      dropNext.set(path, drops - 1);
      sock.destroy(); // before any reply
      return;
    }
    if (path === "/headers-then-drop") {
      sock.write("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 100\r\n\r\npartial");
      setTimeout(() => sock.destroy(), 20);
      return;
    }
    reply(sock, method === "HEAD" ? "" : "ok");
    arm();
  });
});
await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
const port = (upstream.address() as net.AddressInfo).port;
const at = (p: string) => `http://localhost:${port}${p}`;

let route: Awaited<ReturnType<typeof loadRoute>>;
before(async () => {
  route = await loadRoute({ config: { name: "t", api: { baseUrl: `http://localhost:${port}` } } });
});
after(() => {
  upstream.close();
  route.cleanup();
});

const hits = (path: string) => seen.get(path) ?? [];

test("a GET or HEAD whose connection drops before any reply is sent once more", async () => {
  for (const method of ["GET", "HEAD"]) {
    const path = `/once-${method}`;
    dropNext.set(path, 1);
    const { status, data } = await route.send({ url: at(path), method });
    assert.equal(status, 200, `${method}: ${data.error}`);
    assert.equal(data.status, 200);
    assert.deepEqual(hits(path).map((h) => h.method), [method, method]);
    // Nothing to replay: neither attempt carried a body.
    assert.deepEqual(hits(path).map((h) => h.bodyBytes), [0, 0]);
  }
});

test("other methods are never sent twice", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const path = `/never-${method}`;
    dropNext.set(path, 1);
    const { status, data } = await route.send({ url: at(path), method, body: '{"a":1}' });
    assert.equal(status, 502, method);
    assert.match(String(data.error), /couldn't be reached/);
    assert.equal(hits(path).length, 1, `${method} reached the API once`);
  }
});

test("only once: a second drop is a 502, and the budget is left at 0", async () => {
  dropNext.set("/twice", 2);
  const { status, data } = await route.send({ url: at("/twice") });
  assert.equal(status, 502);
  assert.match(String(data.error), /couldn't be reached \((ECONNRESET|UND_ERR_SOCKET|EPIPE)\)/);
  assert.equal(hits("/twice").length, 2);
  assert.equal(PROXY_BUFFERED.bytes, 0);
});

test("a drop after the reply has started isn't retried", async () => {
  const { status } = await route.send({ url: at("/headers-then-drop") });
  assert.equal(status, 502);
  assert.equal(hits("/headers-then-drop").length, 1);
  assert.equal(PROXY_BUFFERED.bytes, 0);
});

test("a GET reusing a connection the API is closing succeeds", { timeout: 60_000 }, async () => {
  // The real case: Send lands just as the API drops the idle connection fetch keeps.
  let ok = 0;
  for (let i = 0; i < 20; i++) {
    await route.send({ url: at("/warm") });
    await new Promise((r) => setTimeout(r, IDLE_MS - 3 + (i % 7)));
    const { status } = await route.send({ url: at("/warm") });
    if (status === 200) ok++;
  }
  assert.equal(ok, 20);
  assert.equal(PROXY_BUFFERED.bytes, 0);
});

test("isConnectionReset knows a dropped connection from other failures", () => {
  for (const code of ["ECONNRESET", "UND_ERR_SOCKET", "EPIPE"]) assert.equal(isConnectionReset({ cause: { code } }), true, code);
  for (const e of [{ cause: { code: "ECONNREFUSED" } }, { cause: { code: "ENOTFOUND" } }, new Error("x"), null, { name: "TimeoutError" }]) {
    assert.equal(isConnectionReset(e), false, JSON.stringify(e));
  }
});
