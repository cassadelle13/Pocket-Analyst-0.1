/**
 * Discovery Cache
 * Кэширование результатов обнаружения БД для улучшения производительности
 * SECURITY: Credentials are sanitized before caching
 */

import { sanitizeCredentials } from './credentialSanitizer';

interface CachedDiscovery {
  timestamp: number;
  data: any;
  ttl: number;
}

class DiscoveryCache {
  private cache: Map<string, CachedDiscovery>;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.cache = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
  }

  /**
   * Получить данные из кэша
   */
  get(key: string): any | null {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }

    const now = Date.now();
    const age = now - cached.timestamp;

    // Проверка TTL
    if (age > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    console.log(`[Cache] HIT for key: ${key}, age: ${Math.round(age / 1000)}s`);
    return cached.data;
  }

  /**
   * Сохранить данные в кэш
   * SECURITY: Sanitizes credentials before caching
   */
  set(key: string, data: any, ttl: number = 60000): void {
    // Sanitize credentials before caching to prevent memory dump leaks
    const sanitizedData = sanitizeCredentials(data);
    
    this.cache.set(key, {
      timestamp: Date.now(),
      data: sanitizedData,
      ttl,
    });
    console.log(`[Cache] SET key: ${key}, ttl: ${ttl}ms (credentials sanitized)`);
  }

  /**
   * Удалить из кэша
   */
  delete(key: string): void {
    this.cache.delete(key);
    console.log(`[Cache] DELETE key: ${key}`);
  }

  /**
   * Очистить весь кэш
   */
  clear(): void {
    this.cache.clear();
    console.log('[Cache] CLEAR all');
  }

  /**
   * Получить статистику кэша
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Автоматическая очистка устаревших записей
   */
  private startCleanup(): void {
    // Очистка каждые 5 минут
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [key, cached] of this.cache.entries()) {
        const age = now - cached.timestamp;
        if (age > cached.ttl) {
          this.cache.delete(key);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Cache] Cleanup: removed ${cleaned} expired entries`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Остановить автоочистку (для тестов)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const discoveryCache = new DiscoveryCache();

export default discoveryCache;

/**
 * TTL presets
 */
export const CACHE_TTL = {
  quick: 60 * 1000,      // 1 минута для quick scan
  full: 5 * 60 * 1000,   // 5 минут для full scan
  docker: 30 * 1000,     // 30 секунд для Docker (контейнеры могут часто меняться)
  files: 2 * 60 * 1000,  // 2 минуты для файлов
};

/**
 * Генерация ключа кэша
 */
export function getCacheKey(mode: string, ip?: string): string {
  const base = `discover:${mode}`;
  return ip ? `${base}:${ip}` : base;
}
