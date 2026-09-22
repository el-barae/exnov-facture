import { company } from "@/config/company";

export type DocumentAssets = { logo: string; watermark: string; fontRegular: string; fontBold: string; fontSans: string };
export const browserAssets: DocumentAssets = {
  logo: company.logo, watermark: company.watermark,
  fontRegular: "/fonts/Carlito-Regular.ttf", fontBold: "/fonts/Carlito-Bold.ttf", fontSans: "/fonts/NotoSans.ttf",
};
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function documentFonts(assets: DocumentAssets) {
  return `@font-face{font-family:InvoiceTable;src:url('${assets.fontRegular}') format('truetype');font-weight:400;font-display:block}
  @font-face{font-family:InvoiceTable;src:url('${assets.fontBold}') format('truetype');font-weight:700;font-display:block}
  @font-face{font-family:InvoiceSans;src:url('${assets.fontSans}') format('truetype');font-weight:100 900;font-display:block}`;
}
export function documentLetterhead(assets: DocumentAssets) {
  const e = escapeHtml;
  return `<img class="watermark" style="opacity:${company.watermarkOpacity}" src="${assets.watermark}" alt="">
  <header class="letterhead"><div class="dark-bar"></div><div class="gold-bar"></div><img class="logo" src="${assets.logo}" alt="BET EXNOV"><div class="brand"><strong>${e(company.name)} — ${e(company.activity)}</strong>${company.subtitles.map(s => `<p>${e(s)}</p>`).join("")}</div></header>`;
}
export function documentFooter() {
  const e = escapeHtml;
  return `<footer class="invoice-footer"><div class="footer-contacts"><span><b>Tél.</b>${e(company.phone)}</span><span><b>@</b>${e(company.email)}</span><span><b>Web</b>${e(company.website)}</span></div><div class="footer-company">${e(company.footer)}<div class="ids"><b>N° RC:</b> ${e(company.rc)} · <b>N° ICE:</b> ${e(company.ice)} · <b>N° TP:</b> ${e(company.tp)}<br><b>N° RIB:</b> ${e(company.rib)}</div></div></footer>`;
}
