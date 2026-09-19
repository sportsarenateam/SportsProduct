import { useState } from "react";
import { supabase } from "../lib/supabase";
import { assertPasswordStrength, PASSWORD_HINT } from "../lib/opsHelpers";
import {
  Card,
  ErrorText,
  Field,
  Label,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from "../components/ui";

/** Forgot password: OTP proves identity (no old password), then set a new strong password. */
export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function sendOtp() {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError("Enter your email");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(normalized);
      if (sendError) throw sendError;
      setStep("otp");
      setMessage("OTP sent. Enter the 6-digit code from your email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send OTP");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    const token = otp.replace(/\D/g, "");
    if (token.length < 6) {
      setError("Enter the 6-digit OTP");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "recovery",
      });
      if (verifyError) throw verifyError;
      if (!data.session) throw new Error("OTP verified but no session. Try again.");
      setStep("password");
      setMessage("OTP verified. Choose a new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired OTP");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword() {
    setBusy(true);
    setError("");
    try {
      assertPasswordStrength(password, confirm);
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });
      if (updateError) {
        if (/same.?password|different from the old/i.test(updateError.message)) {
          throw new Error("New password must be different from your current password");
        }
        throw new Error(updateError.message);
      }
      await supabase.auth.signOut();
      setMessage("Password updated. Log in with your new password.");
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Reset password</Title>
      <Muted>
        Forgot password uses email OTP (you do not enter the old password). After OTP, set a new strong password.
      </Muted>
      <Card>
        {step === "email" ? (
          <>
            <Label>Email</Label>
            <Field
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@yourarena.com"
            />
            <PrimaryButton label="Send OTP" busy={busy} onPress={sendOtp} />
          </>
        ) : null}

        {step === "otp" ? (
          <>
            <Label>OTP code</Label>
            <Field
              keyboardType="number-pad"
              maxLength={8}
              value={otp}
              onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 8))}
              placeholder="••••••"
            />
            <PrimaryButton label="Verify OTP" busy={busy} onPress={verifyOtp} />
            <LinkButton label="Resend OTP" onPress={sendOtp} />
            <LinkButton label="Change email" onPress={() => { setStep("email"); setOtp(""); setError(""); }} />
          </>
        ) : null}

        {step === "password" ? (
          <>
            <Muted>{PASSWORD_HINT}</Muted>
            <Label>New password</Label>
            <Field secureTextEntry value={password} onChangeText={setPassword} placeholder="New password" />
            <Label>Confirm new password</Label>
            <Field secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" />
            <PrimaryButton label="Update password" busy={busy} onPress={savePassword} />
          </>
        ) : null}

        <ErrorText>{error}</ErrorText>
        {message ? <Muted>{message}</Muted> : null}
        <LinkButton label="← Back to login" onPress={onBack} />
      </Card>
    </Screen>
  );
}
