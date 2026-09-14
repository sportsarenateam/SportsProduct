import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import {
  isValidMobile,
  mobileDigits,
  parseAmount,
  sanitizeAmountInput,
  sanitizeMobileInput,
} from "../lib/opsHelpers";
import type { SportConfig } from "../lib/types";
import {
  BackHeader,
  Card,
  Chip,
  ErrorText,
  Field,
  Label,
  Muted,
  PrimaryButton,
  Screen,
} from "../components/ui";

export function MembershipScreen({
  session,
  arenaId,
  sports,
  onBack,
}: {
  session: Session;
  arenaId: string;
  sports: SportConfig[];
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [timing, setTiming] = useState("1 Hour");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseAmount(amount);

  async function load() {
    const data = await opsRequest<{ entries: any[] }>(session, arenaId, "/ops/membership-billing");
    setEntries(data.entries);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [session.access_token, arenaId]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (!isValidMobile(customerMobile, true)) throw new Error("Enter a valid 10-digit mobile number");
      if (!Number.isFinite(amountNum) || amountNum <= 0) throw new Error("Enter an amount greater than 0");
      await opsRequest(session, arenaId, "/ops/membership-billing", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerMobile: mobileDigits(customerMobile),
          sportName: selectedSports.join(", "),
          timing,
          bookingMethod: "WALK_IN",
          amount: amountNum,
          paymentMode,
          items: [],
        }),
      });
      setCustomerName("");
      setCustomerMobile("");
      setSelectedSports([]);
      setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackHeader title="Membership" onBack={onBack} />
      <Card>
        <Label>Customer</Label>
        <Field value={customerName} onChangeText={setCustomerName} />
        <Label>Mobile</Label>
        <Field
          keyboardType="number-pad"
          maxLength={10}
          value={customerMobile}
          onChangeText={(v) => setCustomerMobile(sanitizeMobileInput(v))}
        />
        <Label>Timings</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["1 Hour", "1.5 Hours", "2 Hours", "3 Hours", "4 Hours"].map((t) => (
            <Chip key={t} label={t} active={timing === t} onPress={() => setTiming(t)} />
          ))}
        </View>
        <Label>Amount</Label>
        <Field keyboardType="decimal-pad" value={amount} onChangeText={(v) => setAmount(sanitizeAmountInput(v))} />
        <Label>Payment</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["CASH", "ONLINE"].map((m) => (
            <Chip key={m} label={m} active={paymentMode === m} onPress={() => setPaymentMode(m)} />
          ))}
        </View>
        <Label>Sports (optional)</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {sports.map((sport) => (
            <Chip
              key={sport.id}
              label={sport.name}
              active={selectedSports.includes(sport.name)}
              onPress={() => setSelectedSports((cur) =>
                cur.includes(sport.name) ? cur.filter((n) => n !== sport.name) : [...cur, sport.name],
              )}
            />
          ))}
        </View>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={`Save membership ₹${Number.isFinite(amountNum) ? amountNum.toFixed(0) : "0"}`}
          busy={busy}
          onPress={save}
        />
      </Card>

      <Card>
        <Label>Recent</Label>
        {entries.length === 0 && <Muted>No membership bills yet.</Muted>}
        {entries.slice(0, 20).map((entry) => (
          <View key={entry.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }}>
            <Text style={{ fontWeight: "700" }}>{entry.customer_name} · #{entry.bill_number}</Text>
            <Muted>{entry.timing} · ₹{Number(entry.amount).toFixed(0)}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
