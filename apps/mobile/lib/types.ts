export type AppRole = "owner" | "manager" | "cashier";

export type Arena = {
  id: string;
  name: string;
  trial_ends_at: string | null;
  status: string;
  address?: string;
  pincode?: string;
  contactPhone?: string;
};

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

export type MobilePage =
  | "home"
  | "sales"
  | "booking"
  | "coaching"
  | "billing"
  | "invoice"
  | "menu"
  | "profile"
  | "sports"
  | "subscribe";
