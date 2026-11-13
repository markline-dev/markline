import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalizeAsyncApi, type AsyncChannel } from "../lib/asyncapi.ts";
import { attachChannels } from "../lib/asyncapi-attach.ts";

// Synthetic specs only: no third-party text.

const v2 = {
  asyncapi: "2.6.0",
  info: { title: "t", version: "1" },
  channels: {
    "/v1/speak/{voice_id}/stream-input": {
      publish: { summary: "publish", message: { $ref: "#/components/messages/ClientMessage" } },
      subscribe: { summary: "Subscribe", message: { name: "audio_out", payload: { type: "object", properties: { audio: { type: "string" } } } } },
    },
  },
  components: {
    messages: {
      ClientMessage: {
        name: "client",
        payload: { oneOf: [{ $ref: "#/components/schemas/InitStream" }, { title: "Send text", type: "object", properties: { text: { type: "string" } }, examples: [{ text: "hi" }] }, { type: "object", properties: { close: { type: "boolean" } } }] },
      },
    },
    schemas: {
      InitStream: { type: "object", properties: { voice: { type: "string" } }, example: { voice: "v" } },
    },
  },
};

const v3 = {
  asyncapi: "3.0.0",
  info: { title: "t", version: "1" },
  channels: { live: { address: "/v1/live", messages: { Up: { name: "up", payload: { type: "string" } }, Down: { name: "down", payload: { type: "string" } } } } },
  operations: {
    a: { action: "receive", channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Up" }] },
    b: { action: "send", channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Down" }], summary: "send" },
  },
};

const dirs = (c: AsyncChannel) => c.messages.map((m) => `${m.direction}:${m.name}`);

test("perspective: 'client' swaps send and receive in 2.x, and says so once", () => {
  const server = normalizeAsyncApi(v2);
  const client = normalizeAsyncApi(v2, { perspective: "client" });
  assert.deepEqual(server.warnings, []);
  assert.deepEqual(dirs(server.channels[0]), ["send:InitStream", "send:Send text", "send:Message 3", "receive:audio_out"]);
  assert.deepEqual(dirs(client.channels[0]), ["receive:InitStream", "receive:Send text", "receive:Message 3", "send:audio_out"]);
  assert.deepEqual(client.warnings, [`[markline] AsyncAPI 2.x read from the client's side (api.asyncapi.perspective is "client").`]);
});

test("perspective changes nothing in 3.0, and doesn't warn there", () => {
  const server = normalizeAsyncApi(v3);
  const client = normalizeAsyncApi(v3, { perspective: "client" });
  assert.deepEqual(dirs(server.channels[0]), ["send:up", "receive:down"]);
  assert.deepEqual(client.channels, server.channels);
  assert.deepEqual(client.warnings, []);
});

test("a oneOf payload is one message per member: title, then $ref key, then place", () => {
  const msgs = normalizeAsyncApi(v2).channels[0].messages.filter((m) => m.direction === "send");
  assert.deepEqual(msgs.map((m) => m.name), ["InitStream", "Send text", "Message 3"]);
  assert.deepEqual(msgs.map((m) => m.id), ["ClientMessage-InitStream", "ClientMessage-Send-text", "ClientMessage-Message-3"]);
  // Each keeps its own examples, `example` or `examples`.
  assert.deepEqual(msgs.map((m) => m.examples), [[{ voice: "v" }], [{ text: "hi" }], []]);
  assert.deepEqual(Object.keys(msgs[0].payload?.properties ?? {}), ["voice"]);
  assert.deepEqual(Object.keys(msgs[2].payload?.properties ?? {}), ["close"]);
});

test("a plain payload, or a oneOf beside properties, stays one message", () => {
  const doc = normalizeAsyncApi({
    asyncapi: "2.6.0",
    info: { title: "t", version: "1" },
    channels: { "/x": { publish: { message: { name: "mixed", payload: { type: "object", properties: { a: { type: "string" } }, oneOf: [{ required: ["a"] }] } } } } },
  });
  assert.deepEqual(doc.channels[0].messages.map((m) => m.name), ["mixed"]);
});

test("titles: keyword summaries don't count, so the address names the channel", () => {
  // Both summaries are keywords ("publish", "Subscribe"), so the last plain segment is used.
  assert.equal(normalizeAsyncApi(v2).channels[0].title, "Stream input");
  // 3.0: an operation summary of "send" doesn't count either.
  assert.equal(normalizeAsyncApi(v3).channels[0].title, "Live");
  const named = normalizeAsyncApi({ ...v2, channels: { "/v1/a/{id}": { "x-title": "Custom", publish: { summary: "SEND" } } } });
  assert.equal(named.channels[0].title, "Custom");
  const said = normalizeAsyncApi({ ...v2, channels: { "/v1/a/{id}": { publish: { summary: "Realtime feed" } } } });
  assert.equal(said.channels[0].title, "Realtime feed");
});

const ch = (address: string, tags: string[] = []): AsyncChannel => ({ id: address, address, tags, servers: [], parameters: [], messages: [] }) as AsyncChannel;
const where = (r: ReturnType<typeof attachChannels>) => ({
  byResource: Object.fromEntries([...r.byResource].map(([k, v]) => [k, v.map((c) => c.id)])),
  rest: r.rest.map((c) => c.id),
  hidden: r.hidden.map((c) => c.id),
});

test("attach: the longest shared run of segments wins, without versions or hosts", () => {
  const resources = [
    { name: "Voices", paths: ["/v1/voices", "/v1/voices/{voice_id}"] },
    { name: "Speech", paths: ["/v1/text-to-speech/{voice_id}", "/v1/text-to-speech/{voice_id}/stream"] },
    { name: "Agents", paths: ["/v2/agents"] },
  ];
  const got = where(
    attachChannels(
      [ch("/v1/text-to-speech/{id}/stream-input"), ch("/v1/convai/conversation"), ch("/v3/agents/live"), ch("/VOICES/{x}/watch"), ch("wss://api.acme.test/v1/voices?x=1")],
      resources,
    ),
  );
  assert.deepEqual(got, {
    // {param} matches {param} whatever the name; case doesn't matter; the version segment doesn't count.
    byResource: { Speech: ["/v1/text-to-speech/{id}/stream-input"], Agents: ["/v3/agents/live"], Voices: ["/VOICES/{x}/watch", "wss://api.acme.test/v1/voices?x=1"] },
    // Nothing shared: under "WebSockets". A full URL is compared without its host.
    rest: ["/v1/convai/conversation"],
    hidden: [],
  });
});

test("attach: a tie goes to the resource listed first, every time", () => {
  const a = { name: "A", paths: ["/v1/items/{id}"] };
  const b = { name: "B", paths: ["/v1/items/{id}"] };
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(where(attachChannels([ch("/v1/items/{id}/live")], [a, b])).byResource, { A: ["/v1/items/{id}/live"] });
    assert.deepEqual(where(attachChannels([ch("/v1/items/{id}/live")], [b, a])).byResource, { B: ["/v1/items/{id}/live"] });
  }
});

test("attach: tags win when they name a resource; all-hidden tags hide the channel", () => {
  const resources = [{ name: "Speech", paths: ["/v1/speech"] }, { name: "Realtime", paths: [] }];
  const rename: Record<string, string | null> = { rt: "Realtime", secret: null, gone: null };
  const got = where(
    attachChannels(
      [ch("/v1/speech/live", ["rt"]), ch("/v1/speech/x", ["secret"]), ch("/v1/speech/y", ["nope"]), ch("/v1/speech/z", ["gone", "rt"]), ch("/other", ["secret", "gone"])],
      resources,
      (t) => (t in rename ? rename[t] : t),
    ),
  );
  assert.deepEqual(got, {
    // An unknown tag falls back to the path; one hidden tag among others doesn't hide it.
    byResource: { Realtime: ["/v1/speech/live", "/v1/speech/z"], Speech: ["/v1/speech/y"] },
    rest: [],
    hidden: ["/v1/speech/x", "/other"],
  });
});

test("a channel's URL joins server and address with one slash", async () => {
  const { joinUrl } = await import("../lib/apiref-view.ts");
  assert.equal(joinUrl("wss://api.acme.test/", "/v1/live"), "wss://api.acme.test/v1/live");
  assert.equal(joinUrl("wss://api.acme.test", "v1/live"), "wss://api.acme.test/v1/live");
  assert.equal(joinUrl("wss://api.acme.test/v2", "/live"), "wss://api.acme.test/v2/live");
  assert.equal(joinUrl("", "/v1/live"), "/v1/live");
  assert.equal(joinUrl("wss://a.test", "wss://b.test/x"), "wss://b.test/x");
});
