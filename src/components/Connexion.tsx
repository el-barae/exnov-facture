"use client";

import Image from "next/image";
import { APP_NAME } from "@/config/app";
import { ThemeToggle } from "./ThemeToggle";
import { useState, type FormEvent } from "react";
import { ArrowRight, BookOpen, Eye, EyeOff, FileText, FolderKanban, LockKeyhole, Mail, Sparkles } from "lucide-react";

export function Connexion({ onLogin, mode = "team" }: { onLogin: (email: string, password: string) => Promise<void>; mode?: "team" | "demo" }) {
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!email || !password || busy) return;
    setBusy(true); setError("");
    try { await onLogin(email, password); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Connexion impossible. Réessayez."); }
    finally { setBusy(false); }
  }

  return <main className="login-page">
    <div className="login-topbar"><div className="login-brand">
      <Image src="/logo.png" alt="EXNOV" width={229} height={172} priority unoptimized/>
      <span>{APP_NAME}<small>Votre espace de travail</small></span>
    </div><ThemeToggle/></div>
    <div className="login-layout">
      <section className="login-intro" aria-labelledby="login-intro-title">
        <p className="eyebrow"><span/> L’ESPACE EXNOV</p>
        <h1 id="login-intro-title">Vos projets.<br/>Toutes les étapes.<br/><em>Un seul espace.</em></h1>
        <p className="login-description">Du premier devis à la livraison, retrouvez vos missions et vos documents au même endroit.</p>
        <ul className="login-services">
          <li><FolderKanban size={20}/><div><strong>Suivez vos projets</strong><span>Étapes, avancement et pièces du dossier.</span></div></li>
          <li><FileText size={20}/><div><strong>Préparez vos documents</strong><span>Factures et devis prêts à partager.</span></div></li>
          <li><Sparkles size={20}/><div><strong>Avancez avec l’IA</strong><span>Rapports et CPS pour vos missions.</span></div></li>
        </ul>
        <div className="login-intro-footer"><BookOpen size={15}/><span>Génie civil · Études · Suivi des travaux</span></div>
      </section>
      <section className="login-card" aria-labelledby="login-title">
        <span className="login-icon"><LockKeyhole size={22}/></span>
        <h2 id="login-title">Bienvenue chez EXNOV</h2>
        <p className="login-subtitle">Connectez-vous pour retrouver vos projets.</p>
        <form className="login-form" onSubmit={submit}>
          <label className="field-label" htmlFor="login-email">Adresse e-mail</label>
          <div className="login-input">
            <Mail size={17} aria-hidden="true"/>
            <input id="login-email" name="email" type="email" autoComplete="username" placeholder="vous@exnov.ma" required maxLength={254} disabled={busy} aria-describedby="login-help"/>
          </div>
          <label className="field-label" htmlFor="login-password">Mot de passe</label>
          <div className="login-input">
            <LockKeyhole size={17} aria-hidden="true"/>
            <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Votre mot de passe" required disabled={busy} aria-describedby="login-help"/>
            <button type="button" className="icon-button login-password-toggle" aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          </div>
          {error && <p className="project-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button login-submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}<ArrowRight size={18}/></button>
        </form>
        <p id="login-help" className="login-demo-note">{mode === "demo" ? <><strong>Mode démonstration</strong>Utilisez une adresse e-mail valide et un mot de passe de votre choix. Aucun compte à créer.</> : <><strong>Espace équipe</strong>Utilisez le compte créé par votre administrateur. Contactez-le si vous avez oublié votre mot de passe.</>}</p>
      </section>
    </div>
    <footer className="login-footer"><span>BET EXNOV · Bureau d’études génie civil</span><span>Tanger, Maroc</span></footer>
  </main>;
}
