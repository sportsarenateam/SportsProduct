export type CartLine = {
  itemId: string | null;
  name: string;
  price: number;
  quantity: number;
  category: "EQUIPMENT" | "BEVERAGE";
};

export function mobileDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Indian mobile: exactly 10 digits, numbers only. Empty allowed only when not required. */
export function isValidMobile(value: string, required = false) {
  const digits = mobileDigits(value);
  if (!digits) return !required;
  return digits.length === 10;
}

export function sanitizeMobileInput(raw: string) {
  return mobileDigits(raw).slice(0, 10);
}

export function sanitizeAmountInput(raw: string) {
  const cleaned = raw.replace(/[^\d.]/g, "");
  if (!cleaned) return "";
  const [whole, ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  return rest.length ? `${normalizedWhole || "0"}.${decimals}` : normalizedWhole;
}

export function parseAmount(value: string) {
  if (!value.trim()) return NaN;
  return Number(value);
}

export function adjustCartQty(cart: CartLine[], itemId: string | null, delta: number): CartLine[] {
  return cart
    .map((row) => (row.itemId === itemId ? { ...row, quantity: row.quantity + delta } : row))
    .filter((row) => row.quantity > 0);
}

export function upsertCartItem(
  cart: CartLine[],
  item: { id: string; name: string; price: number; category: "EQUIPMENT" | "BEVERAGE" },
  delta = 1,
): CartLine[] {
  const existing = cart.find((row) => row.itemId === item.id);
  if (existing) return adjustCartQty(cart, item.id, delta);
  if (delta <= 0) return cart;
  return [...cart, {
    itemId: item.id,
    name: item.name,
    price: Number(item.price),
    quantity: delta,
    category: item.category,
  }];
}

export function cartLineTotal(item: CartLine) {
  return Number(item.price) * Number(item.quantity);
}

export function cartItemsTotal(cart: CartLine[]) {
  return cart.reduce((sum, item) => sum + cartLineTotal(item), 0);
}

export function bookingAmount(pricePerHour: number, hours: number, courtCount: number) {
  if (courtCount <= 0 || hours <= 0) return 0;
  return Number(pricePerHour) * hours * courtCount;
}

export function grandTotal(booking: number, items: number, discount = 0, advance = 0) {
  return Math.max(0, booking + items - discount - advance);
}

/** Shown under password fields (web + mobile). */
export const PASSWORD_HINT =
  "Min 8 characters, with at least 1 letter, 1 number, and 1 special character (!@#$…).";

/**
 * Strong password rules for set / reset / change password.
 * Throws a user-facing Error when invalid.
 */
export function assertPasswordStrength(password: string, confirm?: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (password.length > 72) throw new Error("Password must be 72 characters or fewer");
  if (!/[A-Za-z]/.test(password)) throw new Error("Password must include at least one letter");
  if (!/\d/.test(password)) throw new Error("Password must include at least one number");
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must include at least one special character (e.g. !@#$%)");
  }
  if (confirm !== undefined && password !== confirm) {
    throw new Error("Password and confirm password must match");
  }
}
