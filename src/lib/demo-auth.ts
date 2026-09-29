"use client";

import { useSyncExternalStore } from "react";

// Session de démonstration uniquement : aucune vérification ni protection serveur.
const SESSION_KEY = "exnov.demo-session.v1";
const SESSION_EVENT = "exnov:demo-session";
let memorySession: string | null = null;
let memoryOnly = false;

function readSession() {
  if (memoryOnly) return memorySession;
  try { return window.localStorage.getItem(SESSION_KEY) || null; }
  catch { return memorySession; }
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SESSION_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SESSION_EVENT, onChange);
  };
}

export function useDemoSession() {
  return useSyncExternalStore(subscribe, readSession, (): undefined => undefined);
}

export function setDemoSession(email: string | null) {
  memorySession = email;
  try {
    if (email) window.localStorage.setItem(SESSION_KEY, email);
    else window.localStorage.removeItem(SESSION_KEY);
    memoryOnly = false;
  } catch { memoryOnly = true; }
  window.dispatchEvent(new Event(SESSION_EVENT));
}
