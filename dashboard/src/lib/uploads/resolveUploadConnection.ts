import { listConnections } from "../datatalkMetaDb";

/**
 * Connection used for pa_upload imports (must be Postgres pointing at datatalk DB).
 * PA_UPLOAD_CONNECTION_NAME overrides default "Local Postgres".
 */
export async function resolvePostgresUploadConnectionId(): Promise<string | null> {
  const preferred = String(process.env.PA_UPLOAD_CONNECTION_NAME ?? "Local Postgres").trim();
  const connections = await listConnections().catch(() => []);
  if (preferred) {
    const hit = connections.find(
      (c) => String(c.name ?? "").trim().toLowerCase() === preferred.toLowerCase()
    );
    if (hit) return String(hit.id);
  }
  const anyPg = connections.find((c) => String(c.type ?? "").toLowerCase() === "postgres");
  return anyPg ? String(anyPg.id) : null;
}
