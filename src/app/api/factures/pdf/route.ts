import { generatePdf } from "@/lib/server/pdf";
import { parseInvoiceRequest, exportError, fileResponse } from "@/lib/server/request";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try { const invoice = await parseInvoiceRequest(request); return fileResponse(await generatePdf(invoice), invoice.numero, "pdf", invoice.typeDocument); }
  catch (error) { return exportError(error, "PDF"); }
}
