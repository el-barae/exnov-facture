"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const CHANGE_EVENT = "exnov:theme";
let sessionPreference: Theme | null = null;

function preference(): Theme | null {
  if (sessionPreference) return sessionPreference;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch { return null; }
}

function applyTheme(theme: Theme) {
  if (document.documentElement.dataset.theme === theme) return;
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => applyTheme(preference() ?? (system.matches ? "dark" : "light"));
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      sessionPreference = null;
      sync();
    }
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  system.addEventListener("change", sync);
  sync();
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    system.removeEventListener("change", sync);
  };
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, (): Theme => "light");
  const label = theme === "dark" ? "Activer le mode clair" : "Activer le mode sombre";
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    sessionPreference = next;
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next); }
    catch { /* Le choix reste utilisable pour cette session si le stockage est bloqué. */ }
    applyTheme(next);
  }
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={toggle}>
    {theme === "dark" ? <Sun size={19} aria-hidden="true"/> : <Moon size={19} aria-hidden="true"/>}
  </button>;
}
