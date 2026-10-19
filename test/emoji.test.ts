import { describe, expect, it } from 'vitest';
import { emojiCount, isEmojiOnly } from '../src/emoji.js';

describe('emoji/rounds: Emoji 格式', () => {
  it.each([
    ['🧋 ⚫ ⚫'],
    ['🧋　⚫⚫'], // 全形空白
    [':bubble_tea: 🐻 :wave::skin-tone-3:'],
    [':+1: :e-mail: :man\'s_shoe:'],
    ['👨‍👩‍👧 🇹🇼 1️⃣'],
    ['❤'], // 沒有變體選擇符
    ['☺️'],
    ['👍🏽'],
  ])('接受「%s」', (text) => {
    expect(isEmojiOnly(text)).toBe(true);
  });

  it.each([[''], ['   　'], ['🧋奶茶'], ['boba 🧋'], ['1 🧋'], ['1'], ['#'], ['<3'], ['🧋！'], ['🧋.'], [':abc'], [':珍奶:'], [':Bubble_Tea:'], ['ㄅ🧋']])(
    '拒絕「%s」',
    (text) => {
      expect(isEmojiOnly(text)).toBe(false);
    },
  );

  it('ZWJ 組合、國旗、keycap、shortcode 各算 1 個', () => {
    expect(emojiCount('👨‍👩‍👧 🇹🇼 1️⃣')).toBe(3);
    expect(emojiCount(':wave::skin-tone-3: 🧋')).toBe(3);
    expect(emojiCount('🧋奶茶')).toBeNull();
  });

  it('最多 20 個', () => {
    expect(isEmojiOnly('👨‍👩‍👧'.repeat(20))).toBe(true);
    expect(isEmojiOnly('🧋'.repeat(21))).toBe(false);
    expect(isEmojiOnly(':cat:'.repeat(21))).toBe(false);
  });
});
