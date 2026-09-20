import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinkButton, PrimaryButton } from "../components/ui";

export function LandingScreen({
  onSignIn,
}: {
  onSignIn: () => void;
}) {
  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ImageBackground
        source={require("../assets/sportzarena-login-bg.png")}
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <LinearGradient
          colors={["rgba(4,22,40,0.35)", "rgba(4,22,40,0.25)", "rgba(4,22,40,0.82)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          <View style={styles.spacer} />

          <View style={styles.copy}>
            <Text style={styles.headline}>
              Your Sports Venue,{"\n"}
              <Text style={styles.headlineAccent}>Our Smart Solution</Text>
            </Text>
            <Text style={styles.lead}>
              Easily manage bookings, customers, revenue and expenses — all in one place.
            </Text>
          </View>

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <PrimaryButton label="Login →" onPress={onSignIn} />
            <View style={styles.trialRow}>
              <Text style={styles.trialText}>Don&apos;t have an account? </Text>
              <LinkButton label="Start Free Trial" onPress={onSignIn} light />
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#041628" },
  bg: { flex: 1 },
  bgImage: { resizeMode: "cover" },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  spacer: { flex: 1 },
  copy: { gap: 14 },
  headline: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  headlineAccent: { color: "#00D084" },
  lead: {
    color: "#D6E6F5",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
  },
  actions: { gap: 16 },
  trialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  trialText: { color: "#D6E6F5", fontSize: 14, fontWeight: "600" },
});
