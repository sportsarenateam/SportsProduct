import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { sportImage } from "../lib/sportArt";
import {
  Card,
  Kicker,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
  Title,
  colors,
} from "../components/ui";

const SPORTS = ["Cricket Turf", "Badminton", "Football", "Pickleball", "Table Tennis", "Skating"] as const;

export function LandingScreen({
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  return (
    <Screen navy>
      <StatusBar style="light" />

      <View style={styles.topNav}>
        <Image
          source={require("../assets/sportzarena-logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
        <LinkButton label="Log in" onPress={onSignIn} light />
      </View>

      <Text style={styles.brand}>SportzArena</Text>
      <Title light>Run your sports arena with clarity.</Title>
      <Muted light>
        Bookings, invoices, coaching and sales — one app for Indian venues. Owner and Staff sign in the same way as web: Email OTP or Password.
      </Muted>

      <PrimaryButton label="Start free trial →" onPress={onSignIn} />
      <LinkButton label="Already have an account? Log in" onPress={onSignIn} light />

      <Text style={styles.sectionLabel}>ONE HOME FOR EVERY ACTIVITY</Text>
      <View style={styles.sportRow}>
        {SPORTS.map((name) => {
          const img = sportImage(name);
          return (
            <View key={name} style={styles.sportTile}>
              {img ? <Image source={img} style={styles.sportArt} resizeMode="contain" /> : null}
              <Text style={styles.sportName}>{name}</Text>
            </View>
          );
        })}
      </View>

      <Card>
        <Kicker>STARTER · ₹499/MO</Kicker>
        <Text style={styles.planTitle}>Everything one arena needs</Text>
        <Muted>30-day free trial · Start with Email OTP · No separate create-account form</Muted>
        <Muted>✓ Court & walk-in billing</Muted>
        <Muted>✓ Invoices & sales reports</Muted>
        <Muted>✓ Coaching & memberships</Muted>
        <Muted>✓ Owner invites Staff from Profile</Muted>
        <PrimaryButton label="Log in / Start trial" onPress={onSignIn} />
      </Card>

      <Pressable onPress={onSignIn} style={styles.staffHint}>
        <Muted light>Staff? Log in after your owner invites you.</Muted>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  logo: { width: 140, height: 56 },
  brand: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 8,
  },
  sectionLabel: {
    marginTop: 18,
    color: colors.green,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  sportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sportTile: {
    width: "30%",
    minWidth: 96,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    gap: 6,
  },
  sportArt: { width: 36, height: 36 },
  sportName: { color: "#d7e6f5", fontSize: 11, fontWeight: "600", textAlign: "center" },
  planTitle: { color: colors.navy, fontSize: 18, fontWeight: "700" },
  staffHint: { paddingVertical: 8 },
});
