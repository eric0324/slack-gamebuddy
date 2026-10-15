import { describe, expect, it } from 'vitest';
import { MEME_CARDS } from '../src/memeCards.js';
import { MEME_IMAGES } from '../src/memeImages.js';

describe('meme/setup: 文字卡題庫', () => {
  it('至少 300 句，不重複，每句 1～30 字', () => {
    expect(MEME_CARDS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(MEME_CARDS).size).toBe(MEME_CARDS.length);
    for (const c of MEME_CARDS) {
      expect(c, c).toBe(c.trim());
      expect([...c].length, c).toBeGreaterThanOrEqual(1);
      expect([...c].length, c).toBeLessThanOrEqual(30);
    }
  });
});

describe('meme/setup: 梗圖題庫', () => {
  it('至少 6 張，名稱和 https 網址都有，網址不重複，來源是 imgflip 或 tw', () => {
    expect(MEME_IMAGES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(MEME_IMAGES.map((m) => m.url)).size).toBe(MEME_IMAGES.length);
    for (const m of MEME_IMAGES) {
      expect(m.name.trim(), m.url).not.toBe('');
      expect(m.url, m.name).toMatch(/^https:\/\/\S+$/);
      expect(['imgflip', 'tw']).toContain(m.source);
    }
  });
});
