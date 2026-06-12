import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limiter.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request', () => {
    const limiter = createRateLimiter({ maxPerHour: 5, maxPerDay: 20 });
    expect(limiter.checkAndConsume()).toBe(true);
  });

  it('allows up to maxPerHour requests within an hour', () => {
    const limiter = createRateLimiter({ maxPerHour: 3, maxPerDay: 100 });
    expect(limiter.checkAndConsume()).toBe(true);
    expect(limiter.checkAndConsume()).toBe(true);
    expect(limiter.checkAndConsume()).toBe(true);
    expect(limiter.checkAndConsume()).toBe(false);
  });

  it('resets the hourly counter after one hour elapses', () => {
    const limiter = createRateLimiter({ maxPerHour: 2, maxPerDay: 100 });
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    expect(limiter.checkAndConsume()).toBe(false);

    // Advance time by just over 1 hour
    vi.advanceTimersByTime(61 * 60 * 1000);
    expect(limiter.checkAndConsume()).toBe(true);
  });

  it('enforces the daily limit independently of the hourly limit', () => {
    const limiter = createRateLimiter({ maxPerHour: 100, maxPerDay: 3 });
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    expect(limiter.checkAndConsume()).toBe(false);
  });

  it('does not reset the daily count after one hour', () => {
    const limiter = createRateLimiter({ maxPerHour: 5, maxPerDay: 2 });
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    vi.advanceTimersByTime(61 * 60 * 1000);
    // Hour window reset, but daily window not yet
    expect(limiter.checkAndConsume()).toBe(false);
  });

  it('resets the daily count after 24 hours', () => {
    const limiter = createRateLimiter({ maxPerHour: 100, maxPerDay: 2 });
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    expect(limiter.checkAndConsume()).toBe(false);

    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(limiter.checkAndConsume()).toBe(true);
  });

  it('getStats returns current counts', () => {
    const limiter = createRateLimiter({ maxPerHour: 10, maxPerDay: 100 });
    limiter.checkAndConsume();
    limiter.checkAndConsume();
    const stats = limiter.getStats();
    expect(stats.hourCount).toBe(2);
    expect(stats.dayCount).toBe(2);
  });
});
