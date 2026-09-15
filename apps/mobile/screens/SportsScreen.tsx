import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { apiRequest } from "../lib/api";
import {
  BackHeader,
  Card,
  ErrorText,
  Muted,
  PrimaryButton,
  Screen,
  Title,
  colors,
} from "../components/ui";

const SPORT_OPTIONS = [
  "Cricket Turf",
  "Badminton",
  "Football",
  "Pickleball",
  "Table Tennis",
  "Carrom",
  "Skating",
  "Zumba Class",
  "Tennis",
] as const;

export function SportsScreen({
  session,
  initialSelected = [],
  onBack,
  onSaved,
}: {
  session: Session;
  initialSelected?: string[];
  onBack?: () => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function toggle(name: string) {
    setSelected((current) => (
      current.includes(name) ? current.filter((item) => item !== name) : [...current, name]
    ));
  }

  async function save() {
    if (!selected.length || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiRequest(session, "/onboarding/sports", {
        method: "POST",
        body: JSON.stringify({ sports: selected }),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save sports");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {onBack ? <BackHeader title="Sports" onBack={onBack} /> : null}
      <Title>What sports do you run?</Title>
      <Muted>Select every sport at your arena. You can change this later from Profile actions.</Muted>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {SPORT_OPTIONS.map((name) => {
          const chosen = selected.includes(name);
          return (
            <Pressable
              key={name}
              onPress={() => toggle(name)}
              style={{
                width: "47%",
                minHeight: 72,
                borderRadius: 12,
                borderWidth: 1.5,
                borderColor: chosen ? colors.green : colors.border,
                backgroundColor: chosen ? "#eef9e7" : "#fff",
                padding: 12,
                justifyContent: "center",
              }}
            >
              <Text style={{ color: colors.navy, fontWeight: "700" }}>
                {chosen ? "✓ " : ""}{name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Card>
        <Muted>
          {selected.length
            ? `${selected.length} selected · ${selected.join(" · ")}`
            : "Select at least one sport"}
        </Muted>
        <ErrorText>{error}</ErrorText>
        <PrimaryButton
          label={busy ? "Saving…" : "Save sports"}
          busy={busy}
          disabled={!selected.length}
          onPress={save}
        />
      </Card>
    </Screen>
  );
}
