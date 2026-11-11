import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// GitHub stars in a real build, against a stand-in for the GitHub API.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const TOKEN = "ghp_markline_test_token_never_in_output";

const site = createSite();
let api: ChildProcess;
let apiUrl = "";
const authLog = path.join(site.dir, "..", "auth.log");

// In its own process: a build blocks this one while it runs.
const STUB = `
const http = require("node:http"), fs = require("node:fs");
const server = http.createServer((req, res) => {
  fs.appendFileSync(process.argv[1], (req.headers.authorization ?? "") + "\\n");
  if (req.url === "/repos/example-org/docs") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ stargazers_count: 1234 }));
  } else res.writeHead(404).end("{}");
});
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
`;

before(async () => {
  api = spawn(process.execPath, ["-e", STUB, authLog], { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise<string>((r) => api.stdout!.once("data", (d) => r(String(d).trim())));
  apiUrl = `http://127.0.0.1:${port}`;
  fs.writeFileSync(
    path.join(site.dir, "markline.json"),
    JSON.stringify({ name: "t", topbar: { links: [{ label: "GitHub", href: "https://github.com/example-org/docs" }] } }),
  );
});

after(async () => {
  api.kill();
  await site.destroy();
});

const work = () => path.join(site.dir, ".markline");
const homeHtml = () => {
  const file = filesUnder(work()).find((f) => /[/\\]server[/\\]app[/\\]index\.html$/.test(f));
  assert.ok(file, "the home page was built");
  return fs.readFileSync(file, "utf8");
};

test("the build bakes the star count into the page, and the token goes nowhere but the API", { skip }, () => {
  site.build({ GITHUB_API_URL: apiUrl, GITHUB_TOKEN: TOKEN });
  assert.deepEqual(fs.readFileSync(authLog, "utf8").trim().split("\n"), [`Bearer ${TOKEN}`]);
  assert.match(homeHtml(), /class="ghbadge"[^>]*>[\s\S]*?<span class="lbl">1\.2k<\/span>/);
  for (const file of filesUnder(work())) {
    if (fs.statSync(file).size > 20_000_000) continue;
    assert.ok(!fs.readFileSync(file).includes(TOKEN), `the token is in ${path.relative(site.dir, file)}`);
  }
});

test("a build that can't reach GitHub passes, and the badge has no count", { skip }, () => {
  fs.rmSync(path.join(work(), ".markline-github.json"), { force: true });
  const out = site.build({ GITHUB_API_URL: "http://127.0.0.1:9" });
  assert.match(out, /couldn't fetch stars:example-org\/docs/);
  const html = homeHtml();
  assert.match(html, /class="ghbadge"/);
  assert.doesNotMatch(html, /class="lbl"/);
});
