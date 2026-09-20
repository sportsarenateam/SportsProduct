import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import { buildMultiSectionCsv, byBillDesc } from "../lib/opsHelpers";
import {
  BackHeader,
  Card,
  Chip,
  DeleteIconButton,
  ErrorText,
  Field,
  Label,
  Muted,
  Screen,
  ThemeToggle,
} from "../components/ui";
import { useTheme } from "../lib/theme";
import { PieChart } from "../components/PieChart";

type Tab = "BOOKINGS" | "ITEMS" | "COACHING" | "MEMBERSHIP";

function isItemsOnly(row: any) {
  return !String(row.sport_name ?? "").trim();
}

function hasSoldItems(row: any) {
  if (Number(row.items_total || 0) > 0) return true;
  const lines = row.pos_transaction_items;
  return Array.isArray(lines) && lines.length > 0;
}

function bookingNet(row: any) {
  const bookingAmt = Number(row.booking_amount || 0);
  const itemsAmt = Number(row.items_total || 0);
  const disc = Number(row.discount || 0);
  const adv = Number(row.advance || 0);
  const sub = bookingAmt + itemsAmt;
  if (sub <= 0) return Math.max(0, Number(row.grand_total || 0));
  const share = bookingAmt / sub;
  return Math.max(0, bookingAmt - disc * share - adv * share);
}

function coachingPaid(row: any) {
  return Math.max(0, Number(row.amount || 0) - Number(row.discount || 0) - Number(row.advance || 0));
}

function modeAmount(mode: string, amount: number) {
  const key = String(mode || "").toUpperCase();
  if (key === "CASH") return { cash: amount, online: 0, split: 0 };
  if (key === "ONLINE") return { cash: 0, online: amount, split: 0 };
  if (key === "SPLIT") return { cash: 0, online: 0, split: amount };
  return { cash: 0, online: 0, split: 0 };
}

export function SalesScreen({
  session,
  arenaId,
  onBack,
}: {
  session: Session;
  arenaId: string;
  onBack: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [rows, setRows] = useState<any[]>([]);
  const [coaching, setCoaching] = useState<any[]>([]);
  const [membership, setMembership] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>("BOOKINGS");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [tx, coach, member] = await Promise.all([
        opsRequest<{ transactions: any[] }>(session, arenaId, "/ops/transactions"),
        opsRequest<{ entries: any[] }>(session, arenaId, "/ops/coaching"),
        opsRequest<{ entries: any[] }>(session, arenaId, "/ops/membership-billing"),
      ]);
      setRows(tx.transactions);
      setCoaching(coach.entries);
      setMembership(member.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load sales");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [session.access_token, arenaId]);

  function inSelectedMonth(iso: string | null | undefined) {
    if (!month) return true;
    if (!iso) return false;
    return String(iso).slice(0, 7) === month;
  }

  const q = query.trim().toLowerCase();
  const monthRows = rows.filter((row) => inSelectedMonth(row.created_at));
  const filteredBookings = monthRows.filter((row) =>
    !isItemsOnly(row)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  ).slice().sort(byBillDesc);
  const filteredItems = monthRows.filter((row) =>
    hasSoldItems(row)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  ).slice().sort(byBillDesc);
  const filteredCoaching = coaching.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.child_name?.toLowerCase().includes(q)
      || row.parent_name?.toLowerCase().includes(q)
      || row.mobile_number?.includes(q)
      || String(row.bill_number ?? "").includes(q)
    ),
  ).slice().sort(byBillDesc);
  const filteredMembership = membership.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
      || row.timing?.toLowerCase().includes(q)
    ),
  ).slice().sort(byBillDesc);

  const bookingTotal = filteredBookings.reduce((sum, row) => sum + bookingNet(row), 0);
  const itemsTotal = filteredItems.reduce((sum, row) => sum + Number(row.items_total || 0), 0);
  const coachingTotal = filteredCoaching.reduce((sum, row) => sum + coachingPaid(row), 0);
  const coachingDiscount = filteredCoaching.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const coachingAdvance = filteredCoaching.reduce((sum, row) => sum + Number(row.advance || 0), 0);
  const membershipTotal = filteredMembership.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const periodDiscount =
    monthRows.reduce((sum, row) => sum + Number(row.discount || 0), 0) + coachingDiscount;
  const periodAdvance =
    monthRows.reduce((sum, row) => sum + Number(row.advance || 0), 0) + coachingAdvance;
  const tabTotal =
    tab === "BOOKINGS" ? bookingTotal
    : tab === "ITEMS" ? itemsTotal
    : tab === "COACHING" ? coachingTotal
    : membershipTotal;

  const paymentStats = useMemo(() => {
    let cash = 0;
    let online = 0;
    let split = 0;
    for (const row of monthRows) {
      const part = modeAmount(row.payment_mode, Number(row.grand_total || 0));
      cash += part.cash; online += part.online; split += part.split;
    }
    for (const row of filteredCoaching) {
      const part = modeAmount(row.payment_mode, coachingPaid(row));
      cash += part.cash; online += part.online; split += part.split;
    }
    for (const row of filteredMembership) {
      const part = modeAmount(row.payment_mode, Number(row.amount || 0));
      cash += part.cash; online += part.online; split += part.split;
    }
    return { cash, online, split };
  }, [monthRows, filteredCoaching, filteredMembership]);

  const sportBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of filteredBookings) {
      const key = row.sport_name?.trim() || "Sport";
      map[key] = (map[key] ?? 0) + bookingNet(row);
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredBookings]);

  function confirmDelete(kind: string, run: () => Promise<void>) {
    Alert.alert("Delete?", `Delete this ${kind}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => { run().catch((err) => setError(err instanceof Error ? err.message : "Delete failed")); },
      },
    ]);
  }

  async function exportReport() {
    const csv = buildMultiSectionCsv([
      {
        name: "Bookings",
        headers: ["Bill", "Created", "Customer", "Mobile", "Sport", "Discount", "Advance", "GrandTotal", "Payment"],
        rows: filteredBookings.map((row) => [
          row.bill_number, row.created_at, row.customer_name, row.customer_mobile,
          row.sport_name || "", row.discount ?? 0, row.advance ?? 0, Number(row.grand_total || 0), row.payment_mode,
        ]),
      },
      {
        name: "Membership",
        headers: ["Bill", "Created", "Customer", "Mobile", "Sport", "StartDate", "EndDate", "Time", "Amount", "Payment"],
        rows: filteredMembership.map((row) => [
          row.bill_number, row.created_at, row.customer_name, row.customer_mobile,
          row.sport_name, row.start_date || "", row.end_date || "", row.timing, Number(row.amount || 0), row.payment_mode,
        ]),
      },
      {
        name: "Coaching",
        headers: ["Bill", "Created", "Child", "Parent", "Mobile", "Discount", "Advance", "Paid", "Payment"],
        rows: filteredCoaching.map((row) => [
          row.bill_number, row.created_at, row.child_name, row.parent_name, row.mobile_number,
          row.discount ?? 0, row.advance ?? 0, coachingPaid(row), row.payment_mode,
        ]),
      },
      {
        name: "Items",
        headers: ["Bill", "Created", "Customer", "Mobile", "Source", "ItemsTotal", "Discount", "Advance", "GrandTotal", "Payment"],
        rows: filteredItems.map((row) => [
          row.bill_number, row.created_at, row.customer_name, row.customer_mobile,
          isItemsOnly(row) ? "Beverages & Equipment" : `With ${row.sport_name || "sport"}`,
          Number(row.items_total || 0), row.discount ?? 0, row.advance ?? 0, Number(row.grand_total || 0), row.payment_mode,
        ]),
      },
    ]);
    await Share.share({
      message: csv,
      title: `sales-report-${month || "all"}.csv`,
    });
  }

  return (
    <Screen>
      <BackHeader
        title="Sales Report"
        onBack={onBack}
        right={(
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <ThemeToggle />
            <Text style={{ fontWeight: "800", color: themeColors.navy }}>{tab}: ₹{tabTotal.toFixed(0)}</Text>
          </View>
        )}
      />

      <Card>
        <Label>Statistics</Label>
        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: themeColors.navy }]}>Cash ₹{paymentStats.cash.toFixed(0)}</Text>
          <Text style={[styles.stat, { color: themeColors.navy }]}>Online ₹{paymentStats.online.toFixed(0)}</Text>
          <Text style={[styles.stat, { color: themeColors.navy }]}>Split ₹{paymentStats.split.toFixed(0)}</Text>
        </View>
      </Card>

      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Bookings</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{bookingTotal.toFixed(0)}</Text>
          <Muted>{filteredBookings.length}</Muted>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Advance collected</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{periodAdvance.toFixed(0)}</Text>
          <Muted>{month || "All time"}</Muted>
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Discount given</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{periodDiscount.toFixed(0)}</Text>
          <Muted>{month || "All time"}</Muted>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Membership</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{membershipTotal.toFixed(0)}</Text>
          <Muted>{filteredMembership.length}</Muted>
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Coaching</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{coachingTotal.toFixed(0)}</Text>
          <Muted>{filteredCoaching.length}</Muted>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <Text style={[styles.kpiLabel, { color: themeColors.muted }]}>Beverages & Equipment</Text>
          <Text style={[styles.kpi, { color: themeColors.navy }]}>₹{itemsTotal.toFixed(0)}</Text>
          <Muted>{filteredItems.length}</Muted>
        </View>
      </View>

      <Card>
        <PieChart
          title="Revenue by module"
          slices={[
            { label: "Bookings", value: bookingTotal, color: "#3b82f6" },
            { label: "Membership", value: membershipTotal, color: "#e11d48" },
            { label: "Coaching", value: coachingTotal, color: "#0d9488" },
            { label: "Items", value: itemsTotal, color: "#d97706" },
          ]}
        />
      </Card>

      <Card>
        <PieChart
          title="Revenue by sport"
          slices={sportBreakdown.map(([name, value], index) => ({
            label: name,
            value,
            color: ["#3b82f6", "#0d9488", "#e11d48", "#d97706", "#7c3aed", "#2563eb", "#059669"][index % 7],
          }))}
        />
      </Card>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {([
          ["BOOKINGS", "Bookings"],
          ["MEMBERSHIP", "Membership"],
          ["COACHING", "Coaching"],
          ["ITEMS", "Beverages"],
        ] as const).map(([id, label]) => (
          <Chip
            key={id}
            label={label}
            active={tab === id}
            onPress={() => setTab(id)}
          />
        ))}
      </View>

      <Label>Month (YYYY-MM)</Label>
      <Field
        placeholder="2026-08"
        value={month}
        onChangeText={setMonth}
        autoCapitalize="none"
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <Chip label="All months" active={!month} onPress={() => setMonth("")} />
        <Pressable onPress={() => { exportReport().catch(() => undefined); }}>
          <Text style={{ color: themeColors.navy, fontWeight: "800" }}>Share CSV</Text>
        </Pressable>
      </View>

      <Field placeholder="Search name, mobile, bill #" value={query} onChangeText={setQuery} />
      <ErrorText>{error}</ErrorText>
      {busy ? <Muted>Refreshing…</Muted> : null}

      {tab === "BOOKINGS" && filteredBookings.map((row) => (
        <Card key={row.id}>
          <Text style={[styles.rowTitle, { color: themeColors.navy }]}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>{row.sport_name || "—"} · {row.customer_mobile || "—"}</Muted>
          <Text style={[styles.rowAmt, { color: themeColors.navy }]}>
            ₹{Number(row.grand_total || 0).toFixed(0)} · {row.payment_mode}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}{Number(row.advance || 0) > 0 ? ` · adv ₹${Number(row.advance).toFixed(0)}` : ""}
          </Text>
          <DeleteIconButton onPress={() => confirmDelete("booking bill", async () => {
            await opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" });
            await load();
          })} />
        </Card>
      ))}

      {tab === "ITEMS" && filteredItems.map((row) => (
        <Card key={row.id}>
          <Text style={[styles.rowTitle, { color: themeColors.navy }]}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>
            {isItemsOnly(row)
              ? "Beverages & Equipment"
              : `With ${row.sport_name || "sport"}`}
          </Muted>
          <Text style={[styles.rowAmt, { color: themeColors.navy }]}>
            ₹{Number(row.items_total || 0).toFixed(0)} · {row.payment_mode}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}{Number(row.advance || 0) > 0 ? ` · adv ₹${Number(row.advance).toFixed(0)}` : ""}
          </Text>
          <DeleteIconButton onPress={() => confirmDelete("item bill", async () => {
            await opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" });
            await load();
          })} />
        </Card>
      ))}

      {tab === "COACHING" && filteredCoaching.map((row) => (
        <Card key={row.id}>
          <Text style={[styles.rowTitle, { color: themeColors.navy }]}>#{row.bill_number ?? "—"} · {row.child_name}</Text>
          <Muted>{row.parent_name} · {row.mobile_number}</Muted>
          <Text style={[styles.rowAmt, { color: themeColors.navy }]}>
            ₹{coachingPaid(row).toFixed(0)}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}{Number(row.advance || 0) > 0 ? ` · adv ₹${Number(row.advance).toFixed(0)}` : ""}
          </Text>
          <DeleteIconButton onPress={() => confirmDelete("coaching entry", async () => {
            await opsRequest(session, arenaId, `/ops/coaching/${row.id}`, { method: "DELETE" });
            await load();
          })} />
        </Card>
      ))}

      {tab === "MEMBERSHIP" && filteredMembership.map((row) => (
        <Card key={row.id}>
          <Text style={[styles.rowTitle, { color: themeColors.navy }]}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>{row.sport_name || "—"} · {row.start_date || "—"} → {row.end_date || "—"} · {row.timing}</Muted>
          <Text style={[styles.rowAmt, { color: themeColors.navy }]}>₹{Number(row.amount || 0).toFixed(0)}</Text>
          <DeleteIconButton onPress={() => confirmDelete("membership entry", async () => {
            await opsRequest(session, arenaId, `/ops/membership-billing/${row.id}`, { method: "DELETE" });
            await load();
          })} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  stat: { fontWeight: "800", fontSize: 13 },
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  kpiLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  kpi: { fontSize: 16, fontWeight: "800", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowTitle: { fontWeight: "700", fontSize: 14 },
  rowAmt: { fontWeight: "800", marginTop: 4 },
});
