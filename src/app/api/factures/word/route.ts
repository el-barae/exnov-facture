import { protectApi } from "@/lib/server/team-access";
import { generateWord } from "@/lib/server/word";
import { parseInvoiceRequest, exportError, fileResponse } from "@/lib/server/request";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const denied = await protectApi(request, "finance");
  if (denied) return denied;
  try { const invoice = await parseInvoiceRequest(request); return fileResponse(await generateWord(invoice), invoice.numero, "docx", invoice.typeDocument); }
  catch (error) { return exportError(error, "Word"); }
}
