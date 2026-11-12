import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { codeSamples } from "../lib/openapi-codegen.ts";
import { normalize } from "../lib/openapi.ts";
import { safeBlobType } from "../lib/openapi-media.ts";

// One call with nested objects: a declared object, a $ref'd one, a free-form map,
// an array of objects, and a required object, so each sample has to choose.
const raw = {
  info: { title: "Acme", version: "1" },
  components: {
    schemas: {
      VoiceSettings: { type: "object", properties: { similarity_boost: { type: "number", example: 1 }, use_speaker_boost: { type: "boolean" } } },
    },
  },
  paths: {
    "/v1/speak": {
      post: {
        operationId: "speak",
        tags: ["speech"],
        "x-fern-sdk-group-name": "speech",
        "x-fern-sdk-method-name": "speak",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["model_id", "voice_settings"],
                properties: {
                  model_id: { type: "string", example: "eleven_v3" },
                  voice_settings: { $ref: "#/components/schemas/VoiceSettings" },
                  labels: { type: "object", additionalProperties: { type: "string" }, example: { my_label: "x", other_one: "y" } },
                  segments: { type: "array", items: { type: "object", properties: { start_time: { type: "number", example: 0 } } } },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK" } },
      },
    },
  },
};

const doc = normalize(raw);
const tab = (key: string, opts?: Parameters<typeof codeSamples>[5]) =>
  codeSamples(doc.operationsById.speak, doc, raw, "https://api.acme.test", ["node", "python", "go"], opts)
    .tabs.find((t) => t.key === key)!
    .html.replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");

test("Fern Node samples camelCase declared keys at every depth, and leave a map's keys alone", () => {
  const node = tab("js");
  assert.match(node, /modelId: 'eleven_v3'/);
  assert.match(node, /voiceSettings: \{ similarityBoost: 1, useSpeakerBoost: false \}/, "a $ref'd object's own keys");
  assert.match(node, /labels: \{ my_label: 'x', other_one: 'y' \}/, "a free-form map keeps its keys");
  assert.match(node, /segments: \[\{ startTime: 0 \}\]/, "an array's object items too");
  assert.doesNotMatch(node, /similarity_boost|start_time|use_speaker_boost/);
});

test("without Fern names, and in Python, keys stay as the spec writes them", () => {
  const plain = tab("js", { sdkNaming: "off" });
  assert.match(plain, /voice_settings: \{ similarity_boost: 1/);
  assert.match(tab("py"), /"similarity_boost": 1/);
});

test("Go leaves out an optional object, and marks a required one for the reader", () => {
  const go = tab("go");
  assert.match(go, /ModelId: acme\.String\("eleven_v3"\),/);
  assert.match(go, /\/\/ VoiceSettings: required; see the API reference/);
  assert.doesNotMatch(go, /nil,/, "no field set to nil");
  assert.doesNotMatch(go, /Labels|Segments/, "optional objects and arrays are left out");
});

test("only known audio types play; anything else under audio/ downloads", () => {
  for (const ct of ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/webm", "audio/x-m4a"]) assert.equal(safeBlobType(ct), ct);
  for (const ct of ["audio/x-html", "audio/x-anything", "audio/svg+xml", "audio/javascript"]) {
    assert.equal(safeBlobType(ct), "application/octet-stream", ct);
  }
});
