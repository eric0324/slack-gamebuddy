import { describe, expect, it } from 'vitest';
import { HERD_QUESTIONS } from '../src/herdQuestions.js';

describe('herd/setup: 題庫', () => {
  it('至少 150 題', () => {
    expect(HERD_QUESTIONS.length).toBeGreaterThanOrEqual(150);
  });

  it('每題不空白、前後沒有空白', () => {
    for (const q of HERD_QUESTIONS) {
      expect(q.trim(), q).toBe(q);
      expect(q.length, q).toBeGreaterThan(0);
    }
  });

  it('題目不重複', () => {
    expect(new Set(HERD_QUESTIONS).size).toBe(HERD_QUESTIONS.length);
  });
});
