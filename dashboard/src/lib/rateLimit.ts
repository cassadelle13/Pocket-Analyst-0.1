/**
 * Rate Limiting для защиты от DoS атак
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  windowMs: number;  // Временное окно в миллисекундах
  maxRequests: number;  // Максимум запросов в окне
}

/**
 * Проверка rate limit для IP адреса
 */
export function checkRateLimit(
  ip: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  // Если нет записи или окно истекло - создаем новую
  if (!entry || now > entry.resetTime) {
    rateLimitStore.set(ip, {
      count: 1,
      resetTime: now + config.windowMs,
    });
    return { allowed: true };
  }

  // Если превышен лимит
  if (entry.count >= config.maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Увеличиваем счетчик
  entry.count++;
  return { allowed: true };
}

/**
 * Очистка старых записей (вызывать периодически)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
}

// Автоматическая очистка каждые 5 минут
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);

/**
 * Preset конфигурации
 */
export const RATE_LIMIT_PRESETS = {
  // Строгий - для критичных операций
  strict: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 3,
  },
  // Средний - для обычных операций
  moderate: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 10,
  },
  // Мягкий - для частых операций
  lenient: {
    windowMs: 60 * 1000, // 1 минута
    maxRequests: 30,
  },
};
