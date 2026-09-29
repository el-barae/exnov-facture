import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { Pool as NeonPool } from "@neondatabase/serverless";
import { DatabaseSocket } from "./database-socket";

export function databaseTransport(connectionString: string): "neon" | "tcp" {
  const host = new URL(connectionString).hostname.toLowerCase();
  return host.endsWith(".neon.tech") ? "neon" : "tcp";
}

// Contrat commun aux pilotes pg et Neon : les surcharges de leurs types diffèrent.
export interface DatabaseClient {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>>;
  release(destroy?: boolean): void;
}
export interface DatabasePool {
  query<R extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]): Promise<QueryResult<R>>;
  connect(): Promise<DatabaseClient>;
  end(): Promise<void>;
}
let pool: DatabasePool | undefined;
export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL doit être configurée.");
  if (!pool) {
    const options = {
      connectionString: process.env.DATABASE_URL,
      max: 5, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 20_000, allowExitOnIdle: true,
    };
    const created = databaseTransport(options.connectionString) === "neon"
      ? new NeonPool(options)
      : new Pool({ ...options, stream: () => new DatabaseSocket() });
    // Une coupure sur une connexion inactive ne doit pas arrêter le serveur.
    created.on("error", () => console.error("Connexion PostgreSQL inactive interrompue ; le pool recréera la connexion."));
    pool = created;
  }
  return pool;
}
export async function transaction<T>(run: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = await getDatabase().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { discard = true; }
    throw error;
  } finally { client.release(discard); }
}
