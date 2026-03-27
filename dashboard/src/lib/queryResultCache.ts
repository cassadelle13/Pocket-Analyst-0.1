import crypto from "node:crypto";
import { LRUCache } from "lru-cache";
import {
  getDistributedQueryCache,
  purgeExpiredDistributedQueryCache,
  upsertDistributedQueryCache,
} from "./datatalkMetaDb";

export type CacheKeyInput = {
  connectionId: string;
  sql: string;
  params?: unknown;
};

export type CacheTtlPolicy = {
  softTtlMs: number;
  hardTtlMs: number;
};

type CacheEntry<T> = {
  createdAt: number;
  value: T;
  softExpiresAt: number;
  hardExpiresAt: number;
  refreshing?: boolean;
};

const cache = new LRUCache<string, CacheEntry<any>>({
  max: 200,
  ttlAutopurge: true,
});

const distributedCacheEnabled = String(process.env.QUERY_CACHE_DISTRIBUTED ?? "1").trim() !== "0";
let lastPurgeAt = 0;

export function buildCacheKey(input: CacheKeyInput): string {
  const normalized = {
    connectionId: String(input.connectionId ?? "").trim(),
    sql: String(input.sql ?? "").trim(),
    params: input.params ?? null,
  };
  const raw = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

export function getCacheEntry<T>(key: string): CacheEntry<T> | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  return entry ?? null;
}

export function setCacheEntry<T>(key: string, value: T, policy: CacheTtlPolicy): void {
  const now = Date.now();
  const soft = Math.max(0, Number(policy.softTtlMs) || 0);
  const hard = Math.max(0, Number(policy.hardTtlMs) || 0);
  const softExpiresAt = now + soft;
  const hardExpiresAt = now + Math.max(hard, soft);

  cache.set(key, {
    createdAt: now,
    value,
    softExpiresAt,
    hardExpiresAt,
  });
}

async function getDistributedEntry<T>(key: string): Promise<CacheEntry<T> | null> {
  if (!distributedCacheEnabled) return null;
  try {
    const row = await getDistributedQueryCache(key);
    if (!row) return null;
    return {
      createdAt: Date.parse(String(row.updated_at)),
      value: row.value_json as T,
      softExpiresAt: Date.parse(String(row.soft_expires_at)),
      hardExpiresAt: Date.parse(String(row.hard_expires_at)),
    };
  } catch {
    return null;
  }
}

async function setDistributedEntry<T>(key: string, value: T, policy: CacheTtlPolicy): Promise<void> {
  if (!distributedCacheEnabled) return;
  try {
    const now = Date.now();
    const soft = Math.max(0, Number(policy.softTtlMs) || 0);
    const hard = Math.max(0, Number(policy.hardTtlMs) || 0);
    await upsertDistributedQueryCache({
      cacheKey: key,
      valueJson: value,
      softExpiresAt: new Date(now + soft),
      hardExpiresAt: new Date(now + Math.max(hard, soft)),
    });
    if (now - lastPurgeAt > 5 * 60_000) {
      lastPurgeAt = now;
      void purgeExpiredDistributedQueryCache().catch(() => {});
    }
  } catch {
    // best effort
  }
}

export function getTtlPolicyByHint(hint: string | undefined): CacheTtlPolicy {
  const h = String(hint ?? "").trim().toLowerCase();
  if (h === "realtime") {
    return { softTtlMs: 60_000, hardTtlMs: 5 * 60_000 };
  }
  if (h === "report") {
    return { softTtlMs: 60 * 60_000, hardTtlMs: 6 * 60 * 60_000 };
  }
  return { softTtlMs: 2 * 60_000, hardTtlMs: 15 * 60_000 };
}

export async function withCachedResult<T>(params: {
  key: string;
  policy: CacheTtlPolicy;
  fetcher: () => Promise<T>;
}): Promise<{ value: T; cache: { hit: boolean; stale: boolean } }> {
  const now = Date.now();
  const existing = getCacheEntry<T>(params.key) ?? (await getDistributedEntry<T>(params.key));
  if (existing && !getCacheEntry<T>(params.key)) {
    cache.set(params.key, existing);
  }

  if (existing) {
    const hardExpired = now > existing.hardExpiresAt;
    const softExpired = now > existing.softExpiresAt;

    if (!hardExpired) {
      if (!softExpired) {
        return { value: existing.value, cache: { hit: true, stale: false } };
      }

      // Soft-expired: return cached, refresh in background (best effort)
      if (!existing.refreshing) {
        existing.refreshing = true;
        cache.set(params.key, existing);
        params
          .fetcher()
          .then((fresh) => {
            setCacheEntry(params.key, fresh, params.policy);
            void setDistributedEntry(params.key, fresh, params.policy);
          })
          .catch(() => {
            // keep stale
          })
          .finally(() => {
            const e = getCacheEntry<T>(params.key);
            if (e) {
              e.refreshing = false;
              cache.set(params.key, e);
            }
          });
      }

      return { value: existing.value, cache: { hit: true, stale: true } };
    }
  }

  const fresh = await params.fetcher();
  setCacheEntry(params.key, fresh, params.policy);
  void setDistributedEntry(params.key, fresh, params.policy);
  return { value: fresh, cache: { hit: false, stale: false } };
}
