import { company } from "@/config/company";
import { amountFontSize, invoiceView, type Invoice } from "@/lib/invoice";
import { invoiceStyles } from "./styles";
import { paginationScript } from "./paginate";

export type DocumentAssets = { logo: string; watermark: string; fontRegular: string; fontBold: string; fontSans: string };
export const browserAssets: DocumentAssets = {
  logo: company.logo, watermark: company.watermark,
  fontRegular: "/fonts/Carlito-Regular.ttf", fontBold: "/fonts/Carlito-Bold.ttf", fontSans: "/fonts/NotoSans.ttf",
};
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function buildInvoiceHtml(invoice: Invoice, assets: DocumentAssets = browserAssets) {
  const v = invoiceView(invoice), e = escapeHtml;
  const totalRow = (label: string, value: string, last = false) => `<tr class="${last ? "grand-total" : ""}"><td colspan="5" class="total-label">${e(label)}</td><td class="amount" style="font-size:${amountFontSize(value)}pt">${e(value)}</td></tr>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(v.titreDocument)} EXNOV ${e(v.numero)}</title><style>
  @font-face{font-family:InvoiceTable;src:url('${assets.fontRegular}') format('truetype');font-weight:400;font-display:block}
  @font-face{font-family:InvoiceTable;src:url('${assets.fontBold}') format('truetype');font-weight:700;font-display:block}
  @font-face{font-family:InvoiceSans;src:url('${assets.fontSans}') format('truetype');font-weight:100 900;font-display:block}
  ${invoiceStyles}</style></head><body><div id="source">
  <img class="watermark" style="opacity:${company.watermarkOpacity}" src="${assets.watermark}" alt="">
  <header class="letterhead"><div class="dark-bar"></div><div class="gold-bar"></div><img class="logo" src="${assets.logo}" alt="BET EXNOV"><div class="brand"><strong>${e(company.name)} — ${e(company.activity)}</strong>${company.subtitles.map(s => `<p>${e(s)}</p>`).join("")}</div></header>
  <div class="invoice-meta"><div class="invoice-number"><strong>${e(v.titreDocument)} Nº ${e(v.numero)}</strong><br><strong>DATE</strong> ${e(v.date)}</div><div class="recipient"><p>POUR</p><p>${e(v.destinataire || "DESTINATAIRE")}</p>${v.reference ? `<p>REFERENCE: ${e(v.reference)}</p>` : ""}</div></div>
  <table class="invoice-table"><colgroup>${[600,5067,849,1104,2013,1050].map(w => `<col style="width:${w / 10683 * 100}%">`).join("")}</colgroup><thead><tr class="project"><th colspan="6">${e(v.projet || "Intitulé du marché / projet")}</th></tr><tr class="columns"><th>N°<br>Prix</th><th>Désignation des prestations</th><th>Unité</th><th>Quantité</th><th>Prix unitaire en Dirhams hors TVA</th><th>Prix Total</th></tr></thead><tbody>${v.lignes.map(l => `<tr class="service-row"><td><b>${l.numeroPrix}</b></td><td class="designation">${e(l.designation || "Désignation de la prestation")}</td><td class="center">${e(l.unite)}</td><td class="center">${e(l.quantite)}</td><td class="amount" style="font-size:${amountFontSize(l.prixUnitaire)}pt">${e(l.prixUnitaire)}</td><td class="amount" style="font-size:${amountFontSize(l.prixTotal)}pt">${e(l.prixTotal)}</td></tr>`).join("")}</tbody><tbody class="totals">
  ${totalRow("MONTANT TOTAL HT:",v.totalHT)}${totalRow(`MONTANT TVA (TAUX = ${v.tauxTVA} %)`,v.tva)}${totalRow("MONTANT TOTAL TTC",v.ttc)}${v.appliquerRasIS ? totalRow(`A DEDUIRE RAS IS ${v.tauxRasIS}% DU MONTANT TOTAL HT`,v.rasIS) : ""}${v.appliquerRasTVA ? totalRow(`A DEDUIRE RAS TVA ${v.tauxRasTVA}% DU MONTANT DE LA T.V.A`,v.rasTVA) : ""}${v.afficherTotalAPayer ? totalRow("TOTAL A PAYER",v.totalAPayer,true) : ""}</tbody></table>
  <div class="closing"><p>${e(v.formuleArrete)}</p><p>${e(v.montantEnLettres)}.</p><p class="signature">Signature</p><p class="thanks">Nous vous remercions de votre confiance</p></div>
  <footer class="invoice-footer"><div class="footer-contacts"><span><b>Tél.</b>${e(company.phone)}</span><span><b>@</b>${e(company.email)}</span><span><b>Web</b>${e(company.website)}</span></div><div class="footer-company">${e(company.footer)}<div class="ids"><b>N° RC:</b> ${e(company.rc)} · <b>N° ICE:</b> ${e(company.ice)} · <b>N° TP:</b> ${e(company.tp)}<br><b>N° RIB:</b> ${e(company.rib)}</div></div></footer>
  </div><div id="pages"></div><script>${paginationScript}</script></body></html>`;
}
