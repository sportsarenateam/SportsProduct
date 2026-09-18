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
  const today = new Date().toISOString().slice(0, 10);
  const [entries, setEntries] = useState<any[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [timeFrom, setTimeFrom] = useState("18:00");
  const [timeTo, setTimeTo] = useState("19:00");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const amountNum = parseAmount(amount);
  const timingLabel = `${timeFrom} - ${timeTo}`;

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
      if (!timeFrom.trim() || !timeTo.trim()) throw new Error("Select membership time from and to");
      if (!startDate.trim() || !endDate.trim()) throw new Error("Select membership start and end dates");
      if (endDate < startDate) throw new Error("End date must be on or after start date");
      await opsRequest(session, arenaId, "/ops/membership-billing", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerMobile: mobileDigits(customerMobile),
          sportName: selectedSports.join(", "),
          timing: timingLabel,
          bookingMethod: "WALK_IN",
          amount: amountNum,
          paymentMode,
          startDate,
          endDate,
          items: [],
        }),
      });
      setCustomerName("");
      setCustomerMobile("");
      setSelectedSports([]);
      setAmount("");
      setTimeFrom("18:00");
      setTimeTo("19:00");
      setStartDate(today);
      setEndDate(today);
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
        <Label>Start date (YYYY-MM-DD)</Label>
        <Field value={startDate} onChangeText={setStartDate} autoCapitalize="none" placeholder="2026-09-18" />
        <Label>End date (YYYY-MM-DD)</Label>
        <Field value={endDate} onChangeText={setEndDate} autoCapitalize="none" placeholder="2026-10-18" />
        <Label>Time from (HH:MM)</Label>
        <Field value={timeFrom} onChangeText={setTimeFrom} placeholder="18:00" autoCapitalize="none" />
        <Label>Time to (HH:MM)</Label>
        <Field value={timeTo} onChangeText={setTimeTo} placeholder="19:00" autoCapitalize="none" />
        <Muted>Saved as {timingLabel}</Muted>
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
            <Muted>
              {entry.start_date || "—"} → {entry.end_date || "—"} · {entry.timing} · ₹{Number(entry.amount).toFixed(0)}
            </Muted>
            {entry.customer_mobile ? <Muted>+91 {entry.customer_mobile}</Muted> : null}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
