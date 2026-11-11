import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flattenObject,
  looksBinary,
  objectUrlFor,
  readProxyBody,
  readResponseBody,
  safeBlobType,
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

test("base64 round-trips arbitrary bytes and matches Buffer's encoding", async () => {
  for (const len of [0, 1, 2, 3, 4, 5, 255, 1000]) {
    const bytes = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255);
    const b64 = await bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString("base64"), `encode ${len}`);
    assert.deepEqual(base64ToBytes(b64), bytes, `decode ${len}`);
  }
});

test("a proxied audio body decodes to a Blob with its content type and exact size", async () => {
  // What the proxy sends for an audio/mpeg upstream body, and how the
  // playground turns it back into a playable Blob.
  const mp3Header = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x64]);
  const envelope = JSON.parse(JSON.stringify({ contentType: "audio/mpeg", bodyBase64: await bytesToBase64(mp3Header) }));
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

test("bytesToBase64 yields between chunks, so a big upload doesn't freeze the tab", async () => {
  let pauses = 0;
  const bytes = new Uint8Array(2_000_000).map((_, i) => i & 255);
  const b64 = await bytesToBase64(bytes, async () => { pauses++; });
  assert.equal(b64, Buffer.from(bytes).toString("base64"));
  assert.ok(pauses >= 2, `${pauses} pauses`);
});

test("responses are read as text or bytes by Content-Type", async () => {
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0xff, 0xfb]);
  const audio = await readResponseBody(new Response(bytes), "audio/mpeg");
  assert.equal(audio.body, "");
  assert.deepEqual(new Uint8Array(await audio.blob!.arrayBuffer()), bytes);
  const json = await readResponseBody(new Response('{"a":1}'), "application/json");
  assert.deepEqual([json.body, json.blob], ['{"a":1}', undefined]);
});

test("a response with no Content-Type is sniffed, not dumped as text", async () => {
  const bin = await readResponseBody(new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00])), "");
  assert.ok(bin.blob);
  const text = await readResponseBody(new Response("héllo"), "");
  assert.deepEqual([text.body, text.blob], ["héllo", undefined]);
  assert.equal(looksBinary(new TextEncoder().encode("héllo")), false);
  assert.equal(looksBinary(new Uint8Array([104, 0, 105])), true);
  // A multibyte character cut off by the sniff window isn't binary.
  assert.equal(looksBinary(new TextEncoder().encode(`${"a".repeat(4095)}é`)), false);
});

test("the proxy's envelope becomes the same shape as a direct read", async () => {
  const bytes = new Uint8Array([1, 2, 3, 250]);
  const blob = readProxyBody({ bodyBase64: Buffer.from(bytes).toString("base64"), contentType: "audio/wav" }).blob!;
  assert.equal(blob.type, "audio/wav");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
  assert.deepEqual(readProxyBody({ body: "hi" }), { body: "hi" });
  assert.deepEqual(readProxyBody({ body: { a: 1 } }), { body: '{"a":1}' });
});

test("a response's object URL is revoked when it's replaced", () => {
  const log: string[] = [];
  const urls = { createObjectURL: () => "blob:1", revokeObjectURL: (u: string) => void log.push(`revoke ${u}`) };
  const cleanup = objectUrlFor(new Blob(["x"]), (u) => log.push(`set ${u}`), urls);
  assert.deepEqual(log, ["set blob:1"]);
  cleanup();
  assert.deepEqual(log, ["set blob:1", "revoke blob:1"]);
});

test("flattenObject merges allOf, through a nullable wrapper", () => {
  const flat = flattenObject({
    anyOf: [{ allOf: [{ type: "object", required: ["a"], properties: { a: { type: "string" } } }], properties: { b: { type: "string" } } }, { type: "null" }],
  })!;
  assert.deepEqual(Object.keys(flat.properties!), ["a", "b"]);
  assert.deepEqual(flat.required, ["a"]);
});

test("a response's Blob only ever gets a bare, known-safe type", async () => {
  for (const ct of ["audio/mpeg", "Audio/MPEG; codec=mp3", "image/png", "image/webp", "application/pdf", "video/mp4"]) {
    assert.equal(safeBlobType(ct), ct.split(";")[0].toLowerCase(), ct);
  }
  for (const ct of [
    "text/html",
    "image/svg+xml",
    "image/png, text/html",
    "audio/mpeg, text/html",
    "audio/<script>",
    "application/xhtml+xml",
    "application/javascript",
    "text/xml",
    "multipart/x-mixed-replace; boundary=x",
    "image/png\ttext/html",
    "",
    undefined,
    "audio",
    "/png",
  ]) {
    assert.equal(safeBlobType(ct), "application/octet-stream", String(ct));
  }
  const bytes = new Uint8Array([1, 2, 3]);
  // Every path: direct with a type, direct sniffed, through the proxy, and the object URL.
  assert.equal((await readResponseBody(new Response(bytes), "image/png, text/html")).blob!.type, "application/octet-stream");
  // SVG is XML, so it's read and shown as text, never given a Blob.
  assert.equal((await readResponseBody(new Response("<svg/>"), "image/svg+xml")).blob, undefined);
  assert.equal((await readResponseBody(new Response(bytes), "audio/mpeg")).blob!.type, "audio/mpeg");
  assert.equal((await readResponseBody(new Response(new Uint8Array([0xff, 0, 1])), "")).blob!.type, "application/octet-stream");
  const proxied = readProxyBody({ bodyBase64: Buffer.from(bytes).toString("base64"), contentType: "text/html; charset=utf-8" }).blob!;
  assert.equal(proxied.type, "application/octet-stream");
  assert.deepEqual(new Uint8Array(await proxied.arrayBuffer()), bytes);
  const made: Blob[] = [];
  const urls = { createObjectURL: (b: Blob) => (made.push(b), "blob:1"), revokeObjectURL: () => {} };
  objectUrlFor(new Blob(["<script>"], { type: "text/html" }), () => {}, urls);
  objectUrlFor(new Blob(["x"], { type: "audio/wav" }), () => {}, urls);
  assert.deepEqual(made.map((b) => b.type), ["application/octet-stream", "audio/wav"]);
  assert.equal(await made[0].text(), "<script>");
});
