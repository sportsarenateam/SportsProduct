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
  colors,
} from "../components/ui";

type CheckoutPayload = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  planName: string;
  mode?: "test" | "live";
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payMode, setPayMode] = useState<"test" | "live" | null>(null);
  const [checkoutHtml, setCheckoutHtml] = useState<string | null>(null);
  const verifying = useRef(false);

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const checkout = await opsRequest<CheckoutPayload>(session, arena.id, "/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: "basic" }),
      });
      if (checkout.mode) setPayMode(checkout.mode);
      setCheckoutHtml(buildCheckoutHtml({
        checkout,
        arenaName: arena.name,
        email: session.user.email ?? "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start payment");
      setBusy(false);
    }
  }

  async function onWebMessage(raw: string) {
    let payload: {
      type: string;
      paymentId?: string;
      orderId?: string;
      signature?: string;
      description?: string;
    };
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

    if (payload.type !== "success" || verifying.current) return;
    verifying.current = true;
    try {
      const verified = await opsRequest<{ status: string; periodEndsAt?: string }>(
        session,
        arena.id,
        "/subscriptions/verify",
        {
          method: "POST",
          body: JSON.stringify({
            paymentId: payload.paymentId,
            orderId: payload.orderId,
            signature: payload.signature,
          }),
        },
      );
      setCheckoutHtml(null);
      onActivated({ status: verified.status ?? "active" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment verify failed");
      setCheckoutHtml(null);
    } finally {
      verifying.current = false;
      setBusy(false);
    }
  }

  if (checkoutHtml) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ padding: 16, paddingBottom: 8 }}>
          <Muted>Opening Razorpay checkout…</Muted>
        </View>
        <WebView
          originWhitelist={["*"]}
          source={{ html: checkoutHtml, baseUrl: "https://checkout.razorpay.com" }}
          javaScriptEnabled
          domStorageEnabled
          onMessage={(event) => onWebMessage(event.nativeEvent.data)}
          style={{ flex: 1 }}
        />
      </View>
    );
  }

  return (
    <Screen>
      {onDismiss ? <BackHeader title="Subscribe" onBack={onDismiss} /> : null}
      <Card>
        <Muted>{upgradingDuringTrial ? "Upgrade anytime" : "Trial ended"}</Muted>
        <Title>
          {upgradingDuringTrial
            ? "Unlock SportzArena for your arena"
            : "Subscribe to keep your arena open"}
        </Title>
        <Muted>
          {upgradingDuringTrial
            ? `${arena.name} stays fully online after payment — bookings, invoices, coaching and sales in one place.`
            : `Your free trial for ${arena.name} has ended. Pay ₹499/month to restore access for your staff and customers.`}
        </Muted>
        <Muted>Starter · ₹499/mo · UPI, card, or netbanking</Muted>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={busy ? "Opening secure checkout…" : "Pay ₹499 securely"}
          busy={busy}
          onPress={startCheckout}
        />
        <Muted>
          Secured by Razorpay
          {payMode === "test" ? " · Test mode (no real charge)" : payMode === "live" ? " · Live payments" : ""}
          . After payment your arena unlocks immediately.
        </Muted>
        {onDismiss ? (
          <LinkButton label="Not now — keep using trial →" onPress={onDismiss} />
        ) : null}
        {!onDismiss ? (
          <View style={{ marginTop: 8 }}>
            {busy ? <ActivityIndicator color={colors.green} /> : null}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

function buildCheckoutHtml({
  checkout,
  arenaName,
  email,
}: {
  checkout: CheckoutPayload;
  arenaName: string;
  email: string;
}) {
  const safe = (value: string) => value.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body{font-family:system-ui;padding:24px;color:#082b55;background:#f3f7fb}</style>
</head>
<body>
  <p>Loading payment…</p>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    (function () {
      function post(payload) {
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      }
      var options = {
        key: '${safe(checkout.keyId)}',
        amount: ${Number(checkout.amount)},
        currency: '${safe(checkout.currency)}',
        order_id: '${safe(checkout.orderId)}',
        name: 'SportzArena',
        description: '${safe(checkout.planName)} · monthly subscription',
        prefill: {
          name: '${safe(arenaName)}',
          email: '${safe(email)}'
        },
        theme: { color: '#082b55' },
        method: { upi: true, card: true, netbanking: true, wallet: true },
        handler: function (response) {
          post({
            type: 'success',
            paymentId: response.razorpay_payment_id,
            orderId: response.razorpay_order_id,
            signature: response.razorpay_signature
          });
        },
        modal: {
          ondismiss: function () { post({ type: 'dismiss' }); }
        }
      };
      var rzp = new Razorpay(options);
      rzp.on('payment.failed', function (response) {
        post({
          type: 'failed',
          description: (response && response.error && response.error.description) || 'Payment failed'
        });
      });
      rzp.open();
    })();
  </script>
</body>
</html>`;
}
