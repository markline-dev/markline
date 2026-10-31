import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { allResponses, codeSamples, successResponse } from "../lib/openapi-codegen.ts";
import { normalize, type OpenAPIDoc, type OpenAPIOperation } from "../lib/openapi.ts";

// A small spec in the shape of ElevenLabs': a JSON text-to-speech call that
// returns audio, and a multipart speech-to-text upload. Both carry Fern's SDK
// naming extensions.
const raw = {
  info: { title: "ElevenLabs API", version: "1" },
  paths: {
    "/v1/text-to-speech/{voice_id}": {
      post: {
        operationId: "text_to_speech_full",
        tags: ["text-to-speech"],
        "x-fern-sdk-group-name": ["text_to_speech"],
        "x-fern-sdk-method-name": "convert",
        parameters: [{ name: "voice_id", in: "path", required: true, schema: { type: "string", examples: ["JBFqnCBsd6RMkjVDRZzb"] } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["text"],
                properties: {
                  text: { type: "string", examples: ["It's a test."] },
                  model_id: { type: "string", default: "eleven_multilingual_v2" },
                  seed: { anyOf: [{ type: "integer" }, { type: "null" }] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "The generated audio file", content: { "audio/mpeg": { schema: { type: "string", format: "binary" } } } },
          "422": { description: "Validation Error", content: { "application/json": { schema: { type: "object", properties: { detail: { type: "string" } } } } } },
        },
      },
    },
    "/v1/speech-to-text": {
      post: {
        operationId: "speech_to_text",
        tags: ["speech-to-text"],
        "x-fern-sdk-group-name": "speech_to_text",
        "x-fern-sdk-method-name": "convert",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["model_id"],
                properties: {
                  model_id: { type: "string", examples: ["scribe_v2"] },
                  file: { anyOf: [{ type: "string", format: "binary" }, { type: "null" }] },
                  language_code: { anyOf: [{ type: "string" }, { type: "null" }] },
                },
              },
            },
          },
        },
        responses: { "200": { description: "OK", content: { "application/json": { schema: { type: "object", properties: { text: { type: "string" } } } } } } },
      },
    },
    "/v1/forms": {
      post: {
        operationId: "submit_form",
        tags: ["forms"],
        requestBody: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: { type: "object", required: ["name"], properties: { name: { type: "string", example: "Ada Lovelace" } } },
            },
          },
        },
        responses: { "204": { description: "No Content" } },
      },
    },
    "/v1/conversations/{conversation_id}/audio": {
      get: {
        operationId: "get_audio",
        tags: ["conversations"],
        "x-fern-sdk-group-name": ["conversational_ai", "conversations", "audio"],
        "x-fern-sdk-method-name": "get",
        parameters: [{ name: "conversation_id", in: "path", required: true, schema: { type: "string", example: "c_1" } }],
        responses: { "200": { description: "Audio", content: { "audio/*": { schema: { type: "string", format: "binary" } } } } },
      },
    },
  },
};

const doc: OpenAPIDoc = normalize(raw);
const opById = (id: string): OpenAPIOperation => doc.operationsById[id];

function text(op: OpenAPIOperation, key: string, opts?: Parameters<typeof codeSamples>[5], root: unknown = raw): string {
  const rail = codeSamples(op, doc, root, "https://api.elevenlabs.io", ["curl", "node", "python", "go"], opts);
  const tab = rail.tabs.find((t) => t.key === key);
  assert.ok(tab, `expected a ${key} tab`);
  return tab.html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

test("normalize keeps the request body's media type and schema for non-JSON bodies", () => {
  assert.equal(opById("text_to_speech_full").requestBody?.contentType, "application/json");
  const stt = opById("speech_to_text").requestBody;
  assert.equal(stt?.contentType, "multipart/form-data");
  assert.ok(stt?.schema?.properties?.file);
  assert.equal(opById("submit_form").requestBody?.contentType, "application/x-www-form-urlencoded");
});

test("normalize keeps the response media type; only JSON responses carry a schema", () => {
  const [ok, err] = opById("text_to_speech_full").responses;
  assert.equal(ok.contentType, "audio/mpeg");
  assert.equal(ok.schema, undefined);
  assert.equal(err.contentType, "application/json");
  assert.ok(err.schema);
});

test("cURL sends a JSON body as JSON, shell-quoted", () => {
  const curl = text(opById("text_to_speech_full"), "curl");
  assert.match(curl, /^curl https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\/JBFqnCBsd6RMkjVDRZzb \\\n/);
  assert.match(curl, /-H "Content-Type: application\/json"/);
  // The apostrophe in the sample is escaped for the single-quoted shell word.
  assert.ok(curl.includes(`-d '{\n  "text": "It'\\''s a test."\n}'`), curl);
  assert.ok(!/-d text=/.test(curl));
});

test("cURL sends multipart bodies as -F fields and binary fields as @file", () => {
  const curl = text(opById("speech_to_text"), "curl");
  assert.match(curl, /-F model_id=scribe_v2/);
  assert.match(curl, /-F file=@path\/to\/file/);
  assert.ok(!curl.includes("Content-Type"), "curl writes the multipart boundary header itself");
  assert.ok(!curl.includes("-d "));
});

test("cURL sends urlencoded bodies with --data-urlencode", () => {
  const curl = text(opById("submit_form"), "curl");
  assert.match(curl, /--data-urlencode 'name=Ada Lovelace'/);
});

test("a POST without a body keeps -X POST", () => {
  const op = { ...opById("submit_form"), requestBody: undefined };
  assert.match(text(op, "curl"), /^curl -X POST /);
});

test("SDK calls use x-fern-sdk-group-name / x-fern-sdk-method-name, cased per language", () => {
  const tts = opById("text_to_speech_full");
  const node = text(tts, "js");
  const py = text(tts, "py");
  const go = text(tts, "go");
  assert.match(node, /await client\.textToSpeech\.convert\('JBFqnCBsd6RMkjVDRZzb', \{\n {2}text: 'It\\'s a test\.',\n\}\)$/);
  assert.match(py, /= client\.text_to_speech\.convert\(\n {4}voice_id="JBFqnCBsd6RMkjVDRZzb",\n {4}text="It's a test\.",\n\)$/);
  assert.match(go, /err := client\.TextToSpeech\.Convert\(ctx, "JBFqnCBsd6RMkjVDRZzb", &/);
  // Nested groups (an array) become a chain.
  const audio = opById("get_audio");
  assert.match(text(audio, "js"), /client\.conversationalAi\.conversations\.audio\.get\('c_1'\)$/);
  assert.match(text(audio, "py"), /client\.conversational_ai\.conversations\.audio\.get\(conversation_id="c_1"\)$/);
  assert.match(text(audio, "go"), /client\.ConversationalAi\.Conversations\.Audio\.Get\(ctx, "c_1"\)$/);
});

test("multipart SDK samples pass files as streams, not JSON strings", () => {
  const stt = opById("speech_to_text");
  assert.match(text(stt, "js"), /file: fs\.createReadStream\('path\/to\/file'\)/);
  assert.match(text(stt, "js"), /modelId: 'scribe_v2'/);
  assert.match(text(stt, "py"), /file=open\("path\/to\/file", "rb"\)/);
  const go = text(stt, "go");
  assert.match(go, /^file, _ := os\.Open\("path\/to\/file"\)\n/);
  assert.match(go, /File: file,/);
});

test("sdkNaming: off (or no Fern extensions) keeps the tag + verb naming", () => {
  const tts = opById("text_to_speech_full");
  assert.match(text(tts, "js", { sdkNaming: "off" }), /await elevenlabs\.texttospeech\.create\(/);
  assert.match(text(tts, "py", { sdkNaming: "off" }), /= elevenlabs\.texttospeech\.create\(/);
  assert.match(text(opById("submit_form"), "js"), /await elevenlabs\.forms\.create\(\{/);
});

test("a digit-leading Fern group or tag still yields a valid identifier", () => {
  const op: OpenAPIOperation = { ...opById("submit_form"), tag: "3d-models", path: "/v1/models3d", method: "get", requestBody: undefined };
  const root = { paths: { "/v1/models3d": { get: { "x-fern-sdk-group-name": "3d_models", "x-fern-sdk-method-name": "list" } } } };
  assert.match(text(op, "js", {}, root), /client\._3dModels\.list\(\)$/);
  assert.match(text(op, "py", {}, root), /client\._3d_models\.list\(\)$/);
  assert.match(text(op, "js", {}, {}), /elevenlabs\._3dmodels\.list\(\)$/);
});

test("an apiKey header scheme in the operation's security is sent by cURL", () => {
  const op: OpenAPIOperation = {
    ...opById("text_to_speech_full"),
    security: [{ name: "ApiKeyAuth", scheme: { type: "apiKey", in: "header", name: "xi-api-key" } }],
    parameters: { ...opById("text_to_speech_full").parameters, header: [{ name: "xi-api-key", in: "header", required: true }] },
  };
  const curl = text(op, "curl");
  assert.equal(curl.match(/xi-api-key/g)?.length, 1, "the header param of the same name is not repeated");
  assert.match(curl, /-H "xi-api-key: \$API_KEY"/);
  // SDK samples leave the key to client construction.
  assert.ok(!text(op, "js").includes("xi-api-key"));
});

test("binary 2xx responses get a panel naming their media type", () => {
  const tts = opById("text_to_speech_full");
  const rs = allResponses(tts, raw);
  assert.deepEqual(rs.map((r) => r.status), ["200", "422"]);
  const body = rs[0].html.replace(/<[^>]+>/g, "");
  assert.match(body, /Returns audio\/mpeg \(binary\)/);
  assert.match(body, /Content-Type: audio\/mpeg/);
  assert.equal(successResponse(tts, raw)?.status, "200");
  // A 204 with no body still has no panel.
  assert.deepEqual(allResponses(opById("submit_form"), raw), []);
});
