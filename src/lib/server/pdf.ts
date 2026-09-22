import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";
import { type Invoice } from "../invoice";
import { buildInvoiceHtml } from "../document/html";
import { loadAssets } from "./assets";

export async function generatePdf(invoice: Invoice) {
  return renderPdfHtml(buildInvoiceHtml(invoice, await loadAssets()), "invoice");
}

export async function renderPdfHtml(html: string, kind: "invoice" | "report") {
  const localPath = process.env.CHROME_EXECUTABLE_PATH;
  const browser = await puppeteer.launch({
    executablePath: localPath || await chromium.executablePath(),
    args: localPath ? ["--no-sandbox", "--disable-dev-shm-usage"] : chromium.args,
    headless: true,
    timeout: 30000,
  });
  try {
    const page = await browser.newPage();
    // Les données n’introduisent ni URL externe ni script. Les ressources sont embarquées.
    await page.setRequestInterception(true);
    page.on("request", request => void (/^(data:|about:)/.test(request.url()) ? request.continue() : request.abort()));
    await page.emulateMediaType("print");
    await page.setContent(html, { waitUntil: "load", timeout: 20000 });
    await page.waitForFunction(`window.__${kind}Ready || window.__${kind}Error`, { timeout: 20000 });
    const error = await page.evaluate(`window.__${kind}Error`);
    if (error) throw new Error(String(error));
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  } finally {
    await browser.close();
  }
}
