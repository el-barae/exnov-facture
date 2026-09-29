import type { Metadata } from "next";
import { EspaceExnov } from "@/components/EspaceExnov";

export const metadata: Metadata = { title: "Plans 2D", description: "Atelier de création de plans 2D : murs, formes, cotes et calques avec export SVG et DXF." };
export default function PlansPage() { return <EspaceExnov/>; }
