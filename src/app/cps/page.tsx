import type { Metadata } from "next";
import { EspaceExnov } from "@/components/EspaceExnov";

export const metadata: Metadata = { title: "CPS IA — EXNOV", description: "Générez un cahier des prescriptions spéciales à partir de votre logo et de la description des travaux, puis téléchargez-le au format Word." };
export default function CpsPage() { return <EspaceExnov initialService="cps"/>; }
