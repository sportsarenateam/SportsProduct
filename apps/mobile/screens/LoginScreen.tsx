import { useState } from "react";
import {
  ImageBackground,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { getApiUrl, publicRequest } from "../lib/api";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import {
  Chip,
  ErrorText,
  Field,
  Label,
  LinkButton,
  Muted,
  PasswordField,
  PrimaryButton,
  Title,
} from "../components/ui";

function friendlyNetworkError(err: unknown, fallback: string) {
  const text = err instanceof Error ? err.message : String(err ?? "");
  if (/network request failed|failed to fetch|networkerror|typeerror/i.test(text)) {
    return (
      "Network request failed. Email OTP talks to Supabase (needs internet). "
      + `Password check may also need the API at ${getApiUrl()}.`
    );
  }
  return text || fallback;
}

export function LoginScreen({
  onSession,
  onBack,
  onForgotPassword,
}: {
  onSession: (session: Session) => void;
  onBack?: () => void;
  onForgotPassword?: () => void;
}) {
  const { colors: themeColors } = useTheme();
  const [tab, setTab] = useState<"otp" | "password">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function sendOtp() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Enter your email address.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: true },
      });
      if (otpError) throw otpError;
      setCodeSent(true);
      setMessage("Check your inbox for the code. After OTP you’ll set a password, then continue.");
    } catch (err) {
      setError(friendlyNetworkError(err, "Unable to send OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    const token = code.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit OTP from your email.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (verifyError) {
        throw new Error(`${verifyError.message}. You can also open the magic link in the same email.`);
      }
      if (data.session) onSession(data.session);
    } catch (err) {
      setError(friendlyNetworkError(err, "Invalid or expired OTP"));
    } finally {
      setBusy(false);
    }
  }

  async function passwordLogin() {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !password) {
      setError("Enter email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let hasPassword: boolean | undefined;
      try {
        const status = await publicRequest<{ exists?: boolean; hasPassword?: boolean }>(
          "/auth/email-status",
          { method: "POST", body: JSON.stringify({ email: normalized }) },
        );
        if (status.exists === false) {
          throw new Error("No account found for this email. Use Email OTP to get started.");
        }
        hasPassword = status.hasPassword;
      } catch (statusErr) {
        if (statusErr instanceof Error && /No account found/i.test(statusErr.message)) {
          throw statusErr;
        }
      }

      const result = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });
      if (result.error) {
        const msg = result.error.message;
        if (/confirm|not confirmed/i.test(msg)) {
          throw new Error("Please confirm your email first, or wait a minute and try again.");
        }
        if (/rate limit|too many|429/i.test(msg)) {
          throw new Error("Too many login attempts. Wait about a minute, then try again.");
        }
        if (/invalid login credentials|invalid.*password|email not confirmed/i.test(msg)) {
          if (hasPassword === false) {
            throw new Error("Password is not set yet. Use Email OTP, then set a password.");
          }
          throw new Error("Password is wrong. Try again or use Email OTP.");
        }
        throw result.error;
      }
      if (result.data.session) onSession(result.data.session);
    } catch (err) {
      setError(friendlyNetworkError(err, "Unable to sign in"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <ImageBackground
        source={require("../assets/sportzarena-login-bg.png")}
        style={styles.bg}
        imageStyle={styles.bgImage}
      >
        <LinearGradient
          colors={["rgba(4,22,40,0.72)", "rgba(4,22,40,0.55)", "rgba(4,22,40,0.88)"]}
          locations={[0, 0.35, 1]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView style={styles.safe} edges={["top", "left", "right", "bottom"]}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.backRow} hitSlop={8}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
          ) : null}

          <View style={styles.card}>
            <Title>Welcome back! 👋</Title>
            <Muted>
              {tab === "otp"
                ? (codeSent
                  ? `Enter the code sent to ${email}`
                  : "New here? Use Email OTP — returning users should use Password.")
                : "Log in to your account to manage your sports venue."}
            </Muted>

            <View style={styles.tabs}>
              <Chip
                label="Password"
                active={tab === "password"}
                onPress={() => { setTab("password"); setError(""); setMessage(""); setCodeSent(false); }}
              />
              <Chip
                label="Email OTP"
                active={tab === "otp"}
                onPress={() => { setTab("otp"); setError(""); setMessage(""); }}
              />
            </View>

            <View style={styles.form}>
              <Label>Email</Label>
              <View style={styles.inputWrap}>
                <Ionicons name="mail-outline" size={18} color={themeColors.faint} style={styles.inputIcon} />
                <Field
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder=""
                  value={email}
                  onChangeText={setEmail}
                  editable={!busy && !(tab === "otp" && codeSent)}
                  style={styles.inputWithIcon}
                />
              </View>

              {tab === "password" ? (
                <>
                  <Label>Password</Label>
                  <View style={styles.inputWrap}>
                    <Ionicons name="lock-closed-outline" size={18} color={themeColors.faint} style={styles.inputIcon} />
                    <PasswordField
                      autoComplete="password"
                      placeholder=""
                      value={password}
                      onChangeText={setPassword}
                      editable={!busy}
                      style={styles.inputWithIcon}
                    />
                  </View>
                  <View style={styles.forgotRow}>
                    <LinkButton label="Forgot Password?" onPress={() => onForgotPassword?.()} />
                  </View>
                </>
              ) : null}

              {tab === "otp" && codeSent ? (
                <>
                  <Label>OTP code</Label>
                  <Field
                    keyboardType="number-pad"
                    maxLength={8}
                    placeholder="••••••"
                    value={code}
                    onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))}
                    editable={!busy}
                  />
                </>
              ) : null}

              {message ? <Muted>{message}</Muted> : null}
              <ErrorText>{error}</ErrorText>

              {tab === "password" ? (
                <PrimaryButton label="Login →" busy={busy} onPress={passwordLogin} />
              ) : (
                <PrimaryButton
                  label={codeSent ? "Verify OTP" : "Send OTP"}
                  busy={busy}
                  onPress={codeSent ? verifyOtp : sendOtp}
                />
              )}

              {tab === "otp" && codeSent ? (
                <View style={styles.otpLinks}>
                  <LinkButton
                    label="Resend OTP"
                    onPress={async () => {
                      setCode("");
                      setMessage("");
                      await sendOtp();
                    }}
                  />
                  <LinkButton
                    label="Change email"
                    onPress={() => { setCodeSent(false); setCode(""); setMessage(""); setError(""); }}
                  />
                </View>
              ) : null}
            </View>

            {tab === "password" ? (
              <Pressable
                onPress={() => { setTab("otp"); setError(""); setMessage(""); }}
                style={styles.otpSwitch}
              >
                <Text style={[styles.otpSwitchText, { color: themeColors.text }]}>Prefer Email OTP?</Text>
              </Pressable>
            ) : null}

            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: themeColors.muted }]}>Don&apos;t have an account? </Text>
              <LinkButton
                label="Start Free Trial"
                onPress={() => { setTab("otp"); setError(""); setMessage(""); setCodeSent(false); }}
              />
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    justifyContent: "center",
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, marginBottom: 12 },
  backText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.95)",
  },
  tabs: { flexDirection: "row", gap: 8, justifyContent: "center" },
  form: { gap: 10 },
  inputWrap: { position: "relative", justifyContent: "center" },
  inputIcon: { position: "absolute", left: 14, zIndex: 2 },
  inputWithIcon: { paddingLeft: 42 },
  forgotRow: { alignItems: "flex-end", marginTop: -4 },
  otpLinks: { gap: 4 },
  otpSwitch: { alignItems: "center", paddingVertical: 4 },
  otpSwitchText: { fontSize: 13, fontWeight: "700" },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  footerText: { fontSize: 13, fontWeight: "600" },
});
