import type { Report, ReportImage } from "../report";
import { formatDate } from "../invoice";
import { browserAssets, documentFonts, documentFooter, documentLetterhead, escapeHtml, type DocumentAssets } from "./brand";
import { invoiceStyles } from "./styles";
import { reportPaginationScript } from "./report-paginate";

const reportStyles = `
.report-page .page-counter{z-index:3;bottom:25mm;right:17mm;color:#607471;font-size:7.5pt}
.report-running-reference{position:absolute;z-index:2;bottom:25mm;left:17mm;right:50mm;font:7pt/1.25 InvoiceTable,Arial,sans-serif;color:#607471;overflow-wrap:anywhere;white-space:normal}
.report-content{margin:0 17mm;display:flow-root;color:#2f444a;font:10pt/1.6 InvoiceSans,Arial,sans-serif;overflow-wrap:anywhere}
.report-content>*{margin:0 0 3.5mm}
.report-cover{min-height:185mm;display:flex;flex-direction:column;padding:8mm 0 0}
.report-kicker{font-size:8pt;letter-spacing:1.4pt;color:#607471;margin:0 0 7mm}
.report-cover-title{border-left:1.5mm solid #f8be18;padding:1mm 0 2mm 6mm}
.report-cover h1{font:700 27pt/1.18 InvoiceTable,Arial,sans-serif;margin:0;color:#2f444a;white-space:normal}
.report-subtitle{font-size:11pt;line-height:1.5;margin:5mm 0 0;color:#607471;white-space:normal}
.report-meta{display:grid;grid-template-columns:1fr 1fr;gap:5mm 7mm;margin-top:12mm;font-size:9pt;line-height:1.5}
.report-meta>div{padding-top:2mm;border-top:.25mm solid #dce3df;white-space:normal}
.report-meta .report-project{grid-column:1/-1;font-size:12pt;font-weight:600}
.report-meta span{display:block;color:#607471;font-size:7pt;font-weight:500;text-transform:uppercase;letter-spacing:.6pt;margin-bottom:.8mm}
.report-placeholder{font-style:italic;color:#758681;font-weight:400}
.report-cover-note{margin:auto 0 0;padding-top:8mm;font-size:8pt;line-height:1.6;color:#607471}
.report-cover.report-cover-compact{padding-top:3mm}
.report-cover-compact h1{font-size:22pt}
.report-cover-compact .report-kicker{margin-bottom:4mm}
.report-cover-compact .report-subtitle{font-size:9.5pt;margin-top:3mm}
.report-cover-compact .report-meta{font-size:8.5pt;gap:3mm 6mm;margin-top:7mm}
.report-cover-compact .report-meta .report-project{font-size:10pt}
.report-heading{font:700 14pt/1.3 InvoiceTable,Arial,sans-serif;border-bottom:.35mm solid #e0e6df;padding:2.5mm 0;display:flex;gap:3mm;margin-top:4mm}
.report-heading b{color:#9b7400;font-size:10pt;padding-top:1mm;min-width:6mm}
.report-paragraph{white-space:pre-line;text-align:start}
.report-summary{white-space:pre-line;background:#f4f6f1;border-left:1mm solid #f8be18;padding:4mm 5mm;font-size:10pt;line-height:1.65}
.report-bullet{padding-left:5mm;position:relative;white-space:pre-line}
.report-bullet::before{content:'•';color:#a57b00;position:absolute;left:1mm}
.report-bullet.is-continuation::before{content:''}
.report-toc{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt}
.report-toc td{padding:3mm 0;border-bottom:.25mm solid #e4e8e1;vertical-align:top}
.report-toc td:last-child{width:13mm;text-align:right;font-variant-numeric:tabular-nums}
.report-toc a{color:inherit;text-decoration:none}
.report-toc-number{display:inline-block;min-width:8mm;color:#9b7400;font:700 10pt InvoiceTable,Arial,sans-serif}
.report-toc-page{color:#607471}
.report-finding-heading{margin-top:4.5mm!important;margin-bottom:2mm!important;padding:2mm 3mm;background:#eef2ed;border-left:1mm solid #93a39b;font:700 10pt/1.45 InvoiceTable,Arial,sans-serif}
.report-finding-basis{font-weight:400;color:#526b63;font-size:8pt;margin-left:3mm}
.report-finding-location{display:block;font:400 9pt/1.5 InvoiceSans,Arial,sans-serif;margin-top:.8mm;white-space:normal}
.report-finding-field{padding-left:4mm;border-left:.35mm solid #dfe5dc;margin-bottom:2.5mm!important}
.report-field-label{display:block;color:#536d64;font-size:7.5pt;line-height:1.5;letter-spacing:.4pt;text-transform:uppercase;font-weight:700;margin-bottom:.7mm}
.report-finding-field.is-continuation .report-field-label::after{content:' (suite)'}
.report-field-text{margin:0;white-space:pre-line;font-size:9.5pt;line-height:1.6}
.report-recommendation{border-color:#f0c943}
.report-figure{border:.25mm solid #dce4da;border-radius:2mm;padding:3mm;background:#fafbf8;margin-top:4mm}
.report-figure img{display:block;width:100%;height:78mm;object-fit:contain}
.report-figure figcaption{font-size:8.5pt;line-height:1.5;color:#536d64;margin-top:2mm;white-space:pre-line}
.report-photo-number{font-weight:700;color:#2f444a}
.report-actions-table{width:100%;border-collapse:collapse;table-layout:fixed;font:8.5pt/1.5 InvoiceSans,Arial,sans-serif}
.report-actions-table th,.report-actions-table td{border:.25mm solid #dbe3d9;padding:2.5mm 2mm;vertical-align:top;overflow-wrap:anywhere;white-space:normal}
.report-actions-table th{background:#2f444a;color:white;font:700 8pt/1.4 InvoiceTable,Arial,sans-serif;text-align:left}
.report-actions-table tbody tr:nth-child(even){background:#f5f7f2}
.report-actions-table p{margin:0;white-space:pre-line}
.report-action-number{font-weight:700;color:#9b7400}
.report-action-location{display:block;color:#607471;font-size:7.5pt;margin:1.5mm 0 0}
.report-action-priority{display:block;font-weight:700;margin-bottom:1.5mm}
.report-priority-urgente{color:#922f25}
.report-priority-prioritaire{color:#926500}
.report-table-continuation{font:700 9pt/1.4 InvoiceTable,Arial,sans-serif;text-align:left;color:#607471;padding:0 0 2mm}
`;

const basisLabels = { visuel: "Observation visuelle", information: "Information communiquée", document: "Référence documentaire", a_confirmer: "À confirmer" };
const priorityLabels = { a_confirmer: "À confirmer", courante: "Courante", prioritaire: "Prioritaire", urgente: "Urgente" };
const statusLabels = { a_faire: "À faire", en_cours: "En cours", a_verifier: "À vérifier", terminee: "Terminée" };

export function buildReportHtml(report: Report, images: ReportImage[], assets: DocumentAssets = browserAssets) {
  const e = escapeHtml;
  const byId = new Map(images.map(image => [image.id, image]));
  const metadata = report.metadata;
  const value = (text: string | undefined) => text ? e(text) : '<em class="report-placeholder">À renseigner</em>';
  const coverFields = [
    ["Projet", report.project], ["Maître d’ouvrage / destinataire", report.client], ["Localisation", metadata?.location],
    ["Référence", report.reference], ["Version", metadata?.version],
    ["Date du rapport", report.date ? formatDate(report.date) : ""], ["Date de visite", metadata?.visitDate ? formatDate(metadata.visitDate) : ""],
    ["Rédacteur", metadata?.author], ["Vérificateur", metadata?.reviewer],
  ];
  const heading = (title: string, id: string, number?: number) => `<h2 class="report-heading" data-keep-next data-section-id="${id}">${number ? `<b>${String(number).padStart(2, "0")}</b>` : ""}<span>${e(title)}</span></h2>`;
  const tocEntries = [
    ...(report.summary ? [{ title: "Synthèse", id: "report-summary", number: "" }] : []),
    ...report.sections.map((section, index) => ({ title: section.heading, id: `report-section-${index + 1}`, number: String(index + 1).padStart(2, "0") })),
    ...(report.actions?.length ? [{ title: "Plan d’actions et suivi", id: "report-actions", number: String(report.sections.length + 1).padStart(2, "0") }] : []),
  ];
  let photoNumber = 0;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(report.title)} — EXNOV</title><style>${documentFonts(assets)}${invoiceStyles}${reportStyles}</style></head><body><div id="source">
  ${documentLetterhead(assets)}${documentFooter()}
  <div class="report-running-reference">${e(report.reference || "Référence à renseigner")} · ${e(metadata?.version ? `Version ${metadata.version}` : "Version à renseigner")}</div>
  <div class="report-blocks"><div class="report-cover"><p class="report-kicker">BET EXNOV · GÉNIE CIVIL</p><div class="report-cover-title"><h1>${e(report.title)}</h1>${report.subtitle ? `<p class="report-subtitle">${e(report.subtitle)}</p>` : ""}</div><div class="report-meta">${coverFields.map(([label, text], index) => `<div${index === 0 ? ' class="report-project"' : ""}><span>${e(label)}</span>${value(text)}</div>`).join("")}</div><p class="report-cover-note">Les constats et recommandations s’apprécient dans le périmètre, à la date et au regard des informations précisés dans ce rapport.</p></div>
  ${report.sections.length >= 5 ? `${heading("Sommaire", "report-contents")}<table class="report-toc" data-paginated-table aria-label="Sommaire"><colgroup><col><col style="width:13mm"></colgroup><tbody>${tocEntries.map(entry => `<tr data-toc-target="${entry.id}"><td><a href="#${entry.id}">${entry.number ? `<span class="report-toc-number">${entry.number}</span>` : ""}${e(entry.title)}</a></td><td class="report-toc-page">—</td></tr>`).join("")}</tbody></table>` : ""}
  ${report.summary ? `${heading("Synthèse", "report-summary")}<p class="report-summary" data-split>${e(report.summary)}</p>` : ""}
  ${report.sections.map((section, index) => `${heading(section.heading, `report-section-${index + 1}`, index + 1)}${section.paragraphs.map(p => `<p class="report-paragraph" data-split>${e(p)}</p>`).join("")}${section.bullets.map(p => `<p class="report-bullet" data-split>${e(p)}</p>`).join("")}${(section.findings || []).map((finding, findingIndex) => `<h3 class="report-finding-heading" data-keep-next>Constat ${String(index + 1).padStart(2, "0")}.${String(findingIndex + 1).padStart(2, "0")}<span class="report-finding-basis">${e(basisLabels[finding.basis])}</span><span class="report-finding-location">Localisation : ${value(finding.location)}</span></h3>${[["Observation", finding.observation, "observation"], ["Analyse", finding.analysis, "analysis"], ["Recommandation", finding.recommendation, "recommendation"]].filter(([, text]) => text).map(([label, text, kind]) => `<div class="report-finding-field report-${kind}" data-split><span class="report-field-label">${label}</span><p class="report-field-text" data-split-text>${e(text)}</p></div>`).join("")}`).join("")}${section.images.map(figure => {
    const image = byId.get(figure.imageId);
    if (!image) throw new Error("Une photographie du rapport est manquante.");
    photoNumber += 1;
    return `<figure class="report-figure"><img src="${e(image.dataUrl)}" alt="${e(figure.caption || image.name)}"><figcaption><span class="report-photo-number">Photo ${String(photoNumber).padStart(2, "0")} — </span>${e(figure.caption || image.name)}</figcaption></figure>`;
  }).join("")}`).join("")}
  ${report.actions?.length ? `${heading("Plan d’actions et suivi", "report-actions", report.sections.length + 1)}<table class="report-actions-table" data-paginated-table aria-label="Plan d’actions et suivi"><colgroup><col style="width:47%"><col style="width:18%"><col style="width:16%"><col style="width:19%"></colgroup><thead><tr><th scope="col">Action / localisation</th><th scope="col">Responsable</th><th scope="col">Échéance</th><th scope="col">Priorité / état</th></tr></thead><tbody>${report.actions.map((action, index) => `<tr data-action-id="${index + 1}"><td><span class="report-action-number">A${String(index + 1).padStart(2, "0")}</span><p>${e(action.description)}</p><span class="report-action-location">Localisation : ${value(action.location)}</span></td><td>${value(action.owner)}</td><td>${value(action.dueDate)}</td><td><span class="report-action-priority report-priority-${action.priority}">${e(priorityLabels[action.priority])}</span>${e(statusLabels[action.status])}</td></tr>`).join("")}</tbody></table>` : ""}
  </div></div><div id="pages"></div><script>${reportPaginationScript}</script></body></html>`;
}
