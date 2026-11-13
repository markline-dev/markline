import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp, validIpHeader, validProxies } from "../lib/ai/client-ip";

// Which address the AI route's limits count a reader by.

const h = (o: Record<string, string>) => new Headers(o);

test("by default, the address the nearest proxy appended", () => {
  assert.equal(clientIp(h({ "x-forwarded-for": "203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.7" })), "203.0.113.7", "entries to its left aren't counted");
  assert.equal(clientIp(h({ "x-forwarded-for": " 2001:DB8::1 " })), "2001:db8::1");
});

test("trustedProxies counts that many entries from the right", () => {
  const headers = h({ "x-forwarded-for": "9.9.9.9, 203.0.113.7, 10.0.0.2" });
  assert.equal(clientIp(headers, { trustedProxies: 2 }), "203.0.113.7");
  assert.equal(clientIp(headers, { trustedProxies: 3 }), "9.9.9.9");
  assert.equal(clientIp(headers, { trustedProxies: 4 }), "unknown", "fewer entries than proxies");
});

test("ipHeader is read alone when set", () => {
  const headers = h({ "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": "203.0.113.7" });
  assert.equal(clientIp(headers, { ipHeader: "cf-connecting-ip" }), "203.0.113.7");
  assert.equal(clientIp(h({ "x-forwarded-for": "9.9.9.9" }), { ipHeader: "cf-connecting-ip" }), "unknown", "not x-forwarded-for instead");
});

test("no address at all is one shared bucket", () => {
  assert.equal(clientIp(h({})), "unknown");
  assert.equal(clientIp(h({ "x-forwarded-for": " , " })), "unknown");
});

test("ipHeader and trustedProxies take only sensible values", () => {
  assert.equal(validIpHeader("CF-Connecting-IP"), "cf-connecting-ip");
  for (const bad of ["host", "Cookie", "authorization", "x-forwarded-for", "a b", "", "x".repeat(65), 5]) assert.equal(validIpHeader(bad), undefined, String(bad));
  assert.equal(validProxies(2), 2);
  for (const bad of [0, 11, 1.5, "2", -1]) assert.equal(validProxies(bad), undefined, String(bad));
});
