// 骰子街的建築與地標資料、市場翻牌，以及擲骰後結算的純函式 (紅 → 藍綠 → 紫)
export type Color = 'blue' | 'green' | 'red' | 'purple';
export type Tag = 'wheat' | 'cow' | 'gear' | 'boat' | 'bread' | 'factory' | 'fruit' | 'cup' | 'major';

export interface Card {
  name: string;
  color: Color;
  cost: number;
  rolls: number[];
  tag: Tag;
  text: string; // 買建築選單的效果摘要
}

const card = (name: string, color: Color, cost: number, rolls: number[], tag: Tag, text: string): Card => ({ name, color, cost, rolls, tag, text });

// 卡表順序也是同骰點、同費用時的顯示順序
export const CARDS: Record<string, Card> = {
  wheat: card('麥田', 'blue', 1, [1], 'wheat', '任何人擲 1：收 1 元'),
  ranch: card('牧場', 'blue', 1, [2], 'cow', '任何人擲 2：收 1 元'),
  flower: card('花田', 'blue', 2, [4], 'wheat', '任何人擲 4：收 1 元'),
  forest: card('森林', 'blue', 3, [5], 'gear', '任何人擲 5：收 1 元'),
  mackerel: card('鯖魚船', 'blue', 2, [8], 'boat', '任何人擲 8：有港口收 3 元'),
  mine: card('礦場', 'blue', 6, [9], 'gear', '任何人擲 9：收 5 元'),
  apple: card('蘋果園', 'blue', 3, [10], 'wheat', '任何人擲 10：收 3 元'),
  tuna: card('鮪魚船', 'blue', 5, [12, 13, 14], 'boat', '任何人擲 12～14：有港口時另擲 2 顆，收那個點數'),
  bakery: card('麵包店', 'green', 1, [2, 3], 'bread', '自己擲 2～3：收 1 元'),
  store: card('便利商店', 'green', 2, [4], 'bread', '自己擲 4：收 3 元'),
  florist: card('花店', 'green', 1, [6], 'bread', '自己擲 6：每張花田收 1 元'),
  cheese: card('起司工廠', 'green', 5, [7], 'factory', '自己擲 7：每張牧場收 3 元'),
  furniture: card('家具工廠', 'green', 3, [8], 'factory', '自己擲 8：每張森林、礦場收 3 元'),
  produce: card('蔬果市場', 'green', 2, [11, 12], 'fruit', '自己擲 11～12：每張麥田、花田、蘋果園收 2 元'),
  warehouse: card('食品倉庫', 'green', 2, [12, 13], 'factory', '自己擲 12～13：每張紅色建築收 2 元'),
  sushi: card('壽司店', 'red', 4, [1], 'cup', '別人擲 1：有港口向他收 3 元'),
  cafe: card('咖啡館', 'red', 2, [3], 'cup', '別人擲 3：向他收 1 元'),
  pizza: card('披薩店', 'red', 1, [7], 'cup', '別人擲 7：向他收 1 元'),
  burger: card('漢堡店', 'red', 1, [8], 'cup', '別人擲 8：向他收 1 元'),
  family: card('家庭餐廳', 'red', 3, [9, 10], 'cup', '別人擲 9～10：向他收 2 元'),
  stadium: card('體育館', 'purple', 6, [6], 'major', '自己擲 6：向每人收 2 元'),
  tv: card('電視台', 'purple', 7, [6], 'major', '自己擲 6：指定一人收 5 元'),
  business: card('商業中心', 'purple', 8, [6], 'major', '自己擲 6：和一人交換一張非紫色建築'),
  publisher: card('出版社', 'purple', 5, [7], 'major', '自己擲 7：向每人收他杯子和麵包類張數的錢'),
  tax: card('稅務局', 'purple', 4, [8, 9], 'major', '自己擲 8～9：向 10 元以上的人收一半'),
};

export const LANDMARKS = ['harbor', 'station', 'mall', 'park', 'radio', 'airport'] as const; // 依費用排序
export type Landmark = (typeof LANDMARKS)[number];
export const LANDMARK: Record<Landmark | 'cityhall', { name: string; cost: number; text: string }> = {
  cityhall: { name: '市政廳', cost: 0, text: '買東西前 0 元時拿 1 元' },
  harbor: { name: '港口', cost: 2, text: '擲出 10 以上可以 +2' },
  station: { name: '火車站', cost: 4, text: '可以擲 2 顆骰子' },
  mall: { name: '購物中心', cost: 10, text: '杯子和麵包類每張多收 1 元' },
  park: { name: '遊樂園', cost: 16, text: '擲出相同點數再一回合' },
  radio: { name: '廣播塔', cost: 22, text: '每回合可以重擲一次' },
  airport: { name: '機場', cost: 30, text: '沒買東西時拿 10 元' },
};

export const MARKET_KINDS = 10;
const COLOR_WORD: Record<Color, string> = { blue: '藍', green: '綠', red: '紅', purple: '紫' };

// 例如「咖啡館 (紅｜2 元｜骰 3)」
export function cardLabel(code: string): string {
  const c = CARDS[code];
  const rolls = c.rolls.length > 1 ? `${c.rolls[0]}～${c.rolls[c.rolls.length - 1]}` : `${c.rolls[0]}`;
  return `${c.name} (${COLOR_WORD[c.color]}｜${c.cost} 元｜骰 ${rolls})`;
}

// 還沒洗的牌堆：非紫色各 6 張，紫色張數＝玩家人數 (起始的麥田、麵包店另外準備)
export function buildDeck(players: number): string[] {
  return Object.entries(CARDS).flatMap(([code, c]) => Array<string>(c.color === 'purple' ? players : 6).fill(code));
}

// 從牌堆上面一張一張翻到市場，直到有 10 種或牌堆翻完
export function fillMarket(market: Record<string, number>, deck: string[]) {
  while (Object.keys(market).length < MARKET_KINDS && deck.length) {
    const code = deck.shift()!;
    market[code] = (market[code] ?? 0) + 1;
  }
}

// 顯示順序：最小骰點 → 費用 → 卡表順序
export function marketOrder(market: Record<string, number>): string[] {
  return Object.keys(CARDS)
    .filter((code) => market[code])
    .sort((a, b) => CARDS[a].rolls[0] - CARDS[b].rolls[0] || CARDS[a].cost - CARDS[b].cost);
}

// ---------- 結算 ----------

export interface Town {
  id: string;
  coins: number;
  cards: Record<string, number>;
  landmarks: string[];
}

// 一筆結算明細：from 沒寫就是銀行
export interface Line {
  from?: string;
  to: string;
  amount: number;
  card: string;
}

const has = (p: Town, landmark: string) => p.landmarks.includes(landmark);
const count = (p: Town, pred: (c: Card) => boolean) => Object.entries(p.cards).reduce((n, [code, k]) => n + (pred(CARDS[code]) ? k : 0), 0);
const hits = (code: string, total: number) => CARDS[code].rolls.includes(total);
// 購物中心：杯子和麵包類有收入時每張多 1 元
const bonus = (p: Town, code: string, base: number) => (base > 0 && has(p, 'mall') && ['cup', 'bread'].includes(CARDS[code].tag) ? base + 1 : base);

// 從 from 收錢 (不夠就收現有的)，回傳實際收到多少
function take(from: Town, to: Town, amount: number): number {
  const paid = Math.min(amount, from.coins);
  from.coins -= paid;
  to.coins += paid;
  return paid;
}

// 紅色：從擲骰者上一位開始依座位逆序，一位一位向擲骰者收錢
export function settleRed(players: Town[], roller: number, total: number): Line[] {
  const n = players.length;
  const me = players[roller];
  const lines: Line[] = [];
  for (let k = 1; k < n; k++) {
    const p = players[(roller - k + n) % n];
    for (const [code, k2] of Object.entries(p.cards)) {
      if (CARDS[code].color !== 'red' || !hits(code, total)) continue;
      const base = code === 'sushi' ? (has(p, 'harbor') ? 3 : 0) : code === 'family' ? 2 : 1;
      const paid = take(me, p, bonus(p, code, base) * k2);
      if (paid) lines.push({ from: me.id, to: p.id, amount: paid, card: code });
    }
  }
  return lines;
}

// 綠色建築每張的收入
function greenIncome(p: Town, code: string): number {
  switch (code) {
    case 'bakery':
      return 1;
    case 'store':
      return 3;
    case 'florist':
      return p.cards.flower ?? 0;
    case 'cheese':
      return 3 * count(p, (c) => c.tag === 'cow');
    case 'furniture':
      return 3 * count(p, (c) => c.tag === 'gear');
    case 'produce':
      return 2 * count(p, (c) => c.tag === 'wheat');
    case 'warehouse':
      return 2 * count(p, (c) => c.tag === 'cup');
    default:
      return 0;
  }
}

// 藍色 (所有人) 和綠色 (擲骰者自己) 從銀行收錢；鮪魚船需要時才擲一次，所有鮪魚船共用
export function settleBlueGreen(players: Town[], roller: number, total: number, tunaRoll: () => number[]): { lines: Line[]; tuna?: number[] } {
  const lines: Line[] = [];
  let tuna: number[] | undefined;
  const blue = (p: Town, code: string): number => {
    switch (code) {
      case 'mackerel':
        return has(p, 'harbor') ? 3 : 0;
      case 'mine':
        return 5;
      case 'apple':
        return 3;
      case 'tuna':
        if (!has(p, 'harbor')) return 0;
        tuna ??= tunaRoll();
        return tuna[0] + tuna[1];
      default:
        return 1;
    }
  };
  players.forEach((p, i) => {
    for (const [code, k] of Object.entries(p.cards)) {
      const color = CARDS[code].color;
      if (!hits(code, total) || !(color === 'blue' || (color === 'green' && i === roller))) continue;
      const amount = bonus(p, code, color === 'blue' ? blue(p, code) : greenIncome(p, code)) * k;
      if (!amount) continue;
      p.coins += amount;
      lines.push({ to: p.id, amount, card: code });
    }
  });
  return tuna ? { lines, tuna } : { lines };
}

// 不用選擇的紫色：體育館、出版社、稅務局 (電視台和商業中心由 engine 停下來等選擇)
export function settlePurple(players: Town[], roller: number, total: number): Line[] {
  const n = players.length;
  const me = players[roller];
  const lines: Line[] = [];
  for (const code of ['stadium', 'publisher', 'tax']) {
    if (!me.cards[code] || !hits(code, total)) continue;
    for (let k = 1; k < n; k++) {
      const p = players[(roller + k) % n];
      const want = code === 'stadium' ? 2 : code === 'publisher' ? count(p, (c) => c.tag === 'cup' || c.tag === 'bread') : p.coins >= 10 ? Math.floor(p.coins / 2) : 0;
      const paid = take(p, me, want);
      if (paid) lines.push({ from: p.id, to: me.id, amount: paid, card: code });
    }
  }
  return lines;
}

// 這個點數對擲骰者自己的收入 (藍綠紫，不扣紅色；電視台算 5、商業中心算 0、鮪魚船以 7 估)；在複本上試算
export function income(players: Town[], roller: number, total: number): number {
  const copy = structuredClone(players);
  const me = copy[roller].id;
  const lines = [...settleBlueGreen(copy, roller, total, () => [3, 4]).lines, ...settlePurple(copy, roller, total)];
  const tv = copy[roller].cards.tv && hits('tv', total) ? 5 : 0;
  return lines.filter((l) => l.to === me).reduce((sum, l) => sum + l.amount, tv);
}
