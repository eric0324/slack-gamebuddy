import { describe, expect, it } from 'vitest';
import { CHAMELEON_CARDS } from '../src/chameleonCards.js';

describe('chameleon/setup: 主題卡詞庫', () => {
  it('至少 30 張，主題名稱不空白、不重複', () => {
    expect(CHAMELEON_CARDS.length).toBeGreaterThanOrEqual(30);
    const topics = CHAMELEON_CARDS.map((c) => c.topic);
    expect(new Set(topics).size).toBe(topics.length);
    for (const t of topics) expect(t.trim(), t).toBe(t), expect(t, t).not.toBe('');
  });

  it('每張剛好 16 個詞，不空白、不重複、20 字以內', () => {
    for (const { topic, words } of CHAMELEON_CARDS) {
      expect(words, topic).toHaveLength(16);
      expect(new Set(words.map((w) => w.toLowerCase())).size, topic).toBe(16);
      for (const w of words) {
        expect(w.trim(), `${topic}:${w}`).toBe(w);
        expect(w, topic).not.toBe('');
        expect([...w].length, w).toBeLessThanOrEqual(20);
      }
    }
  });
});
