export type CashfreeEnv = "sandbox" | "production";

const API_VERSION = "2023-08-01";

export function cashfreeBaseUrl(env: CashfreeEnv) {
  return env === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

export function cashfreeModeLabel(env: CashfreeEnv): "test" | "live" {
  return env === "production" ? "live" : "test";
}

type CashfreeConfig = {
  appId: string;
  secretKey: string;
  env: CashfreeEnv;
};

async function cashfreeFetch<T>(
  config: CashfreeConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${cashfreeBaseUrl(config.env)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-api-version": API_VERSION,
      "x-client-id": config.appId,
      "x-client-secret": config.secretKey,
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as T & {
    message?: string;
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const detail = typeof body.error === "string"
      ? body.error
      : body.error?.message ?? body.message ?? `Cashfree request failed (${response.status})`;
    throw new Error(detail);
  }
  return body as T;
}

export async function createCashfreeOrder(
  config: CashfreeConfig,
  input: {
    orderId: string;
    amount: number;
    customerId: string;
    customerEmail: string;
    customerPhone: string;
    returnUrl: string;
    tags?: Record<string, string>;
  },
) {
  return cashfreeFetch<{
    order_id: string;
    payment_session_id: string;
    order_status?: string;
  }>(config, "/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: input.amount,
      order_currency: "INR",
      customer_details: {
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: {
        return_url: input.returnUrl,
      },
      order_tags: input.tags,
    }),
  });
}

export async function getCashfreeOrder(config: CashfreeConfig, orderId: string) {
  return cashfreeFetch<{
    order_id: string;
    order_status: string;
    order_amount?: number;
    order_currency?: string;
  }>(config, `/orders/${encodeURIComponent(orderId)}`);
}

export async function getCashfreePayments(config: CashfreeConfig, orderId: string) {
  return cashfreeFetch<Array<{
    cf_payment_id?: string | number;
    payment_status?: string;
    payment_amount?: number;
  }>>(config, `/orders/${encodeURIComponent(orderId)}/payments`);
}
