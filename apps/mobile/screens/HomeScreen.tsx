import { useEffect, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Session } from "@supabase/supabase-js";
import type { AppRole, Arena, MobilePage, SportConfig } from "../lib/types";
import { daysUntil, formatPlanDate, planRenewLabel } from "../lib/opsHelpers";
import { sportImage } from "../lib/sportArt";
import { opsRequest } from "../lib/api";
import {
  Card,
  LinkButton,
  ModuleTile,
  Muted,
  Screen,
  SectionLabel,
  SportPickTile,
  TrialBanner,
  WorkspaceHeader,
  tones,
  type ModuleIconName,
} from "../components/ui";
import { useTheme } from "../lib/theme";

const quickModules: Array<{
  id: MobilePage;
  label: string;
  tone: string;
  icon: ModuleIconName;
  ownerOnly?: boolean;
}> = [
  { id: "booking", label: "Add Booking", tone: tones.purple, icon: "booking" },
  { id: "sales", label: "View Reports", tone: tones.teal, icon: "sales", ownerOnly: true },
  { id: "coaching", label: "Coaching", tone: tones.rose, icon: "coaching" },
  { id: "billing", label: "Membership", tone: tones.amber, icon: "billing" },
  { id: "expiring", label: "Expiring soon", tone: tones.amber, icon: "expiring" },
  { id: "invoice", label: "Invoice", tone: tones.indigo, icon: "invoice" },
  { id: "menu", label: "Manage Menu", tone: tones.indigo, icon: "menu" },
  { id: "profile", label: "Profile", tone: tones.amber, icon: "profile" },
];

function greetingName(email: string, role: AppRole) {
  if (role === "owner") return "Admin";
  const local = email.split("@")[0]?.trim();
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function HomeScreen({
  session,
  email,
  arena,
  role,
  sports,
  onOpen,
  onOpenBooking,
  onUpgrade,
  onOpenProfile,
}: {
  session: Session;
  email: string;
  arena: Arena;
  role: AppRole;
  sports: SportConfig[];
  onOpen: (page: MobilePage) => void;
  onOpenBooking: (sport: SportConfig | null, bevOnly: boolean) => void;
  onUpgrade?: () => void;
  onOpenProfile: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const sportTileWidth = Math.min(96, Math.floor((windowWidth - 52) / 2));
  const isOwner = role === "owner";
  const modules = quickModules.filter((module) => isOwner || !module.ownerOnly);
  const days = daysUntil(arena.trial_ends_at) ?? 0;
  const trialActive = arena.status === "trialing" || arena.status === "created";
  const planDaysLeft = ["active", "authenticated"].includes(arena.status)
    ? daysUntil(arena.current_period_ends_at)
    : null;
  const renewSoon = planDaysLeft !== null && planDaysLeft <= 7;
  const showUpgrade = Boolean(
    (trialActive && onUpgrade) || (renewSoon && isOwner && !trialActive && onUpgrade),
  );

  const [stats, setStats] = useState({ revenue: 0, bookings: 0, customers: 0 });

  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    Promise.all([
      opsRequest<{ transactions: Array<{ created_at?: string; grand_total?: number; customer_mobile?: string; sport_name?: string }> }>(
        session,
        arena.id,
        "/ops/transactions",
      ),
      opsRequest<{ entries: Array<{ created_at?: string; amount?: number; discount?: number; advance?: number }> }>(
        session,
        arena.id,
        "/ops/coaching",
      ).catch(() => ({ entries: [] })),
      opsRequest<{ entries: Array<{ created_at?: string; amount?: number }> }>(
        session,
        arena.id,
        "/ops/membership-billing",
      ).catch(() => ({ entries: [] })),
    ])
      .then(([txData, coachData, memberData]) => {
        if (cancelled) return;
        const tx = (txData.transactions ?? []).filter((row) => String(row.created_at ?? "").slice(0, 7) === monthKey);
        const coach = (coachData.entries ?? []).filter((row) => String(row.created_at ?? "").slice(0, 7) === monthKey);
        const member = (memberData.entries ?? []).filter((row) => String(row.created_at ?? "").slice(0, 7) === monthKey);
        const txRevenue = tx.reduce((sum, row) => sum + Number(row.grand_total || 0), 0);
        const coachRevenue = coach.reduce(
          (sum, row) => sum + Math.max(0, Number(row.amount || 0) - Number(row.discount || 0) - Number(row.advance || 0)),
          0,
        );
        const memberRevenue = member.reduce((sum, row) => sum + Number(row.amount || 0), 0);
        setStats({
          revenue: txRevenue + coachRevenue + memberRevenue,
          bookings: tx.filter((row) => String(row.sport_name ?? "").trim()).length,
          customers: new Set(tx.map((row) => row.customer_mobile).filter(Boolean)).size,
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [isOwner, session, arena.id]);

  const courtsOnline = sports.reduce((sum, sport) => sum + (sport.courts?.length ?? 0), 0);

  const kpis = isOwner
    ? [
        { label: "Total Revenue", value: `₹${stats.revenue.toLocaleString("en-IN")}`, tone: "#00D084", icon: "wallet" as const, hint: "This month" },
        { label: "Total Bookings", value: String(stats.bookings), tone: "#008CFF", icon: "calendar" as const, hint: "This month" },
        { label: "Active Customers", value: String(stats.customers), tone: "#7C3AED", icon: "people" as const, hint: "This month" },
        { label: "Courts Online", value: String(courtsOnline), tone: "#0B2D58", icon: "grid" as const, hint: `${sports.length} sports` },
      ]
    : [
        { label: "Sports", value: String(sports.length), tone: "#008CFF", icon: "football" as const, hint: "Available" },
        { label: "Courts Online", value: String(courtsOnline), tone: "#0B2D58", icon: "grid" as const, hint: "Ready to book" },
        { label: "Plan", value: trialActive ? (days > 0 ? `${days}d` : "End") : "Active", tone: "#00D084", icon: "ribbon" as const, hint: planRenewLabel(arena) },
        { label: "Role", value: "Staff", tone: "#F59E0B", icon: "person" as const, hint: email },
      ];

  return (
    <Screen
      header={(
        <WorkspaceHeader
          arenaName={arena.name}
          planLabel={planRenewLabel(arena)}
          onUpgrade={showUpgrade ? onUpgrade : undefined}
          onOpenProfile={onOpenProfile}
        />
      )}
    >
      <View style={[styles.heroBanner, { backgroundColor: themeColors.navyDeep }]}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>
            {timeGreeting()}, {greetingName(email, role)} 👋
          </Text>
          <Text style={styles.heroLead}>Here&apos;s what&apos;s happening with your arena today.</Text>
        </View>
        <Image
          source={require("../assets/sportzarena-logo.png")}
          style={styles.heroLogo}
          resizeMode="contain"
        />
      </View>

      {renewSoon && isOwner && !trialActive && onUpgrade ? (
        <TrialBanner
          title={
            planDaysLeft === 0
              ? "Your plan ended — renew to stay online"
              : `Plan renews in ${planDaysLeft} day${planDaysLeft === 1 ? "" : "s"}`
          }
          body={
            arena.current_period_ends_at
              ? `Renew before ${formatPlanDate(arena.current_period_ends_at)} to avoid interruption.`
              : "Renew your SportzArena plan to keep access."
          }
          actionLabel="Renew plan"
          onAction={onUpgrade}
        />
      ) : null}

      {trialActive && isOwner && onUpgrade ? (
        <TrialBanner
          title={days > 0 ? `${days} days left on your free trial` : "Your free trial ends today"}
          body="Subscribe anytime to keep bookings and billing uninterrupted."
          actionLabel="Choose a plan"
          onAction={onUpgrade}
        />
      ) : null}

      <View style={styles.kpiGrid}>
        {kpis.map((kpi) => (
          <View
            key={kpi.label}
            style={[styles.kpiCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          >
            <View style={[styles.kpiIcon, { backgroundColor: kpi.tone }]}>
              <Ionicons name={kpi.icon} size={18} color="#fff" />
            </View>
            <Text style={[styles.kpiLabel, { color: themeColors.faint }]} numberOfLines={1}>{kpi.label}</Text>
            <Text style={[styles.kpiValue, { color: themeColors.text }]} numberOfLines={1}>{kpi.value}</Text>
            <Text style={[styles.kpiHint, { color: themeColors.greenDeep }]} numberOfLines={1}>{kpi.hint}</Text>
          </View>
        ))}
      </View>

      <SectionLabel>Quick actions</SectionLabel>
      <View style={styles.quickRow}>
        {modules.map((module) => (
          <ModuleTile
            key={module.id}
            label={module.label}
            tone={module.tone}
            icon={module.icon}
            onPress={() => {
              if (module.id === "booking") onOpenBooking(null, false);
              else onOpen(module.id);
            }}
          />
        ))}
      </View>

      <View style={styles.sportsHead}>
        <Text style={[styles.sportsTitle, { color: themeColors.text }]}>Sports & Arenas</Text>
        {isOwner ? <LinkButton label="Manage" onPress={() => onOpen("sports")} /> : null}
      </View>
      {sports.length === 0 ? (
        <Card>
          <Muted>
            {isOwner
              ? "No sports selected yet. Use Manage to add sports."
              : "No sports selected yet. Ask the owner to add sports."}
          </Muted>
          {isOwner ? <LinkButton label="Add sports" onPress={() => onOpen("sports")} /> : null}
        </Card>
      ) : (
        <View style={styles.sportGrid}>
          {sports.map((sport) => (
            <SportPickTile
              key={sport.id}
              name={sport.name}
              image={sportImage(sport.name)}
              caption={`${sport.courts.length} court${sport.courts.length === 1 ? "" : "s"}`}
              width={sportTileWidth}
              onPress={() => onOpenBooking(sport, false)}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroBanner: {
    borderRadius: 18,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  heroCopy: { flex: 1, gap: 6 },
  heroTitle: { color: "#fff", fontSize: 22, fontWeight: "800", letterSpacing: -0.3 },
  heroLead: { color: "#D6E6F5", fontSize: 13, lineHeight: 18 },
  heroLogo: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: "#fff",
    opacity: 0.95,
  },
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  kpiCard: {
    width: "47.5%",
    flexGrow: 1,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  kpiIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  kpiLabel: { fontSize: 11, fontWeight: "700" },
  kpiValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  kpiHint: { fontSize: 11, fontWeight: "700" },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sportsHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 4,
  },
  sportsTitle: { fontSize: 17, fontWeight: "800" },
  sportGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
});
