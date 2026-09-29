import { ZodError } from "zod";
import { AuthConfigurationError, createManagedAuthUser, getAuthConfiguration } from "../src/lib/server/auth";
import { getDatabase, transaction } from "../src/lib/server/database";

async function bootstrap() {
  if (process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
  getAuthConfiguration();
  const name = process.env.EXNOV_ADMIN_NAME;
  const email = process.env.EXNOV_ADMIN_EMAIL;
  const password = process.env.EXNOV_ADMIN_PASSWORD;
  if (!name || !email || !password) throw new Error("ADMIN_ENV_MISSING");
  const pool = getDatabase();
  try {
    await transaction(async client => {
      // Only one process can create the first team member, even concurrently.
      await client.query("LOCK TABLE team_members IN EXCLUSIVE MODE");
      const members = await client.query("SELECT user_id FROM team_members LIMIT 1");
      if (members.rowCount) throw new Error("TEAM_ALREADY_INITIALIZED");
      const user = await createManagedAuthUser({ name, email, password }, client);
      await client.query("INSERT INTO team_members (user_id, role, active) VALUES ($1, 'admin', true)", [user.id]);
      await client.query(
        "INSERT INTO team_audit (actor_id, action) VALUES ($1, 'team.bootstrap')",
        [user.id],
      );
    });
    console.info("Premier administrateur créé. Retirez EXNOV_ADMIN_PASSWORD de votre configuration.");
  } finally {
    await pool.end();
  }
}

bootstrap().catch(error => {
  const message = error instanceof AuthConfigurationError ? error.message
    : error instanceof ZodError ? "Identité invalide : vérifiez le nom, l’e-mail et un mot de passe de 12 à 128 caractères."
      : error instanceof Error && error.message === "ADMIN_ENV_MISSING"
        ? "Renseignez EXNOV_ADMIN_NAME, EXNOV_ADMIN_EMAIL et EXNOV_ADMIN_PASSWORD pour créer le premier administrateur."
        : error instanceof Error && error.message === "TEAM_ALREADY_INITIALIZED"
          ? "L’équipe possède déjà un membre. Utilisez un administrateur existant pour gérer les comptes."
          : "Création impossible. Vérifiez la connexion Neon et appliquez d’abord npm run db:migrate.";
  console.error(message);
  process.exitCode = 1;
});
