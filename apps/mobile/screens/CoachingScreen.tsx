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

export function CoachingScreen({
  session,
  arenaId,
  onBack,
}: {
  session: Session;
  arenaId: string;
  onBack: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [entries, setEntries] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    parentName: "",
    childName: "",
    age: "10",
    mobileNumber: "",
    level: "Beginner",
    courtNumber: "Court 1",
    startTime: "17:00",
    endTime: "18:00",
    startDate: today,
    endDate: today,
    amount: "",
    discount: "",
    advance: "",
    paymentMode: "CASH",
  });

  async function load() {
    const data = await opsRequest<{ entries: any[] }>(session, arenaId, "/ops/coaching");
    setEntries(data.entries);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [session.access_token, arenaId]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      if (!form.startDate || !form.endDate) throw new Error("Start and end dates are required");
      if (form.endDate < form.startDate) throw new Error("End date must be on or after start date");
      if (!isValidMobile(form.mobileNumber, true)) throw new Error("Enter a valid 10-digit mobile number");
      const amount = parseAmount(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid amount greater than 0");
      await opsRequest(session, arenaId, "/ops/coaching", {
        method: "POST",
        body: JSON.stringify({
          parentName: form.parentName,
          childName: form.childName,
          age: Number(form.age) || 0,
          mobileNumber: mobileDigits(form.mobileNumber),
          level: form.level,
          courtNumber: form.courtNumber,
          startTime: form.startTime,
          endTime: form.endTime,
          startDate: form.startDate,
          endDate: form.endDate,
          amount,
          discount: Number(form.discount || 0),
          advance: Number(form.advance || 0),
          paymentMode: form.paymentMode,
        }),
      });
      setForm((c) => ({
        ...c,
        parentName: "",
        childName: "",
        mobileNumber: "",
        amount: "",
        discount: "",
        advance: "",
        startDate: today,
        endDate: today,
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BackHeader title="Coaching" onBack={onBack} />
      <Card>
        <Label>Parent name</Label>
        <Field value={form.parentName} onChangeText={(v) => setForm({ ...form, parentName: v })} />
        <Label>Child name</Label>
        <Field value={form.childName} onChangeText={(v) => setForm({ ...form, childName: v })} />
        <Label>Mobile</Label>
        <Field
          keyboardType="number-pad"
          maxLength={10}
          value={form.mobileNumber}
          onChangeText={(v) => setForm({ ...form, mobileNumber: sanitizeMobileInput(v) })}
        />
        <Label>Age</Label>
        <Field keyboardType="number-pad" value={form.age} onChangeText={(v) => setForm({ ...form, age: v })} />
        <Label>Level</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["Beginner", "Intermediate", "Advance"].map((level) => (
            <Chip key={level} label={level} active={form.level === level} onPress={() => setForm({ ...form, level })} />
          ))}
        </View>
        <Label>Court</Label>
        <Field value={form.courtNumber} onChangeText={(v) => setForm({ ...form, courtNumber: v })} />
        <Label>Start date</Label>
        <Field value={form.startDate} onChangeText={(v) => setForm({ ...form, startDate: v })} />
        <Label>End date</Label>
        <Field value={form.endDate} onChangeText={(v) => setForm({ ...form, endDate: v })} />
        <Label>Start time</Label>
        <Field value={form.startTime} onChangeText={(v) => setForm({ ...form, startTime: v })} />
        <Label>End time</Label>
        <Field value={form.endTime} onChangeText={(v) => setForm({ ...form, endTime: v })} />
        <Label>Fee amount</Label>
        <Field
          keyboardType="decimal-pad"
          value={form.amount}
          onChangeText={(v) => setForm({ ...form, amount: sanitizeAmountInput(v) })}
        />
        <Label>Discount</Label>
        <Field
          keyboardType="decimal-pad"
          value={form.discount}
          onChangeText={(v) => setForm({ ...form, discount: sanitizeAmountInput(v) })}
        />
        <Label>Advance</Label>
        <Field
          keyboardType="decimal-pad"
          value={form.advance}
          onChangeText={(v) => setForm({ ...form, advance: sanitizeAmountInput(v) })}
        />
        <Label>Payment</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["CASH", "ONLINE"].map((m) => (
            <Chip key={m} label={m} active={form.paymentMode === m} onPress={() => setForm({ ...form, paymentMode: m })} />
          ))}
        </View>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton label="Register coaching" busy={busy} onPress={save} />
      </Card>

      <Card>
        <Label>Recent</Label>
        {entries.length === 0 && <Muted>No coaching entries yet.</Muted>}
        {entries.slice(0, 20).map((entry) => (
          <View key={entry.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" }}>
            <Text style={{ fontWeight: "700" }}>{entry.child_name} · #{entry.bill_number ?? "—"}</Text>
            <Muted>{entry.parent_name} · ₹{Number(entry.amount).toFixed(0)}</Muted>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
