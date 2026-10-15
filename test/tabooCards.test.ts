import { describe, expect, it } from 'vitest';
import { TABOO_CARDS } from '../src/tabooCards.js';

describe('taboo/setup: 題目卡詞庫', () => {
  it('至少 150 張', () => {
    expect(TABOO_CARDS.length).toBeGreaterThanOrEqual(150);
  });

  it('每張 1 個題目詞和 5 個不重複的禁語，每個詞至少 2 個字、不空白', () => {
    for (const { word, taboo } of TABOO_CARDS) {
      expect(taboo, word).toHaveLength(5);
      expect(new Set(taboo).size, word).toBe(5);
      expect(taboo, word).not.toContain(word);
      for (const w of [word, ...taboo]) {
        expect(w.trim(), word).toBe(w);
        expect([...w].length, `${word}：${w}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('題目詞不重複', () => {
    const words = TABOO_CARDS.map((c) => c.word);
    expect(new Set(words).size).toBe(words.length);
  });
});
