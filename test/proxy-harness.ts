import fs from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

// Runs app/api/playground/route.ts against a real local server. Config is read
// once per process, so each allowlist setup is its own test file.

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
export async function loadRoute(content: { config: object; spec?: string }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-proxy-"));
  fs.writeFileSync(path.join(dir, "markline.json"), JSON.stringify(content.config));
  if (content.spec !== undefined) {
    fs.mkdirSync(path.join(dir, "api"));
    fs.writeFileSync(path.join(dir, "api", "openapi.json"), content.spec);
  }
  process.env.MARKLINE_CONTENT = dir;
  const { POST } = await import("../app/api/playground/route");
  return {
    send: async (payload: object) => {
      const res = await POST(new Request("http://docs.test/api/playground", { method: "POST", body: JSON.stringify(payload) }));
      return { status: res.status, data: (await res.json()) as Record<string, unknown> };
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
