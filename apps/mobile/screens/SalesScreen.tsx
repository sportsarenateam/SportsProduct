import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import {
  BackHeader,
  Card,
  Chip,
  ErrorText,
  Field,
  Label,
  Muted,
  Screen,
  colors,
} from "../components/ui";

type Tab = "BOOKINGS" | "ITEMS" | "COACHING" | "MEMBERSHIP";

function isItemsOnly(row: any) {
  return !String(row.sport_name ?? "").trim();
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
  );
  const filteredItems = monthRows.filter((row) =>
    isItemsOnly(row)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  );
  const filteredCoaching = coaching.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.child_name?.toLowerCase().includes(q)
      || row.parent_name?.toLowerCase().includes(q)
      || row.mobile_number?.includes(q)
      || String(row.bill_number ?? "").includes(q)
    ),
  );
  const filteredMembership = membership.filter((row) =>
    inSelectedMonth(row.created_at)
    && (
      !q
      || row.customer_name?.toLowerCase().includes(q)
      || row.sport_name?.toLowerCase().includes(q)
      || String(row.bill_number).includes(q)
      || row.customer_mobile?.includes(q)
    ),
  );

  const bookingTotal = filteredBookings.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const bookingDiscount = filteredBookings.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const itemsTotal = filteredItems.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
  const itemsDiscount = filteredItems.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const coachingTotal = filteredCoaching.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const coachingDiscount = filteredCoaching.reduce((sum, row) => sum + Number(row.discount || 0), 0);
  const membershipTotal = filteredMembership.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const periodDiscount = bookingDiscount + itemsDiscount + coachingDiscount;
  const tabTotal =
    tab === "BOOKINGS" ? bookingTotal
    : tab === "ITEMS" ? itemsTotal
    : tab === "COACHING" ? coachingTotal
    : membershipTotal;

  const sportBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of filteredBookings) {
      const key = row.sport_name?.trim() || "Sport";
      map[key] = (map[key] ?? 0) + Number(row.grand_total || 0);
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

  async function exportCsv() {
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    let headers: string[];
    let dataRows: unknown[][];
    if (tab === "BOOKINGS" || tab === "ITEMS") {
      const source = tab === "ITEMS" ? filteredItems : filteredBookings;
      headers = ["Bill", "Customer", "Mobile", "Sport", "Discount", "Mode", "Total", "Created"];
      dataRows = source.map((row) => [
        row.bill_number, row.customer_name, row.customer_mobile,
        row.sport_name || "Beverages & Equipment",
        row.discount || 0, row.payment_mode, row.grand_total, row.created_at,
      ]);
    } else if (tab === "COACHING") {
      headers = ["Bill", "Child", "Parent", "Mobile", "Discount", "Amount", "Created"];
      dataRows = filteredCoaching.map((row) => [
        row.bill_number, row.child_name, row.parent_name, row.mobile_number,
        row.discount || 0, row.amount, row.created_at,
      ]);
    } else {
      headers = ["Bill", "Customer", "Sport", "Timing", "Amount", "Created"];
      dataRows = filteredMembership.map((row) => [
        row.bill_number, row.customer_name, row.sport_name, row.timing, row.amount, row.created_at,
      ]);
    }
    const csv = [headers, ...dataRows].map((line) => line.map(escape).join(",")).join("\n");
    await Share.share({
      message: csv,
      title: `sales-${tab.toLowerCase()}-${month || "all"}.csv`,
    });
  }

  return (
    <Screen>
      <BackHeader
        title="Sales Report"
        onBack={onBack}
        right={<Text style={{ fontWeight: "800", color: colors.navy }}>{tab}: ₹{tabTotal.toFixed(0)}</Text>}
      />
      <Muted>Sales stay forever — they do not reset next month. Filter by month below.</Muted>

      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Bookings</Text>
          <Text style={styles.kpi}>₹{bookingTotal.toFixed(0)}</Text>
          <Muted>{filteredBookings.length}</Muted>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Items</Text>
          <Text style={styles.kpi}>₹{itemsTotal.toFixed(0)}</Text>
          <Muted>{filteredItems.length}</Muted>
        </View>
      </View>
      <View style={styles.kpiRow}>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Coaching</Text>
          <Text style={styles.kpi}>₹{coachingTotal.toFixed(0)}</Text>
          <Muted>{filteredCoaching.length}</Muted>
        </View>
        <View style={styles.kpiBox}>
          <Text style={styles.kpiLabel}>Membership</Text>
          <Text style={styles.kpi}>₹{membershipTotal.toFixed(0)}</Text>
          <Muted>{filteredMembership.length}</Muted>
        </View>
      </View>
      <View style={styles.kpiBox}>
        <Text style={styles.kpiLabel}>Discount given</Text>
        <Text style={styles.kpi}>₹{periodDiscount.toFixed(0)}</Text>
        <Muted>{month || "All time"}</Muted>
      </View>

      {sportBreakdown.length > 0 && (
        <Card>
          <Label>Revenue by sport</Label>
          {sportBreakdown.map(([name, value]) => (
            <View key={name} style={styles.row}>
              <Text style={styles.rowTitle}>{name}</Text>
              <Text style={styles.rowAmt}>₹{value.toFixed(0)}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(["BOOKINGS", "ITEMS", "COACHING", "MEMBERSHIP"] as const).map((name) => (
          <Chip key={name} label={name} active={tab === name} onPress={() => setTab(name)} />
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
        <Pressable onPress={() => { exportCsv().catch(() => undefined); }}>
          <Text style={{ color: colors.navy, fontWeight: "800" }}>Share CSV</Text>
        </Pressable>
      </View>

      <Field placeholder="Search name, mobile, bill #" value={query} onChangeText={setQuery} />
      <ErrorText>{error}</ErrorText>
      {busy ? <Muted>Refreshing…</Muted> : null}

      {tab === "BOOKINGS" && filteredBookings.map((row) => (
        <Card key={row.id}>
          <Text style={styles.rowTitle}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>{row.sport_name || "—"} · {row.customer_mobile || "—"}</Muted>
          <Text style={styles.rowAmt}>
            ₹{Number(row.grand_total || 0).toFixed(0)} · {row.payment_mode}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}
          </Text>
          <Pressable onPress={() => confirmDelete("booking bill", async () => {
            await opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" });
            await load();
          })}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </Card>
      ))}

      {tab === "ITEMS" && filteredItems.map((row) => (
        <Card key={row.id}>
          <Text style={styles.rowTitle}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>Beverages & Equipment</Muted>
          <Text style={styles.rowAmt}>
            ₹{Number(row.grand_total || 0).toFixed(0)} · {row.payment_mode}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}
          </Text>
          <Pressable onPress={() => confirmDelete("item bill", async () => {
            await opsRequest(session, arenaId, `/ops/transactions/${row.id}`, { method: "DELETE" });
            await load();
          })}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </Card>
      ))}

      {tab === "COACHING" && filteredCoaching.map((row) => (
        <Card key={row.id}>
          <Text style={styles.rowTitle}>#{row.bill_number ?? "—"} · {row.child_name}</Text>
          <Muted>{row.parent_name} · {row.mobile_number}</Muted>
          <Text style={styles.rowAmt}>
            ₹{Number(row.amount || 0).toFixed(0)}
            {Number(row.discount || 0) > 0 ? ` · disc ₹${Number(row.discount).toFixed(0)}` : ""}
          </Text>
          <Pressable onPress={() => confirmDelete("coaching entry", async () => {
            await opsRequest(session, arenaId, `/ops/coaching/${row.id}`, { method: "DELETE" });
            await load();
          })}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </Card>
      ))}

      {tab === "MEMBERSHIP" && filteredMembership.map((row) => (
        <Card key={row.id}>
          <Text style={styles.rowTitle}>#{row.bill_number} · {row.customer_name}</Text>
          <Muted>{row.sport_name || "—"} · {row.timing}</Muted>
          <Text style={styles.rowAmt}>₹{Number(row.amount || 0).toFixed(0)}</Text>
          <Pressable onPress={() => confirmDelete("membership entry", async () => {
            await opsRequest(session, arenaId, `/ops/membership-billing/${row.id}`, { method: "DELETE" });
            await load();
          })}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: "row", gap: 8 },
  kpiBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  kpiLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  kpi: { color: colors.navy, fontSize: 16, fontWeight: "800", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowTitle: { color: colors.navy, fontWeight: "700", fontSize: 14 },
  rowAmt: { color: colors.navy, fontWeight: "800", marginTop: 4 },
  delete: { color: colors.danger, fontWeight: "700", marginTop: 8 },
});
