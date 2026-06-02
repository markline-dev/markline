#!/usr/bin/env node
// Scaffold a new Markline docs project:  npm create @markline@latest my-docs
//
// Self-contained: it only writes the starter files. The scaffolded project
// depends on @markline/markline (installed when the user runs `npm install`),
// so this scaffolder stays tiny and fast.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveTemplates() {
  // Published: ./templates (copied by prepublishOnly). Dev: ../templates/init.
  const candidates = [
    path.join(__dirname, "templates"),
    path.join(__dirname, "..", "templates", "init"),
  ];
  const found = candidates.find((p) => fs.existsSync(path.join(p, "docs.json")));
  if (!found) throw new Error("Markline starter templates not found.");
  return found;
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

function sanitizePkgName(name) {
  return name.toLowerCase().replace(/[^a-z0-9-~]/g, "-").replace(/^-+|-+$/g, "") || "my-docs";
}

function main() {
  const arg = process.argv[2];
  const target = arg ? path.resolve(process.cwd(), arg) : process.cwd();
  const name = path.basename(target);

  if (fs.existsSync(path.join(target, "docs.json"))) {
    console.error(`\n  ${target} already contains a docs.json — refusing to overwrite.\n`);
    process.exit(1);
  }

  fs.mkdirSync(target, { recursive: true });
  copyDir(resolveTemplates(), target);

  // Name the scaffolded package after its directory.
  const pkgPath = path.join(target, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkg.name = sanitizePkgName(name);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  } catch {
    /* leave the template name */
  }

  const rel = path.relative(process.cwd(), target) || ".";
  console.log(`\n  Created a Markline docs project in ${rel}\n`);
  console.log("  Next steps:");
  if (rel !== ".") console.log(`    cd ${rel}`);
  console.log("    npm install");
  console.log("    npm run dev\n");
}

try {
  main();
} catch (err) {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
}
