import type { Metadata } from "next";
import { APP_NAME } from "@/config/app";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";
import "./projects.css";
import "./team.css";
import "./cps.css";
import "./login.css";
import "./theme.css";
import "./projects-dark.css";
import "./plans.css";
export const metadata: Metadata = { title: { default: APP_NAME, template: `%s — ${APP_NAME}` }, applicationName: APP_NAME, icons: { icon: { url: "/favicon.ico", type: "image/x-icon" } }, description: "Factures, devis, rapports IA, génération de CPS Word et suivi des projets de génie civil BET EXNOV.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="fr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}/></head><body>{children}</body></html>; }
