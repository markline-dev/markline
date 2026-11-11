import { test } from "node:test";
import assert from "node:assert/strict";
import matter from "gray-matter";
import { lastUpdated } from "../lib/docs";

// `last_updated` as a page shows it.

const read = (yaml: string) => lastUpdated(matter(`---\n${yaml}\n---\n`).data.last_updated);

test("an unquoted date is shown as that day", () => {
  assert.equal(read("last_updated: 2026-11-08"), "November 8, 2026");
  assert.equal(read("last_updated: 2026-01-01"), "January 1, 2026", "not moved back a day by a timezone");
});

test("a date with a time is shown as its UTC day", () => {
  assert.equal(lastUpdated(new Date("2026-11-08T23:30:00-05:00")), "November 9, 2026");
});

test("anything else is shown as written, and nothing for no value", () => {
  assert.equal(read('last_updated: "Nov 10, 2026"'), "Nov 10, 2026");
  assert.equal(read("last_updated: Nov 10, 2026"), "Nov 10, 2026");
  assert.equal(read("title: x"), undefined);
  assert.equal(lastUpdated(new Date("nope")), undefined);
});
