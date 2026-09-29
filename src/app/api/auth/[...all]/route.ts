import { AuthConfigurationError, getAuth, getAuthConfiguration } from "@/lib/server/auth";

export const runtime = "nodejs";

async function handle(request: Request) {
  try {
    const configuration = getAuthConfiguration();
    // Cookie-authenticated writes are accepted only from this application.
    if (request.method === "POST" && request.headers.get("origin") !== configuration.baseURL) {
      return Response.json({ message: "Origine de la requête non autorisée." }, { status: 403 });
    }
    return await getAuth().handler(request);
  } catch (error) {
    return Response.json(
      { message: error instanceof AuthConfigurationError
        ? "La connexion de l’équipe n’est pas encore configurée. Contactez l’administrateur."
        : "La connexion est momentanément indisponible. Réessayez dans quelques instants." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
