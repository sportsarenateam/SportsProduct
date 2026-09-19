import { useState } from "react";
import { Image, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import type { Session } from "@supabase/supabase-js";
import { getApiUrl, publicRequest } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  Card,
  Chip,
  ErrorText,
  Field,
  Kicker,
  Label,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
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
  const [tab, setTab] = useState<"otp" | "password">("otp");
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
        options: {
          // Same as web: OTP can create the Auth user; arena/password come after.
          shouldCreateUser: true,
        },
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
      // Same as web — soft-fail if phone cannot reach LAN API yet.
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
        // Continue — Supabase password login still works without email-status.
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
    <Screen navy>
      <StatusBar style="light" />
      <Image
        source={require("../assets/sportzarena-logo.png")}
        style={{ width: 168, height: 72, alignSelf: "flex-start" }}
        resizeMode="contain"
      />
      <Kicker>SPORTZARENA</Kicker>
      <Title light>Welcome back</Title>
      <Muted light>
        {tab === "otp"
          ? (codeSent
            ? `Enter the code sent to ${email}`
            : "Enter your email for a one-time code. New owners start here too.")
          : "Sign in with the password you created after OTP."}
      </Muted>
      {onBack ? <LinkButton label="← SportzArena" onPress={onBack} light /> : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip
          label="Email OTP"
          active={tab === "otp"}
          onPress={() => { setTab("otp"); setError(""); setMessage(""); }}
        />
        <Chip
          label="Password"
          active={tab === "password"}
          onPress={() => { setTab("password"); setError(""); setMessage(""); setCodeSent(false); }}
        />
      </View>

      <Card>
        <Label>Email</Label>
        <Field
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@yourarena.com"
          value={email}
          onChangeText={setEmail}
          editable={!busy && !(tab === "otp" && codeSent)}
        />

        {tab === "password" ? (
          <>
            <Label>Password</Label>
            <Field
              secureTextEntry
              autoComplete="password"
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
            <LinkButton label="Forgot password?" onPress={() => onForgotPassword?.()} />
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
          <PrimaryButton label="Log in with password" busy={busy} onPress={passwordLogin} />
        ) : (
          <PrimaryButton
            label={codeSent ? "Verify OTP" : "Send OTP"}
            busy={busy}
            onPress={codeSent ? verifyOtp : sendOtp}
          />
        )}

        {tab === "otp" && codeSent ? (
          <>
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
          </>
        ) : null}
      </Card>

      <Muted light>Staff: use the email your owner invited, then Email OTP or Password.</Muted>
    </Screen>
  );
}
