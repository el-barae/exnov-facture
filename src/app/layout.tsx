import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EXNOV — Factures, devis & rapports", description: "Création de factures, devis et rapports IA BET EXNOV. Aperçu A4 et téléchargement PDF.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
