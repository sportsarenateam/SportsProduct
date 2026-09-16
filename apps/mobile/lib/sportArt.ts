import type { ImageSourcePropType } from "react-native";

const art: Record<string, ImageSourcePropType> = {
  "Cricket Turf": require("../assets/cricket.png"),
  Cricket: require("../assets/cricket.png"),
  Badminton: require("../assets/badminton.png"),
  Football: require("../assets/football.png"),
  Pickleball: require("../assets/pickleball.png"),
  "Table Tennis": require("../assets/table-tennis.png"),
  Carrom: require("../assets/carrom.png"),
  Skating: require("../assets/skating.png"),
  Volleyball: require("../assets/volleyball.png"),
};

export function sportImage(name: string): ImageSourcePropType | null {
  if (art[name]) return art[name];
  const key = Object.keys(art).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? art[key] : null;
}
