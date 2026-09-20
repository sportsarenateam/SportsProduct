import { useState } from "react";
import { StyleSheet, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { apiRequest } from "../lib/api";
import { sportImage } from "../lib/sportArt";
import {
  BackHeader,
  Card,
  ErrorText,
  Muted,
  PrimaryButton,
  Screen,
  SportPickTile,
  Title,
} from "../components/ui";

const SPORT_OPTIONS = [
  "Cricket Turf",
  "Badminton",
  "Football",
  "Pickleball",
  "Table Tennis",
  "Carrom",
  "Skating",
  "Volleyball",
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
      <Muted>Select every sport at your arena. You can change this later from Home → Add sports.</Muted>
      <View style={styles.grid}>
        {SPORT_OPTIONS.map((name) => {
          const chosen = selected.includes(name);
          return (
            <SportPickTile
              key={name}
              name={name}
              image={sportImage(name)}
              active={chosen}
              width="47%"
              onPress={() => toggle(name)}
            />
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

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
});
