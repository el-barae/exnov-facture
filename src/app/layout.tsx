import type { Metadata } from "next";
import "./globals.css";
import "./projects.css";
import "./cps.css";
export const metadata: Metadata = { title: "EXNOV — Factures, rapports, CPS & projets", description: "Factures, devis, rapports IA, génération de CPS Word et suivi des projets de génie civil BET EXNOV.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
