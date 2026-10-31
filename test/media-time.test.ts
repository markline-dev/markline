import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTime, nextSpeed, speedLabel } from "../lib/media-time.ts";

test("formatTime", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(16.9), "00:16");
  assert.equal(formatTime(75), "01:15");
  assert.equal(formatTime(3725), "1:02:05");
  assert.equal(formatTime(NaN), "00:00");
  assert.equal(formatTime(Infinity), "00:00");
});

test("speeds cycle and label", () => {
  assert.equal(nextSpeed(1), 1.25);
  assert.equal(nextSpeed(2), 0.75);
  assert.equal(nextSpeed(0.75), 1);
  assert.equal(nextSpeed(3), 1);
  assert.equal(speedLabel(1), "1.0x");
  assert.equal(speedLabel(1.25), "1.25x");
  assert.equal(speedLabel(2), "2.0x");
});
