import { after } from "next/server";
import { flushFileCleanup } from "@/lib/server/team-file-cleanup";
import { appendUpload, finishUpload, cancelUpload } from "@/lib/server/team-files";
import { requireTeamUser, apiError, jsonResponse } from "@/lib/server/team-access";
import {RequestError} from "@/lib/server/request";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = {params:Promise<{projectId:string;uploadId:string}>};
export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireTeamUser(request); const { projectId, uploadId } = await context.params;
    const reader = request.body?.getReader(); if (!reader) throw new RequestError("Bloc vide.",400);
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const {value,done} = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024*1024) { await reader.cancel(); throw new RequestError("Bloc trop volumineux.",413); } chunks.push(value); } } finally { reader.releaseLock(); }
    return jsonResponse(await appendUpload(user,projectId,uploadId,Number(new URL(request.url).searchParams.get("offset")),Buffer.concat(chunks)));
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request, context: Context) { try { const user = await requireTeamUser(request); const {projectId,uploadId} = await context.params; after(async () => { await flushFileCleanup(); }); return jsonResponse({project:await finishUpload(user,projectId,uploadId)}); } catch(error) {return apiError(error);} }
export async function DELETE(request: Request, context: Context) { try { const user = await requireTeamUser(request); const {projectId,uploadId} = await context.params; await cancelUpload(user,projectId,uploadId); return jsonResponse({ok:true}); } catch(error) {return apiError(error);} }
