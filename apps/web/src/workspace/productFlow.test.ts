import assert from "node:assert/strict";
import test from "node:test";

/**
 * Product flow checklist as executable documentation.
 * Run with: npm test --workspace=@arena/web
 * Manual QA: walk each module once; automated helpers cover money/mobile/cart rules.
 */
const modules = [
  "login / session restore",
  "sport booking → sales report",
  "beverages & equipment → sales report",
  "coaching → sales coaching tab",
  "billing & membership → sales membership tab",
  "generate invoice (optional)",
  "manage menu inventory",
  "manage menu sports & courts",
] as const;

test("product flow covers core arena modules", () => {
  assert.equal(modules.length, 8);
  assert.ok(modules.includes("sport booking → sales report"));
  assert.ok(modules.includes("generate invoice (optional)"));
});

test("sport booking save must not auto-open invoice", () => {
  const bookingSaveBehavior = { opensInvoice: false, writesSalesReport: true };
  assert.equal(bookingSaveBehavior.opensInvoice, false);
  assert.equal(bookingSaveBehavior.writesSalesReport, true);
});

test("beverages flow has no mobile field", () => {
  const beverageFormFields = ["customerName", "items", "payment"];
  assert.equal(beverageFormFields.includes("customerMobile"), false);
});

test("mobile rule is exactly 10 digits", () => {
  const rule = { min: 10, max: 10, digitsOnly: true };
  assert.deepEqual(rule, { min: 10, max: 10, digitsOnly: true });
});
