"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAuthClient } from "@/lib/auth-client";
import { setDemoSession, useDemoSession } from "@/lib/demo-auth";
import { configureProjectStorage } from "@/lib/project-storage";
import { teamRequest } from "@/lib/team-client";
import type { TeamUser } from "@/lib/team";

type TeamSession = { mode: "team" | "demo" | "setup"; user: TeamUser | null };
type TeamContextValue = TeamSession & {
  loading: boolean;
  error: string;
  refreshSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const TeamContext = createContext<TeamContextValue | null>(null);
const SESSION_CHANNEL = "exnov:team-session";
function announceSessionChange() {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(SESSION_CHANNEL);
  channel.postMessage("changed");
  channel.close();
}

export function TeamProvider({ children }: { children: ReactNode }) {
  const demoEmail = useDemoSession();
  const [session, setSession] = useState<TeamSession | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  const refreshSession = useCallback(async () => {
    const revision = ++request.current;
    try {
      const next = await teamRequest<TeamSession>("/api/team/session");
      if (revision !== request.current) return;
      if (next.mode === "team" || next.mode === "demo") configureProjectStorage(next.mode, next.user?.id);
      setSession(next);
      setError("");
    } catch (reason) {
      if (revision === request.current) setError(reason instanceof Error ? reason.message : "Impossible de vérifier votre connexion.");
      throw reason;
    }
  }, []);
  useEffect(() => {
    const refresh = () => { void refreshSession().catch(() => {}); };
    refresh();
    const interval = window.setInterval(refresh, 30000);
    const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(SESSION_CHANNEL);
    if (channel) channel.onmessage = refresh;
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(interval); channel?.close(); window.removeEventListener("focus", refresh); request.current += 1; };
  }, [refreshSession]);
  const demoUser = useMemo<TeamUser | null>(() => demoEmail ? ({ id: "demo", name: "Démonstration", email: demoEmail, role: "admin", active: true }) : null, [demoEmail]);
  const mode = session?.mode ?? "setup";
  const user = mode === "demo" ? demoUser : session?.user ?? null;
  const login = async (email: string, password: string) => {
    if (mode === "demo") { setDemoSession(email); return; }
    if (mode !== "team") throw new Error("L’espace équipe n’est pas encore configuré.");
    const result = await getAuthClient().signIn.email({ email, password });
    if (result.error) throw new Error("Connexion impossible. Vérifiez vos identifiants ou contactez l’administrateur.");
    announceSessionChange();
    await refreshSession();
  };
  const logout = async () => {
    if (mode === "demo") setDemoSession(null);
    else {
      const result = await getAuthClient().signOut();
      if (result.error) throw new Error("La déconnexion a échoué. Réessayez.");
      configureProjectStorage("team", undefined);
      announceSessionChange();
      await refreshSession();
    }
  };
  return <TeamContext.Provider value={{ mode, user, loading: !session && !error || mode === "demo" && demoEmail === undefined, error, refreshSession, login, logout }}>{children}</TeamContext.Provider>;
}

export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error("L’espace équipe doit être ouvert dans TeamProvider.");
  return context;
}
