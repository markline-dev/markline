import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base64ToBytes,
  bodyKind,
  bytesToBase64,
  describeMediaType,
  extensionFor,
  formatBytes,
  isBinarySchema,
  isTextualMediaType,
  pickMediaType,
} from "../lib/openapi-media.ts";

test("pickMediaType prefers JSON, then +json, then the first listed", () => {
  assert.equal(pickMediaType({ "audio/mpeg": {}, "application/json": {} }), "application/json");
  assert.equal(pickMediaType({ "text/plain": {}, "application/problem+json": {} }), "application/problem+json");
  assert.equal(pickMediaType({ "multipart/form-data": {} }), "multipart/form-data");
  assert.equal(pickMediaType(undefined), undefined);
  assert.equal(pickMediaType({}), undefined);
});

test("bodyKind maps media types to how a body is sent", () => {
  assert.equal(bodyKind(undefined), "json");
  assert.equal(bodyKind("application/json; charset=utf-8"), "json");
  assert.equal(bodyKind("multipart/form-data"), "multipart");
  assert.equal(bodyKind("application/x-www-form-urlencoded"), "form");
  assert.equal(bodyKind("application/octet-stream"), "other");
});

test("isTextualMediaType separates text bodies from bytes", () => {
  for (const ct of ["application/json", "text/plain; charset=utf-8", "text/event-stream", "application/problem+json", "application/xml", ""]) {
    assert.equal(isTextualMediaType(ct), true, ct);
  }
  for (const ct of ["audio/mpeg", "audio/*", "application/octet-stream", "application/zip", "video/mp4", "image/png"]) {
    assert.equal(isTextualMediaType(ct), false, ct);
  }
});

test("describeMediaType labels binary, text and stream bodies", () => {
  assert.equal(describeMediaType("audio/mpeg"), "Returns audio/mpeg (binary)");
  assert.equal(describeMediaType("text/csv"), "Returns text/csv (text)");
  assert.equal(describeMediaType("text/event-stream"), "Returns text/event-stream (event stream)");
});

test("isBinarySchema finds file fields, also inside a nullable anyOf", () => {
  assert.equal(isBinarySchema({ type: "string", format: "binary" }), true);
  assert.equal(isBinarySchema({ anyOf: [{ type: "string", format: "binary" }, { type: "null" }] }), true);
  assert.equal(isBinarySchema({ type: "array", items: { type: "string", format: "binary" } }), true);
  assert.equal(isBinarySchema({ type: "string", contentMediaType: "audio/wav" }), true);
  assert.equal(isBinarySchema({ type: "string" }), false);
  assert.equal(isBinarySchema({ anyOf: [{ type: "string" }, { type: "integer" }] }), false);
});

test("base64 round-trips arbitrary bytes and matches Buffer's encoding", () => {
  for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
    const bytes = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255);
    const b64 = bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString("base64"), `encode ${len}`);
    assert.deepEqual(base64ToBytes(b64), bytes, `decode ${len}`);
  }
});

test("a proxied audio body decodes to a Blob with its content type and exact size", async () => {
  // What the proxy sends for an audio/mpeg upstream body, and how the
  // playground turns it back into a playable Blob.
  const mp3Header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x64]);
  const envelope = JSON.parse(JSON.stringify({ contentType: "audio/mpeg", bodyBase64: bytesToBase64(mp3Header) }));
  assert.equal(isTextualMediaType(envelope.contentType), false);
  const blob = new Blob([base64ToBytes(envelope.bodyBase64) as BlobPart], { type: envelope.contentType });
  assert.equal(blob.type, "audio/mpeg");
  assert.equal(blob.size, mp3Header.length);
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), mp3Header);
});

test("formatBytes and extensionFor label a download", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(extensionFor("audio/mpeg"), "mp3");
  assert.equal(extensionFor("application/zip"), "zip");
  assert.equal(extensionFor("application/octet-stream"), "bin");
});
