import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "colorful" | "apple" | "google";

interface ThemeContextValue {
  theme: Theme;
  resolved: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  resolved: "light",
  setTheme: () => {},
});

import { getStoreItem, setStoreItem } from "@renderer/utils/store";
import { THEME_STORAGE_KEY as STORAGE_KEY } from "../constants";

const VALID_THEMES = new Set<string>(["light", "colorful", "apple", "google"]);

export function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = getStoreItem(STORAGE_KEY);
    if (stored && VALID_THEMES.has(stored as string)) return stored as Theme;
    return "light";
  });

  function setTheme(next: Theme): void {
    setThemeState(next);
    setStoreItem(STORAGE_KEY, next);
  }

  // Apply data-theme attribute to <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved: theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
