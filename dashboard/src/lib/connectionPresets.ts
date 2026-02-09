import { ConnectionPayload, ConnectionPreset, ConnectionPresetInput } from "../types/connection";
import { getDataTalkMetaPool } from "./datatalkMetaDb";

type ConnectionPresetRow = {
  id: string;
  name: string;
  driver_id: string;
  payload: ConnectionPayload;
  created_at: string;
  updated_at: string;
};

async function ensureConnectionPresetsTable() {
  await getDataTalkMetaPool().query(`
    CREATE TABLE IF NOT EXISTS connection_presets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      driver_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_connection_presets_driver ON connection_presets(driver_id);
    CREATE INDEX IF NOT EXISTS idx_connection_presets_updated ON connection_presets(updated_at DESC);
  `);
}

export async function listConnectionPresets(driverId?: string): Promise<ConnectionPreset[]> {
  await ensureConnectionPresetsTable();
  const params: unknown[] = [];
  const where = driverId ? `WHERE driver_id = $1` : "";
  if (driverId) {
    params.push(driverId);
  }
  const result = await getDataTalkMetaPool().query(
    `
    SELECT id, name, driver_id, payload, created_at, updated_at
    FROM connection_presets
    ${where}
    ORDER BY updated_at DESC
    `,
    params
  );

  return result.rows.map((row: ConnectionPresetRow) => ({
    id: row.id,
    name: row.name,
    driverId: row.driver_id,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function createConnectionPreset(input: ConnectionPresetInput): Promise<ConnectionPreset> {
  await ensureConnectionPresetsTable();
  const result = await getDataTalkMetaPool().query(
    `
    INSERT INTO connection_presets (name, driver_id, payload)
    VALUES ($1, $2, $3)
    RETURNING id, name, driver_id, payload, created_at, updated_at
    `,
    [input.name, input.driverId, input.payload]
  );

  const row = result.rows[0] as ConnectionPresetRow;
  return {
    id: row.id,
    name: row.name,
    driverId: row.driver_id,
    payload: row.payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteConnectionPreset(id: string): Promise<boolean> {
  await ensureConnectionPresetsTable();
  const result = await getDataTalkMetaPool().query(
    `DELETE FROM connection_presets WHERE id = $1`,
    [id]
  );
  return result.rowCount === 1;
}
