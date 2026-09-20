import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ThemeMode = "light" | "dark";

/** Brand kit: navy #0B2D58 · blue #008CFF · green #00D084 · mint #E6F9F0 */
export type ThemeColors = {
  navy: string;
  navyDeep: string;
  blue: string;
  green: string;
  greenDeep: string;
  mint: string;
  bg: string;
  soft: string;
  card: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  link: string;
  danger: string;
  trialBg: string;
  trialBorder: string;
  trialText: string;
  noticeBg: string;
  noticeBorder: string;
  noticeText: string;
  inputBg: string;
  chipActiveBg: string;
  chipActiveBorder: string;
  chipActiveText: string;
  heroOverlay: string;
  canvasTop: string;
  canvasMid: string;
  canvasBottom: string;
  blobA: string;
  blobB: string;
};

export const lightColors: ThemeColors = {
  navy: "#0B2D58",
  navyDeep: "#0B2D58",
  blue: "#008CFF",
  green: "#00D084",
  greenDeep: "#00B572",
  mint: "#E6F9F0",
  bg: "#E6F9F0",
  soft: "#D8F3E8",
  card: "#ffffff",
  border: "#C8E8DA",
  text: "#0B2D58",
  muted: "#5B7A90",
  faint: "#7A93A8",
  link: "#0B2D58",
  danger: "#E11D48",
  trialBg: "#E6F9F0",
  trialBorder: "#00D084",
  trialText: "#0B2D58",
  noticeBg: "#fff7ed",
  noticeBorder: "#fdba74",
  noticeText: "#9a3412",
  inputBg: "#F4FCF8",
  chipActiveBg: "#E6F9F0",
  chipActiveBorder: "#00D084",
  chipActiveText: "#0B2D58",
  heroOverlay: "rgba(11, 45, 88, 0.62)",
  canvasTop: "#E6F9F0",
  canvasMid: "#E6F8FD",
  canvasBottom: "#F7FBFA",
  blobA: "rgba(0, 208, 132, 0.16)",
  blobB: "rgba(0, 140, 255, 0.12)",
};

export const darkColors: ThemeColors = {
  navy: "#7EB6FF",
  navyDeep: "#071B33",
  blue: "#3BA4FF",
  green: "#00D084",
  greenDeep: "#5EE9B0",
  mint: "#123528",
  bg: "#071B33",
  soft: "#0F2744",
  card: "#0F2744",
  border: "#1E3F63",
  text: "#F2F7FC",
  muted: "#A9BCD0",
  faint: "#8AA0B6",
  link: "#D0E4F5",
  danger: "#FF8A97",
  trialBg: "#123528",
  trialBorder: "#00D084",
  trialText: "#DFF9CF",
  noticeBg: "#322012",
  noticeBorder: "#b8732c",
  noticeText: "#ffd0a0",
  inputBg: "#0C223C",
  chipActiveBg: "#123528",
  chipActiveBorder: "#00D084",
  chipActiveText: "#DFF9CF",
  heroOverlay: "rgba(7, 27, 51, 0.78)",
  canvasTop: "#0A1F18",
  canvasMid: "#071B33",
  canvasBottom: "#0B1E36",
  blobA: "rgba(0, 208, 132, 0.18)",
  blobB: "rgba(0, 140, 255, 0.16)",
};

const STORAGE_KEY = "sportzarena-theme";

type ThemeContextValue = {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  colors: lightColors,
  toggleTheme: () => undefined,
  setTheme: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("light");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === "dark" || value === "light") setThemeState(value);
      })
      .catch(() => undefined);
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
    void AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => undefined);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      colors: theme === "dark" ? darkColors : lightColors,
      toggleTheme,
      setTheme,
    }),
    [theme, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
