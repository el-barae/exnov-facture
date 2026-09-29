import { readTeamFile } from "@/lib/server/team-files";
import { requireTeamUser, apiError } from "@/lib/server/team-access";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ projectId: string; documentId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireTeamUser(request);
    const { projectId, documentId } = await context.params;
    const { document, bytes } = await readTeamFile(user, projectId, documentId);
    // Keep the response streamed for files above Vercel's buffered payload limit.
    const stream = new Blob([new Uint8Array(bytes)]).stream();
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return apiError(error); }
}
