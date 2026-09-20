import type { NavigatorScreenParams } from "@react-navigation/native";
import type { SportConfig } from "../lib/types";

export type MainTabParamList = {
  HomeTab: undefined;
  BookTab: undefined;
  SalesTab: undefined;
  MoreTab: undefined;
};

export type WorkspaceStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Booking: { sport: SportConfig | null; bevOnly: boolean };
  Coaching: undefined;
  Billing: undefined;
  Expiring: undefined;
  Invoice: undefined;
  Menu: undefined;
  Profile: undefined;
  Sports: undefined;
};
