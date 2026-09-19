import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { opsRequest } from "../lib/api";
import { assertPasswordStrength, isValidMobile, mobileDigits, PASSWORD_HINT, sanitizeMobileInput } from "../lib/opsHelpers";
import type { AppRole, Arena } from "../lib/types";
import { supabase } from "../lib/supabase";
import {
  BackHeader,
  Card,
  ErrorText,
  Field,
  Label,
  LinkButton,
  Muted,
  PrimaryButton,
  Screen,
} from "../components/ui";

type StaffRow = {
  userId: string;
  email: string;
  fullName: string;
  active: boolean;
};

export function ProfileScreen({
  session,
  arena,
  role,
  onBack,
  onSaved,
}: {
  session: Session;
  arena: Arena;
  role: AppRole;
  onBack: () => void;
  onSaved: (next: Partial<Arena>) => void;
}) {
  const isOwner = role === "owner";
  const [name, setName] = useState(arena.name);
  const [address, setAddress] = useState(arena.address ?? "");
  const [pincode, setPincode] = useState(arena.pincode ?? "");
  const [contactPhone, setContactPhone] = useState(arena.contactPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffBusy, setStaffBusy] = useState(false);
  const [staffError, setStaffError] = useState("");
  const [staffMessage, setStaffMessage] = useState("");
  const [staffList, setStaffList] = useState<StaffRow[]>([]);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdSaved, setPwdSaved] = useState(false);

  useEffect(() => {
    opsRequest<{ profile: { name: string; address: string; pincode: string; contactPhone: string } }>(
      session,
      arena.id,
      "/ops/profile",
    )
      .then(({ profile }) => {
        setName(profile.name);
        setAddress(profile.address);
        setPincode(profile.pincode);
        setContactPhone(profile.contactPhone);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load profile"));
  }, [session.access_token, arena.id]);

  async function loadStaff() {
    if (!isOwner) return;
    const data = await opsRequest<{ staff: StaffRow[] }>(session, arena.id, "/ops/staff");
    setStaffList(data.staff.filter((row) => row.active));
  }

  useEffect(() => {
    loadStaff().catch(() => undefined);
  }, [session.access_token, arena.id, isOwner]);

  async function changePassword() {
    setPwdBusy(true);
    setPwdError("");
    setPwdSaved(false);
    try {
      if (!oldPassword) throw new Error("Enter your current password");
      assertPasswordStrength(newPassword, confirmNewPassword);
      if (oldPassword === newPassword) {
        throw new Error("New password must be different from your current password");
      }
      const email = session.user.email;
      if (!email) throw new Error("No email on this account");
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      if (verifyError) throw new Error("Current password is incorrect");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        if (/same.?password|different from the old/i.test(error.message)) {
          throw new Error("New password must be different from your current password");
        }
        throw new Error(error.message);
      }
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPwdSaved(true);
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : "Unable to change password");
    } finally {
      setPwdBusy(false);
    }
  }

  async function save() {
    if (!isOwner) return;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      if (contactPhone && !isValidMobile(contactPhone, true)) {
        throw new Error("Enter a valid 10-digit mobile number");
      }
      const { profile } = await opsRequest<{
        profile: { name: string; address: string; pincode: string; contactPhone: string };
      }>(session, arena.id, "/ops/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          address,
          pincode,
          contactPhone: mobileDigits(contactPhone),
        }),
      });
      onSaved({
        name: profile.name,
        address: profile.address,
        pincode: profile.pincode,
        contactPhone: profile.contactPhone,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save profile");
    } finally {
      setBusy(false);
    }
  }

  async function addStaff() {
    setStaffBusy(true);
    setStaffError("");
    setStaffMessage("");
    try {
      const result = await opsRequest<{ message?: string }>(session, arena.id, "/ops/staff", {
        method: "POST",
        body: JSON.stringify({ email: staffEmail.trim(), fullName: staffName.trim() }),
      });
      setStaffEmail("");
      setStaffName("");
      setStaffMessage(result.message ?? "Staff added.");
      await loadStaff();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unable to add staff");
    } finally {
      setStaffBusy(false);
    }
  }

  async function removeStaff(userId: string) {
    setStaffError("");
    try {
      await opsRequest(session, arena.id, `/ops/staff/${userId}`, { method: "DELETE" });
      await loadStaff();
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Unable to remove staff");
    }
  }

  return (
    <Screen>
      <BackHeader title="Arena Profile" onBack={onBack} />
      <Card>
        <Muted>
          Signed in as {isOwner ? "Owner" : "Staff"}.
          {isOwner ? " These details appear on invoices." : " Profile is read-only for staff."}
        </Muted>
        <Label>Arena name</Label>
        <Field value={name} editable={isOwner} onChangeText={setName} />
        <Label>Mobile</Label>
        <Field
          value={contactPhone}
          editable={isOwner}
          keyboardType="number-pad"
          maxLength={10}
          onChangeText={(v) => setContactPhone(sanitizeMobileInput(v))}
        />
        <Label>Pincode</Label>
        <Field
          value={pincode}
          editable={isOwner}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))}
        />
        <Label>Address</Label>
        <Field value={address} editable={isOwner} onChangeText={setAddress} />
        <ErrorText>{error}</ErrorText>
        {saved ? <Muted>Profile saved.</Muted> : null}
        {isOwner ? <PrimaryButton label="Save profile" busy={busy} onPress={save} /> : null}
      </Card>

      <Card>
        <Text style={{ fontWeight: "700", color: "#082b55", fontSize: 16 }}>Change password</Text>
        <Muted>
          Use current password when you still remember it. If you forgot it, use Forgot password on login (OTP).
        </Muted>
        <Muted>{PASSWORD_HINT}</Muted>
        <Label>Current password</Label>
        <Field secureTextEntry value={oldPassword} onChangeText={setOldPassword} placeholder="Current password" />
        <Label>New password</Label>
        <Field secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholder="New password" />
        <Label>Confirm new password</Label>
        <Field secureTextEntry value={confirmNewPassword} onChangeText={setConfirmNewPassword} placeholder="Confirm new password" />
        <ErrorText>{pwdError}</ErrorText>
        {pwdSaved ? <Muted>Password updated.</Muted> : null}
        <PrimaryButton label="Update password" busy={pwdBusy} onPress={changePassword} />
      </Card>

      {isOwner ? (
        <Card>
          <Text style={{ fontWeight: "700", color: "#082b55", fontSize: 16 }}>Staff</Text>
          <Muted>They log in on this same app with Email OTP, then set a password.</Muted>
          <Label>Staff email</Label>
          <Field
            value={staffEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="staff@example.com"
            onChangeText={setStaffEmail}
          />
          <Label>Name (optional)</Label>
          <Field value={staffName} placeholder="Display name" onChangeText={setStaffName} />
          <PrimaryButton
            label="Add staff"
            busy={staffBusy}
            disabled={!staffEmail.trim()}
            onPress={addStaff}
          />
          <ErrorText>{staffError}</ErrorText>
          {staffMessage ? <Muted>{staffMessage}</Muted> : null}
          {staffList.length === 0 ? <Muted>No staff yet.</Muted> : null}
          {staffList.map((row) => (
            <View
              key={row.userId}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: "#e2e8f0",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: "#082b55" }}>{row.fullName || row.email}</Text>
                <Muted>{row.email}</Muted>
              </View>
              <LinkButton label="Remove" onPress={() => removeStaff(row.userId)} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
