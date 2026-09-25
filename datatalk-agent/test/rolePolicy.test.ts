import assert from "node:assert/strict";
import { test } from "node:test";
import { enforceRolePolicy, isProbablyMultiStatement, normalizeRole } from "../src/rolePolicy.ts";

test("normalizeRole defaults unknown values to user", () => {
  assert.equal(normalizeRole("admin"), "admin");
  assert.equal(normalizeRole("nope"), "user");
  assert.equal(normalizeRole(undefined), "user");
});

test("user role rejects DELETE and accepts SELECT", () => {
  assert.doesNotThrow(() => enforceRolePolicy("SELECT 1", "user"));
  assert.throws(() => enforceRolePolicy("DELETE FROM analytics.events", "user"), /forbidden|read-only/i);
});

test("KNOWN DEFECT S1: admin role currently skips SQL policy", () => {
  // Desired: admin is not a client-chosen bypass. Current: admin returns early.
  assert.doesNotThrow(() => enforceRolePolicy("DELETE FROM analytics.events", "admin"));
});

test("multi-statement detection", () => {
  assert.equal(isProbablyMultiStatement("SELECT 1"), false);
  assert.equal(isProbablyMultiStatement("SELECT 1;"), false);
  assert.equal(isProbablyMultiStatement("SELECT 1; DELETE FROM t"), true);
});
