import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import { mobileDigits } from "../lib/opsHelpers";
import { BackHeader, Card, DeleteIconButton, ErrorText, Muted, Screen } from "../components/ui";
import { useTheme } from "../lib/theme";

type ExpiringEntry = {
  id: string;
  customer_name: string;
  customer_mobile: string;
  sport_name?: string;
  end_date?: string | null;
};

function formatEndDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function MembershipExpiringScreen({
  session,
  arenaId,
  arenaName,
  arenaPhone,
  onBack,
}: {
  session: Session;
  arenaId: string;
  arenaName: string;
  arenaPhone?: string;
  onBack: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [entries, setEntries] = useState<ExpiringEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await opsRequest<{ entries: ExpiringEntry[] }>(
        session,
        arenaId,
        "/ops/membership-reminders?withinDays=1",
      );
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load expiring memberships");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, [session.access_token, arenaId]);

  async function remind(entry: ExpiringEntry) {
    const digits = mobileDigits(entry.customer_mobile);
    if (digits.length !== 10) {
      setError("Invalid mobile number for this member");
      return;
    }
    const helpdesk = arenaPhone ? mobileDigits(arenaPhone) : "";
    const contactLine = helpdesk.length === 10
      ? `To renew, please contact ${arenaName} help desk at +91 ${helpdesk}.`
      : `To renew, please contact ${arenaName}.`;
    const message = `Hi ${entry.customer_name}, thanks for choosing ${arenaName}! Your membership is going to expire on ${formatEndDate(entry.end_date)}. We'd love to have you back on court — renew now so you don't miss your sessions. ${contactLine} See you soon!`;
    const url = `https://wa.me/91${digits}?text=${encodeURIComponent(message)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      setError("Unable to open WhatsApp on this device");
      return;
    }
    await Linking.openURL(url);
  }

  function confirmDelete(entry: ExpiringEntry) {
    Alert.alert(
      "Delete membership?",
      `Remove ${entry.customer_name} after they renew?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            removeEntry(entry).catch(() => undefined);
          },
        },
      ],
    );
  }

  async function removeEntry(entry: ExpiringEntry) {
    setError("");
    try {
      await opsRequest(session, arenaId, `/ops/membership-billing/${entry.id}`, { method: "DELETE" });
      setEntries((current) => current.filter((row) => row.id !== entry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete membership");
    }
  }

  return (
    <Screen>
      <BackHeader title="Membership expiring" onBack={onBack} />
      <Muted>Members ending today or tomorrow. Remind via WhatsApp; Delete after they renew.</Muted>
      <Pressable onPress={() => load().catch(() => undefined)}>
        <Text style={[styles.refresh, { color: themeColors.navy }]}>Refresh</Text>
      </Pressable>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {loading ? (
        <Muted>Loading…</Muted>
      ) : entries.length === 0 ? (
        <Card>
          <Muted>No memberships expiring within 1 day.</Muted>
        </Card>
      ) : (
        entries.map((entry) => (
          <Card key={entry.id}>
            <Text style={[styles.name, { color: themeColors.navy }]}>{entry.customer_name}</Text>
            <Muted>Ends {formatEndDate(entry.end_date)}</Muted>
            <Muted>+91 {entry.customer_mobile}</Muted>
            {entry.sport_name ? <Muted>{entry.sport_name}</Muted> : null}
            <View style={styles.row}>
              <Pressable style={styles.remindBtn} onPress={() => remind(entry).catch(() => undefined)}>
                <Text style={styles.remindLabel}>Remind</Text>
              </Pressable>
              <DeleteIconButton onPress={() => confirmDelete(entry)} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  refresh: {
    fontWeight: "700",
    marginBottom: 8,
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
  },
  row: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
  },
  remindBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  remindLabel: {
    color: "#fff",
    fontWeight: "700",
  },
});
