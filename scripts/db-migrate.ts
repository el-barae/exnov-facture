import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { getAuth, AuthConfigurationError } from "../src/lib/server/auth";
import { getDatabase, transaction } from "../src/lib/server/database";

async function migrate() {
  // Administration uses the direct Neon connection when one is provided.
  if (process.env.DATABASE_DIRECT_URL) process.env.DATABASE_URL = process.env.DATABASE_DIRECT_URL;
  const auth = getAuth();
  const pool = getDatabase();
  try {
    const authentication = await getMigrations(auth.options);
    await authentication.runMigrations();
    const directory = new URL("../db/migrations/", import.meta.url);
    const files = (await readdir(directory)).filter(name => /^\d+[-\w]*\.sql$/.test(name)).sort();
    await transaction(async client => {
      await client.query("SELECT pg_advisory_xact_lock(69163751)");
      await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
        name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
      )`);
      for (const name of files) {
        const sql = await readFile(new URL(name, directory), "utf8");
        const checksum = createHash("sha256").update(sql).digest("hex");
        const previous = await client.query<{ checksum: string }>("SELECT checksum FROM app_schema_migrations WHERE name = $1", [name]);
        if (previous.rows.length) {
          if (previous.rows[0].checksum !== checksum) throw new Error("MIGRATION_CHANGED");
          continue;
        }
        await client.query(sql);
        await client.query("INSERT INTO app_schema_migrations (name, checksum) VALUES ($1, $2)", [name, checksum]);
      }
    });
    console.info("Migrations appliquées : authentification et espace équipe prêts.");
  } finally {
    await pool.end();
  }
}

migrate().catch(error => {
  const message = error instanceof AuthConfigurationError ? error.message
    : error instanceof Error && error.message === "MIGRATION_CHANGED"
      ? "Une migration déjà appliquée a changé. Créez un nouveau fichier SQL pour la modification."
      : "Migration impossible. Vérifiez la connexion Neon, les droits PostgreSQL et la compatibilité du schéma.";
  console.error(message);
  process.exitCode = 1;
});
