import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { AppRole, Arena, MobilePage, SportConfig } from "../lib/types";
import { daysUntil, formatPlanDate, planRenewLabel } from "../lib/opsHelpers";
import { sportImage } from "../lib/sportArt";
import { Card, Kicker, LinkButton, Muted, Screen, Title, colors } from "../components/ui";

const allModules: Array<{ id: MobilePage; label: string; tone: string; ownerOnly?: boolean }> = [
  { id: "sales", label: "Sales Report", tone: "#6d28d9", ownerOnly: true },
  { id: "coaching", label: "Coaching", tone: "#0f766e" },
  { id: "billing", label: "Membership", tone: "#be123c" },
  { id: "invoice", label: "Generate Invoice", tone: "#4338ca" },
  { id: "menu", label: "Manage Menu", tone: "#1d4ed8" },
  { id: "profile", label: "Profile", tone: "#b45309" },
  { id: "booking", label: "Beverages & Equipment", tone: "#c2410c" },
];

export function HomeScreen({
  email,
  arena,
  role,
  sports,
  onOpen,
  onOpenBooking,
  onLogout,
  onUpgrade,
}: {
  email: string;
  arena: Arena;
  role: AppRole;
  sports: SportConfig[];
  onOpen: (page: MobilePage) => void;
  onOpenBooking: (sport: SportConfig | null, bevOnly: boolean) => void;
  onLogout: () => void;
  onUpgrade?: () => void;
}) {
  const isOwner = role === "owner";
  const modules = allModules.filter((module) => isOwner || !module.ownerOnly);
  const days = daysUntil(arena.trial_ends_at) ?? 0;
  const trialActive = arena.status === "trialing" || arena.status === "created";
  const planDaysLeft = ["active", "authenticated"].includes(arena.status)
    ? daysUntil(arena.current_period_ends_at)
    : null;
  const renewSoon = planDaysLeft !== null && planDaysLeft <= 7;
  const trialLabel = trialActive
    ? (arena.trial_ends_at ? `${days}d trial` : "Trial")
    : ["active", "authenticated"].includes(arena.status)
      ? "Active"
      : arena.status;
  const planChip = arena.current_period_ends_at
    ? `Till ${formatPlanDate(arena.current_period_ends_at)}`
    : trialActive
      ? (days > 0 ? `${days}d trial` : "Trial end")
      : "₹499/mo";

  return (
    <Screen>
      <Image source={require("../assets/sportzarena-logo.png")} style={styles.logo} resizeMode="contain" />

      <View style={styles.welcome}>
        <View style={{ flex: 1 }}>
          <Kicker>{arena.name.toUpperCase()}</Kicker>
          <Title>Welcome, {arena.name}</Title>
          <Muted>
            {isOwner
              ? "Book courts, bill walk-ins, and review sales — including staff bills."
              : "Book courts, bill walk-ins, and keep coaching and membership running."}
          </Muted>
          <Muted>Signed in as {email} · {isOwner ? "Owner" : "Staff"}</Muted>
          <Muted>{planRenewLabel(arena)}</Muted>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(arena.name.trim()[0] || "A").toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{trialLabel}</Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>Sports</Text>
          <Text style={styles.statusValue}>{sports.length}</Text>
        </View>
        <View style={styles.statusChip}>
          <Text style={styles.statusLabel}>Plan</Text>
          <Text style={styles.statusValue}>{planChip}</Text>
        </View>
      </View>

      {renewSoon && isOwner && !trialActive && onUpgrade ? (
        <Card>
          <Text style={{ fontWeight: "700", color: colors.navy }}>
            {planDaysLeft === 0
              ? "Your plan ended — renew to stay online"
              : `Plan renews in ${planDaysLeft} day${planDaysLeft === 1 ? "" : "s"}`}
          </Text>
          <Muted>
            {arena.current_period_ends_at
              ? `Renew before ${formatPlanDate(arena.current_period_ends_at)} to avoid interruption.`
              : "Renew your SportzArena plan to keep access."}
          </Muted>
          <LinkButton label="Renew plan →" onPress={onUpgrade} />
        </Card>
      ) : null}

      {trialActive && isOwner && onUpgrade ? (
        <Card>
          <Text style={{ fontWeight: "700", color: colors.navy }}>
            {days > 0 ? `${days} days left on your free trial` : "Your free trial ends today"}
          </Text>
          <Muted>Keep bookings, invoices, coaching and sales running without interruption.</Muted>
          <LinkButton label="Choose a plan →" onPress={onUpgrade} />
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {isOwner ? <LinkButton label="Add sports" onPress={() => onOpen("sports")} /> : null}
        {((trialActive && onUpgrade) || (renewSoon && isOwner && !trialActive && onUpgrade)) ? (
          <LinkButton
            label={renewSoon && !trialActive ? "Renew" : "Upgrade"}
            onPress={onUpgrade}
          />
        ) : null}
        <LinkButton label="Sign out" onPress={onLogout} />
      </View>

      <Text style={styles.section}>Quick actions</Text>
      <View style={styles.grid}>
        {modules.map((module) => (
          <Pressable
            key={module.id}
            style={[styles.tile, { borderColor: module.tone }]}
            onPress={() => {
              if (module.id === "booking") onOpenBooking(null, true);
              else onOpen(module.id);
            }}
          >
            <Text style={[styles.tileLabel, { color: module.tone }]}>{module.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Select sport to book</Text>
      {sports.length === 0 ? (
        <Card>
          <Muted>
            {isOwner
              ? "No sports configured yet. Tap Add sports to choose them."
              : "No sports configured yet. Ask the owner to add sports."}
          </Muted>
          {isOwner ? <LinkButton label="Add sports →" onPress={() => onOpen("sports")} /> : null}
        </Card>
      ) : (
        <View style={styles.grid}>
          {sports.map((sport) => {
            const img = sportImage(sport.name);
            return (
              <Pressable
                key={sport.id}
                style={[styles.tile, styles.sportTile]}
                onPress={() => onOpenBooking(sport, false)}
              >
                {img ? <Image source={img} style={styles.sportArt} resizeMode="contain" /> : null}
                <Text style={[styles.tileLabel, { color: colors.navy }]}>{sport.name}</Text>
                <Text style={styles.tileMeta}>₹{sport.pricePerHour}/hr</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { width: 150, height: 64 },
  welcome: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  statusRow: { flexDirection: "row", gap: 8 },
  statusChip: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
  },
  statusLabel: { color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  statusValue: { color: colors.navy, fontSize: 14, fontWeight: "800", marginTop: 2 },
  section: {
    marginTop: 8,
    color: colors.navy,
    fontSize: 14,
    fontWeight: "700",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    width: "47%",
    minHeight: 78,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 14,
    justifyContent: "center",
  },
  sportTile: { alignItems: "flex-start", minHeight: 120 },
  sportArt: { width: 44, height: 44, marginBottom: 8 },
  tileLabel: { fontSize: 14, fontWeight: "700" },
  tileMeta: { marginTop: 4, color: colors.muted, fontSize: 12 },
});
