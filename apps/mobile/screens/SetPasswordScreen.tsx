import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  Card,
  ErrorText,
  Field,
  Label,
  Muted,
  PrimaryButton,
  Screen,
  Title,
} from "../components/ui";

export function SetPasswordScreen({ onDone }: { onDone: (session: Session) => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { password_set: true },
    });
    if (updateError && !/same.?password|different from the old/i.test(updateError.message)) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    if (updateError) {
      const { error: metaError } = await supabase.auth.updateUser({ data: { password_set: true } });
      if (metaError) {
        setBusy(false);
        setError(metaError.message);
        return;
      }
    }
    const { data, error: sessionError } = await supabase.auth.getSession();
    setBusy(false);
    if (sessionError || !data.session) {
      setError(sessionError?.message ?? "Session expired. Sign in again.");
      return;
    }
    onDone(data.session);
  }

  return (
    <Screen>
      <Title>Create password</Title>
      <Muted>Set a password so you can sign in on this phone without waiting for OTP next time.</Muted>
      <Card>
        <Label>New password</Label>
        <Field secureTextEntry value={password} onChangeText={setPassword} placeholder="At least 8 characters" />
        <Label>Confirm password</Label>
        <Field secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton label="Save password" busy={busy} onPress={save} />
      </Card>
    </Screen>
  );
}
