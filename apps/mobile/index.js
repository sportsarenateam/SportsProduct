import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "./lib/theme";
import App from "./App";

function Root() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

registerRootComponent(Root);
