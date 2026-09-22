"use client";
import { useMemo } from "react";
import type { Invoice } from "@/lib/invoice";
import { buildInvoiceHtml } from "@/lib/document/html";
import { ApercuDocument } from "./ApercuDocument";

export function ApercuFacture({ invoice }: { invoice: Invoice }) {
  const html = useMemo(() => buildInvoiceHtml(invoice), [invoice]);
  return <ApercuDocument html={html} label={invoice.typeDocument === "devis" ? "Devis" : "Facture"}/>;
}
