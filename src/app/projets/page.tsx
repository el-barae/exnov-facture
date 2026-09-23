import type { Metadata } from "next";
import { EspaceExnov } from "@/components/EspaceExnov";

export const metadata: Metadata = { title: "Projets — EXNOV", description: "Suivi des projets de génie civil : workflow, documents et avancement des missions." };
export default function ProjectsPage() { return <EspaceExnov initialService="projets"/>; }
