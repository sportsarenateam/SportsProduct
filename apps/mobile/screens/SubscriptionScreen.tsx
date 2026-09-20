import { useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { WebView } from "react-native-webview";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import type { Arena } from "../lib/types";
import {
  BackHeader,
  Card,
  ErrorText,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from "../components/ui";
import { useTheme } from "../lib/theme";

type CheckoutPayload = {
  orderId: string;
  paymentSessionId: string;
  amountRupees?: number;
  amount?: number;
  currency: string;
  planName?: string;
  mode?: "test" | "live";
  env?: "sandbox" | "production";
};

export function SubscriptionScreen({
  session,
  arena,
  upgradingDuringTrial,
  onActivated,
  onDismiss,
}: {
  session: Session;
  arena: Arena;
  upgradingDuringTrial?: boolean;
  onActivated: (next: Partial<Arena>) => void;
  onDismiss?: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payMode, setPayMode] = useState<"test" | "live" | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const verifying = useRef(false);

  async function startCheckout() {
    setBusy(true);
    setError("");
    setPendingOrderId(null);
    try {
      const checkout = await opsRequest<CheckoutPayload>(session, arena.id, "/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: "basic" }),
      });
      if (!checkout.orderId || !checkout.paymentSessionId) {
        throw new Error("Checkout did not return a Cashfree order");
      }
      if (checkout.mode) setPayMode(checkout.mode);
      setPendingOrderId(checkout.orderId);
      setCheckoutHtml(buildCheckoutHtml(checkout));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start payment");
      setBusy(false);
    }
  }

  async function verifyOrder(orderId: string, allowPending = true) {
    if (verifying.current) return;
    verifying.current = true;
    setBusy(true);
    setError("");
    try {
      const delays = allowPending ? [0, 2000, 4000, 6000] : [0];
      let lastError = "Payment not completed yet";
      for (const wait of delays) {
        if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
        try {
          const verified = await opsRequest<{ status: string; periodEndsAt?: string }>(
            session,
            arena.id,
            "/subscriptions/verify",
            {
              method: "POST",
              body: JSON.stringify({ orderId }),
            },
          );
          setCheckoutHtml(null);
          setPendingOrderId(null);
          onActivated({
            status: verified.status ?? "active",
            current_period_ends_at: verified.periodEndsAt ?? null,
          });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : "Payment verify failed";
          if (!/not completed|PENDING|ACTIVE|UNKNOWN|timed out/i.test(lastError)) {
            throw err;
          }
        }
      }
      setCheckoutHtml(null);
      setError(formatPaymentPendingMessage(lastError));
    } catch (err) {
      setCheckoutHtml(null);
      setError(err instanceof Error ? err.message : "Payment verify failed");
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  async function onWebMessage(raw: string) {
    let payload: { type: string; orderId?: string; description?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    if (payload.type === "dismiss" || payload.type === "failed") {
      setCheckoutHtml(null);
      setBusy(false);
      if (payload.type === "failed") {
        setError(payload.description ?? "Payment failed. Try UPI, card, or netbanking.");
      }
      return;
    }

    // Cashfree often resolves when the sheet closes — not when money is captured.
    if (payload.type === "checkout_closed" || payload.type === "success") {
      const orderId = payload.orderId || pendingOrderId;
      if (!orderId) {
        setCheckoutHtml(null);
        setBusy(false);
        setError("Payment window closed. Start checkout again, or tap check status if you already paid.");
        return;
      }
      await verifyOrder(orderId, true);
    }
  }

  if (checkoutHtml) {
    return (
      <View style={{ flex: 1, backgroundColor: themeColors.bg }}>
        <View style={{ padding: 16, paddingBottom: 8, gap: 8 }}>
          <Muted>Complete the Cashfree sandbox payment (test mode — no real money).</Muted>
          <Muted>When you finish or close the sheet, we confirm with the server.</Muted>
          <PrimaryButton
            label="Close checkout"
            onPress={() => {
              setCheckoutHtml(null);
              setBusy(false);
            }}
          />
        </View>
        <WebView
          originWhitelist={["*"]}
          source={{ html: checkoutHtml, baseUrl: "https://sdk.cashfree.com" }}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(event) => {
            void onWebMessage(event.nativeEvent.data);
          }}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <Screen>
      {onDismiss ? <BackHeader title="Subscribe" onBack={onDismiss} /> : null}
      <Card>
        <Muted>
          {upgradingDuringTrial
            ? (["active", "authenticated"].includes(arena.status) ? "Renew anytime" : "Upgrade anytime")
            : "Subscription required"}
        </Muted>
        <Title>
          {upgradingDuringTrial
            ? (["active", "authenticated"].includes(arena.status)
              ? "Renew SportzArena for your arena"
              : "Unlock SportzArena for your arena")
            : "Subscribe to keep your arena open"}
        </Title>
        <Muted>
          {upgradingDuringTrial
            ? `${arena.name} stays fully online after payment — bookings, invoices, coaching and sales in one place.`
            : `Access for ${arena.name} is paused. Pay ₹499/month to restore bookings and billing for your staff.`}
        </Muted>
        <Muted>Starter · ₹499/mo · UPI, card, or netbanking</Muted>
        <Muted>
          Current status: {arena.status}
          {arena.status === "trialing"
            ? " (trial — app works until trial ends; payment not required yet)"
            : ""}
          {arena.status === "active" ? " (marked paid / activated)" : ""}
        </Muted>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={busy && !pendingOrderId ? "Opening secure checkout…" : (
            ["active", "authenticated"].includes(arena.status) && upgradingDuringTrial
              ? "Renew ₹499 securely"
              : "Pay ₹499 securely"
          )}
          busy={busy && !pendingOrderId}
          onPress={startCheckout}
        />
        {pendingOrderId ? (
          <PrimaryButton
            label={busy ? "Checking Cashfree…" : "I finished payment — check status"}
            busy={busy}
            onPress={() => {
              void verifyOrder(pendingOrderId, true);
            }}
          />
        ) : null}
        <Muted>
          Secured by Cashfree
          {payMode === "test" ? " · Test mode (no real charge)" : payMode === "live" ? " · Live payments" : ""}
          . Test keys do not auto-succeed — finish the Cashfree sandbox payment (test card / UPI).
        </Muted>
        {onDismiss ? (
          <LinkButton
            label={
              ["active", "authenticated"].includes(arena.status)
                ? "Not now — keep using plan →"
                : "Not now — keep using trial →"
            }
            onPress={onDismiss}
          />
        ) : null}
        {!onDismiss && busy ? (
          <View style={{ marginTop: 8 }}>
            <ActivityIndicator color={themeColors.green} />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function buildCheckoutHtml(checkout: CheckoutPayload) {
  const safe = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
  const mode = checkout.env === "production" ? "production" : "sandbox";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body{font-family:system-ui;padding:24px;color:#082b55;background:#f3f7fb}</style>
</head>
<body>
  <p>Loading Cashfree payment…</p>
  <script src="https://sdk.cashfree.com/js/v3/cashfree.js"></script>
  <script>
    (function () {
      function post(payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }
      try {
        var cashfree = Cashfree({ mode: '${mode}' });
        cashfree.checkout({
          paymentSessionId: '${safe(checkout.paymentSessionId)}',
          redirectTarget: '_modal'
        }).then(function (result) {
          if (result && result.error) {
            post({ type: 'failed', description: result.error.message || 'Payment failed' });
            return;
          }
          // Native side confirms with /subscriptions/verify — do not assume paid here.
          post({ type: 'checkout_closed', orderId: '${safe(checkout.orderId)}' });
        }).catch(function (err) {
          post({ type: 'failed', description: (err && err.message) || 'Payment failed' });
        });
      } catch (err) {
        post({ type: 'failed', description: (err && err.message) || 'Unable to open Cashfree' });
      }
    })();
  </script>
</body>
</html>`;
}

/** Keep Cashfree status visible, e.g. "Payment not completed yet (status: ACTIVE)". */
function formatPaymentPendingMessage(raw: string) {
  const text = String(raw || "").trim();
  const statusMatch = text.match(/status:\s*([A-Za-z0-9_]+)/i);
  const status = (statusMatch?.[1] || "UNKNOWN").toUpperCase();

  const hint = status === "ACTIVE"
    ? "ACTIVE = order created, payment not paid yet. Finish Cashfree checkout, then tap check status."
    : status === "PENDING"
      ? "PENDING = Cashfree is still processing. Wait, then tap check status."
      : status === "EXPIRED"
        ? "EXPIRED = checkout timed out. Start a new payment."
        : status === "FAILED" || status === "CANCELLED"
          ? "Payment did not succeed. Try again."
          : "If Cashfree showed success, tap “I finished payment — check status”.";

  // Always show this exact first line with the real Cashfree value.
  return `Payment not completed yet (status: ${status})\n\n${hint}`;
}
