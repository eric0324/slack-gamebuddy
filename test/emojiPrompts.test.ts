import { describe, expect, it } from 'vitest';
import { EMOJI_PROMPTS } from '../src/emojiPrompts.js';

describe('emoji/setup: 題庫', () => {
  it('至少 150 題，題目不重複、不空白', () => {
    expect(EMOJI_PROMPTS.length).toBeGreaterThanOrEqual(150);
    expect(new Set(EMOJI_PROMPTS).size).toBe(EMOJI_PROMPTS.length);
    for (const p of EMOJI_PROMPTS) expect(p.trim(), p).toBe(p);
  });

  it('每題 2～12 字', () => {
    for (const p of EMOJI_PROMPTS) {
      expect(Array.from(p).length, p).toBeGreaterThanOrEqual(2);
      expect(Array.from(p).length, p).toBeLessThanOrEqual(12);
    }
  });
});
