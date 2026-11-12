import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { versionEntries } from "../lib/apiref-view.ts";
import { versionTarget } from "../lib/apiref-version.ts";

test("no picker without two configured versions", () => {
  assert.deepEqual(versionEntries(undefined), []);
  assert.deepEqual(versionEntries([]), []);
  assert.deepEqual(versionEntries([{ id: "v1", label: "1.0" }]), []);
});

test("each version shows its configured label, and the one in view is current", () => {
  const versions = [{ id: "v2", label: "2.0 (latest)" }, { id: "v1", label: "1.0" }, { id: "v0" }];
  assert.deepEqual(versionEntries(versions), [
    { id: "v2", label: "2.0 (latest)", current: true, default: true },
    { id: "v1", label: "1.0", current: false, default: false },
    { id: "v0", label: "v0", current: false, default: false },
  ]);
  assert.deepEqual(versionEntries(versions, "v1").map((v) => v.current), [false, true, false]);
  // An empty label falls back to the id, as a missing one does.
  assert.equal(versionEntries([{ id: "a", label: "" }, { id: "b" }])[0].label, "a");
});

test("a version without an API reference isn't offered", () => {
  const versions = [{ id: "v3", label: "3.0" }, { id: "v2", label: "2.0" }, { id: "v1", label: "1.0 (docs only)" }];
  const withSpec = (id: string) => id !== "v1";
  assert.deepEqual(versionEntries(versions, undefined, withSpec).map((v) => v.id), ["v3", "v2"]);
  // Two configured, one with a spec: nothing to pick.
  assert.deepEqual(versionEntries(versions.slice(1), "v2", withSpec), []);
  // The index says which is the default, so a docs-only default is handled too.
  const seen: [string, number][] = [];
  versionEntries(versions, undefined, (id, i) => (seen.push([id, i]), true));
  assert.deepEqual(seen, [["v3", 0], ["v2", 1], ["v1", 2]]);
});

const entries = [
  { id: "v3", label: "3.0", default: true },
  { id: "v2", label: "2.0" },
];

test("picking a version keeps the page when it exists there", async () => {
  const asked: string[] = [];
  const there = async (p: string) => (asked.push(p), true);
  assert.deepEqual(await versionTarget("/api-reference/voices", "v2", entries, there), { path: "/api-reference/v2/voices", same: true });
  assert.deepEqual(await versionTarget("/api-reference/v2/voicesOp1", "v3", entries, there), { path: "/api-reference/voicesOp1", same: true });
  assert.deepEqual(asked, ["/api-reference/v2/voices", "/api-reference/voicesOp1"]);
});

test("picking a version falls back to its reference home when the page isn't there", async () => {
  const missing = async () => false;
  assert.deepEqual(await versionTarget("/api-reference/dubbing", "v2", entries, missing), { path: "/api-reference/v2", same: false });
  assert.deepEqual(await versionTarget("/api-reference/v2/dubbing", "v3", entries, missing), { path: "/api-reference", same: false });
  // Unreachable (offline): try the page anyway.
  const offline = async () => {
    throw new Error("offline");
  };
  assert.deepEqual(await versionTarget("/api-reference/dubbing", "v2", entries, offline), { path: "/api-reference/v2/dubbing", same: true });
});

test("the default is the one marked, not whichever is listed first", async () => {
  const docsOnlyDefault = [
    { id: "v2", label: "2.0" },
    { id: "v1", label: "1.0" },
  ];
  // v3, the configured default, has no reference: neither listed version is unprefixed.
  assert.deepEqual(await versionTarget("/api-reference/v2/voices", "v1", docsOnlyDefault, async () => true), {
    path: "/api-reference/v1/voices",
    same: true,
  });
});
