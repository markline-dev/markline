import { test } from "node:test";
import assert from "node:assert/strict";
import { eventAnchor, mergeTagEvents, parseOperationEvents, parseWebhooks, parseXEvents } from "../lib/openapi-events.ts";

/** A raw operation that emits two events via the `x-events` map (one name-only). */
const CREATE_PAYMENT = {
  operationId: "createPayment",
  tags: ["Payments"],
  "x-events": {
    "payment.succeeded": { summary: "Succeeded", payload: { type: "object", properties: { id: { type: "string" } } } },
    "payment.failed": {}, // name-only reference
  },
};

/** A raw operation that emits via a standard `callbacks` block. */
const CREATE_SUBSCRIPTION = {
  operationId: "createSubscription",
  tags: ["Subscriptions"],
  callbacks: {
    "invoice.paid": {
      "{$request.body#/url}": {
        post: {
          summary: "Invoice paid",
          requestBody: { content: { "application/json": { schema: { type: "object", properties: { amount: { type: "integer" } } } } } },
        },
      },
    },
  },
};

test("eventAnchor makes a DOM-safe id", () => {
  assert.equal(eventAnchor("payment.succeeded"), "event-payment-succeeded");
  assert.equal(eventAnchor("invoice.paid"), "event-invoice-paid");
});

test("parseOperationEvents: x-events map (incl. name-only) inherits op tags", () => {
  const events = parseOperationEvents(CREATE_PAYMENT, {});
  const names = events.map((e) => e.name).sort();
  assert.deepEqual(names, ["payment.failed", "payment.succeeded"]);
  const succeeded = events.find((e) => e.name === "payment.succeeded");
  assert.equal(succeeded?.summary, "Succeeded");
  assert.deepEqual(succeeded?.tags, ["Payments"]);
  assert.ok(succeeded?.payloadSchema, "map form carries a (raw) payload schema");
  const failed = events.find((e) => e.name === "payment.failed");
  assert.equal(failed?.payloadSchema, undefined, "name-only form has no payload");
});

test("parseOperationEvents: x-events as an array of names", () => {
  const events = parseOperationEvents({ tags: ["Cards"], "x-events": ["card.created", "card.frozen"] }, {});
  assert.deepEqual(events.map((e) => e.name), ["card.created", "card.frozen"]);
  assert.deepEqual(events[0].tags, ["Cards"]);
});

test("parseOperationEvents: callbacks become events with the requestBody as payload", () => {
  const events = parseOperationEvents(CREATE_SUBSCRIPTION, {});
  assert.deepEqual(events.map((e) => e.name), ["invoice.paid"]);
  assert.equal(events[0].summary, "Invoice paid");
  assert.ok(events[0].payloadSchema, "callback requestBody is the payload");
  assert.deepEqual(events[0].tags, ["Subscriptions"], "callback inherits the op's tags");
});

test("parseWebhooks: root `webhooks` (3.1) and `x-webhooks` (Redoc), with their own tags", () => {
  const wh = {
    post: { summary: "Account updated", tags: ["Payments"], requestBody: { content: { "application/json": { schema: { type: "object" } } } } },
  };
  assert.deepEqual(parseWebhooks({ webhooks: { "account.updated": wh } }).map((e) => e.name), ["account.updated"]);
  const fromX = parseWebhooks({ "x-webhooks": { "account.updated": wh } });
  assert.deepEqual(fromX[0].tags, ["Payments"]);
  assert.ok(fromX[0].payloadSchema);
});

test("parseWebhooks: $ref pathItems resolve against the root", () => {
  const root = {
    "x-webhooks": { "card.created": { $ref: "#/components/pathItems/CardCreated" } },
    components: { pathItems: { CardCreated: { post: { summary: "Card created", tags: ["Cards"] } } } },
  };
  const wh = parseWebhooks(root);
  assert.deepEqual(wh.map((e) => e.name), ["card.created"]);
  assert.equal(wh[0].summary, "Card created");
});

test("parseXEvents (tag-level): no inherited tags, carries summary + guide", () => {
  const events = parseXEvents({ "payment.refunded": { summary: "Refunded", guide: "/guides/refunds" } });
  assert.deepEqual(events[0].tags, []);
  assert.equal(events[0].summary, "Refunded");
  assert.equal(events[0].guideHref, "/guides/refunds");
});

test("mergeTagEvents: tag-level + per-op events dedupe by name and sort", () => {
  const tagEvents = parseXEvents({ "payment.refunded": { summary: "Refunded" } });
  const ops = [{ ...CREATE_PAYMENT, events: parseOperationEvents(CREATE_PAYMENT, {}) }] as any;
  const merged = mergeTagEvents(ops, tagEvents);
  assert.deepEqual(merged.map((e) => e.name), ["payment.failed", "payment.refunded", "payment.succeeded"]);
});

test("no events in → empty arrays out (never fabricates demo data)", () => {
  assert.deepEqual(parseWebhooks({ info: {}, paths: {} }), []);
  assert.deepEqual(parseOperationEvents({ tags: ["X"], responses: {} }, {}), []);
  assert.deepEqual(parseXEvents(undefined), []);
});
