import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, Share, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import { sportImage } from "../lib/sportArt";
import {
  bookingAmount as calcBookingAmount,
  byBillDesc,
  cartItemsTotal,
  grandTotal as calcGrandTotal,
  isValidMobile,
  mobileDigits,
  sanitizeAmountInput,
  sanitizeMobileInput,
  upsertCartItem,
} from "../lib/opsHelpers";
import type { CartItem, InventoryItem, SportConfig } from "../lib/types";
import {
  BackHeader,
  Card,
  Chip,
  DeleteIconButton,
  ErrorText,
  Field,
  Label,
  Muted,
  PrimaryButton,
  Screen,
} from "../components/ui";
import { useTheme } from "../lib/theme";

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startM = sh * 60 + (sm || 0);
  const endM = eh * 60 + (em || 0);
  const diff = endM - startM;
  return diff > 0 ? diff / 60 : 0;
}

export function BookingScreen({
  session,
  arenaId,
  sport,
  bevOnly,
  inventory,
  onDone,
  onBack,
}: {
  session: Session;
  arenaId: string;
  sport: SportConfig | null;
  bevOnly: boolean;
  inventory: InventoryItem[];
  onDone: () => void;
  onBack: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [method, setMethod] = useState<"WALK_IN" | "PLAYO" | "TURF_TOWN" | "OFFLINE">("WALK_IN");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:00");
  const [selectedCourts, setSelectedCourts] = useState<string[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState("");
  const [advance, setAdvance] = useState("");
  const [paymentMode, setPaymentMode] = useState<"CASH" | "ONLINE" | "SPLIT">("CASH");
  const [splitCash, setSplitCash] = useState("");
  const [splitOnline, setSplitOnline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [itemBills, setItemBills] = useState<any[]>([]);
  const [itemMonth, setItemMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [itemQuery, setItemQuery] = useState("");

  async function loadItemBills() {
    if (!bevOnly) return;
    const data = await opsRequest<{ transactions: any[] }>(session, arenaId, "/ops/transactions");
    setItemBills((data.transactions ?? []).filter((row) => !String(row.sport_name ?? "").trim()));
  }

  useEffect(() => {
    loadItemBills().catch(() => undefined);
  }, [session.access_token, arenaId, bevOnly]);

  const hours = useMemo(() => hoursBetween(startTime, endTime), [startTime, endTime]);
  const courtCount = selectedCourts.length;
  const bookingAmt = bevOnly ? 0 : calcBookingAmount(sport?.pricePerHour ?? 0, hours, courtCount);
  const itemsTotal = cartItemsTotal(cart);
  const discountNum = Number(discount || 0);
  const advanceNum = Number(advance || 0);
  const grand = calcGrandTotal(bookingAmt, itemsTotal, discountNum, advanceNum);

  function qtyFor(itemId: string) {
    return cart.find((row) => row.itemId === itemId)?.quantity ?? 0;
  }

  function setItemQty(item: InventoryItem, nextQty: number) {
    setCart((current) => {
      const existing = current.find((row) => row.itemId === item.id);
      if (!existing) {
        if (nextQty <= 0) return current;
        return upsertCartItem(current, item, nextQty);
      }
      if (nextQty <= 0) return current.filter((row) => row.itemId !== item.id);
      return current.map((row) => (row.itemId === item.id ? { ...row, quantity: nextQty } : row));
    });
  }

  async function checkout() {
    setBusy(true);
    setError("");
    try {
      if (!customerName.trim()) throw new Error("Customer name is required");
      if (!bevOnly) {
        if (!isValidMobile(customerMobile, true)) throw new Error("Enter a valid 10-digit mobile number");
        if (!sport || !selectedCourts.length) throw new Error("Select at least one court");
      }
      if (bevOnly && !cart.length) throw new Error("Add at least one beverage or equipment item");
      const splitCashNum = Number(splitCash || 0);
      const splitOnlineNum = Number(splitOnline || 0);
      if (paymentMode === "SPLIT" && Math.abs(splitCashNum + splitOnlineNum - grand) > 0.5) {
        throw new Error("Split cash + online must match grand total");
      }
      const courtNames = sport?.courts.filter((c) => selectedCourts.includes(c.id)).map((c) => c.name) ?? [];
      await opsRequest(session, arenaId, "/ops/transactions", {
        method: "POST",
        body: JSON.stringify({
          customerName,
          customerMobile: bevOnly ? "" : mobileDigits(customerMobile),
          sportId: sport?.id ?? null,
          sportName: sport?.name,
          courtNames,
          courtIds: selectedCourts,
          bookingDate: date,
          startTime,
          endTime,
          durationHours: hours,
          bookingAmount: bookingAmt,
          items: cart,
          discount: discountNum,
          advance: advanceNum,
          paymentMode,
          splitCash: splitCashNum,
          splitOnline: splitOnlineNum,
          bookingMethod: method,
        }),
      });
      if (bevOnly) await loadItemBills();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  const filteredItemBills = itemBills.filter((row) => {
    const inMonth = !itemMonth || String(row.created_at ?? "").slice(0, 7) === itemMonth;
    const q = itemQuery.trim().toLowerCase();
    const match = !q
      || row.customer_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q);
    return inMonth && match;
  }).slice().sort(byBillDesc);
  const itemSalesTotal = filteredItemBills.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const itemSalesDiscount = filteredItemBills.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const itemSalesAdvance = filteredItemBills.reduce((sum, row) => sum + Number(row.advance || 0), 0);

  async function exportItemCsv() {
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = ["Bill", "Created", "Customer", "Discount", "Advance", "Total", "Payment"];
    const dataRows = filteredItemBills.map((row) => [
      row.bill_number, row.created_at, row.customer_name, row.discount || 0, row.advance || 0, row.grand_total, row.payment_mode,
    ]);
    const csv = [headers, ...dataRows].map((line) => line.map(escape).join(",")).join("\n");
    await Share.share({ message: csv, title: `beverages-equipment-${itemMonth || "all"}.csv` });
  }

  return (
    <Screen>
      <BackHeader
        title={bevOnly ? "Beverages & Equipment" : `Book ${sport?.name ?? "Sport"}`}
        onBack={onBack}
        right={<Text style={{ fontWeight: "800", color: themeColors.navy }}>₹{grand.toFixed(0)}</Text>}
      />

      {!bevOnly && sport && sportImage(sport.name) ? (
        <Image source={sportImage(sport.name)!} style={{ width: 56, height: 56 }} resizeMode="contain" />
      ) : null}

      {!bevOnly && (
        <Card>
          <Label>Customer</Label>
          <Field value={customerName} onChangeText={setCustomerName} placeholder="Name" />
          <Label>Mobile</Label>
          <Field
            keyboardType="number-pad"
            maxLength={10}
            value={customerMobile}
            onChangeText={(v) => setCustomerMobile(sanitizeMobileInput(v))}
            placeholder="10 digits"
          />
          <Label>Method</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["WALK_IN", "PLAYO", "TURF_TOWN", "OFFLINE"] as const).map((m) => (
              <Chip key={m} label={m.replace("_", " ")} active={method === m} onPress={() => setMethod(m)} />
            ))}
          </View>
          <Label>Date (YYYY-MM-DD)</Label>
          <Field value={date} onChangeText={setDate} />
          <Label>Start (HH:MM)</Label>
          <Field value={startTime} onChangeText={setStartTime} />
          <Label>End (HH:MM)</Label>
          <Field value={endTime} onChangeText={setEndTime} />
          <Label>Courts</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(sport?.courts ?? []).map((court) => (
              <Chip
                key={court.id}
                label={court.name}
                active={selectedCourts.includes(court.id)}
                onPress={() => setSelectedCourts((cur) =>
                  cur.includes(court.id) ? cur.filter((id) => id !== court.id) : [...cur, court.id],
                )}
              />
            ))}
          </View>
          <Muted>
            {courtCount === 0
              ? "Select one or more courts"
              : `${hours} hr × ₹${sport?.pricePerHour ?? 0} × ${courtCount} = ₹${bookingAmt.toFixed(0)}`}
          </Muted>
        </Card>
      )}

      {bevOnly && (
        <Card>
          <Label>Customer name</Label>
          <Field value={customerName} onChangeText={setCustomerName} placeholder="Name" />
        </Card>
      )}

      <Card>
        <Label>Equipment & beverages</Label>
        {inventory.map((item) => {
          const qty = qtyFor(item.id);
          return (
            <View key={item.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: themeColors.navy }}>{item.name}</Text>
                <Muted>₹{item.price} · stock {item.stock}</Muted>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Chip label="−" onPress={() => setItemQty(item, qty - 1)} />
                <Text style={{ fontWeight: "700", minWidth: 18, textAlign: "center", color: themeColors.text }}>{qty}</Text>
                <Chip label="+" onPress={() => setItemQty(item, qty + 1)} />
              </View>
            </View>
          );
        })}
        <Muted>Items subtotal: ₹{itemsTotal.toFixed(0)}</Muted>
      </Card>

      <Card>
        <Label>Discount</Label>
        <Field keyboardType="decimal-pad" value={discount} onChangeText={(v) => setDiscount(sanitizeAmountInput(v))} placeholder="Optional" />
        <Label>Advance</Label>
        <Field keyboardType="decimal-pad" value={advance} onChangeText={(v) => setAdvance(sanitizeAmountInput(v))} placeholder="Optional" />
        <Label>Payment</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["CASH", "ONLINE", "SPLIT"] as const).map((m) => (
            <Chip key={m} label={m} active={paymentMode === m} onPress={() => setPaymentMode(m)} />
          ))}
        </View>
        {paymentMode === "SPLIT" && (
          <>
            <Label>Cash part</Label>
            <Field keyboardType="decimal-pad" value={splitCash} onChangeText={(v) => setSplitCash(sanitizeAmountInput(v))} />
            <Label>Online part</Label>
            <Field keyboardType="decimal-pad" value={splitOnline} onChangeText={(v) => setSplitOnline(sanitizeAmountInput(v))} />
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <View style={{ marginTop: 8, marginBottom: 28 }}>
        <PrimaryButton label={`Save bill ₹${grand.toFixed(0)}`} busy={busy} onPress={checkout} />
      </View>
      </Card>

      {bevOnly && (
        <Card>
          <Label>Beverages & Equipment sales</Label>
          <Muted>Month filter + Share CSV — same idea as Sales Report.</Muted>
          <Text style={{ color: themeColors.navy, fontWeight: "800", marginTop: 8 }}>
            ₹{itemSalesTotal.toFixed(0)} · {filteredItemBills.length} bills · disc ₹{itemSalesDiscount.toFixed(0)} · adv ₹{itemSalesAdvance.toFixed(0)}
          </Text>
          <Label>Month (YYYY-MM)</Label>
          <Field placeholder="2026-08" value={itemMonth} onChangeText={setItemMonth} autoCapitalize="none" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <Chip label="All months" active={!itemMonth} onPress={() => setItemMonth("")} />
            <Pressable onPress={() => { exportItemCsv().catch(() => undefined); }}>
              <Text style={{ color: themeColors.navy, fontWeight: "800" }}>Share CSV</Text>
            </Pressable>
          </View>
          <Field placeholder="Search customer / bill #" value={itemQuery} onChangeText={setItemQuery} />
          {filteredItemBills.length === 0 && <Muted>No item bills for this period.</Muted>}
          {filteredItemBills.map((row) => (
            <View key={row.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: themeColors.border }}>
              <Text style={{ color: themeColors.navy, fontWeight: "700" }}>#{row.bill_number} · {row.customer_name}</Text>
              <Muted>
                ₹{Number(row.grand_total || 0).toFixed(0)} · {row.payment_mode}
                {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}
                {Number(row.advance || 0) > 0 ? ` · adv ₹${Number(row.advance).toFixed(0)}` : ""}
              </Muted>
              <DeleteIconButton onPress={() => {
                Alert.alert("Delete?", "Delete this bill?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" })
                        .then(() => loadItemBills())
                        .catch((err) => setError(err instanceof Error ? err.message : "Delete failed"));
                    },
                  },
                ]);
              }} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
