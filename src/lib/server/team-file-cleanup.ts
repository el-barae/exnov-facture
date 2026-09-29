import "server-only";
import { getDatabase, transaction } from "./database";
import { deleteDriveFile, driveStorageConfigured } from "./drive-files";

/** Une mise en corbeille différée reste traçable même si Google est indisponible. */
export async function queueFileCleanup(ids: string[]) {
  for (const id of ids) {
    try { await getDatabase().query("INSERT INTO drive_file_cleanup(file_id) VALUES($1) ON CONFLICT DO NOTHING", [id]); }
    catch { console.error("Impossible de programmer le nettoyage d’un fichier Drive."); }
  }
}
export async function flushFileCleanup(limit = 3): Promise<number> {
  if (!driveStorageConfigured()) return 0;
  let removed = 0;
  try {
    await transaction(async client => {
      const pending = await client.query("SELECT file_id FROM drive_file_cleanup ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED", [limit]);
      for (const row of pending.rows) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,78124914))", [row.file_id]);
        // Une reprise après un résultat de commit incertain ne doit pas supprimer un fichier utilisé.
        const live = await client.query("SELECT id FROM project_files WHERE drive_file_id=$1", [row.file_id]);
        if (!live.rowCount) { await deleteDriveFile(row.file_id); removed++; }
        await client.query("DELETE FROM drive_file_cleanup WHERE file_id=$1", [row.file_id]);
      }
      await client.query("DELETE FROM project_uploads WHERE expires_at<now()");
    });
  } catch { console.error("Nettoyage Drive différé ; les fichiers restent dans la file de reprise."); }
  return removed;
}
