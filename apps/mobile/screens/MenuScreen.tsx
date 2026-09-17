import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import { sanitizeAmountInput } from "../lib/opsHelpers";
import type { InventoryItem, SportConfig } from "../lib/types";
import {
  BackHeader,
  Card,
  Chip,
  ErrorText,
  Field,
  Label,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
} from "../components/ui";

export function MenuScreen({
  session,
  arenaId,
  sports,
  inventory,
  onChanged,
  onBack,
}: {
  session: Session;
  arenaId: string;
  sports: SportConfig[];
  inventory: InventoryItem[];
  onChanged: () => Promise<void>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"INVENTORY" | "COURTS">("INVENTORY");
  const [localInv, setLocalInv] = useState(inventory);
  const [courtNames, setCourtNames] = useState<Record<string, string>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => setLocalInv(inventory), [inventory]);
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const sport of sports) next[sport.id] = String(sport.pricePerHour);
    setRates(next);
  }, [sports]);

  async function saveItem(item: InventoryItem) {
    setBusyId(item.id);
    setError("");
    try {
      await opsRequest(session, arenaId, "/ops/inventory", {
        method: "POST",
        body: JSON.stringify(item),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save item");
    } finally {
      setBusyId(null);
    }
  }

  async function addItem() {
    setBusyId("add-item");
    setError("");
    try {
      const existing = new Set(localInv.map((item) => item.name.toLowerCase()));
      let name = "New Item";
      let n = 2;
      while (existing.has(name.toLowerCase())) {
        name = `New Item ${n}`;
        n += 1;
      }
      await opsRequest(session, arenaId, "/ops/inventory", {
        method: "POST",
        body: JSON.stringify({ name, category: "EQUIPMENT", price: 0, stock: 0 }),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add item");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    setBusyId(id);
    setError("");
    try {
      await opsRequest(session, arenaId, `/ops/inventory/${id}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete item");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRate(sportId: string) {
    setBusyId(sportId);
    setError("");
    try {
      const pricePerHour = Number(rates[sportId] || 0);
      await opsRequest(session, arenaId, `/ops/sports/${sportId}`, {
        method: "PATCH",
        body: JSON.stringify({ pricePerHour }),
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save rate");
    } finally {
      setBusyId(null);
    }
  }

  async function addCourt(sportId: string) {
    const name = (courtNames[sportId] ?? "").trim();
    if (!name) return;
    setBusyId(`court-${sportId}`);
    setError("");
    try {
      await opsRequest(session, arenaId, "/ops/courts", {
        method: "POST",
        body: JSON.stringify({ sportId, name }),
      });
      setCourtNames((current) => ({ ...current, [sportId]: "" }));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add court");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteCourt(courtId: string) {
    setBusyId(courtId);
    setError("");
    try {
      await opsRequest(session, arenaId, `/ops/courts/${courtId}`, { method: "DELETE" });
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete court");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen>
      <BackHeader title="Manage Menu" onBack={onBack} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Inventory" active={tab === "INVENTORY"} onPress={() => setTab("INVENTORY")} />
        <Chip label="Sports & Courts" active={tab === "COURTS"} onPress={() => setTab("COURTS")} />
      </View>
      <ErrorText>{error}</ErrorText>

      {tab === "INVENTORY" ? (
        <>
          <PrimaryButton label="+ Add item" busy={busyId === "add-item"} onPress={addItem} />
          {localInv.map((item, index) => (
            <Card key={item.id}>
              <Label>Name</Label>
              <Field
                value={item.name}
                onChangeText={(v) => {
                  const next = [...localInv];
                  next[index] = { ...item, name: v };
                  setLocalInv(next);
                }}
              />
              <Label>Category</Label>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Chip
                  label="Equipment"
                  active={item.category === "EQUIPMENT"}
                  onPress={() => {
                    const next = [...localInv];
                    next[index] = { ...item, category: "EQUIPMENT" };
                    setLocalInv(next);
                  }}
                />
                <Chip
                  label="Beverage"
                  active={item.category === "BEVERAGE"}
                  onPress={() => {
                    const next = [...localInv];
                    next[index] = { ...item, category: "BEVERAGE" };
                    setLocalInv(next);
                  }}
                />
              </View>
              <Label>Price</Label>
              <Field
                keyboardType="decimal-pad"
                placeholder="—"
                value={item.price === 0 ? "" : String(item.price)}
                onChangeText={(v) => {
                  const next = [...localInv];
                  const cleaned = sanitizeAmountInput(v);
                  next[index] = { ...item, price: cleaned === "" ? 0 : Number(cleaned) };
                  setLocalInv(next);
                }}
              />
              <Label>Stock</Label>
              <Field
                keyboardType="number-pad"
                placeholder="—"
                value={item.stock === 0 ? "" : String(item.stock)}
                onChangeText={(v) => {
                  const next = [...localInv];
                  const digits = v.replace(/\D/g, "");
                  next[index] = { ...item, stock: digits === "" ? 0 : Number(digits) };
                  setLocalInv(next);
                }}
              />
              <PrimaryButton
                label="Save item"
                busy={busyId === item.id}
                onPress={() => saveItem(localInv[index])}
              />
              <LinkButton label="Delete item" onPress={() => deleteItem(item.id)} />
            </Card>
          ))}
        </>
      ) : null}

      {tab === "COURTS" ? sports.map((sport) => (
        <Card key={sport.id}>
          <Text style={{ fontWeight: "700", color: "#082b55" }}>{sport.name}</Text>
          <Label>₹ per hour</Label>
          <Field
            keyboardType="decimal-pad"
            value={rates[sport.id] ?? "0"}
            onChangeText={(v) => setRates((c) => ({ ...c, [sport.id]: sanitizeAmountInput(v) }))}
          />
          <PrimaryButton
            label="Save rate"
            busy={busyId === sport.id}
            onPress={() => saveRate(sport.id)}
          />
          <Muted>Courts</Muted>
          {sport.courts.length === 0 ? <Muted>No courts yet.</Muted> : null}
          {sport.courts.map((court) => (
            <View
              key={court.id}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: "#1e3348", fontWeight: "600" }}>{court.name}</Text>
              <LinkButton label="Remove" onPress={() => deleteCourt(court.id)} />
            </View>
          ))}
          <Label>New court name</Label>
          <Field
            value={courtNames[sport.id] ?? ""}
            placeholder="Court 1"
            onChangeText={(v) => setCourtNames((c) => ({ ...c, [sport.id]: v }))}
          />
          <PrimaryButton
            label="Add court"
            busy={busyId === `court-${sport.id}`}
            disabled={!(courtNames[sport.id] ?? "").trim()}
            onPress={() => addCourt(sport.id)}
          />
        </Card>
      )) : null}
    </Screen>
  );
}
