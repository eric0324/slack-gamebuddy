import { describe, expect, it } from 'vitest';
import { CAUSE_BOARD, CLUES, LOCATION_BOARDS, MEANS, SCENE_BOARDS } from '../src/deceptionCards.js';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('deception/setup: 詞庫', () => {
  it('手段、線索各至少 100 個，不空白、不重複、兩個詞庫沒有共同的詞、不超過 6 個字', () => {
    for (const words of [MEANS, CLUES]) {
      expect(words.length).toBeGreaterThanOrEqual(100);
      expect(new Set(words).size).toBe(words.length);
      for (const w of words) {
        expect(w.trim(), w).toBe(w);
        expect(w.length, w).toBeGreaterThan(0);
        expect([...w].length, w).toBeLessThanOrEqual(6);
        expect(EMOJI.test(w), w).toBe(false);
      }
    }
    const means = new Set(MEANS);
    expect(CLUES.filter((w) => means.has(w))).toEqual([]);
  });
});

describe('deception/clues: 提示板內容', () => {
  it('死因板 1 張、地點板 4 張、場景板至少 20 張；每張 6 個不重複的選項；題目不重複、不含 emoji', () => {
    expect(CAUSE_BOARD.title).toBe('死因');
    expect(LOCATION_BOARDS).toHaveLength(4);
    expect(SCENE_BOARDS.length).toBeGreaterThanOrEqual(20);
    const all = [CAUSE_BOARD, ...LOCATION_BOARDS, ...SCENE_BOARDS];
    for (const b of all) {
      expect(b.title.trim(), b.title).not.toBe('');
      expect(b.options, b.title).toHaveLength(6);
      expect(new Set(b.options).size, b.title).toBe(6);
      for (const t of [b.title, ...b.options]) {
        expect(t.trim(), b.title).not.toBe('');
        expect(EMOJI.test(t), t).toBe(false);
      }
    }
    const titles = all.map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});
