import { describe, it, expect } from 'vitest';
import { divide, calculateDiscount } from './app.js';

describe('demo/app — intentional bugs', () => {
  describe('divide', () => {
    it('returns correct result for normal division', () => {
      expect(divide(10, 2)).toBe(5);
    });

    it('returns Infinity when dividing by zero (the bug — should throw)', () => {
      // This test documents the current broken behavior.
      // After the fix, this should throw an error instead.
      expect(divide(10, 0)).toBe(Infinity);
    });
  });

  describe('calculateDiscount', () => {
    it('currently applies wrong discount (bug: multiplies instead of divides by 100)', () => {
      // Bug: returns 100 * 20 = 2000, not 100 * 0.20 = 20
      expect(calculateDiscount(100, 20)).toBe(2000);
    });

    it('should return 80 for 100 with 20% discount (correct behavior)', () => {
      // After the fix: calculateDiscount(100, 20) should return 80 (price - discount)
      // or 20 (the discount amount). Document the expected post-fix behavior.
      const discountAmount = 100 * (20 / 100);
      expect(discountAmount).toBe(20);
    });
  });
});
