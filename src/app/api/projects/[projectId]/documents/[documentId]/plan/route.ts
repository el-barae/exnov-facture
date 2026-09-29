import { readTeamFile } from "@/lib/server/team-files";
import { requireTeamUser, apiError } from "@/lib/server/team-access";
import { RequestError } from "@/lib/server/request";
import { isEditableProjectPlan, parseProjectPlanFile, loadedProjectPlan } from "@/lib/cad/project";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ projectId: string; documentId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const user = await requireTeamUser(request);
    const { projectId, documentId } = await context.params;
    const { document, project, bytes } = await readTeamFile(user, projectId, documentId);
    if (!isEditableProjectPlan(document)) throw new RequestError("Ce document n’est pas un plan modifiable.", 400);
    const plan = await parseProjectPlanFile(new Blob([new Uint8Array(bytes)]));
    const body = JSON.stringify({ document: loadedProjectPlan(project, document, plan) });
    return new Response(new Blob([body]).stream(), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return apiError(error); }
}
