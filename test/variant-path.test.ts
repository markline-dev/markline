import { test } from "node:test";
import assert from "node:assert/strict";
import { variantOf, variantPath, type Variants } from "../lib/variant-path.ts";

const locales: Variants = {
  kind: "locales",
  defaultId: "en",
  entries: [{ id: "en", label: "English" }, { id: "es", label: "Español" }, { id: "fr", label: "Français" }],
};
const versions: Variants = {
  kind: "versions",
  defaultId: "v2",
  entries: [{ id: "v2", label: "v2" }, { id: "v1", label: "v1" }],
};

test("variantOf reads the first segment, else the default", () => {
  assert.equal(variantOf("/es/billing", locales), "es");
  assert.equal(variantOf("/billing", locales), "en");
  assert.equal(variantOf("/", locales), "en");
  assert.equal(variantOf("/en/billing", locales), "en");
  assert.equal(variantOf("/esports", locales), "en");
});

test("variantPath moves a page between locales", () => {
  assert.equal(variantPath("/billing/plans", "es", locales), "/es/billing/plans");
  assert.equal(variantPath("/es/billing/plans", "fr", locales), "/fr/billing/plans");
  assert.equal(variantPath("/es/billing/plans", "en", locales), "/billing/plans");
  assert.equal(variantPath("/", "es", locales), "/es");
  assert.equal(variantPath("/es", "en", locales), "/");
  assert.equal(variantPath("/billing?x=1#plans", "es", locales), "/es/billing?x=1#plans");
});

test("the API reference has versions but no locales", () => {
  assert.equal(variantPath("/api-reference/payments", "es", locales), "/api-reference/payments");
  assert.equal(variantOf("/api-reference/v1/payments", versions), "v1");
  assert.equal(variantPath("/api-reference/payments", "v1", versions), "/api-reference/v1/payments");
  assert.equal(variantPath("/api-reference/v1/payments", "v2", versions), "/api-reference/payments");
  assert.equal(variantPath("/v1/quickstart", "v2", versions), "/quickstart");
});
