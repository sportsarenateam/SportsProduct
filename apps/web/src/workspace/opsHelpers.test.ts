import assert from "node:assert/strict";
import test from "node:test";
import {
  adjustCartQty,
  bookingAmount,
  cartItemsTotal,
  grandTotal,
  isValidMobile,
  sanitizeAmountInput,
  sanitizeMobileInput,
  upsertCartItem,
} from "./opsHelpers.ts";

test("mobile accepts exactly 10 digits", () => {
  assert.equal(isValidMobile("9876543210", true), true);
  assert.equal(isValidMobile("987654321", true), false);
  assert.equal(isValidMobile("98765432101", true), false);
  assert.equal(isValidMobile("", true), false);
  assert.equal(isValidMobile("", false), true);
});

test("mobile input strips non-digits and caps at 10", () => {
  assert.equal(sanitizeMobileInput("98a76b543210999"), "9876543210");
  assert.equal(sanitizeMobileInput("abc"), "");
});

test("amount input does not keep leading zeros", () => {
  assert.equal(sanitizeAmountInput("0500"), "500");
  assert.equal(sanitizeAmountInput(""), "");
  assert.equal(sanitizeAmountInput("12.5"), "12.5");
});

test("cart qty adjusts only the selected item", () => {
  let cart = upsertCartItem([], { id: "r1", name: "Badminton Racket", price: 50, category: "EQUIPMENT" }, 1);
  cart = upsertCartItem(cart, { id: "w1", name: "Water", price: 20, category: "BEVERAGE" }, 1);
  cart = upsertCartItem(cart, { id: "r1", name: "Badminton Racket", price: 50, category: "EQUIPMENT" }, 1);
  cart = adjustCartQty(cart, "r1", 1);
  assert.equal(cart.find((row) => row.itemId === "r1")?.quantity, 3);
  assert.equal(cart.find((row) => row.itemId === "w1")?.quantity, 1);
  cart = adjustCartQty(cart, "w1", -1);
  assert.equal(cart.some((row) => row.itemId === "w1"), false);
  assert.equal(cartItemsTotal(cart), 150);
});

test("booking amount uses selected courts only", () => {
  assert.equal(bookingAmount(400, 1.5, 0), 0);
  assert.equal(bookingAmount(400, 1.5, 2), 1200);
});

test("grand total never goes negative", () => {
  assert.equal(grandTotal(100, 50, 200, 0), 0);
  assert.equal(grandTotal(100, 50, 10, 20), 120);
});
