import { describe, expect, it } from 'vitest';
import { WAGER_QUESTIONS } from '../src/wagerQuestions.js';

describe('wager/setup: 題庫', () => {
  it('至少 120 題，題目不重複、不空白', () => {
    expect(WAGER_QUESTIONS.length).toBeGreaterThanOrEqual(120);
    const qs = WAGER_QUESTIONS.map((x) => x.q);
    expect(new Set(qs).size).toBe(qs.length);
    for (const q of qs) expect(q.trim(), q).toBe(q);
    for (const q of qs) expect(q.length, q).toBeGreaterThan(0);
  });

  it('正解是 0 以上、小於 1,000,000 的數字；單位和補充說明不空白', () => {
    for (const { q, answer, unit, note } of WAGER_QUESTIONS) {
      expect(Number.isFinite(answer), q).toBe(true);
      expect(answer, q).toBeGreaterThanOrEqual(0);
      expect(answer, q).toBeLessThan(1_000_000);
      expect(unit.trim(), q).not.toBe('');
      expect(note.trim(), q).not.toBe('');
    }
  });
});
