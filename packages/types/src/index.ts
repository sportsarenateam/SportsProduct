export const bookingSources = ["walk_in", "membership", "turftown", "playo", "other_online"] as const;
export const paymentMethods = ["cash", "upi", "gpay", "card"] as const;
export const userRoles = ["owner", "manager", "cashier"] as const;
export const sessionStatuses = ["reserved", "checked_in", "completed", "cancelled", "no_show"] as const;
export const paymentStatuses = ["pending", "partial", "paid", "refunded", "void"] as const;

export type BookingSource = (typeof bookingSources)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type UserRole = (typeof userRoles)[number];
export type SessionStatus = (typeof sessionStatuses)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];

export interface PlaySessionInput {
  courtId: string;
  sportId: string;
  customerName?: string;
  bookingSource: BookingSource;
  startsAt: string;
  endsAt: string;
  hourlyRate: number;
  paymentMethod: PaymentMethod;
  paymentAmount: number;
  notes?: string;
}

export interface ExpenseInput {
  category: string;
  description: string;
  amount: number;
  expenseDate: string;
  paymentMethod?: PaymentMethod;
}

export interface SessionRecord extends PlaySessionInput {
  id: string;
  invoiceNumber: string;
  status: SessionStatus;
  total: number;
  balance: number;
  createdAt: string;
}

export interface DashboardSummary {
  revenue: number;
  expenses: number;
  outstanding: number;
  completedSessions: number;
}

export function calculateSessionTotal(startsAt: string, endsAt: string, hourlyRate: number): number {
  const hours = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
  return Math.max(0, Math.round(hours * hourlyRate * 100) / 100);
}

export function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
