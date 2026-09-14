import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Match web `styles.css` SportzArena tokens */
export const colors = {
  navy: "#082b55",
  navyDeep: "#061f3d",
  green: "#58b91c",
  greenDark: "#23920f",
  bg: "#f3f7fb",
  card: "#ffffff",
  border: "#d5e3ef",
  muted: "#5b7390",
  text: "#1e3348",
  danger: "#b91c1c",
};

export function Screen({
  children,
  scroll = true,
  navy = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  navy?: boolean;
}) {
  const body = scroll
    ? (
      <ScrollView
        contentContainerStyle={[styles.page, navy && styles.pageNavy]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    )
    : <View style={[styles.page, navy && styles.pageNavy]}>{children}</View>;
  return (
    <SafeAreaView style={[styles.safe, navy && styles.safeNavy]} edges={["top", "left", "right"]}>
      {body}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Title({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.title, light && styles.titleLight]}>{children}</Text>;
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

export function Muted({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return <Text style={[styles.muted, light && styles.mutedLight]}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput {...props} style={[styles.input, props.style]} placeholderTextColor="#94a3b8" />;
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
      disabled={disabled || busy}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export function LinkButton({ label, onPress, light = false }: { label: string; onPress: () => void; light?: boolean }) {
  return (
    <Pressable onPress={onPress}>
      <Text style={[styles.link, light && styles.linkLight]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <LinkButton label="← Back" onPress={onBack} />
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  safeNavy: { backgroundColor: colors.navyDeep },
  page: { padding: 20, gap: 14, paddingBottom: 40 },
  pageNavy: { backgroundColor: colors.navyDeep },
  card: {
    backgroundColor: colors.card,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  kicker: {
    color: colors.green,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
  },
  title: { color: colors.navy, fontSize: 26, fontWeight: "700" },
  titleLight: { color: "#fff" },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  mutedLight: { color: "#b7d1e5" },
  label: { color: colors.navy, fontSize: 12, fontWeight: "700", marginTop: 4 },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    color: colors.text,
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: colors.green,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    minHeight: 48,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  link: { color: colors.greenDark, fontSize: 13, fontWeight: "600" },
  linkLight: { color: "#94ed5d" },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#eef9e7", borderColor: colors.green },
  chipText: { fontSize: 12, color: colors.muted },
  chipTextActive: { color: colors.greenDark, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerTitle: { color: colors.navy, fontSize: 22, fontWeight: "700", marginTop: 4 },
});
