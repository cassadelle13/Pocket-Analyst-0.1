/**
 * Neutral default connection for status API and semantic bootstrap.
 * No product-specific names (e.g. MusGen): use env override or first connection
 * (listConnections already orders by name ASC — stable and predictable).
 */

export type ConnectionPickRow = { id: string; name: string };

export function pickDefaultConnection<T extends ConnectionPickRow>(
  connections: T[] | null | undefined
): T | null {
  const arr = Array.isArray(connections) ? connections : [];
  if (arr.length === 0) return null;

  const preferredName = String(process.env.DATATALK_DEFAULT_CONNECTION_NAME ?? "").trim();
  if (preferredName) {
    const hit = arr.find(
      (c) => String(c.name ?? "").trim().toLowerCase() === preferredName.toLowerCase()
    );
    if (hit) return hit;
  }

  return arr[0] ?? null;
}
