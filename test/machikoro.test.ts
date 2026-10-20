import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  CARDS,
  fillMarket,
  income,
  LANDMARK,
  LANDMARKS,
  marketOrder,
  settleBlueGreen,
  settlePurple,
  settleRed,
  type Town,
} from '../src/machikoroCards.js';

// 測試用：做一位玩家的城鎮
const town = (id: string, coins: number, cards: Record<string, number> = {}, landmarks: string[] = []): Town => ({
  id,
  coins,
  cards,
  landmarks: ['cityhall', ...landmarks],
});
const noTuna = () => {
  throw new Error('不該擲鮪魚船');
};

describe('machikoro/setup: 建築資料', () => {
  it('25 種一般建築的顏色、費用、骰點、類別照表', () => {
    const row = (code: string) => {
      const c = CARDS[code];
      return [c.name, c.color, c.cost, c.rolls.join(','), c.tag];
    };
    expect(Object.keys(CARDS)).toHaveLength(25);
    expect(row('wheat')).toEqual(['麥田', 'blue', 1, '1', 'wheat']);
    expect(row('ranch')).toEqual(['牧場', 'blue', 1, '2', 'cow']);
    expect(row('flower')).toEqual(['花田', 'blue', 2, '4', 'wheat']);
    expect(row('forest')).toEqual(['森林', 'blue', 3, '5', 'gear']);
    expect(row('mackerel')).toEqual(['鯖魚船', 'blue', 2, '8', 'boat']);
    expect(row('mine')).toEqual(['礦場', 'blue', 6, '9', 'gear']);
    expect(row('apple')).toEqual(['蘋果園', 'blue', 3, '10', 'wheat']);
    expect(row('tuna')).toEqual(['鮪魚船', 'blue', 5, '12,13,14', 'boat']);
    expect(row('bakery')).toEqual(['麵包店', 'green', 1, '2,3', 'bread']);
    expect(row('store')).toEqual(['便利商店', 'green', 2, '4', 'bread']);
    expect(row('florist')).toEqual(['花店', 'green', 1, '6', 'bread']);
    expect(row('cheese')).toEqual(['起司工廠', 'green', 5, '7', 'factory']);
    expect(row('furniture')).toEqual(['家具工廠', 'green', 3, '8', 'factory']);
    expect(row('produce')).toEqual(['蔬果市場', 'green', 2, '11,12', 'fruit']);
    expect(row('warehouse')).toEqual(['食品倉庫', 'green', 2, '12,13', 'factory']);
    expect(row('sushi')).toEqual(['壽司店', 'red', 4, '1', 'cup']);
    expect(row('cafe')).toEqual(['咖啡館', 'red', 2, '3', 'cup']);
    expect(row('pizza')).toEqual(['披薩店', 'red', 1, '7', 'cup']);
    expect(row('burger')).toEqual(['漢堡店', 'red', 1, '8', 'cup']);
    expect(row('family')).toEqual(['家庭餐廳', 'red', 3, '9,10', 'cup']);
    expect(row('stadium')).toEqual(['體育館', 'purple', 6, '6', 'major']);
    expect(row('tv')).toEqual(['電視台', 'purple', 7, '6', 'major']);
    expect(row('business')).toEqual(['商業中心', 'purple', 8, '6', 'major']);
    expect(row('publisher')).toEqual(['出版社', 'purple', 5, '7', 'major']);
    expect(row('tax')).toEqual(['稅務局', 'purple', 4, '8,9', 'major']);
  });

  it('5 人局：20 種非紫色各 6 張、5 種紫色各 5 張，共 145 張', () => {
    const deck = buildDeck(5);
    expect(deck).toHaveLength(145);
    for (const [code, card] of Object.entries(CARDS)) expect(deck.filter((x) => x === code)).toHaveLength(card.color === 'purple' ? 5 : 6);
  });

  it('2 人局：每種紫色建築各 2 張；起始的麥田、麵包店另外準備，牌堆照樣各 6 張', () => {
    const deck = buildDeck(2);
    for (const code of ['stadium', 'tv', 'business', 'publisher', 'tax']) expect(deck.filter((x) => x === code)).toHaveLength(2);
    expect(deck.filter((x) => x === 'wheat')).toHaveLength(6);
    expect(deck.filter((x) => x === 'bakery')).toHaveLength(6);
  });

  it('地標 6 個依費用排序：港口 2、火車站 4、購物中心 10、遊樂園 16、廣播塔 22、機場 30', () => {
    expect(LANDMARKS.map((l) => [LANDMARK[l].name, LANDMARK[l].cost])).toEqual([
      ['港口', 2],
      ['火車站', 4],
      ['購物中心', 10],
      ['遊樂園', 16],
      ['廣播塔', 22],
      ['機場', 30],
    ]);
    expect(LANDMARK.cityhall.name).toBe('市政廳');
  });
});

describe('machikoro/setup: 市場', () => {
  const ELEVEN = ['wheat', 'ranch', 'flower', 'forest', 'mackerel', 'mine', 'apple', 'tuna', 'bakery', 'store', 'florist'];

  it('從牌堆上面翻到 10 種不同的建築，重複的疊在同一堆', () => {
    const deck = ['cafe', 'cafe', ...ELEVEN];
    const market: Record<string, number> = {};
    fillMarket(market, deck);
    expect(Object.keys(market)).toHaveLength(10);
    expect(market.cafe).toBe(2);
    expect(market.bakery).toBe(1);
    expect(deck).toEqual(['store', 'florist']);
  });

  it('買完一堆後補到 10 種；牌堆用完就不再補', () => {
    const deck = ['cafe', ...ELEVEN.slice(0, 10)];
    const market: Record<string, number> = {};
    fillMarket(market, deck);
    expect(deck).toEqual(['store']);
    delete market.cafe;
    fillMarket(market, deck);
    expect(Object.keys(market)).toHaveLength(10);
    expect(market.store).toBe(1);
    expect(deck).toEqual([]);
    delete market.wheat;
    fillMarket(market, deck);
    expect(Object.keys(market)).toHaveLength(9);
  });

  it('顯示順序依最小骰點、同骰點依費用（再依卡表順序）', () => {
    expect(marketOrder({ family: 1, mine: 1, cafe: 2, wheat: 1, bakery: 1, ranch: 1, sushi: 1, stadium: 1, florist: 1 })).toEqual([
      'wheat',
      'sushi',
      'ranch',
      'bakery',
      'cafe',
      'florist',
      'stadium',
      'family',
      'mine',
    ]);
  });
});

describe('machikoro/buildings: 藍色和綠色', () => {
  it('麥田任何人擲都收，每張各收一次', () => {
    const ps = [town('A', 0, { wheat: 1 }), town('B', 0, { wheat: 2 })];
    const { lines } = settleBlueGreen(ps, 0, 1, noTuna);
    expect(ps.map((p) => p.coins)).toEqual([1, 2]);
    expect(lines).toEqual([
      { to: 'A', amount: 1, card: 'wheat' },
      { to: 'B', amount: 2, card: 'wheat' },
    ]);
  });

  it('別人的綠色建築不算', () => {
    const ps = [town('A', 0), town('B', 0, { bakery: 1 })];
    settleBlueGreen(ps, 0, 2, noTuna);
    expect(ps[1].coins).toBe(0);
  });

  it('家具工廠算齒輪、起司工廠算牛', () => {
    const a = [town('A', 0, { furniture: 1, forest: 1, mine: 1 })];
    settleBlueGreen(a, 0, 8, noTuna);
    expect(a[0].coins).toBe(6);
    const b = [town('A', 0, { cheese: 1, ranch: 2 })];
    settleBlueGreen(b, 0, 7, noTuna);
    expect(b[0].coins).toBe(6);
  });

  it('蔬果市場算麥穗（含花田），花店算花田', () => {
    const a = [town('A', 0, { produce: 1, wheat: 1, flower: 1, apple: 1 })];
    settleBlueGreen(a, 0, 11, noTuna);
    expect(a[0].coins).toBe(6);
    const b = [town('A', 0, { florist: 1, flower: 2 })];
    settleBlueGreen(b, 0, 6, noTuna);
    expect(b[0].coins).toBe(2);
  });

  it('食品倉庫算紅色張數', () => {
    const ps = [town('A', 0, { warehouse: 1, cafe: 2, family: 1 })];
    settleBlueGreen(ps, 0, 13, noTuna);
    expect(ps[0].coins).toBe(6);
  });

  it('鯖魚船需要港口', () => {
    const ps = [town('A', 0), town('B', 0, { mackerel: 1 }, ['harbor']), town('C', 0, { mackerel: 1 })];
    settleBlueGreen(ps, 0, 8, noTuna);
    expect(ps.map((p) => p.coins)).toEqual([0, 3, 0]);
  });

  it('鮪魚船共用一次額外擲骰，每張收那個點數', () => {
    const ps = [town('A', 0), town('B', 0, { tuna: 2 }, ['harbor']), town('C', 0, { tuna: 1 }, ['harbor']), town('D', 0, { tuna: 1 })];
    let rolls = 0;
    const { tuna } = settleBlueGreen(ps, 0, 12, () => (rolls++, [5, 4]));
    expect(rolls).toBe(1);
    expect(tuna).toEqual([5, 4]);
    expect(ps.map((p) => p.coins)).toEqual([0, 18, 9, 0]);
  });

  it('沒有人有港口和鮪魚船就不額外擲骰', () => {
    const ps = [town('A', 0), town('B', 0, { tuna: 1 })];
    expect(settleBlueGreen(ps, 0, 12, noTuna).tuna).toBeUndefined();
  });

  it('購物中心讓麵包類多收 1 元', () => {
    const ps = [town('A', 0, { bakery: 2, florist: 1, flower: 1 }, ['mall'])];
    settleBlueGreen(ps, 0, 2, noTuna);
    expect(ps[0].coins).toBe(4);
    settleBlueGreen(ps, 0, 6, noTuna);
    expect(ps[0].coins).toBe(6);
  });
});

describe('machikoro/buildings: 紅色', () => {
  it('紅色向擲骰的人收，擲骰者自己的紅色不算', () => {
    const ps = [town('A', 5, { family: 1 }), town('B', 0, { family: 1 })];
    const lines = settleRed(ps, 0, 10);
    expect(ps.map((p) => p.coins)).toEqual([3, 2]);
    expect(lines).toEqual([{ from: 'A', to: 'B', amount: 2, card: 'family' }]);
  });

  it('從擲骰者上一位依座位逆序，錢不夠付到 0 為止', () => {
    const ps = [town('A', 0), town('B', 0, { cafe: 1 }), town('C', 0, { cafe: 1 }), town('D', 1)];
    const lines = settleRed(ps, 3, 3);
    expect(ps.map((p) => p.coins)).toEqual([0, 0, 1, 0]);
    expect(lines).toEqual([{ from: 'D', to: 'C', amount: 1, card: 'cafe' }]);
  });

  it('逆序會繞回座位最後面', () => {
    const ps = [town('A', 1), town('B', 0, { cafe: 1 }), town('C', 0, { cafe: 1 })];
    settleRed(ps, 0, 3);
    expect(ps.map((p) => p.coins)).toEqual([0, 0, 1]);
  });

  it('壽司店需要港口；購物中心讓杯子類多收 1 元', () => {
    const a = [town('A', 5), town('B', 0, { sushi: 1 })];
    settleRed(a, 0, 1);
    expect(a[1].coins).toBe(0);
    const b = [town('A', 5), town('B', 0, { cafe: 1 }, ['mall'])];
    settleRed(b, 0, 3);
    expect(b.map((p) => p.coins)).toEqual([3, 2]);
  });
});

describe('machikoro/buildings: 紫色自動結算', () => {
  it('體育館向每人收 2 元，不夠就收現有的', () => {
    const ps = [town('A', 0, { stadium: 1 }), town('B', 5), town('C', 1)];
    settlePurple(ps, 0, 6);
    expect(ps.map((p) => p.coins)).toEqual([3, 3, 0]);
  });

  it('出版社依對方的杯子和麵包類張數收', () => {
    const ps = [town('A', 0, { publisher: 1 }), town('B', 5, { bakery: 1, cafe: 2 }), town('C', 1, { bakery: 3 })];
    settlePurple(ps, 0, 7);
    expect(ps.map((p) => p.coins)).toEqual([4, 2, 0]);
  });

  it('稅務局向 10 元以上的人收一半（捨去）', () => {
    const ps = [town('A', 0, { tax: 1 }), town('B', 15), town('C', 9)];
    settlePurple(ps, 0, 9);
    expect(ps.map((p) => p.coins)).toEqual([7, 8, 9]);
  });

  it('別人的紫色不算', () => {
    const ps = [town('A', 5), town('B', 0, { stadium: 1 })];
    settlePurple(ps, 0, 6);
    expect(ps.map((p) => p.coins)).toEqual([5, 0]);
  });
});

describe('machikoro/bots: 這次點數對自己的收入', () => {
  it('算藍綠紫的收入、不扣紅色、電視台算 5，不改 state', () => {
    const ps = [town('A', 2, { bakery: 1, wheat: 1 }), town('B', 9, { cafe: 1, wheat: 1 })];
    const before = structuredClone(ps);
    expect(income(ps, 0, 3)).toBe(1);
    expect(income(ps, 0, 1)).toBe(1);
    expect(income(ps, 0, 5)).toBe(0);
    expect(ps).toEqual(before);
    const tv = [town('A', 0, { tv: 1, stadium: 1 }), town('B', 9)];
    expect(income(tv, 0, 6)).toBe(7);
  });
});
