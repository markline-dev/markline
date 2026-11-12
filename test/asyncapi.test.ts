import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalizeAsyncApi, type AsyncChannel } from "../lib/asyncapi.ts";

// Synthetic specs in the shape of a streaming speech API: a handshake with path,
// query and header parameters, and messages each way. No third-party text.

const v26 = {
  asyncapi: "2.6.0",
  info: { title: "Acme realtime", version: "1.0" },
  servers: {
    production: { url: "api.acme.test", protocol: "wss" },
    eu: { url: "wss://eu.api.acme.test", protocol: "wss" },
  },
  channels: {
    "/v1/speak/{voice_id}/stream": {
      description: "Stream text in, audio out.",
      parameters: { voice_id: { description: "Which voice.", schema: { type: "string" } } },
      bindings: {
        ws: {
          query: { type: "object", properties: { model_id: { type: "string" }, inactivity_timeout: { type: "integer", default: 20, maximum: 180 } } },
          headers: { type: "object", properties: { "x-api-key": { type: "string" } } },
        },
      },
      publish: {
        summary: "Stream input",
        tags: [{ name: "speech" }],
        message: { oneOf: [{ $ref: "#/components/messages/Init" }, { $ref: "#/components/messages/SendText" }, { $ref: "#/components/messages/Ping" }] },
      },
      subscribe: {
        tags: [{ name: "audio" }],
        message: { oneOf: [{ $ref: "#/components/messages/Audio" }, { $ref: "#/components/messages/Ping" }] },
      },
    },
    "/v1/quiet": { description: "A channel with no messages." },
    "/v1/single": { subscribe: { message: { name: "tick", payload: { type: "integer" } } } },
  },
  components: {
    messages: {
      Init: { name: "init", title: "Initialise", payload: { $ref: "#/components/schemas/Init" }, examples: [{ name: "first", payload: { text: " " } }] },
      SendText: { name: "send_text", payload: { type: "object", properties: { text: { type: "string" }, settings: { $ref: "#/components/schemas/Settings" } } } },
      Ping: { name: "ping", payload: { type: "object", properties: { event_id: { type: "integer" } } } },
      Audio: { name: "audio", payload: { type: "object", properties: { audio: { type: "string", description: "Base64 audio." } } }, deprecated: true },
    },
    schemas: {
      Init: { type: "object", required: ["text"], properties: { text: { type: "string" }, settings: { $ref: "#/components/schemas/Settings" } } },
      Settings: { type: "object", properties: { stability: { type: "number" } } },
    },
  },
};

const v30 = {
  asyncapi: "3.0.0",
  info: { title: "Acme realtime", version: "2.0" },
  servers: { production: { host: "api.acme.test", protocol: "wss", pathname: "/v2" } },
  channels: {
    transcribe: {
      address: "/v1/transcribe/{lang}",
      title: "Realtime transcription",
      parameters: { lang: { description: "Language.", enum: ["en", "fr"], default: "en" } },
      bindings: { ws: { query: { type: "object", properties: { token: { type: "string" } } } } },
      messages: {
        AudioChunk: { $ref: "#/components/messages/AudioChunk" },
        Transcript: { name: "transcript", payload: { type: "object", properties: { text: { type: "string" } } } },
        Ping: { $ref: "#/components/messages/Ping" },
        Notes: { name: "notes", payload: { type: "string" } },
      },
    },
    empty: { address: "/v1/empty" },
  },
  operations: {
    // `receive`: the described application receives it, so a client sends it.
    sendAudio: {
      action: "receive",
      channel: { $ref: "#/channels/transcribe" },
      messages: [{ $ref: "#/channels/transcribe/messages/AudioChunk" }, { $ref: "#/channels/transcribe/messages/Ping" }],
      tags: [{ name: "speech" }],
    },
    // `send`: the described application sends it, so a client receives it.
    receiveTranscript: {
      action: "send",
      channel: { $ref: "#/channels/transcribe" },
      messages: [{ $ref: "#/channels/transcribe/messages/Transcript" }, { $ref: "#/channels/transcribe/messages/Ping" }],
    },
  },
  components: {
    messages: {
      AudioChunk: { name: "audio_chunk", payload: { type: "object", properties: { audio: { type: "string" } } }, examples: [{ payload: { audio: "AAAA" } }] },
      Ping: { name: "ping", payload: { type: "object" } },
    },
  },
};

const channel = (channels: AsyncChannel[], id: string) => {
  const c = channels.find((x) => x.id === id);
  assert.ok(c, `channel ${id}`);
  return c;
};
const sent = (c: AsyncChannel) => c.messages.filter((m) => m.direction === "send").map((m) => m.name);
const received = (c: AsyncChannel) => c.messages.filter((m) => m.direction === "receive").map((m) => m.name);

test("2.6: the handshake, its parameters and servers", () => {
  const doc = normalizeAsyncApi(v26);
  assert.deepEqual(doc.warnings, []);
  assert.equal(doc.version, "2.6.0");
  const c = channel(doc.channels, "/v1/speak/{voice_id}/stream");
  assert.equal(c.address, "/v1/speak/{voice_id}/stream");
  assert.equal(c.title, "Stream input");
  assert.equal(c.description, "Stream text in, audio out.");
  assert.deepEqual(c.servers, ["wss://api.acme.test", "wss://eu.api.acme.test"]);
  assert.deepEqual(c.parameters, [{ name: "voice_id", description: "Which voice.", schema: { type: "string" } }]);
  assert.deepEqual(Object.keys(c.query?.properties ?? {}), ["model_id", "inactivity_timeout"]);
  assert.equal(c.query?.properties?.inactivity_timeout.maximum, 180);
  assert.deepEqual(Object.keys(c.headers?.properties ?? {}), ["x-api-key"]);
  assert.deepEqual(c.tags, ["speech", "audio"]);
});

test("2.6: publish is what a client sends, subscribe what it receives", () => {
  const c = channel(normalizeAsyncApi(v26).channels, "/v1/speak/{voice_id}/stream");
  assert.deepEqual(sent(c), ["init", "send_text", "ping"]);
  // A message used both ways is listed once for each.
  assert.deepEqual(received(c), ["audio", "ping"]);
  // Shown as written: the document's labels decide, whatever the names suggest.
  assert.deepEqual(sent(channel(normalizeAsyncApi(v26).channels, "/v1/single")), []);
  assert.deepEqual(received(channel(normalizeAsyncApi(v26).channels, "/v1/single")), ["tick"]);
});

test("$refs resolve across messages, components and nested schemas", () => {
  const c = channel(normalizeAsyncApi(v26).channels, "/v1/speak/{voice_id}/stream");
  const init = c.messages.find((m) => m.name === "init")!;
  assert.equal(init.id, "Init");
  assert.equal(init.title, "Initialise");
  assert.deepEqual(init.payload?.required, ["text"]);
  assert.deepEqual(init.payload?.properties?.settings.properties?.stability, { type: "number" });
  assert.deepEqual(init.examples, [{ text: " " }]);
  const sendText = c.messages.find((m) => m.name === "send_text")!;
  assert.equal(sendText.payload?.properties?.settings.type, "object");
  assert.equal(c.messages.find((m) => m.name === "audio")!.deprecated, true);
});

test("a channel with no messages is still a channel", () => {
  const quiet = channel(normalizeAsyncApi(v26).channels, "/v1/quiet");
  assert.deepEqual(quiet.messages, []);
  assert.equal(quiet.description, "A channel with no messages.");
  const empty = channel(normalizeAsyncApi(v30).channels, "empty");
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.address, "/v1/empty");
});

test("3.0: operations reach channels by $ref, and action is read from the server's side", () => {
  const doc = normalizeAsyncApi(v30);
  assert.deepEqual(doc.warnings, []);
  const c = channel(doc.channels, "transcribe");
  assert.equal(c.address, "/v1/transcribe/{lang}");
  assert.equal(c.title, "Realtime transcription");
  assert.deepEqual(c.servers, ["wss://api.acme.test/v2"]);
  // `action: receive` → the client sends; `action: send` → the client receives.
  assert.deepEqual(sent(c), ["audio_chunk", "ping"]);
  assert.deepEqual(received(c), ["transcript", "ping"]);
  // A message no operation names: its direction isn't said, so it isn't guessed.
  assert.deepEqual(c.messages.filter((m) => m.direction === "unspecified").map((m) => m.name), ["notes"]);
  assert.deepEqual(c.messages.find((m) => m.name === "audio_chunk")!.examples, [{ audio: "AAAA" }]);
  assert.deepEqual(c.parameters, [{ name: "lang", description: "Language.", schema: { type: "string", enum: ["en", "fr"], default: "en" } }]);
  assert.deepEqual(Object.keys(c.query?.properties ?? {}), ["token"]);
  assert.deepEqual(c.tags, ["speech"]);
});

test("unknown, newer and missing versions warn and give no channels, without throwing", () => {
  for (const [input, says] of [
    [{ ...v26, asyncapi: "1.2.0" }, /AsyncAPI 1\.2\.0 isn't supported/],
    [{ ...v30, asyncapi: "3.1.0" }, /AsyncAPI 3\.1\.0 is newer than 3\.0/],
    [{ ...v26, asyncapi: undefined }, /has no "asyncapi" version/],
    [null, /has no "asyncapi" version/],
    ["not a document", /has no "asyncapi" version/],
  ] as const) {
    const doc = normalizeAsyncApi(input);
    assert.deepEqual(doc.channels, [], String(says));
    assert.match(doc.warnings.join("\n"), says);
  }
});

test("a $ref outside the document, to nothing, or in a loop is skipped with a warning", () => {
  const odd = {
    asyncapi: "2.6.0",
    info: { title: "t", version: "1" },
    channels: {
      "/a": { publish: { message: { oneOf: [{ $ref: "other.yaml#/Msg" }, { $ref: "#/components/messages/Missing" }, { $ref: "#/components/messages/Ok" }] } } },
      "/b": { $ref: "#/channels/~1b" },
    },
    components: {
      messages: { Ok: { name: "ok", payload: { $ref: "#/components/schemas/Node" } } },
      schemas: { Node: { type: "object", properties: { next: { $ref: "#/components/schemas/Node" } } } },
    },
  };
  const doc = normalizeAsyncApi(odd);
  assert.deepEqual(channel(doc.channels, "/a").messages.map((m) => m.name), ["ok"]);
  assert.deepEqual(doc.channels.map((c) => c.id), ["/a"]);
  const warnings = doc.warnings.join("\n");
  assert.match(warnings, /"other\.yaml#\/Msg" points outside the document/);
  assert.match(warnings, /"#\/components\/messages\/Missing" points at nothing/);
  assert.match(warnings, /"#\/channels\/~1b" refers back to itself/);
  // A recursive schema stops at the repeat instead of looping.
  const ok = channel(doc.channels, "/a").messages[0];
  assert.equal(ok.payload?.properties?.next.description, "(recursive)");
});

test("2.x: a channel is deprecated by itself, or by either of its operations", () => {
  const base = { asyncapi: "2.6.0", info: { title: "t", version: "1" } };
  const msg = { message: { name: "m", payload: { type: "string" } } };
  const doc = normalizeAsyncApi({
    ...base,
    channels: {
      "/own": { deprecated: true, publish: msg },
      "/pub": { publish: { ...msg, deprecated: true } },
      "/sub": { subscribe: { ...msg, deprecated: true } },
      "/live": { publish: msg, subscribe: msg },
    },
  });
  assert.deepEqual(
    doc.channels.map((c) => [c.id, c.deprecated ?? false]),
    [["/own", true], ["/pub", true], ["/sub", true], ["/live", false]],
  );
});
