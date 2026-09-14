import assert from "node:assert/strict";
import test from "node:test";
import { calculateSessionTotal } from "./index.js";

test("calculates a one-and-a-half hour session precisely", () => {
  assert.equal(calculateSessionTotal("2026-07-30T10:00:00Z", "2026-07-30T11:30:00Z", 500), 750);
});

test("does not create a negative session total", () => {
  assert.equal(calculateSessionTotal("2026-07-30T11:00:00Z", "2026-07-30T10:00:00Z", 500), 0);
});
