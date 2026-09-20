import { Ionicons } from "@expo/vector-icons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { Session } from "@supabase/supabase-js";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import {
  Screen,
  SectionLabel,
  Muted,
  SportPickTile,
} from "../components/ui";
import { useTheme } from "../lib/theme";
import type { AppRole, Arena, InventoryItem, MobilePage, SportConfig } from "../lib/types";
import { sportImage } from "../lib/sportArt";
import { HomeScreen } from "../screens/HomeScreen";
import { BookingScreen } from "../screens/BookingScreen";
import { CoachingScreen } from "../screens/CoachingScreen";
import { MembershipScreen } from "../screens/MembershipScreen";
import { MembershipExpiringScreen } from "../screens/MembershipExpiringScreen";
import { InvoiceScreen } from "../screens/InvoiceScreen";
import { MenuScreen } from "../screens/MenuScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SalesScreen } from "../screens/SalesScreen";
import { SportsScreen } from "../screens/SportsScreen";
import type { MainTabParamList, WorkspaceStackParamList } from "./types";

const Stack = createNativeStackNavigator<WorkspaceStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

type Props = {
  session: Session;
  arena: Arena;
  role: AppRole;
  sports: SportConfig[];
  inventory: InventoryItem[];
  message: string;
  onMessage: (msg: string) => void;
  onRefreshOps: () => Promise<void>;
  onArenaSaved: (next: Partial<Arena>) => void;
  onUpgrade?: () => void;
  onLogout: () => void;
};

function pageToRoute(page: MobilePage): keyof WorkspaceStackParamList | "SalesTab" | null {
  switch (page) {
    case "sales":
      return "SalesTab";
    case "booking":
      return "Booking";
    case "coaching":
      return "Coaching";
    case "billing":
      return "Billing";
    case "expiring":
      return "Expiring";
    case "invoice":
      return "Invoice";
    case "menu":
      return "Menu";
    case "profile":
      return "Profile";
    case "sports":
      return "Sports";
    default:
      return null;
  }
}

export function WorkspaceNavigator({
  session,
  arena,
  role,
  sports,
  inventory,
  message,
  onMessage,
  onRefreshOps,
  onArenaSaved,
  onUpgrade,
  onLogout,
}: Props) {
  const isOwner = role === "owner";
  const { theme: mode, colors: themeColors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const sportTileWidth = Math.min(88, Math.floor((windowWidth - 40) / 4.2));
  const navTheme = {
    ...(mode === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: themeColors.bg,
      card: themeColors.card,
      text: themeColors.text,
      border: themeColors.border,
      primary: themeColors.green,
    },
  };

  function BookPicker({ stackNav }: { stackNav: any }) {
    return (
      <Screen>
        <Text style={[styles.pickerTitle, { color: themeColors.text }]}>Book a Court</Text>
        <Muted>Pick a sport or sell beverages and equipment only.</Muted>
        <Pressable
          style={[styles.bevCard, { backgroundColor: themeColors.green }]}
          onPress={() => stackNav.navigate("Booking", { sport: null, bevOnly: true })}
        >
          <Ionicons name="cafe" size={22} color="#fff" />
          <Text style={styles.bevText}>Beverages & Equipment Only</Text>
        </Pressable>
        <SectionLabel>Sports</SectionLabel>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sportRow}
        >
          {sports.map((sport) => (
            <SportPickTile
              key={sport.id}
              name={sport.name}
              image={sportImage(sport.name)}
              caption={
                sport.pricePerHour > 0
                  ? `₹${sport.pricePerHour}/hr`
                  : `${sport.courts.length} court${sport.courts.length === 1 ? "" : "s"}`
              }
              width={sportTileWidth}
              onPress={() => stackNav.navigate("Booking", { sport, bevOnly: false })}
            />
          ))}
        </ScrollView>
        {sports.length === 0 ? (
          <Muted>No sports yet. {isOwner ? "Add sports from Home." : "Ask the owner to add sports."}</Muted>
        ) : null}
      </Screen>
    );
  }

  function MoreMenu({ stackNav }: { stackNav: any }) {
    const links: Array<{ label: string; page: MobilePage; ownerOnly?: boolean }> = [
      { label: "Coaching", page: "coaching" },
      { label: "Membership", page: "billing" },
      { label: "Membership expiring", page: "expiring" },
      { label: "Generate Invoice", page: "invoice" },
      { label: "Manage Menu", page: "menu" },
      { label: "Profile", page: "profile" },
      { label: "Manage sports", page: "sports", ownerOnly: true },
    ];
    return (
      <Screen>
        <Text style={[styles.pickerTitle, { color: themeColors.text }]}>More</Text>
        <Muted>Quick links to arena tools.</Muted>
        {links
          .filter((link) => isOwner || !link.ownerOnly)
          .map((link) => (
            <Pressable
              key={link.page}
              style={[
                styles.moreRow,
                { backgroundColor: themeColors.card, borderColor: themeColors.border },
              ]}
              onPress={() => {
                const route = pageToRoute(link.page);
                if (route && route !== "SalesTab") stackNav.navigate(route);
              }}
            >
              <Text style={[styles.moreLabel, { color: themeColors.text }]}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={themeColors.faint} />
            </Pressable>
          ))}
        <View style={{ marginTop: 16, alignItems: "flex-start" }}>
          <Pressable
            onPress={onLogout}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            style={[
              styles.logoutIconBtn,
              { backgroundColor: themeColors.card, borderColor: themeColors.border },
            ]}
          >
            <Ionicons name="log-out-outline" size={22} color={themeColors.danger} />
          </Pressable>
        </View>
      </Screen>
    );
  }

  function MainTabs() {
    return (
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: themeColors.green,
          tabBarInactiveTintColor: themeColors.faint,
          tabBarStyle: {
            backgroundColor: themeColors.card,
            borderTopColor: themeColors.border,
            height: 58,
            paddingBottom: 6,
            paddingTop: 4,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              HomeTab: "home",
              BookTab: "calendar",
              SalesTab: "stats-chart",
              MoreTab: "grid",
            };
            return <Ionicons name={icons[route.name] ?? "ellipse"} size={size} color={color} />;
          },
        })}
      >
        <Tabs.Screen name="HomeTab" options={{ title: "Home" }}>
          {({ navigation }) => (
            <View style={{ flex: 1 }}>
              {message ? (
                <View style={styles.toast}>
                  <Text style={styles.toastText}>{message}</Text>
                </View>
              ) : null}
              <HomeScreen
                session={session}
                email={session.user.email ?? ""}
                arena={arena}
                role={role}
                sports={sports}
                onOpen={(page) => {
                  onMessage("");
                  if (page === "sales" && isOwner) {
                    navigation.navigate("SalesTab");
                    return;
                  }
                  const route = pageToRoute(page);
                  if (route === "Booking") {
                    navigation.getParent()?.navigate("Booking", { sport: null, bevOnly: false });
                  } else if (route && route !== "SalesTab") {
                    navigation.getParent()?.navigate(route);
                  }
                }}
                onOpenBooking={(sport, bevOnly) => {
                  onMessage("");
                  const parent = navigation.getParent();
                  if (parent) {
                    parent.navigate("Booking", { sport, bevOnly });
                  } else {
                    navigation.navigate("Booking" as never, { sport, bevOnly } as never);
                  }
                }}
                onUpgrade={onUpgrade}
                onOpenProfile={() => {
                  onMessage("");
                  navigation.getParent()?.navigate("Profile");
                }}
              />
            </View>
          )}
        </Tabs.Screen>
        <Tabs.Screen name="BookTab" options={{ title: "Bookings" }}>
          {({ navigation }) => <BookPicker stackNav={navigation.getParent() ?? navigation} />}
        </Tabs.Screen>
        {isOwner ? (
          <Tabs.Screen name="SalesTab" options={{ title: "Reports" }}>
            {({ navigation }) => (
              <SalesScreen
                session={session}
                arenaId={arena.id}
                onBack={() => navigation.navigate("HomeTab")}
              />
            )}
          </Tabs.Screen>
        ) : null}
        <Tabs.Screen name="MoreTab" options={{ title: "More" }}>
          {({ navigation }) => <MoreMenu stackNav={navigation.getParent() ?? navigation} />}
        </Tabs.Screen>
      </Tabs.Navigator>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="Tabs" component={MainTabs} />
        <Stack.Screen name="Booking">
          {({ navigation, route }) => (
            <BookingScreen
              session={session}
              arenaId={arena.id}
              sport={route.params.sport}
              bevOnly={route.params.bevOnly}
              inventory={inventory}
              onBack={() => navigation.goBack()}
              onDone={async () => {
                await onRefreshOps();
                onMessage("Bill saved successfully.");
                navigation.navigate("Tabs", { screen: "HomeTab" });
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Coaching">
          {({ navigation }) => (
            <CoachingScreen session={session} arenaId={arena.id} onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Billing">
          {({ navigation }) => (
            <MembershipScreen
              session={session}
              arenaId={arena.id}
              sports={sports}
              onBack={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Expiring">
          {({ navigation }) => (
            <MembershipExpiringScreen
              session={session}
              arenaId={arena.id}
              arenaName={arena.name}
              arenaPhone={arena.contactPhone}
              onBack={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Invoice">
          {({ navigation }) => (
            <InvoiceScreen session={session} arena={arena} onBack={() => navigation.goBack()} />
          )}
        </Stack.Screen>
        <Stack.Screen name="Menu">
          {({ navigation }) => (
            <MenuScreen
              session={session}
              arenaId={arena.id}
              sports={sports}
              inventory={inventory}
              onChanged={onRefreshOps}
              onBack={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Profile">
          {({ navigation }) => (
            <ProfileScreen
              session={session}
              arena={arena}
              role={role}
              onBack={() => navigation.goBack()}
              onSaved={onArenaSaved}
              onLogout={onLogout}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Sports">
          {({ navigation }) => (
            <SportsScreen
              session={session}
              initialSelected={sports.map((s) => s.name)}
              onBack={sports.length ? () => navigation.goBack() : undefined}
              onSaved={async () => {
                await onRefreshOps();
                onMessage("Sports saved.");
                navigation.navigate("Tabs", { screen: "HomeTab" });
              }}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  toast: { backgroundColor: "#eef9e7", padding: 10 },
  toastText: { color: "#357c13", textAlign: "center", fontWeight: "600" },
  pickerTitle: { fontSize: 24, fontWeight: "700", letterSpacing: -0.2 },
  bevCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 16,
  },
  bevText: { color: "#fff", fontWeight: "700", fontSize: 15, flex: 1 },
  sportRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 4,
    paddingRight: 8,
  },
  moreRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  moreLabel: { fontWeight: "700", fontSize: 15 },
  logoutIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
