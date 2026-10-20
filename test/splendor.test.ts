import { describe, expect, it } from 'vitest';
import { CARDS, cardText, COLORS, gemsText, need, NOBLES, nobleText, payment, shortfall, type Color, type Gems } from '../src/splendorCards.js';

const gems = (g: Partial<Gems> = {}): Gems => ({ w: 0, b: 0, g: 0, r: 0, k: 0, o: 0, ...g });
const disc = (d: Partial<Record<Color, number>> = {}): Record<Color, number> => ({ w: 0, b: 0, g: 0, r: 0, k: 0, ...d });

describe('splendor/setup: 發展卡', () => {
  it('90 張：一級 40、二級 30、三級 20，id 依序 1～90', () => {
    expect(CARDS).toHaveLength(90);
    expect(CARDS.map((c) => c.id)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect([1, 2, 3].map((lv) => CARDS.filter((c) => c.level === lv).length)).toEqual([40, 30, 20]);
  });

  it('每級每色 8／6／4 張', () => {
    for (const [lv, n] of [[1, 8], [2, 6], [3, 4]] as const) {
      for (const color of COLORS) expect(CARDS.filter((c) => c.level === lv && c.color === color)).toHaveLength(n);
    }
  });

  it('分數範圍：一級 0～1、二級 1～3、三級 3～5', () => {
    const range = (lv: number) => {
      const pts = CARDS.filter((c) => c.level === lv).map((c) => c.points);
      return [Math.min(...pts), Math.max(...pts)];
    };
    expect([range(1), range(2), range(3)]).toEqual([[0, 1], [1, 3], [3, 5]]);
  });

  it('抽查牌表：#8 一級白 1 分成本綠4、#90 三級黑 5 分成本紅7 黑3、#71 三級白 3 分', () => {
    expect(CARDS[7]).toEqual({ id: 8, level: 1, color: 'w', points: 1, cost: disc({ g: 4 }) });
    expect(CARDS[89]).toEqual({ id: 90, level: 3, color: 'k', points: 5, cost: disc({ r: 7, k: 3 }) });
    expect(CARDS[70]).toEqual({ id: 71, level: 3, color: 'w', points: 3, cost: disc({ b: 3, g: 3, r: 5, k: 3 }) });
    expect(CARDS[44].cost).toEqual(disc({ g: 1, r: 4, k: 2 })); // #45
  });
});

describe('splendor/setup: 貴族', () => {
  it('10 張，每張 3 分：5 張兩色各 4、5 張三色各 3', () => {
    expect(NOBLES).toHaveLength(10);
    expect(NOBLES.every((n) => n.points === 3)).toBe(true);
    const shapes = NOBLES.map((n) => n.need.map(([, v]) => v).join(','));
    expect(shapes.filter((x) => x === '4,4')).toHaveLength(5);
    expect(shapes.filter((x) => x === '3,3,3')).toHaveLength(5);
  });

  it('條件文字照牌表的順序：#1 紅4 綠4、#8 藍3 白3 黑3', () => {
    expect(nobleText(NOBLES[0])).toBe('紅4 綠4');
    expect(nobleText(NOBLES[7])).toBe('藍3 白3 黑3');
  });
});

describe('splendor/turns: 應付、缺口、付款', () => {
  it('應付：成本減折扣，最少 0', () => {
    expect(need(disc({ b: 3, g: 1 }), disc({ b: 1, g: 2 }))).toEqual(disc({ b: 2 }));
  });

  it('缺口：每色應付減籌碼的總和再減黃金，最少 0', () => {
    expect(shortfall(disc({ b: 3, g: 1 }), disc({ b: 1 }), gems({ b: 1 }))).toBe(2);
    expect(shortfall(disc({ b: 3, g: 1 }), disc({ b: 1 }), gems({ b: 1, o: 1 }))).toBe(1);
    expect(shortfall(disc({ b: 3 }), disc(), gems({ o: 5 }))).toBe(0);
  });

  it('付款：先付同色再用黃金', () => {
    expect(payment(disc({ b: 3 }), disc({ b: 1 }), gems({ b: 1, o: 1 }))).toEqual(gems({ b: 1, o: 1 }));
    expect(payment(disc({ w: 3 }), disc(), gems({ w: 5, o: 2 }))).toEqual(gems({ w: 3 }));
  });

  it('黃金不夠就買不起（回傳 null）', () => {
    expect(payment(disc({ b: 3, g: 2 }), disc(), gems({ b: 2, o: 1 }))).toBeNull();
  });

  it('折扣足夠時免費', () => {
    expect(payment(disc({ w: 4 }), disc({ w: 4 }), gems())).toEqual(gems());
  });
});

describe('splendor/setup: 顯示文字', () => {
  it('顏色文字：只列不為 0 的，依白藍綠紅黑金排序，全 0 寫「無」', () => {
    expect(gemsText(gems({ b: 1, w: 2 }))).toBe('白2 藍1');
    expect(gemsText(gems({ o: 1, k: 2, g: 1 }))).toBe('綠1 黑2 金1');
    expect(gemsText(gems())).toBe('無');
    expect(gemsText(disc({ r: 4 }))).toBe('紅4');
  });

  it('卡片文字：「1-2 綠 1分｜白4」，沒有位置時只有卡片', () => {
    const card = { id: 0, level: 1 as const, color: 'g' as const, points: 1, cost: disc({ w: 4 }) };
    expect(cardText(card, '1-2')).toBe('1-2 綠 1分｜白4');
    expect(cardText(card)).toBe('綠 1分｜白4');
  });
});
