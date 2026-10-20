// 璀璨寶石 (Splendor 基本版) 的牌組資料：90 張發展卡、10 張貴族、顏色代號和顯示文字、付款計算 (純函式)
export type Color = 'w' | 'b' | 'g' | 'r' | 'k';
export type Gem = Color | 'o'; // o 是黃金 (萬用)
export type Gems = Record<Gem, number>;
export type Level = 1 | 2 | 3;

export const COLORS: Color[] = ['w', 'b', 'g', 'r', 'k'];
export const GEMS: Gem[] = [...COLORS, 'o'];
export const GEM_WORD: Record<Gem, string> = { w: '白', b: '藍', g: '綠', r: '紅', k: '黑', o: '金' };

export interface Card {
  id: number;
  level: Level;
  color: Color;
  points: number;
  cost: Record<Color, number>;
}
export interface Noble {
  id: number;
  points: number;
  need: [Color, number][]; // 照牌表的順序
}

// [等級, 顏色, 分數, 白, 藍, 綠, 紅, 黑]；順序就是 id (從 1 開始)，照原版牌表
const CARD_ROWS: [Level, Color, number, number, number, number, number, number][] = [
  [1, 'w', 0, 0, 0, 0, 2, 1],
  [1, 'w', 0, 0, 1, 1, 1, 1],
  [1, 'w', 0, 0, 1, 2, 1, 1],
  [1, 'w', 0, 0, 2, 0, 0, 2],
  [1, 'w', 0, 0, 2, 2, 0, 1],
  [1, 'w', 0, 0, 3, 0, 0, 0],
  [1, 'w', 0, 3, 1, 0, 0, 1],
  [1, 'w', 1, 0, 0, 4, 0, 0],
  [1, 'b', 0, 0, 0, 0, 0, 3],
  [1, 'b', 0, 0, 0, 2, 0, 2],
  [1, 'b', 0, 0, 1, 3, 1, 0],
  [1, 'b', 0, 1, 0, 0, 0, 2],
  [1, 'b', 0, 1, 0, 1, 1, 1],
  [1, 'b', 0, 1, 0, 1, 2, 1],
  [1, 'b', 0, 1, 0, 2, 2, 0],
  [1, 'b', 1, 0, 0, 0, 4, 0],
  [1, 'g', 0, 0, 0, 0, 3, 0],
  [1, 'g', 0, 0, 1, 0, 2, 2],
  [1, 'g', 0, 0, 2, 0, 2, 0],
  [1, 'g', 0, 1, 1, 0, 1, 1],
  [1, 'g', 0, 1, 1, 0, 1, 2],
  [1, 'g', 0, 1, 3, 1, 0, 0],
  [1, 'g', 0, 2, 1, 0, 0, 0],
  [1, 'g', 1, 0, 0, 0, 0, 4],
  [1, 'r', 0, 0, 2, 1, 0, 0],
  [1, 'r', 0, 1, 0, 0, 1, 3],
  [1, 'r', 0, 1, 1, 1, 0, 1],
  [1, 'r', 0, 2, 0, 0, 2, 0],
  [1, 'r', 0, 2, 0, 1, 0, 2],
  [1, 'r', 0, 2, 1, 1, 0, 1],
  [1, 'r', 0, 3, 0, 0, 0, 0],
  [1, 'r', 1, 4, 0, 0, 0, 0],
  [1, 'k', 0, 0, 0, 1, 3, 1],
  [1, 'k', 0, 0, 0, 2, 1, 0],
  [1, 'k', 0, 0, 0, 3, 0, 0],
  [1, 'k', 0, 1, 1, 1, 1, 0],
  [1, 'k', 0, 1, 2, 1, 1, 0],
  [1, 'k', 0, 2, 0, 2, 0, 0],
  [1, 'k', 0, 2, 2, 0, 1, 0],
  [1, 'k', 1, 0, 4, 0, 0, 0],
  [2, 'w', 1, 0, 0, 3, 2, 2],
  [2, 'w', 1, 2, 3, 0, 3, 0],
  [2, 'w', 2, 0, 0, 0, 5, 0],
  [2, 'w', 2, 0, 0, 0, 5, 3],
  [2, 'w', 2, 0, 0, 1, 4, 2],
  [2, 'w', 3, 6, 0, 0, 0, 0],
  [2, 'b', 1, 0, 2, 2, 3, 0],
  [2, 'b', 1, 0, 2, 3, 0, 3],
  [2, 'b', 2, 0, 5, 0, 0, 0],
  [2, 'b', 2, 2, 0, 0, 1, 4],
  [2, 'b', 2, 5, 3, 0, 0, 0],
  [2, 'b', 3, 0, 6, 0, 0, 0],
  [2, 'g', 1, 2, 3, 0, 0, 2],
  [2, 'g', 1, 3, 0, 2, 3, 0],
  [2, 'g', 2, 0, 0, 5, 0, 0],
  [2, 'g', 2, 0, 5, 3, 0, 0],
  [2, 'g', 2, 4, 2, 0, 0, 1],
  [2, 'g', 3, 0, 0, 6, 0, 0],
  [2, 'r', 1, 0, 3, 0, 2, 3],
  [2, 'r', 1, 2, 0, 0, 2, 3],
  [2, 'r', 2, 0, 0, 0, 0, 5],
  [2, 'r', 2, 1, 4, 2, 0, 0],
  [2, 'r', 2, 3, 0, 0, 0, 5],
  [2, 'r', 3, 0, 0, 0, 6, 0],
  [2, 'k', 1, 3, 0, 3, 0, 2],
  [2, 'k', 1, 3, 2, 2, 0, 0],
  [2, 'k', 2, 0, 0, 5, 3, 0],
  [2, 'k', 2, 0, 1, 4, 2, 0],
  [2, 'k', 2, 5, 0, 0, 0, 0],
  [2, 'k', 3, 0, 0, 0, 0, 6],
  [3, 'w', 3, 0, 3, 3, 5, 3],
  [3, 'w', 4, 0, 0, 0, 0, 7],
  [3, 'w', 4, 3, 0, 0, 3, 6],
  [3, 'w', 5, 3, 0, 0, 0, 7],
  [3, 'b', 3, 3, 0, 3, 3, 5],
  [3, 'b', 4, 6, 3, 0, 0, 3],
  [3, 'b', 4, 7, 0, 0, 0, 0],
  [3, 'b', 5, 7, 3, 0, 0, 0],
  [3, 'g', 3, 5, 3, 0, 3, 3],
  [3, 'g', 4, 0, 7, 0, 0, 0],
  [3, 'g', 4, 3, 6, 3, 0, 0],
  [3, 'g', 5, 0, 7, 3, 0, 0],
  [3, 'r', 3, 3, 5, 3, 0, 3],
  [3, 'r', 4, 0, 0, 7, 0, 0],
  [3, 'r', 4, 0, 3, 6, 3, 0],
  [3, 'r', 5, 0, 0, 7, 3, 0],
  [3, 'k', 3, 3, 3, 5, 3, 0],
  [3, 'k', 4, 0, 0, 0, 7, 0],
  [3, 'k', 4, 0, 0, 3, 6, 3],
  [3, 'k', 5, 0, 0, 0, 7, 3],
];

export const CARDS: Card[] = CARD_ROWS.map(([level, color, points, w, b, g, r, k], i) => ({ id: i + 1, level, color, points, cost: { w, b, g, r, k } }));
export const cardOf = (id: number) => CARDS[id - 1];

// 貴族條件是折扣 (已買卡的顏色張數)，照牌表的順序
const NOBLE_NEEDS: [Color, number][][] = [
  [['r', 4], ['g', 4]],
  [['g', 4], ['b', 4]],
  [['b', 4], ['w', 4]],
  [['w', 4], ['k', 4]],
  [['r', 4], ['k', 4]],
  [['r', 3], ['g', 3], ['b', 3]],
  [['g', 3], ['b', 3], ['w', 3]],
  [['b', 3], ['w', 3], ['k', 3]],
  [['r', 3], ['w', 3], ['k', 3]],
  [['r', 3], ['g', 3], ['k', 3]],
];
export const NOBLES: Noble[] = NOBLE_NEEDS.map((need, i) => ({ id: i + 1, points: 3, need }));
export const nobleOf = (id: number) => NOBLES[id - 1];

export const emptyGems = (): Gems => ({ w: 0, b: 0, g: 0, r: 0, k: 0, o: 0 });
export const total = (g: Gems) => GEMS.reduce((sum, x) => sum + g[x], 0);

// 每種顏色的應付：成本減掉折扣，最少 0
export function need(cost: Record<Color, number>, discount: Record<Color, number>): Record<Color, number> {
  const owe = { w: 0, b: 0, g: 0, r: 0, k: 0 };
  for (const c of COLORS) owe[c] = Math.max(0, cost[c] - discount[c]);
  return owe;
}

// 缺口：每色「應付減手上同色」的總和，再減黃金，最少 0；0 就是買得起
export function shortfall(cost: Record<Color, number>, discount: Record<Color, number>, tokens: Gems): number {
  const owe = need(cost, discount);
  const missing = COLORS.reduce((sum, c) => sum + Math.max(0, owe[c] - tokens[c]), 0);
  return Math.max(0, missing - tokens.o);
}

// 自動付款：先付同色籌碼，不夠的用黃金；黃金也不夠回傳 null
export function payment(cost: Record<Color, number>, discount: Record<Color, number>, tokens: Gems): Gems | null {
  const owe = need(cost, discount);
  const pay = emptyGems();
  for (const c of COLORS) {
    pay[c] = Math.min(owe[c], tokens[c]);
    pay.o += owe[c] - pay[c];
  }
  return pay.o <= tokens.o ? pay : null;
}

// 「白2 藍1」：只列不為 0 的，依白藍綠紅黑金的順序；全 0 寫「無」
export function gemsText(g: Partial<Gems>): string {
  const parts = GEMS.filter((x) => (g[x] ?? 0) > 0).map((x) => `${GEM_WORD[x]}${g[x]}`);
  return parts.length ? parts.join(' ') : '無';
}

// 「1-2 綠 1分｜白4」；沒有位置時只有卡片本身
export const cardText = (card: Card, slot?: string) => `${slot ? `${slot} ` : ''}${GEM_WORD[card.color]} ${card.points}分｜${gemsText(card.cost)}`;

export const nobleText = (n: Noble) => n.need.map(([c, v]) => `${GEM_WORD[c]}${v}`).join(' ');
