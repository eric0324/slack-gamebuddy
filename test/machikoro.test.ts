import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyMachikoro, type MAction, type MState } from '../src/machikoro.js';
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

// ---------- engine ----------

const rng = () => 0.99999; // 洗牌不動；從最後一位開始；骰子都是 6

function run(actions: MAction[], start?: MState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyMachikoro(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as MAction),
  ]);
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'machikoro' && p.audience === 'channel');
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const labels = (events: GameEvent[], user: string) => menuOf(events, user)?.options.map((o) => o.label) ?? [];
const values = (events: GameEvent[], user: string) => menuOf(events, user)?.options.map((o) => o.value) ?? [];
// 除了允許的 🏘️、👉、📋、✅、🤖 之外不該有 emoji
const otherEmoji = (text: string) => text.replace(/🏘️|👉|📋|✅|🤖/gu, '').match(/\p{Extended_Pictographic}/gu);

describe('machikoro/setup: 骰子街的房間', () => {
  it('開房：公告標示骰子街', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'machikoro', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '骰子街', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1').join()).toContain('至少需要 2 人');
  });

  it('房間已滿（5 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(5).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'x').join()).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p2' }], lobby).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    const hostLeft = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(hostLeft.state.phase).toBe('ended');
    expect(announces(hostLeft.events).join()).toContain('取消');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')).toEqual(['這個頻道已經有遊戲了。']);
  });
});

describe('machikoro/setup: 加入與移除 bot', () => {
  it('一個人加 3 個 bot 就能開始；removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(4);
    expect(added.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const removed = run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state;
    expect(removed.players.map((p) => p.id)).toEqual(added.players.slice(0, 3).map((p) => p.id));
    expect(run([{ type: 'start', user: 'p1' }], added).state.phase).not.toBe('lobby');
  });

  it('超過 5 人只加到 5 人；非房主被拒；開始後被拒', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(4).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'p1').join()).toContain('房間已滿');
    const other = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(3).state);
    expect(ephemeralTo(other.events, 'p2').join()).toContain('只有房主可以加入 bot');
    const late = run([{ type: 'addBot', user: 'p1', count: 1 }], started(2).state);
    expect(late.state.players).toHaveLength(2);
    expect(ephemeralTo(late.events, 'p1').join()).toContain('遊戲已經開始了');
  });
});

describe('machikoro/setup: 開局', () => {
  it('每人 3 元、麥田、麵包店和市政廳；市場 10 種；牌堆扣掉翻出來的', () => {
    const { state } = started(3);
    expect(state.phase).toBe('play');
    for (const p of state.players) expect(p).toMatchObject({ coins: 3, cards: { wheat: 1, bakery: 1 }, landmarks: ['cityhall'] });
    expect(Object.keys(state.market)).toHaveLength(10);
    expect(state.market.wheat).toBe(6);
    const inMarket = Object.values(state.market).reduce((a, b) => a + b, 0);
    expect(state.deck.length + inMarket).toBe(20 * 6 + 5 * 3);
  });

  it('隨機選起始玩家', () => {
    expect(started(4).state.current).toBe(3);
    expect(started(4, () => 0).state.current).toBe(0);
    expect(started(4).state).toMatchObject({ first: 3, round: 1 });
  });

  it('開局公告玩家、起始資源、規則摘要和市場', () => {
    const text = announces(started(4).events).join('\n');
    expect(text).toContain('骰子街開始');
    expect(text).toContain('<@p1>、<@p2>、<@p3>、<@p4>');
    expect(text).toContain('3 元');
    expect(text).toContain('紅色');
    expect(text).toContain('港口、火車站、購物中心、遊樂園、廣播塔、機場');
    expect(text).toContain('30 輪');
    expect(text).toContain('麥田（藍｜1 元｜骰 1）');
    expect(otherEmoji(text)).toBeNull();
  });

  it('第一個回合面板：輪到誰、市場、每人一行、兩顆按鈕，不用 emoji 代表建築或錢', () => {
    const { state, events } = started(4);
    const [board] = boards(events);
    expect(board.ref).toBe(`machikoro:turn:${state.seq}`);
    expect(board.text).toContain('👉 輪到 <@p4>');
    expect(board.text).toContain('第 1 輪');
    expect(board.text).toContain('麥田（藍｜1 元｜骰 1）剩 6 張');
    expect(board.text).toContain('{{name:p1}} 3 元｜地標：（沒有）｜建築 2 張');
    expect(board.text).toContain('👉 {{name:p4}} 3 元');
    expect(board.options).toEqual([
      { value: `turnMenu:${state.seq}`, label: '🏘️ 行動' },
      { value: 'town', label: '📋 城鎮一覽' },
    ]);
    expect(otherEmoji(board.text)).toBeNull();
  });
});
