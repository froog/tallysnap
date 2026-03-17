import { describe, it, expect } from 'vitest';
import { QuiddlerPlugin } from '../plugins/QuiddlerPlugin';

describe('QuiddlerPlugin', () => {
  describe('cardPoints', () => {
    it('returns correct points for single letters', () => {
      expect(QuiddlerPlugin.cardPoints('A')).toBe(2);
      expect(QuiddlerPlugin.cardPoints('Q')).toBe(15);
      expect(QuiddlerPlugin.cardPoints('Z')).toBe(14);
    });

    it('returns correct points for double letters', () => {
      expect(QuiddlerPlugin.cardPoints('TH')).toBe(9);
      expect(QuiddlerPlugin.cardPoints('QU')).toBe(9);
      expect(QuiddlerPlugin.cardPoints('ER')).toBe(7);
    });

    it('returns 0 for invalid cards', () => {
      expect(QuiddlerPlugin.cardPoints('XYZ')).toBe(0);
    });
  });

  describe('letterCount', () => {
    it('returns 1 for single letters', () => {
      expect(QuiddlerPlugin.letterCount('A')).toBe(1);
      expect(QuiddlerPlugin.letterCount('Z')).toBe(1);
    });

    it('returns 2 for double letters', () => {
      expect(QuiddlerPlugin.letterCount('TH')).toBe(2);
      expect(QuiddlerPlugin.letterCount('QU')).toBe(2);
    });
  });

  describe('wordPoints', () => {
    it('calculates word points correctly', () => {
      // CAT = C(8) + A(2) + T(3) = 13
      expect(QuiddlerPlugin.wordPoints(['C', 'A', 'T'])).toBe(13);
      
      // THE = TH(9) + E(2) = 11
      expect(QuiddlerPlugin.wordPoints(['TH', 'E'])).toBe(11);
    });
  });

  describe('scoreHand', () => {
    it('calculates total score and stats', () => {
      const result = QuiddlerPlugin.scoreHand([['C', 'A', 'T'], ['TH', 'E']]);
      
      expect(result.total).toBe(24); // 13 + 11
      expect(result.wordCount).toBe(2);
      expect(result.words).toHaveLength(2);
    });
  });
});
