import { flushFileCleanup } from "../src/lib/server/team-file-cleanup";
import { getDatabase } from "../src/lib/server/database";
import { driveStorageConfigured } from "../src/lib/server/drive-files";
try {
  if (!driveStorageConfigured()) throw new Error("Configurez les variables Google Drive avant le nettoyage.");
  const removed = await flushFileCleanup(100);
  const pending = await getDatabase().query("SELECT count(*)::integer AS total FROM drive_file_cleanup");
  console.log(`${removed} fichier(s) mis en corbeille, ${pending.rows[0].total} restant(s).`);
  if (pending.rows[0].total) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Nettoyage impossible.");
  process.exitCode = 1;
} finally { if (process.env.DATABASE_URL) await getDatabase().end(); }
