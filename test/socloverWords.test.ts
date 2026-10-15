import { describe, expect, it } from 'vitest';
import { SOCLOVER_WORDS } from '../src/socloverWords.js';

describe('soclover/setup: 詞庫', () => {
  it('至少 200 個詞，不空白、不含空白字元、不重複', () => {
    expect(SOCLOVER_WORDS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(SOCLOVER_WORDS).size).toBe(SOCLOVER_WORDS.length);
    for (const w of SOCLOVER_WORDS) expect(w, w).toMatch(/^\S+$/);
  });
});
