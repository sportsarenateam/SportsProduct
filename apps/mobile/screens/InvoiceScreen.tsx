import { useEffect, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import {
  isValidMobile,
  mobileDigits,
  parseAmount,
  sanitizeAmountInput,
  sanitizeMobileInput,
} from "../lib/opsHelpers";
import type { Arena, CartItem } from "../lib/types";
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
  colors,
} from "../components/ui";

type InvoiceDraft = {
  arenaName: string;
  arenaAddress?: string | null;
  arenaPincode?: string | null;
  arenaPhone?: string | null;
  billNumber: number;
  customerName: string;
  customerMobile: string;
  sportName?: string;
  courtNames: string[];
  bookingDate: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  bookingAmount: number;
  items: CartItem[];
  discount: number;
  advance: number;
  subTotal: number;
  grandTotal: number;
  paymentMode: string;
  bookingMethod: string;
};

type SavedInvoice = {
  id: string;
  bill_number: number;
  customer_name: string;
  customer_mobile: string;
  grand_total: number;
  payload: InvoiceDraft;
  created_at: string;
};

function draftToText(draft: InvoiceDraft) {
  return [
    draft.arenaName,
    [draft.arenaAddress, draft.arenaPincode].filter(Boolean).join(", "),
    draft.arenaPhone ? `Ph: ${draft.arenaPhone}` : "",
    (draft.startDate || draft.endDate) ? `Period: ${draft.startDate || "—"} → ${draft.endDate || "—"}` : "",
    `Bill #${draft.billNumber}`,
    `Customer: ${draft.customerName} (${draft.customerMobile})`,
    draft.sportName ? `Sport: ${draft.sportName}` : "",
    draft.courtNames.length ? `Courts: ${draft.courtNames.join(", ")}` : "",
    `Date: ${draft.bookingDate} ${draft.startTime}-${draft.endTime}`,
    `Booking: ₹${draft.bookingAmount.toFixed(0)}`,
    ...draft.items.map((i) => `${i.name} × ${i.quantity} = ₹${(i.price * i.quantity).toFixed(0)}`),
    draft.discount ? `Discount: ₹${draft.discount.toFixed(0)}` : "",
    draft.advance ? `Advance: ₹${draft.advance.toFixed(0)}` : "",
    `Total: ₹${draft.grandTotal.toFixed(0)} (${draft.paymentMode})`,
  ].filter(Boolean).join("\n");
}

export function InvoiceScreen({
  session,
  arena,
  onBack,
}: {
  session: Session;
  arena: Arena;
  onBack: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [sportName, setSportName] = useState("");
  const [courtNames, setCourtNames] = useState("");
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [bookingAmount, setBookingAmount] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState("CASH");
  const [billNumber, setBillNumber] = useState("1");
  const [preview, setPreview] = useState<InvoiceDraft | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [history, setHistory] = useState<SavedInvoice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadHistory() {
    const data = await opsRequest<{ invoices: SavedInvoice[] }>(session, arena.id, "/ops/generated-invoices");
    setHistory(data.invoices.map((row) => ({
      ...row,
      payload: row.payload as InvoiceDraft,
    })));
  }

  useEffect(() => {
    loadHistory().catch(() => undefined);
  }, [session.access_token, arena.id]);

  function pendingLine(): CartItem | null {
    const price = parseAmount(itemPrice);
    const qty = Number(itemQty);
    if (!itemName.trim() || !Number.isFinite(price) || price < 0 || !Number.isFinite(qty) || qty < 1) return null;
    return { itemId: null, name: itemName.trim(), price, quantity: qty, category: "EQUIPMENT" };
  }

  async function buildPreview() {
    setError("");
    if (!customerName.trim()) return setError("Customer name is required");
    if (!isValidMobile(customerMobile, true)) return setError("Enter a valid 10-digit mobile number");
    if (!startDate.trim() || !endDate.trim()) return setError("Start date and end date are required");
    if (endDate < startDate) return setError("End date must be on or after start date");
    const pending = pendingLine();
    const allItems = pending ? [...items, pending] : items;
    if (pending) {
      setItems(allItems);
      setItemName("");
      setItemPrice("");
      setItemQty("1");
    }
    const booking = Number(bookingAmount || 0);
    const itemsTotal = allItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const disc = Number(discount || 0);
    const adv = Number(advance || 0);
    const subTotal = booking + itemsTotal;
    const grand = Math.max(0, subTotal - disc - adv);
    if (grand <= 0 && subTotal <= 0) return setError("Enter booking amount or add line items");

    const draft: InvoiceDraft = {
      arenaName: arena.name,
      arenaAddress: arena.address,
      arenaPincode: arena.pincode,
      arenaPhone: arena.contactPhone,
      billNumber: Number(billNumber) || 1,
      customerName,
      customerMobile: mobileDigits(customerMobile),
      sportName: sportName || undefined,
      courtNames: courtNames ? courtNames.split(",").map((s) => s.trim()).filter(Boolean) : [],
      bookingDate,
      startDate,
      endDate,
      startTime,
      endTime,
      bookingAmount: booking,
      items: allItems,
      discount: disc,
      advance: adv,
      subTotal,
      grandTotal: grand,
      paymentMode,
      bookingMethod: "WALK_IN",
    };

    setBusy(true);
    try {
      const saved = await opsRequest<{ invoice: { id: string } }>(session, arena.id, "/ops/generated-invoices", {
        method: "POST",
        body: JSON.stringify({
          billNumber: draft.billNumber,
          customerName: draft.customerName,
          customerMobile: draft.customerMobile,
          grandTotal: draft.grandTotal,
          payload: draft,
        }),
      });
      setSavedId(saved.invoice.id);
      setPreview(draft);
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save invoice");
    } finally {
      setBusy(false);
    }
  }

  function removeSaved(id: string) {
    Alert.alert("Remove?", "Remove this saved invoice?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          opsRequest(session, arena.id, `/ops/generated-invoices/${id}`, { method: "DELETE" })
            .then(async () => {
              if (savedId === id) {
                setPreview(null);
                setSavedId(null);
              }
              await loadHistory();
            })
            .catch((err) => setError(err instanceof Error ? err.message : "Remove failed"));
        },
      },
    ]);
  }

  if (preview) {
    const text = draftToText(preview);
    return (
      <Screen>
        <BackHeader title="Invoice preview" onBack={() => { setPreview(null); setSavedId(null); }} />
        <Card>
          <Text style={{ lineHeight: 22, color: colors.navy }}>{text}</Text>
          <PrimaryButton label="Share invoice" onPress={() => Share.share({ message: text })} />
          {savedId && (
            <Pressable onPress={() => removeSaved(savedId)}>
              <Text style={{ color: colors.danger, fontWeight: "700", marginTop: 12 }}>Remove saved</Text>
            </Pressable>
          )}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title="Generate Invoice" onBack={onBack} />
      <Muted>Fill the form first — saved invoices appear at the bottom.</Muted>

      <Card>
        <Label>Bill #</Label>
        <Field keyboardType="number-pad" value={billNumber} onChangeText={setBillNumber} />
        <Label>Customer</Label>
        <Field value={customerName} onChangeText={setCustomerName} />
        <Label>Mobile</Label>
        <Field
          keyboardType="number-pad"
          maxLength={10}
          value={customerMobile}
          onChangeText={(v) => setCustomerMobile(sanitizeMobileInput(v))}
        />
        <Label>Sport</Label>
        <Field value={sportName} onChangeText={setSportName} placeholder="Optional" />
        <Label>Courts</Label>
        <Field value={courtNames} onChangeText={setCourtNames} placeholder="Comma separated" />
        <Label>Start date (YYYY-MM-DD)</Label>
        <Field value={startDate} onChangeText={setStartDate} autoCapitalize="none" />
        <Label>End date (YYYY-MM-DD)</Label>
        <Field value={endDate} onChangeText={setEndDate} autoCapitalize="none" />
        <Label>Session date</Label>
        <Field value={bookingDate} onChangeText={setBookingDate} autoCapitalize="none" />
        <Label>Start time</Label>
        <Field value={startTime} onChangeText={setStartTime} />
        <Label>End time</Label>
        <Field value={endTime} onChangeText={setEndTime} />
        <Label>Booking amount</Label>
        <Field
          keyboardType="decimal-pad"
          value={bookingAmount}
          onChangeText={(v) => setBookingAmount(sanitizeAmountInput(v))}
        />
        <Label>Add item name</Label>
        <Field value={itemName} onChangeText={setItemName} />
        <Label>Item price</Label>
        <Field keyboardType="decimal-pad" value={itemPrice} onChangeText={(v) => setItemPrice(sanitizeAmountInput(v))} />
        <Label>Qty</Label>
        <Field keyboardType="number-pad" value={itemQty} onChangeText={setItemQty} />
        <PrimaryButton
          label="Add line item"
          onPress={() => {
            const line = pendingLine();
            if (!line) {
              setError("Enter item name, price and quantity");
              return;
            }
            setError("");
            setItems((c) => [...c, line]);
            setItemName("");
            setItemPrice("");
            setItemQty("1");
          }}
        />
        {items.map((item, idx) => (
          <Muted key={`${item.name}-${idx}`}>{item.name} × {item.quantity} · ₹{(item.price * item.quantity).toFixed(0)}</Muted>
        ))}
        <Label>Discount</Label>
        <Field keyboardType="decimal-pad" value={discount} onChangeText={(v) => setDiscount(sanitizeAmountInput(v))} />
        <Label>Advance</Label>
        <Field keyboardType="decimal-pad" value={advance} onChangeText={(v) => setAdvance(sanitizeAmountInput(v))} />
        <Label>Payment</Label>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {["CASH", "ONLINE"].map((m) => (
            <Chip key={m} label={m} active={paymentMode === m} onPress={() => setPaymentMode(m)} />
          ))}
        </View>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={busy ? "Saving…" : "Save & preview invoice"}
          onPress={() => { if (!busy) void buildPreview(); }}
        />
      </Card>

      <Card>
        <Label>Saved invoices</Label>
        {history.length === 0 && <Muted>No saved invoices yet.</Muted>}
        {history.map((row) => (
          <View key={row.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.navy, fontWeight: "700" }}>
              #{row.bill_number} · {row.customer_name}
            </Text>
            <Muted>₹{Number(row.grand_total).toFixed(0)} · {new Date(row.created_at).toLocaleString("en-IN")}</Muted>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 6 }}>
              <Pressable onPress={() => { setSavedId(row.id); setPreview(row.payload); }}>
                <Text style={{ color: colors.navy, fontWeight: "700" }}>Preview</Text>
              </Pressable>
              <Pressable onPress={() => removeSaved(row.id)}>
                <Text style={{ color: colors.danger, fontWeight: "700" }}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
