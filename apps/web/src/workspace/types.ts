export type PaymentMode = "CASH" | "ONLINE" | "SPLIT";
export type BookingMethod = "WALK_IN" | "PLAYO" | "TURF_TOWN" | "OFFLINE";

export type InventoryItem = {
  id: string;
  name: string;
  category: "EQUIPMENT" | "BEVERAGE";
  price: number;
  stock: number;
};

export type SportConfig = {
  id: string;
  name: string;
  pricePerHour: number;
  courts: Array<{ id: string; name: string }>;
};

export type CartItem = {
  itemId: string | null;
  name: string;
  price: number;
  quantity: number;
  category: "EQUIPMENT" | "BEVERAGE";
};

export type WorkspacePage = "home" | "sales" | "coaching" | "billing" | "menu" | "booking" | "invoice" | "profile";

/** DB roles: owner = arena creator; manager = staff (ops without Sales Report). */
export type AppRole = "owner" | "manager" | "cashier";
