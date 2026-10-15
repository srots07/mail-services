"use client";

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

export type ThemeChoice = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";

const THEME_KEY = "theme";
const DENSITY_KEY = "table-density";

interface ThemeContextValue {
  choice: ThemeChoice;
  density: Density;
  ready: boolean;
  setTheme: (choice: ThemeChoice) => void;
  setDensity: (density: Density) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveTheme(choice: ThemeChoice): "dark" | "light" {
  if (choice === "system") {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return choice;
}

function applyTheme(choice: ThemeChoice) {
  const resolved = resolveTheme(choice);
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  window.setTimeout(() => root.classList.remove("theme-transition"), 220);
}

const PREFS_EVENT = "theme-prefs-change";

function subscribePrefs(onChange: () => void): () => void {
  window.addEventListener(PREFS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readChoice(): ThemeChoice {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
}

function readDensity(): Density {
  return localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
}

const noopSubscribe = () => () => {};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useSyncExternalStore(subscribePrefs, readChoice, () => "dark" as ThemeChoice);
  const density = useSyncExternalStore(subscribePrefs, readDensity, () => "comfortable" as Density);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    applyTheme(choice);
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const setTheme = useCallback((next: ThemeChoice) => {
    localStorage.setItem(THEME_KEY, next);
    window.dispatchEvent(new Event(PREFS_EVENT));
  }, []);

  const setDensity = useCallback((next: Density) => {
    localStorage.setItem(DENSITY_KEY, next);
    window.dispatchEvent(new Event(PREFS_EVENT));
  }, []);

  return <ThemeContext.Provider value={{ choice, density, ready, setTheme, setDensity }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
