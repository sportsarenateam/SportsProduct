import { useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { apiRequest } from "../lib/api";
import { mobileDigits, sanitizeMobileInput } from "../lib/opsHelpers";
import type { Arena } from "../lib/types";
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
import { supabase } from "../lib/supabase";

export function ArenaOnboardingScreen({
  session,
  onComplete,
}: {
  session: Session;
  onComplete: (arena: Arena) => void;
}) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createArena() {
    const arenaName = name.trim();
    if (arenaName.length < 2) {
      setError("Enter your arena name (at least 2 characters).");
      return;
    }
    const contactPhone = mobileDigits(phone);
    if (contactPhone && contactPhone.length !== 10) {
      setError("Contact phone must be exactly 10 digits");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{
        organization: { id: string; name: string };
        subscription: { trialEndsAt: string | null; status: string };
      }>(session, "/onboarding/arena", {
        method: "POST",
        body: JSON.stringify({
          arenaName,
          address: address.trim(),
          contactPhone,
          timezone: "Asia/Kolkata",
          currencyCode: "INR",
        }),
      });
      onComplete({
        id: result.organization.id,
        name: result.organization.name,
        trial_ends_at: result.subscription.trialEndsAt,
        status: result.subscription.status,
        address: address.trim(),
        contactPhone,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create arena");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Title>Name your sports arena</Title>
      <Muted>
        Start your 30-day free trial, then choose sports. If you were invited as Staff, sign out and ask the owner to add your email under Profile → Staff.
      </Muted>
      <Card>
        <Label>Sports arena name</Label>
        <Field value={name} onChangeText={setName} placeholder="e.g. CTC Sports" editable={!busy} />
        <Label>Address</Label>
        <Field value={address} onChangeText={setAddress} editable={!busy} />
        <Label>Contact phone</Label>
        <Field
          keyboardType="number-pad"
          maxLength={10}
          value={phone}
          onChangeText={(v) => setPhone(sanitizeMobileInput(v))}
          editable={!busy}
        />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton label="Continue to sports" busy={busy} onPress={createArena} />
        <LinkButton label="Sign out" onPress={() => supabase.auth.signOut()} />
      </Card>
    </Screen>
  );
}
