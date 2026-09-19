import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { assertPasswordStrength, PASSWORD_HINT } from "../lib/opsHelpers";
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
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error(sessionError?.message ?? "Session expired. Sign in again.");
      }
      onDone(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Create password</Title>
      <Muted>Set a password so you can sign in on this phone without waiting for OTP next time.</Muted>
      <Muted>{PASSWORD_HINT}</Muted>
      <Card>
        <Label>New password</Label>
        <Field secureTextEntry value={password} onChangeText={setPassword} placeholder="Strong password" />
        <Label>Confirm password</Label>
        <Field secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton label="Save password" busy={busy} onPress={save} />
      </Card>
    </Screen>
  );
}
