#!/usr/bin/env node
// Markline CLI — run a docs site from the consumer's own docs.json + content
// without forking the framework. The Next app ships inside this package; the
// CLI launches it pointed at the current working directory's content.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, ".."); // the Next app (this package root)
const CONTENT_DIR = process.cwd(); // the consumer's project
const CONFIG_PATH = path.join(CONTENT_DIR, "docs.json");

const NEXT_BIN = path.join(APP_DIR, "node_modules", ".bin", "next");
const SEARCH_SCRIPT = path.join(APP_DIR, "scripts", "build-search.mjs");
const TEMPLATE_DIR = path.join(APP_DIR, "templates", "init");

function readPkgVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

function baseEnv(extra = {}) {
  return {
    ...process.env,
    MARKLINE_CONTENT: CONTENT_DIR,
    MARKLINE_CONFIG: CONFIG_PATH,
    ...extra,
  };
}

function run(cmd, args, { env = baseEnv(), cwd = APP_DIR } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} exited with code ${code}`))));
  });
}

function requireConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(
      `\n  No docs.json found in ${CONTENT_DIR}.\n  Run \`markline init\` to scaffold a new docs project here.\n`,
    );
    process.exit(1);
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

async function buildSearch(env) {
  await run(process.execPath, [SEARCH_SCRIPT], { env });
}

const COMMANDS = {
  async init(args) {
    const target = args[0] ? path.resolve(CONTENT_DIR, args[0]) : CONTENT_DIR;
    if (!fs.existsSync(TEMPLATE_DIR)) {
      console.error(`  Template directory missing: ${TEMPLATE_DIR}`);
      process.exit(1);
    }
    if (fs.existsSync(path.join(target, "docs.json"))) {
      console.error(`  docs.json already exists in ${target} — refusing to overwrite.`);
      process.exit(1);
    }
    copyDir(TEMPLATE_DIR, target);
    const rel = path.relative(CONTENT_DIR, target) || ".";
    console.log(`\n  Created a Markline docs project in ${rel}\n`);
    console.log(`  Next steps:`);
    if (rel !== ".") console.log(`    cd ${rel}`);
    console.log(`    markline dev\n`);
  },

  async dev() {
    requireConfig();
    await run(NEXT_BIN, ["dev"], { env: baseEnv() });
  },

  async build() {
    requireConfig();
    const env = baseEnv();
    await buildSearch(env);
    await run(NEXT_BIN, ["build"], { env });
  },

  async start() {
    requireConfig();
    await run(NEXT_BIN, ["start"], { env: baseEnv() });
  },

  async export() {
    requireConfig();
    const env = baseEnv({ MARKLINE_EXPORT: "1" });
    await buildSearch(env);
    await run(NEXT_BIN, ["build"], { env });
    // Next writes the static site to <app>/out; move it into the consumer's project.
    const from = path.join(APP_DIR, "out");
    const to = path.join(CONTENT_DIR, "out");
    if (fs.existsSync(from) && from !== to) {
      fs.rmSync(to, { recursive: true, force: true });
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    }
    console.log(`\n  Static site exported to ${path.join(CONTENT_DIR, "out")}\n`);
  },

  version() {
    console.log(`markline ${readPkgVersion()}`);
  },

  help() {
    console.log(`
  Markline — open-source documentation framework

  Usage: markline <command>

  Commands:
    init [dir]   Scaffold a new docs project (docs.json + sample content)
    dev          Start the dev server against ./docs.json
    build        Build a production server bundle (Docker / Vercel / start)
    start        Serve a production build
    export       Build a static HTML site into ./out (any CDN / Pages / S3)
    version      Print the Markline version
    help         Show this help

  Content lives in the current directory: docs.json, docs/*.mdx, api/openapi.json
`);
  },
};

async function main() {
  const [cmd = "help", ...args] = process.argv.slice(2);
  const handler = COMMANDS[cmd] ?? (cmd === "--version" || cmd === "-v" ? COMMANDS.version : null) ?? (cmd === "--help" || cmd === "-h" ? COMMANDS.help : null);
  if (!handler) {
    console.error(`  Unknown command: ${cmd}\n`);
    COMMANDS.help();
    process.exit(1);
  }
  try {
    await handler(args);
  } catch (err) {
    console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
}

main();
