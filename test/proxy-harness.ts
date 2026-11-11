import fs from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

// Runs app/api/playground/route.ts against a real local server.

export async function startStub(handler: RequestListener) {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? "");
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    hits,
    port: (server.address() as AddressInfo).port,
    stop: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}

/** Points the app at a temp content folder, then loads the route. */
export async function loadRoute(content: { config: object | string | null; spec?: string; versionSpecs?: Record<string, string> }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-proxy-"));
  if (content.config !== null) {
    fs.writeFileSync(path.join(dir, "markline.json"), typeof content.config === "string" ? content.config : JSON.stringify(content.config));
  }
  if (content.spec !== undefined) {
    fs.mkdirSync(path.join(dir, "api"));
    fs.writeFileSync(path.join(dir, "api", "openapi.json"), content.spec);
  }
  for (const [id, spec] of Object.entries(content.versionSpecs ?? {})) {
    fs.mkdirSync(path.join(dir, id, "api"), { recursive: true });
    fs.writeFileSync(path.join(dir, id, "api", "openapi.json"), spec);
  }
  process.env.MARKLINE_CONTENT = dir;
  const { POST } = await import("../app/api/playground/route");
  return {
    send: async (payload: object, signal?: AbortSignal) => {
      process.env.MARKLINE_CONTENT = dir;
      const res = await POST(new Request("http://docs.test/api/playground", { method: "POST", body: JSON.stringify(payload), signal }));
      return { status: res.status, data: (await res.json()) as Record<string, unknown> };
    },
    /** Sends a request as given, for its size handling. */
    sendRaw: async (init: RequestInit) => {
      process.env.MARKLINE_CONTENT = dir;
      const res = await POST(new Request("http://docs.test/api/playground", { method: "POST", ...init }));
      return { status: res.status, data: (await res.json()) as Record<string, unknown> };
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

/** Resolves once `ok()` holds, checking every 10 ms; fails naming `what` after `ms`.
 *  For what happens on its own time, such as a dropped connection closing. */
export async function until(ok: () => boolean, what: string, ms = 10_000) {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
