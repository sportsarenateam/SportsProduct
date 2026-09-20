import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../lib/theme";
import { lightColors } from "../lib/theme";

/**
 * SportzArena design tokens — default light palette (screens may also use useTheme()).
 */
export const colors = lightColors;

export const fonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  extrabold: "Manrope_800ExtraBold",
};

export const tones = {
  purple: "#008CFF",
  teal: "#00B572",
  rose: "#E11D48",
  indigo: "#0B2D58",
  amber: "#F59E0B",
};

const SPORT_ICON_TINTS = ["#008CFF", "#00D084", "#00B8D4", "#0B2D58", "#3BA4FF", "#00B572"];

/** Mockup-style sport chip: icon in rounded square + centered one-line label. */
export function SportPickTile({
  name,
  image,
  caption,
  active,
  onPress,
  width,
}: {
  name: string;
  image?: ImageSourcePropType | null;
  caption?: string;
  active?: boolean;
  onPress: () => void;
  width?: number | `${number}%`;
}) {
  const { colors: themeColors } = useTheme();
  const tint = SPORT_ICON_TINTS[Math.abs(name.length * 7 + name.charCodeAt(0)) % SPORT_ICON_TINTS.length];
  return (
    <Pressable
      onPress={tap(onPress)}
      style={[
        styles.sportPick,
        width != null ? { width } : null,
        {
          borderColor: active ? themeColors.green : "transparent",
          backgroundColor: "transparent",
        },
      ]}
    >
      <View
        style={[
          styles.sportPickIcon,
          {
            backgroundColor: active ? themeColors.mint : themeColors.soft,
            borderColor: active ? themeColors.green : themeColors.border,
          },
        ]}
      >
        {image ? (
          <Image source={image} style={styles.sportPickImg} resizeMode="contain" />
        ) : (
          <Text style={[styles.sportPickFallback, { color: tint }]}>{name[0]}</Text>
        )}
      </View>
      <Text
        style={[styles.sportPickName, { color: themeColors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {name}
      </Text>
      {caption ? (
        <Text style={[styles.sportPickCaption, { color: themeColors.faint }]} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

export type ModuleIconName =
  | "sales"
  | "coaching"
  | "billing"
  | "expiring"
  | "invoice"
  | "menu"
  | "profile"
  | "booking"
  | "sports";

const MODULE_ICONS: Record<ModuleIconName, keyof typeof Ionicons.glyphMap> = {
  sales: "bar-chart",
  coaching: "people",
  billing: "card",
  expiring: "alarm",
  invoice: "document-text",
  menu: "grid",
  profile: "person",
  booking: "cafe",
  sports: "football",
};

function tap(onPress?: () => void) {
  return () => {
    void Haptics.selectionAsync().catch(() => undefined);
    onPress?.();
  };
}

export function Skeleton({
  height = 16,
  width = "100%" as number | `${number}%`,
  radius = 8,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
}) {
  const { colors: themeColors } = useTheme();
  return <View style={{ height, width, borderRadius: radius, backgroundColor: themeColors.soft }} />;
}

export function Screen({
  children,
  scroll = true,
  navy = false,
  header,
}: {
  children: ReactNode;
  scroll?: boolean;
  navy?: boolean;
  /** Sticky chrome above the scroll area (mirrors web workspace nav). */
  header?: ReactNode;
}) {
  const { colors: themeColors } = useTheme();
  const body = scroll
    ? (
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    )
    : <View style={[styles.page, { flex: 1 }]}>{children}</View>;

  if (navy) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: themeColors.navyDeep }]} edges={["top", "left", "right"]}>
        {header}
        {body}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safe}>
      <LinearGradient
        colors={[themeColors.canvasTop, themeColors.canvasMid, themeColors.canvasBottom]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.blob, styles.blobA, { backgroundColor: themeColors.blobA }]} />
      <View style={[styles.blob, styles.blobB, { backgroundColor: themeColors.blobB }]} />
      <SafeAreaView style={styles.safeTransparent} edges={["top", "left", "right"]}>
        {header}
        {body}
      </SafeAreaView>
    </View>
  );
}

export function ThemeToggle({ light = false }: { light?: boolean }) {
  const { theme, toggleTheme, colors: themeColors } = useTheme();
  const isDark = theme === "dark";
  return (
    <Pressable
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        toggleTheme();
      }}
      style={[
        styles.themeToggle,
        {
          borderColor: light ? "rgba(255,255,255,0.35)" : themeColors.border,
          backgroundColor: light ? "rgba(255,255,255,0.12)" : themeColors.card,
        },
      ]}
      accessibilityLabel={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      <Ionicons name={isDark ? "sunny" : "moon"} size={16} color={light ? "#fff" : themeColors.text} />
      <Text style={[styles.themeToggleText, { color: light ? "#fff" : themeColors.text }]}>
        {isDark ? "Light" : "Dark"}
      </Text>
    </Pressable>
  );
}

export function DeleteIconButton({ onPress, label = "Delete" }: { onPress: () => void; label?: string }) {
  const { colors: themeColors } = useTheme();
  return (
    <Pressable
      onPress={tap(onPress)}
      style={[styles.deleteBtn, { borderColor: themeColors.border, backgroundColor: themeColors.soft }]}
      hitSlop={6}
    >
      <Ionicons name="trash-outline" size={16} color={themeColors.danger} />
      <Text style={[styles.deleteBtnText, { color: themeColors.danger }]}>{label}</Text>
    </Pressable>
  );
}

/** Top bar: logo + arena + plan — stays visible while content scrolls. */
export function WorkspaceHeader({
  arenaName,
  planLabel,
  onUpgrade,
  onOpenProfile,
}: {
  arenaName: string;
  planLabel: string;
  onUpgrade?: () => void;
  onOpenProfile: () => void;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.workspaceHeader, { backgroundColor: themeColors.navyDeep, borderBottomColor: themeColors.navyDeep }]}>
      <Image
        source={require("../assets/sportzarena-logo.png")}
        style={[styles.workspaceLogo, { backgroundColor: "#fff", borderRadius: 8 }]}
        resizeMode="contain"
      />
      <View style={styles.workspaceMeta}>
        <Text style={styles.workspaceBrand}>
          Sportz<Text style={{ color: themeColors.green }}>Arena</Text>
        </Text>
        <Text style={[styles.workspaceArena, { color: "#fff" }]} numberOfLines={1}>{arenaName}</Text>
        <Text style={[styles.workspacePlan, { color: "#A8C4DE" }]} numberOfLines={1}>{planLabel}</Text>
      </View>
      <View style={styles.workspaceActions}>
        <ThemeToggle light />
        {onUpgrade ? (
          <Pressable style={[styles.headerPill, { backgroundColor: themeColors.green }]} onPress={onUpgrade}>
            <Text style={styles.headerPillText}>Upgrade</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onOpenProfile}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Arena profile"
          style={styles.avatarBtn}
        >
          <Ionicons name="person" size={16} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors: themeColors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Numbered panel like web booking steps (1 / 2 / 3). */
export function SectionCard({
  step,
  title,
  children,
}: {
  step?: number | string;
  title: string;
  children: ReactNode;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
    >
      <View style={styles.sectionHead}>
        {step != null ? (
          <View style={[styles.stepBadge, { backgroundColor: themeColors.navyDeep }]}>
            <Text style={styles.stepBadgeText}>{step}</Text>
          </View>
        ) : null}
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function Title({ children, light = false }: { children: ReactNode; light?: boolean }) {
  const { colors: themeColors } = useTheme();
  return (
    <Text style={[styles.title, { color: light ? "#fff" : themeColors.text }]}>
      {children}
    </Text>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  const { colors: themeColors } = useTheme();
  return <Text style={[styles.kicker, { color: themeColors.greenDeep }]}>{children}</Text>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { colors: themeColors } = useTheme();
  return <Text style={[styles.sectionLabel, { color: themeColors.faint }]}>{children}</Text>;
}

export function Muted({ children, light = false }: { children: ReactNode; light?: boolean }) {
  const { colors: themeColors } = useTheme();
  return (
    <Text style={[styles.muted, { color: light ? "#b7d1e5" : themeColors.muted }]}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const { colors: themeColors } = useTheme();
  return <Text style={[styles.label, { color: themeColors.text }]}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  const { colors: themeColors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[
        styles.input,
        {
          color: themeColors.text,
          backgroundColor: themeColors.inputBg,
          borderColor: focused ? themeColors.green : themeColors.border,
          shadowOpacity: focused ? 0.08 : 0,
        },
        props.style,
      ]}
      placeholderTextColor={themeColors.faint}
    />
  );
}

export function PasswordField(props: Omit<TextInputProps, "secureTextEntry">) {
  const { colors: themeColors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.passwordWrap}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[
          styles.input,
          styles.passwordInput,
          {
            color: themeColors.text,
            backgroundColor: themeColors.inputBg,
            borderColor: focused ? themeColors.green : themeColors.border,
          },
          props.style,
        ]}
        placeholderTextColor={themeColors.faint}
      />
      <Pressable style={styles.passwordToggle} onPress={() => setVisible((v) => !v)} hitSlop={8}>
        <Ionicons name={visible ? "eye-off" : "eye"} size={20} color={themeColors.muted} />
      </Pressable>
    </View>
  );
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
  const { colors: themeColors } = useTheme();
  return (
    <Pressable
      style={[styles.buttonWrap, (disabled || busy) && styles.buttonDisabled]}
      disabled={disabled || busy}
      onPress={tap(onPress)}
    >
      <LinearGradient
        colors={[themeColors.green, themeColors.blue]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.button}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <Pressable
      style={[
        styles.secondaryButton,
        {
          backgroundColor: themeColors.soft,
          borderColor: themeColors.border,
        },
        disabled && styles.buttonDisabled,
      ]}
      disabled={disabled}
      onPress={onPress}
    >
      <Text style={[styles.secondaryButtonText, { color: themeColors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress, light = false }: { label: string; onPress: () => void; light?: boolean }) {
  const { colors: themeColors } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Text style={[styles.link, { color: light ? "#00D084" : themeColors.link }]}>{label}</Text>
    </Pressable>
  );
}

export function ModuleTile({
  label,
  tone,
  icon = "menu",
  onPress,
}: {
  label: string;
  tone: string;
  icon?: ModuleIconName;
  onPress: () => void;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <Pressable
      style={[
        styles.moduleTile,
        {
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
      ]}
      onPress={tap(onPress)}
    >
      <View style={[styles.moduleIcon, { backgroundColor: tone }]}>
        <Ionicons name={MODULE_ICONS[icon]} size={18} color="#fff" />
      </View>
      <Text
        style={[styles.moduleLabel, { color: themeColors.text }]}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {label}
      </Text>
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
  const { colors: themeColors } = useTheme();
  return (
    <Pressable
      style={[
        styles.chip,
        {
          backgroundColor: active ? themeColors.chipActiveBg : themeColors.card,
          borderColor: active ? themeColors.chipActiveBorder : themeColors.border,
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.chipText,
          { color: active ? themeColors.chipActiveText : themeColors.muted },
          active && styles.chipTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function EmptyState({ title, body, actionLabel, onAction }: {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.emptyState, { backgroundColor: themeColors.soft }]}>
      <Text style={[styles.emptyTitle, { color: themeColors.text }]}>{title}</Text>
      {body ? <Text style={[styles.emptyBody, { color: themeColors.muted }]}>{body}</Text> : null}
      {actionLabel && onAction ? <LinkButton label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <LinkButton label="← Back" onPress={onBack} />
        <Text style={[styles.headerTitle, { color: themeColors.text }]}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function StatusChip({ label, value }: { label: string; value: string }) {
  const { colors: themeColors } = useTheme();
  return (
    <View style={[styles.statusChip, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
      <Text style={[styles.statusChipLabel, { color: themeColors.faint }]}>{label}</Text>
      <Text style={[styles.statusChipValue, { color: themeColors.text }]}>{value}</Text>
    </View>
  );
}

export function TrialBanner({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { colors: themeColors } = useTheme();
  return (
    <View
      style={[
        styles.trialBanner,
        {
          backgroundColor: themeColors.trialBg,
          borderColor: themeColors.trialBorder,
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.trialTitle, { color: themeColors.trialText }]}>{title}</Text>
        <Text style={[styles.trialBody, { color: themeColors.muted }]}>{body}</Text>
      </View>
      <Pressable style={[styles.trialBtn, { backgroundColor: themeColors.green }]} onPress={onAction}>
        <Text style={styles.trialBtnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  safeTransparent: { flex: 1, backgroundColor: "transparent" },
  safeNavy: { backgroundColor: colors.navyDeep },
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  pageNavy: { backgroundColor: colors.navyDeep },
  blob: {
    position: "absolute",
    borderRadius: 999,
  },
  blobA: {
    width: 220,
    height: 220,
    top: -40,
    right: -60,
  },
  blobB: {
    width: 180,
    height: 180,
    bottom: 80,
    left: -50,
  },
  workspaceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  workspaceLogo: { width: 40, height: 40 },
  workspaceMeta: { flex: 1, minWidth: 0, gap: 1 },
  workspaceBrand: { fontSize: 13, fontWeight: "800", color: "#fff", letterSpacing: -0.2 },
  workspaceArena: { fontSize: 13, fontWeight: "700", color: colors.text },
  workspacePlan: { fontSize: 10, fontWeight: "600", color: colors.muted },
  workspaceActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerPill: {
    backgroundColor: colors.green,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerPillText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  logoutIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  headerLink: { color: colors.link, fontSize: 12, fontWeight: "700" },
  card: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 2 },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.navy,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.text },
  kicker: {
    color: colors.greenDeep,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  sectionLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.faint,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  titleLight: { color: "#fff" },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  mutedLight: { color: "#b7d1e5" },
  label: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 4, letterSpacing: 0.2 },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    color: colors.text,
    backgroundColor: colors.inputBg,
    fontSize: 16,
    shadowColor: "#0f172a",
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 0,
  },
  passwordWrap: { position: "relative", justifyContent: "center" },
  passwordInput: { paddingRight: 48 },
  passwordToggle: { position: "absolute", right: 14, height: 52, justifyContent: "center" },
  buttonWrap: {
    borderRadius: 999,
    overflow: "hidden",
  },
  button: {
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    minHeight: 52,
  },
  secondaryButton: {
    backgroundColor: colors.soft,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 15,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: -0.2 },
  link: { color: colors.link, fontSize: 13, fontWeight: "600" },
  linkLight: { color: "#00D084" },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.chipActiveBg,
    borderColor: colors.chipActiveBorder,
  },
  chipText: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  chipTextActive: { color: colors.chipActiveText, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13, fontWeight: "600", lineHeight: 20 },
  emptyState: {
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.soft,
    gap: 6,
    alignItems: "flex-start",
  },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  emptyBody: { fontSize: 13, color: colors.muted, lineHeight: 19 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  headerTitle: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: 4 },
  statusChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  statusChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.faint,
    marginBottom: 2,
  },
  statusChipValue: { fontSize: 15, fontWeight: "700", color: colors.text },
  moduleTile: {
    width: "47%",
    minHeight: 88,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.card,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  moduleIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  moduleLabel: {
    width: "100%",
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 16,
    textAlign: "center",
  },
  sportPick: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderRadius: 16,
  },
  sportPickIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sportPickImg: { width: 40, height: 40 },
  sportPickFallback: { fontSize: 22, fontWeight: "800" },
  sportPickName: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
  },
  sportPickCaption: {
    width: "100%",
    textAlign: "center",
    fontSize: 10,
    fontWeight: "600",
    lineHeight: 13,
  },
  themeToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  themeToggleText: { fontSize: 12, fontWeight: "700" },
  deleteBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deleteBtnText: { fontSize: 12, fontWeight: "700" },
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.trialBg,
    borderWidth: 1,
    borderColor: colors.trialBorder,
  },
  trialTitle: { fontSize: 15, fontWeight: "700", color: colors.trialText },
  trialBody: { fontSize: 13, lineHeight: 18, color: colors.trialText, opacity: 0.9 },
  trialBtn: {
    backgroundColor: colors.green,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  trialBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
