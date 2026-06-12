export interface RateLimiterConfig {
  maxPerHour: number;
  maxPerDay: number;
}

export interface RateLimiter {
  checkAndConsume(key?: string): boolean;
  getStats(): { hourCount: number; dayCount: number };
}

/**
 * Token-bucket style rate limiter using sliding window.
 * In production deployments with multiple instances, use a shared Redis counter.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const hourly: number[] = [];
  const daily: number[] = [];

  function prune(timestamps: number[], windowMs: number): void {
    const cutoff = Date.now() - windowMs;
    let i = 0;
    while (i < timestamps.length && (timestamps[i] ?? 0) < cutoff) i++;
    timestamps.splice(0, i);
  }

  return {
    checkAndConsume(): boolean {
      const now = Date.now();
      prune(hourly, 60 * 60 * 1000);
      prune(daily, 24 * 60 * 60 * 1000);

      if (hourly.length >= config.maxPerHour) return false;
      if (daily.length >= config.maxPerDay) return false;

      hourly.push(now);
      daily.push(now);
      return true;
    },

    getStats() {
      prune(hourly, 60 * 60 * 1000);
      prune(daily, 24 * 60 * 60 * 1000);
      return { hourCount: hourly.length, dayCount: daily.length };
    },
  };
}
