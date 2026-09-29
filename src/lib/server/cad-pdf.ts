import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { company } from "../../config/company";
import { cadPdfFitMessage, cadPdfLayout, CAD_PDF_CARTOUCHE_MM, CAD_PDF_MARGIN_MM, parseCadPdfRequest, type CadPdfSettings } from "../cad/pdf";
import { exportSvg } from "../cad/svg";
import type { CadPlan } from "../cad/types";
import type { DocumentAssets } from "../document/html";
import { loadAssets } from "./assets";

function html(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const mm = (value: number) => `${Number(value.toFixed(8))}mm`;

/** The SVG viewport is physically sized; no fit-to-page transform is applied. */
export function buildCadPdfHtml(input: CadPlan, rawSettings: CadPdfSettings, assets: DocumentAssets): string {
  const { plan, settings } = parseCadPdfRequest({ plan: input, settings: rawSettings });
  const layout = cadPdfLayout(plan, settings);
  if (!layout.fits) throw new Error(cadPdfFitMessage(layout));
  const svg = exportSvg(plan).replace(/^<\?xml[^>]*>\s*/, "").replace(/<svg\b[^>]*>/, (tag) => tag
    .replace(/\bwidth="[^"]*"/, `width="${mm(layout.svgWidthMm)}"`)
    .replace(/\bheight="[^"]*"/, `height="${mm(layout.svgHeightMm)}"`)
    .replace("<svg ", `<svg style="position:absolute;left:${mm(layout.svgLeftMm)};top:${mm(layout.svgTopMm)};width:${mm(layout.svgWidthMm)};height:${mm(layout.svgHeightMm)};max-width:none;max-height:none" `));
  const field = (label: string, value: string) => `<div class="field"><span>${label}</span><strong>${html(value || "—")}</strong></div>`;
  const date = settings.date ? settings.date.split("-").reverse().join("/") : "";
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'"><title>${html(plan.name)} — EXNOV</title><style>
@font-face{font-family:CadPrint;src:url('${assets.fontRegular}') format('truetype');font-weight:400}
@font-face{font-family:CadPrint;src:url('${assets.fontBold}') format('truetype');font-weight:700}
@font-face{font-family:CadFallback;src:url('${assets.fontSans}') format('truetype');font-weight:100 900}
@page{size:${mm(layout.sheetWidthMm)} ${mm(layout.sheetHeightMm)};margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0;width:${mm(layout.sheetWidthMm)};height:${mm(layout.sheetHeightMm)};color:#172126;background:#fff;font-family:CadPrint,CadFallback,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{position:relative;width:${mm(layout.sheetWidthMm)};height:${mm(layout.sheetHeightMm)};overflow:hidden;break-inside:avoid}svg text{font-family:CadPrint,CadFallback,sans-serif}
.frame{position:absolute;left:${mm(CAD_PDF_MARGIN_MM)};top:${mm(CAD_PDF_MARGIN_MM)};width:${mm(layout.outerFrameWidthMm)};height:${mm(layout.outerFrameHeightMm)};border:.2mm solid #acb8bb}
.cartouche{position:absolute;left:${mm(CAD_PDF_MARGIN_MM)};bottom:${mm(CAD_PDF_MARGIN_MM)};width:${mm(layout.outerFrameWidthMm)};height:${mm(CAD_PDF_CARTOUCHE_MM)};border:.3mm solid #1b3837;display:grid;grid-template-columns:44mm 1fr}
.brand{border-right:.2mm solid #1b3837;padding:3mm;display:flex;flex-direction:column;justify-content:center;gap:1mm;font-size:7.5pt;line-height:1.2}.brand img{width:32mm;height:12mm;object-fit:contain;object-position:left center}.brand strong{font-size:9pt}.brand p{margin:0}
.metadata{display:grid;grid-template-rows:15mm 13mm 1fr;min-width:0}.row{display:grid;grid-template-columns:1fr 1fr;min-width:0}.row+.row{border-top:.2mm solid #1b3837}.row:last-child{grid-template-columns:minmax(0,1fr) 25mm 25mm 20mm}.field{padding:1.1mm 2mm;min-width:0;overflow:hidden}.field+.field{border-left:.2mm solid #1b3837}.field span{display:block;color:#476162;font-size:6.8pt;line-height:1.05;margin-bottom:.7mm;text-transform:uppercase;letter-spacing:.1mm}.field strong{display:block;font-size:8pt;line-height:1.12;font-weight:400;overflow-wrap:anywhere}.row:first-child .field:first-child strong{font-weight:700}
</style></head><body><main class="sheet"><div class="frame"></div>${svg}<footer class="cartouche"><div class="brand"><img src="${html(assets.logo)}" alt="EXNOV"><strong>${html(company.name)}</strong><p>${html(company.activity)}<br>${html(company.city)}</p><p>${html(company.website)} · ${html(company.phone)}</p></div><div class="metadata"><div class="row">${field("Plan", plan.name)}${field("Projet", settings.project)}</div><div class="row">${field("Client", settings.client)}${field("Référence", settings.reference)}</div><div class="row">${field("Dessiné par", settings.drawnBy)}${field("Date", date)}${field("Échelle", `1:${settings.scale} · mètres`)}${field("Feuille", "1 / 1")}</div></div></footer></main></body></html>`;
}

export async function generateCadPdf(plan: CadPlan, settings: CadPdfSettings): Promise<Uint8Array> {
  const htmlDocument = buildCadPdfHtml(plan, settings, await loadAssets());
  const layout = cadPdfLayout(plan, settings);
  const localPath = process.env.CHROME_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({
    executablePath: localPath || await chromium.executablePath(),
    args: localPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : chromium.args,
    headless: true, timeout: 30000,
  });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => void (/^(data:|about:)/.test(request.url()) ? request.continue() : request.abort()));
    await page.emulateMediaType("print");
    await page.setContent(htmlDocument, { waitUntil: "load", timeout: 20000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map((image) => image.decode()));
      // Only cartouche typography may tighten; the plan viewport remains physically fixed.
      for (const field of document.querySelectorAll<HTMLElement>(".field")) {
        const value = field.querySelector<HTMLElement>("strong");
        if (!value) continue;
        let fontSize = Number.parseFloat(getComputedStyle(value).fontSize);
        while ((field.scrollHeight > field.clientHeight || field.scrollWidth > field.clientWidth) && fontSize > 7) {
          fontSize -= 0.25;
          value.style.fontSize = `${fontSize}px`;
        }
        if (field.scrollHeight > field.clientHeight + 1 || field.scrollWidth > field.clientWidth + 1) {
          throw new Error("Un texte du cartouche est trop long. Raccourcissez-le avant l’export.");
        }
      }
    });
    return await page.pdf({
      width: mm(layout.sheetWidthMm), height: mm(layout.sheetHeightMm), scale: 1,
      printBackground: true, preferCSSPageSize: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  } finally {
    await browser.close();
  }
}
