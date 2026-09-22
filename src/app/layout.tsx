import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "EXNOV — Espace facturation", description: "Création de factures et devis BET EXNOV. Aperçu A4, téléchargement PDF et Word.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr"><body>{children}</body></html>; }
