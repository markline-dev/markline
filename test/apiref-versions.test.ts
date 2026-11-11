import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { versionEntries } from "../lib/apiref-view.ts";

test("no picker without two configured versions", () => {
  assert.deepEqual(versionEntries(undefined), []);
  assert.deepEqual(versionEntries([]), []);
  assert.deepEqual(versionEntries([{ id: "v1", label: "1.0" }]), []);
});

test("each version shows its configured label, and the one in view is current", () => {
  const versions = [{ id: "v2", label: "2.0 (latest)" }, { id: "v1", label: "1.0" }, { id: "v0" }];
  assert.deepEqual(versionEntries(versions), [
    { id: "v2", label: "2.0 (latest)", current: true },
    { id: "v1", label: "1.0", current: false },
    { id: "v0", label: "v0", current: false },
  ]);
  assert.deepEqual(versionEntries(versions, "v1").map((v) => v.current), [false, true, false]);
  // An empty label falls back to the id, as a missing one does.
  assert.equal(versionEntries([{ id: "a", label: "" }, { id: "b" }])[0].label, "a");
});
