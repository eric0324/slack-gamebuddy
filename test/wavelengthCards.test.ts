import { describe, expect, it } from 'vitest';
import { SPECTRUMS } from '../src/wavelengthCards.js';

describe('wavelength/setup: 光譜卡', () => {
  it('至少 60 張，兩端不空白、不重複', () => {
    expect(SPECTRUMS.length).toBeGreaterThanOrEqual(60);
    const keys = SPECTRUMS.map(([l, r]) => `${l}|${r}`);
    expect(new Set(keys).size).toBe(SPECTRUMS.length);
    for (const [l, r] of SPECTRUMS) {
      expect(l.trim(), `${l}|${r}`).not.toBe('');
      expect(r.trim(), `${l}|${r}`).not.toBe('');
      expect(l).not.toBe(r);
    }
  });
});
