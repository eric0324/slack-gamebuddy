import { describe, expect, it } from 'vitest';
import { DECRYPTO_WORDS } from '../src/decryptoWords.js';

describe('decrypto/setup: 詞庫', () => {
  it('至少 120 個詞，不空白、不重複', () => {
    expect(DECRYPTO_WORDS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(DECRYPTO_WORDS).size).toBe(DECRYPTO_WORDS.length);
    for (const w of DECRYPTO_WORDS) expect(w.trim(), w).toBe(w), expect(w, w).not.toBe('');
  });
});
