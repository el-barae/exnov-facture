import type { Report, ReportImage } from "../report";
import { formatDate } from "../invoice";
import { browserAssets, documentFonts, documentFooter, documentLetterhead, escapeHtml, type DocumentAssets } from "./brand";
import { invoiceStyles } from "./styles";
import { reportPaginationScript } from "./report-paginate";

const reportStyles = `
.report-page .page-counter{z-index:3}
.report-content{margin:0 17mm;display:flow-root;color:#2f444a;font:10.5pt/1.65 InvoiceSans,Arial,sans-serif;overflow-wrap:anywhere}
.report-content>*{margin:0 0 3.5mm}
.report-cover{border-left:1.4mm solid #f8be18;padding:1mm 0 1mm 5mm;margin-bottom:7mm}
.report-kicker{font-size:8pt;letter-spacing:1.5pt;color:#73817e;margin:0 0 2mm}
.report-cover h1{font:700 24pt/1.2 InvoiceTable,Arial,sans-serif;margin:0 0 3mm;color:#2f444a}
.report-subtitle{font-size:11pt;margin:0 0 4mm;color:#6b7d7e}
.report-meta{display:grid;grid-template-columns:1fr 1fr;gap:2mm 6mm;font-size:9pt}
.report-meta span{display:block;color:#788785;font-size:7pt;text-transform:uppercase;letter-spacing:.5pt}
.report-heading{font:700 14pt/1.3 InvoiceTable,Arial,sans-serif;border-bottom:.3mm solid #e4e8e4;padding:2mm 0;display:flex;gap:3mm}
.report-heading b{color:#ac8100;font-size:10pt;padding-top:1mm;min-width:6mm}
.report-paragraph{white-space:pre-line;text-align:start}
.report-bullet{padding-left:5mm;position:relative;white-space:pre-line}
.report-bullet::before{content:'•';color:#b78a00;position:absolute;left:1mm}
.report-figure{border:.25mm solid #e0e6e0;border-radius:2mm;padding:3mm;background:#fafbf9}
.report-figure img{display:block;width:100%;height:78mm;object-fit:contain}
.report-figure figcaption{font-size:8.5pt;line-height:1.5;color:#607471;margin-top:2mm;white-space:pre-line}
`;

export function buildReportHtml(report: Report, images: ReportImage[], assets: DocumentAssets = browserAssets) {
  const e = escapeHtml;
  const byId = new Map(images.map(image => [image.id, image]));
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(report.title)} — EXNOV</title><style>${documentFonts(assets)}${invoiceStyles}${reportStyles}</style></head><body><div id="source">
  ${documentLetterhead(assets)}${documentFooter()}
  <div class="report-blocks"><div class="report-cover"><p class="report-kicker">BET EXNOV · RAPPORT</p><h1>${e(report.title)}</h1>${report.subtitle ? `<p class="report-subtitle">${e(report.subtitle)}</p>` : ""}<div class="report-meta">${[["Projet", report.project], ["Destinataire", report.client], ["Référence", report.reference], ["Date", report.date ? formatDate(report.date) : ""]].filter(([, value]) => value).map(([label, value]) => `<div><span>${e(label)}</span>${e(value)}</div>`).join("")}</div></div>
  ${report.sections.map((section, index) => `<h2 class="report-heading"><b>${String(index + 1).padStart(2, "0")}</b><span>${e(section.heading)}</span></h2>${section.paragraphs.map(p => `<p class="report-paragraph" data-split>${e(p)}</p>`).join("")}${section.bullets.map(p => `<p class="report-bullet" data-split>${e(p)}</p>`).join("")}${section.images.map(figure => {
    const image = byId.get(figure.imageId);
    if (!image) throw new Error("Une photographie du rapport est manquante.");
    return `<figure class="report-figure"><img src="${e(image.dataUrl)}" alt="${e(figure.caption || image.name)}"><figcaption>${e(figure.caption || image.name)}</figcaption></figure>`;
  }).join("")}`).join("")}</div></div><div id="pages"></div><script>${reportPaginationScript}</script></body></html>`;
}
