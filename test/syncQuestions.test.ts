import { describe, expect, it } from 'vitest';
import { MIX_THEMES, SYNC_QUESTIONS, SYNC_THEMES, THEME_NAMES, themeIds } from '../src/syncQuestions.js';
import { SYNC_QUESTIONS_EN, THEME_NAMES_EN } from '../src/syncQuestionsEn.js';

const REAL = SYNC_THEMES.filter((t) => t !== 'mix');

describe('sync/setup: 題庫', () => {
  it('13 個主題和中英文名稱', () => {
    expect(SYNC_THEMES).toEqual(['mix', 'daily', 'friends', 'food', 'travel', 'movies', 'music', 'games', 'football', 'genshin', 'love', 'family', 'work']);
    expect(SYNC_THEMES.map((t) => THEME_NAMES[t])).toEqual(['通用隨機', '日常偏好', '朋友日常', '吃喝美食', '旅行出遊', '電影', '音樂', '遊戲', '足球', '原神', '心動與戀愛', '家人之間', '同事同學']);
    expect(SYNC_THEMES.map((t) => THEME_NAMES_EN[t])).toEqual(['General Mix', 'Daily Preferences', 'Friends', 'Food & Drink', 'Travel', 'Movies', 'Music', 'Games', 'Football', 'Genshin Impact', 'Romance', 'Family', 'Coworkers & Classmates']);
    expect(MIX_THEMES).toEqual(['daily', 'friends', 'food', 'travel']);
  });

  it('12 個實際主題各至少 30 題；通用隨機是四個日常主題', () => {
    for (const t of REAL) expect(themeIds(t).length, t).toBeGreaterThanOrEqual(30);
    expect(themeIds('mix').sort((a, b) => a - b)).toEqual(MIX_THEMES.flatMap((t) => themeIds(t)).sort((a, b) => a - b));
  });

  it('每題 2～4 個選項，格式正確，同題選項不重複', () => {
    for (const lang of [SYNC_QUESTIONS, SYNC_QUESTIONS_EN]) {
      for (const { q, options } of lang) {
        expect(q.trim(), q).toBe(q);
        expect(q.length, q).toBeGreaterThan(0);
        expect(options.length, q).toBeGreaterThanOrEqual(2);
        expect(options.length, q).toBeLessThanOrEqual(4);
        expect(new Set(options).size, q).toBe(options.length);
        for (const o of options) {
          expect(o.trim(), `${q} ${o}`).toBe(o);
          expect([...o].length, `${q} ${o}`).toBeGreaterThanOrEqual(1);
          expect([...o].length, `${q} ${o}`).toBeLessThanOrEqual(20);
        }
      }
    }
  });

  it('同主題題目不重複 (中英文都是)', () => {
    for (const t of REAL) {
      const ids = themeIds(t);
      expect(new Set(ids.map((i) => SYNC_QUESTIONS[i].q)).size, t).toBe(ids.length);
      expect(new Set(ids.map((i) => SYNC_QUESTIONS_EN[i].q)).size, t).toBe(ids.length);
    }
  });

  it('英文題庫和中文一對一：題數和每題選項數相同', () => {
    expect(SYNC_QUESTIONS_EN).toHaveLength(SYNC_QUESTIONS.length);
    SYNC_QUESTIONS.forEach((zh, i) => expect(SYNC_QUESTIONS_EN[i].options.length, zh.q).toBe(zh.options.length));
  });
});
