import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { machikoro } from '../src/games/machikoro.js';
import { applyMachikoro, autoMove, botDice, richest, type MAction, type MState } from '../src/machikoro.js';
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

  it('顯示順序依最小骰點、同骰點依費用 (再依卡表順序)', () => {
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

  it('蔬果市場算麥穗 (含花田)，花店算花田', () => {
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

  it('稅務局向 10 元以上的人收一半 (捨去)', () => {
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

  it('房間已滿 (5 人) 時拒絕加入', () => {
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
    expect(text).toContain('麥田 (藍｜1 元｜骰 1)');
    expect(otherEmoji(text)).toBeNull();
  });

  it('第一個回合面板：輪到誰、市場、每人一行、兩顆按鈕，不用 emoji 代表建築或錢', () => {
    const { state, events } = started(4);
    const [board] = boards(events);
    expect(board.ref).toBe(`machikoro:turn:${state.seq}`);
    expect(board.text).toContain('👉 輪到 <@p4>');
    expect(board.text).toContain('第 1 輪');
    expect(board.text).toContain('麥田 (藍｜1 元｜骰 1) 剩 6 張');
    expect(board.text).toContain('<@p1> 3 元｜地標：(沒有)｜建築 2 張');
    expect(board.text).toContain('👉 <@p4> 3 元');
    expect(board.options).toEqual([
      { value: `turnMenu:${state.seq}`, label: '🏘️ 行動' },
      { value: 'town', label: '📋 城鎮一覽' },
    ]);
    expect(otherEmoji(board.text)).toBeNull();
  });
});

// 測試用：開局後改 state；預設第 1 輪從 p1 開始
function setup(mut: (s: MState) => void = () => {}, n = 4) {
  const s = structuredClone(started(n).state);
  s.first = s.current = 0;
  mut(s);
  return s;
}
// 依序擲出這些點數的 rng，之後都是 6
const dice = (...vals: number[]) => {
  let i = 0;
  return () => (i < vals.length ? (vals[i++] - 0.5) / 6 : 0.99999);
};
const P = (s: MState, id: string) => s.players.find((p) => p.id === id)!;
const cur = (s: MState) => s.players[s.current].id;
const roll = (s: MState, n: 1 | 2 = 1, r: () => number = rng) => run([{ type: 'roll', user: cur(s), seq: s.seq, n }], s, r);
const pass = (s: MState) => run([{ type: 'pass', user: cur(s), seq: s.seq }], s);
const buy = (s: MState, code: string) => run([{ type: 'buy', user: cur(s), seq: s.seq, code }], s);
const fire = (s: MState, r: () => number = rng) => run([{ type: 'timeout', id: s.timers.phase! }], s, r);
const turnMenu = (s: MState, user = cur(s)) => run([{ type: 'turnMenu', user, seq: s.seq }], s);
const timers = (events: GameEvent[]) => events.filter((e) => e.type === 'startTimer');
const STALE = '這個選單已經過期，請重新按「🏘️ 行動」。';
// 擲 1 顆 (預設 6，沒有人有 6 的建築) 然後不買
const skipTurn = (s: MState) => pass(roll(s).state).state;

describe('machikoro/turns: 回合面板', () => {
  it('同一回合原地更新：擲骰和結算改同一則面板，按鈕還在', () => {
    const s = setup();
    const { state, events } = roll(s, 1, dice(1));
    const [b] = boards(events);
    expect(b.ref).toBe(`machikoro:turn:${s.seq}`);
    expect(b.text).toContain('擲出 1');
    expect(b.text).toContain('<@p1> 的麥田 +1 元');
    expect(b.options.map((o) => o.label)).toEqual(['🏘️ 行動', '📋 城鎮一覽']);
    expect(state.seq).toBe(s.seq);
  });

  it('回合結束：舊面板改成回合結束並拿掉按鈕，輪到下一位發新的一則', () => {
    const s = roll(setup()).state;
    const { state, events } = pass(s);
    const [old, next] = boards(events);
    expect(old.ref).toBe(`machikoro:turn:${s.seq}`);
    expect(old.text).toContain('回合結束');
    expect(old.text).toContain('<@p1>');
    expect(old.options).toEqual([]);
    expect(next.ref).toBe(`machikoro:turn:${s.seq + 1}`);
    expect(next.text).toContain('👉 輪到 <@p2>');
    expect(state.current).toBe(1);
  });

  it('第 25 輪起標示 N/30', () => {
    expect(boards(roll(setup((s) => (s.round = 24))).events)[0].text).toContain('第 24 輪');
    expect(boards(roll(setup((s) => (s.round = 25))).events)[0].text).toContain('第 25/30 輪');
  });

  it('城鎮一覽：任何人都能看，列出現金、建築、已蓋和還沒蓋的地標，state 不變', () => {
    const s = setup((s) => {
      P(s, 'p2').cards.cafe = 2;
      P(s, 'p2').landmarks.push('harbor');
    });
    for (const user of ['p3', 'outsider']) {
      const { state, events } = run([{ type: 'town', user }], s);
      expect(state).toBe(s);
      const text = ephemeralTo(events, user).join('\n');
      expect(text).toContain('{{name:p2}} 3 元');
      expect(text).toContain('紅：咖啡館 ×2');
      expect(text).toContain('藍：麥田 ×1');
      expect(text).toContain('已蓋：市政廳、港口');
      expect(text).toContain('還沒蓋：火車站、購物中心、遊樂園、廣播塔、機場');
    }
  });
});

describe('machikoro/turns: 回合選單', () => {
  it('不是輪到的人、局外人被拒', () => {
    const s = setup();
    expect(ephemeralTo(turnMenu(s, 'p2').events, 'p2')).toEqual(['還沒輪到你。']);
    expect(ephemeralTo(turnMenu(s, 'x').events, 'x')).toEqual(['你不在這局遊戲中']);
  });

  it('打開選單不改 state、不重設計時器，選單用 replace 原地換', () => {
    const s = setup();
    const { state, events } = turnMenu(s);
    expect(state).toBe(s);
    expect(timers(events)).toEqual([]);
    expect(menuOf(events, 'p1')).toMatchObject({ kind: 'machikoro', replace: true, perRow: 4 });
  });

  it('過期選單被拒且 state 不變：上一個回合的、或這一步已經做過的', () => {
    const s = setup();
    const old = run([{ type: 'turnMenu', user: 'p1', seq: s.seq - 1 }], s);
    expect(ephemeralTo(old.events, 'p1')).toEqual([STALE]);
    const rolled = roll(s).state;
    const again = roll(rolled);
    expect(again.state).toBe(rolled);
    expect(ephemeralTo(again.events, 'p1')).toEqual([STALE]);
  });

  it('按一步之後私人選單原地換成下一步', () => {
    const { events } = roll(setup());
    expect(menuOf(events, 'p1')?.replace).toBe(true);
    expect(labels(events, 'p1')).toContain('不買');
  });
});

describe('machikoro/turns: 擲骰', () => {
  it('沒有火車站只有擲 1 顆；不能擲 2 顆', () => {
    const s = setup();
    expect(labels(turnMenu(s).events, 'p1')).toEqual(['擲 1 顆']);
    expect(roll(s, 2).state).toBe(s);
  });

  it('有火車站可以擲 2 顆，點數用 rng', () => {
    const s = setup((s) => P(s, 'p1').landmarks.push('station'));
    expect(labels(turnMenu(s).events, 'p1')).toEqual(['擲 1 顆', '擲 2 顆']);
    const { state, events } = roll(s, 2, dice(3, 4));
    expect(state.turn).toMatchObject({ dice: [3, 4], total: 7 });
    expect(boards(events)[0].text).toContain('擲出 3 + 4 = 7');
  });
});

describe('machikoro/turns: 廣播塔重擲', () => {
  const radio = (extra: string[] = []) => setup((s) => P(s, 'p1').landmarks.push('radio', ...extra));

  it('擲完可以保留或重擲；重擲後以新點數結算，不能再重擲', () => {
    const r1 = roll(radio(), 1, dice(5));
    expect(r1.state.turn!.step).toBe('reroll');
    expect(labels(r1.events, 'p1')).toEqual(['保留', '重擲']);
    const r2 = run([{ type: 'reroll', user: 'p1', seq: r1.state.seq, n: 1 }], r1.state, dice(3));
    expect(r2.state.turn).toMatchObject({ step: 'buy', total: 3, rerolled: true });
    expect(P(r2.state, 'p1').coins).toBe(4); // 麵包店
    expect(boards(r2.events)[0].text).toContain('擲出 5，重擲 3');
    const again = run([{ type: 'reroll', user: 'p1', seq: r1.state.seq, n: 1 }], r2.state);
    expect(again.state).toBe(r2.state);
  });

  it('保留就用原本的點數', () => {
    const r1 = roll(radio(), 1, dice(3));
    const r2 = run([{ type: 'keep', user: 'p1', seq: r1.state.seq }], r1.state);
    expect(r2.state.turn).toMatchObject({ step: 'buy', total: 3 });
    expect(P(r2.state, 'p1').coins).toBe(4);
  });

  it('有火車站時分成重擲 1 顆、重擲 2 顆', () => {
    expect(labels(roll(radio(['station'])).events, 'p1')).toEqual(['保留', '重擲 1 顆', '重擲 2 顆']);
  });

  it('沒有廣播塔直接結算', () => {
    expect(roll(setup(), 1, dice(5)).state.turn!.step).toBe('buy');
  });
});

describe('machikoro/turns: 港口加二', () => {
  const harbor = (extra: string[] = []) => setup((s) => P(s, 'p1').landmarks.push('harbor', 'station', ...extra));

  it('10 以上才出現，+2 後結算', () => {
    const r1 = roll(harbor(), 2, dice(6, 5));
    expect(r1.state.turn!.step).toBe('harbor');
    expect(labels(r1.events, 'p1')).toEqual(['+2 (變成 13)', '不加']);
    const r2 = run([{ type: 'harbor', user: 'p1', seq: r1.state.seq, yes: true }], r1.state);
    expect(r2.state.turn).toMatchObject({ step: 'buy', total: 13, harbor: true });
    expect(boards(r2.events)[0].text).toContain('擲出 6 + 5 = 11，港口 +2 = 13');
  });

  it('不加就用原本的點數', () => {
    const r1 = roll(harbor(), 2, dice(6, 5));
    const r2 = run([{ type: 'harbor', user: 'p1', seq: r1.state.seq, yes: false }], r1.state);
    expect(r2.state.turn).toMatchObject({ step: 'buy', total: 11, harbor: false });
  });

  it('點數不到 10 直接結算', () => {
    expect(roll(harbor(), 2, dice(4, 4)).state.turn!.step).toBe('buy');
  });

  it('相同點數不受 +2 影響', () => {
    const r1 = roll(harbor(['park']), 2, dice(5, 5));
    const r2 = run([{ type: 'harbor', user: 'p1', seq: r1.state.seq, yes: true }], r1.state);
    const { state, events } = pass(r2.state);
    expect(state.current).toBe(0);
    expect(announces(events).join()).toContain('再一回合');
  });
});

describe('machikoro/turns: 買建築', () => {
  const market = (m: Record<string, number>, coins = 3, mut: (s: MState) => void = () => {}) =>
    roll(
      setup((s) => {
        s.market = m;
        P(s, 'p1').coins = coins;
        mut(s);
      }),
      1,
      dice(5),
    ).state;

  it('買一棟建築：扣錢、放進城鎮、市場少一張、面板更新，輪到下一位', () => {
    const s = market({ cafe: 2, wheat: 3 });
    const { state, events } = buy(s, 'cafe');
    expect(P(state, 'p1')).toMatchObject({ coins: 1, cards: { wheat: 1, bakery: 1, cafe: 1 } });
    expect(state.market.cafe).toBe(1);
    expect(boards(events)[0].text).toContain('<@p1> 買了咖啡館');
    expect(state.current).toBe(1);
    expect(ephemeralTo(events, 'p1').join()).toContain('咖啡館');
  });

  it('選單只列買得起的、寫出現金和效果；1 元時沒有地標', () => {
    const s = market({ cafe: 2, wheat: 3, pizza: 1 }, 1);
    const { events } = turnMenu(s);
    expect(labels(events, 'p1')).toEqual(['麥田 (1 元)', '披薩店 (1 元)', '不買']);
    expect(menuOf(events, 'p1')!.text).toContain('現金 1 元');
    expect(menuOf(events, 'p1')!.text).toContain('別人擲 7：向他收 1 元');
    expect(buy(s, 'cafe').state).toBe(s);
  });

  it('已經有的紫色建築不列', () => {
    const s = market({ stadium: 2, tv: 1 }, 10, (s) => (P(s, 'p1').cards.stadium = 1));
    expect(values(turnMenu(s).events, 'p1')).not.toContain(`buy:${s.seq}:stadium`);
    expect(values(turnMenu(s).events, 'p1')).toContain(`buy:${s.seq}:tv`);
    expect(buy(s, 'stadium').state).toBe(s);
  });

  it('蓋地標：買得起的才有按鈕，扣錢、面板寫蓋了', () => {
    const s = market({ cafe: 1 }, 4);
    expect(labels(turnMenu(s).events, 'p1')).toEqual(['咖啡館 (2 元)', '港口 (2 元)', '火車站 (4 元)', '不買']);
    const { state, events } = buy(s, 'station');
    expect(P(state, 'p1')).toMatchObject({ coins: 0, landmarks: ['cityhall', 'station'] });
    expect(boards(events)[0].text).toContain('<@p1> 蓋了火車站');
  });

  it('一回合最多買一個：買完舊選單就過期', () => {
    const s = market({ cafe: 2, wheat: 3 });
    const after = buy(s, 'wheat').state;
    const again = run([{ type: 'buy', user: 'p1', seq: s.seq, code: 'wheat' }], after);
    expect(again.state).toBe(after);
  });

  it('買完一堆立刻從牌堆補到 10 種', () => {
    const full = { cafe: 1, wheat: 1, ranch: 1, flower: 1, forest: 1, mackerel: 1, mine: 1, apple: 1, tuna: 1, bakery: 1 };
    const s = market(full, 3, (s) => (s.deck = ['pizza', 'burger']));
    const { state } = buy(s, 'cafe');
    expect(state.market.cafe).toBeUndefined();
    expect(state.market.pizza).toBe(1);
    expect(state.deck).toEqual(['burger']);
  });

  it('市政廳：結算完 0 元拿 1 元', () => {
    const s = market({ cafe: 1 }, 0);
    expect(P(s, 'p1').coins).toBe(1);
    expect(s.turn!.log.join()).toContain('市政廳');
  });

  it('機場：不買拿 10 元', () => {
    const s = market({ cafe: 1 }, 3, (s) => P(s, 'p1').landmarks.push('airport'));
    const { state, events } = pass(s);
    expect(P(state, 'p1').coins).toBe(13);
    expect(boards(events)[0].text).toContain('機場');
  });
});

describe('machikoro/turns: 輪流、遊樂園與計時', () => {
  it('依座位輪流，輪回第一位時輪數 +1', () => {
    let s = setup((s) => (s.first = s.current = 2));
    const order: string[] = [];
    for (let i = 0; i < 5; i++) {
      order.push(`${cur(s)}@${s.round}`);
      s = skipTurn(s);
    }
    expect(order).toEqual(['p3@1', 'p4@1', 'p1@1', 'p2@1', 'p3@2']);
  });

  it('遊樂園擲出相同點數再一回合 (新 seq、新面板、不算輪)，可以連續', () => {
    const s = setup((s) => P(s, 'p1').landmarks.push('station', 'park'));
    const r1 = pass(roll(s, 2, dice(4, 4)).state);
    expect(announces(r1.events).join()).toContain('{{name:p1}} 擲出相同點數，再一回合');
    expect(r1.state).toMatchObject({ current: 0, round: 1, seq: s.seq + 1 });
    expect(boards(r1.events)[1].ref).toBe(`machikoro:turn:${s.seq + 1}`);
    expect(timers(r1.events)).toHaveLength(1);
    const r2 = pass(roll(r1.state, 2, dice(2, 2)).state);
    expect(r2.state).toMatchObject({ current: 0, seq: s.seq + 2 });
    const r3 = pass(roll(r2.state, 2, dice(2, 3)).state);
    expect(r3.state.current).toBe(1);
  });

  it('沒有遊樂園擲出相同點數就輪到下一位', () => {
    const s = setup((s) => P(s, 'p1').landmarks.push('station'));
    expect(pass(roll(s, 2, dice(4, 4)).state).state.current).toBe(1);
  });

  it('完全沒操作：系統替他擲 1 顆、照常結算、不買，公告逾時，輪到下一位', () => {
    const s = setup();
    const { state, events } = fire(s, dice(1));
    expect(P(state, 'p1').coins).toBe(4);
    expect(P(state, 'p1').cards).toEqual({ wheat: 1, bakery: 1 });
    expect(announces(events).join()).toContain('{{name:p1}} 逾時，系統代為完成這回合');
    expect(state.current).toBe(1);
  });

  it('逾時照 bot 規則擲骰：有火車站和大骰點建築就擲 2 顆', () => {
    const s = setup((s) => {
      P(s, 'p1').landmarks.push('station');
      P(s, 'p1').cards.mine = 1;
    });
    const { events } = fire(s, dice(4, 5));
    expect(boards(events)[0].text).toContain('擲出 4 + 5 = 9');
  });

  it('逾時不重擲；港口照 bot 規則', () => {
    const s = setup((s) => P(s, 'p1').landmarks.push('radio'));
    expect(boards(fire(s, dice(5)).events)[0].text).not.toContain('重擲');
    const h = setup((s) => {
      P(s, 'p1').landmarks.push('harbor', 'station');
      P(s, 'p1').cards.warehouse = 1;
      P(s, 'p1').cards.cafe = 2;
    });
    const all = boards(fire(h, dice(6, 5)).events).map((b) => b.text).join('\n');
    expect(all).toContain('港口 +2 = 13');
    expect(all).toContain('<@p1> 的食品倉庫 +4 元');
  });

  it('選建築時逾時：不買，回合結束', () => {
    const s = roll(setup()).state;
    const { state } = fire(s);
    expect(P(state, 'p1').cards).toEqual({ wheat: 1, bakery: 1 });
    expect(state.current).toBe(1);
  });

  it('舊計時器被忽略', () => {
    const s = setup();
    const old = s.timers.phase!;
    const next = skipTurn(s);
    expect(run([{ type: 'timeout', id: old }], next).state).toBe(next);
  });
});

describe('machikoro/buildings: 電視台', () => {
  const tv = (mut: (s: MState) => void = () => {}) =>
    roll(
      setup((s) => {
        P(s, 'p1').cards.tv = 1;
        mut(s);
      }),
    );

  it('每位對手一顆按鈕標示現金；收 5 元，面板公告', () => {
    const r1 = tv((s) => (P(s, 'p2').coins = 8));
    expect(r1.state.turn!.step).toBe('tv');
    expect(labels(r1.events, 'p1')).toEqual(['p2 (8 元)', 'p3 (3 元)', 'p4 (3 元)']);
    const { state, events } = run([{ type: 'tv', user: 'p1', seq: r1.state.seq, target: 'p2' }], r1.state);
    expect(P(state, 'p2').coins).toBe(3);
    expect(P(state, 'p1').coins).toBe(8);
    expect(state.turn!.step).toBe('buy');
    expect(boards(events)[0].text).toContain('<@p1> 的電視台向 <@p2> 收 5 元');
  });

  it('不夠就收現有的；不能選自己', () => {
    const r1 = tv((s) => (P(s, 'p2').coins = 2));
    expect(run([{ type: 'tv', user: 'p1', seq: r1.state.seq, target: 'p1' }], r1.state).state).toBe(r1.state);
    const { state } = run([{ type: 'tv', user: 'p1', seq: r1.state.seq, target: 'p2' }], r1.state);
    expect(P(state, 'p2').coins).toBe(0);
    expect(P(state, 'p1').coins).toBe(5);
  });

  it('逾時時選錢最多的對手', () => {
    const r1 = tv((s) => (P(s, 'p3').coins = 9));
    const { state } = fire(r1.state);
    expect(P(state, 'p3').coins).toBe(4);
  });
});

describe('machikoro/buildings: 商業中心', () => {
  const biz = (mut: (s: MState) => void = () => {}) =>
    roll(
      setup((s) => {
        P(s, 'p1').cards.business = 1;
        mut(s);
      }),
    );

  it('三步選單：給出的建築 → 對象 → 對方的建築，紫色和地標不能換；交換後公告', () => {
    const r1 = biz((s) => Object.assign(P(s, 'p2').cards, { mine: 1, stadium: 1 }));
    expect(r1.state.turn!.step).toBe('bizGive');
    expect(labels(r1.events, 'p1')).toEqual(['麥田', '麵包店', '不換']);
    const r2 = run([{ type: 'bizGive', user: 'p1', seq: r1.state.seq, card: 'wheat' }], r1.state);
    expect(labels(r2.events, 'p1')).toEqual(['p2', 'p3', 'p4', '不換']);
    expect(values(r2.events, 'p1')[0]).toBe(`bizPlayer:${r1.state.seq}:wheat:p2`);
    const r3 = run([{ type: 'bizPlayer', user: 'p1', seq: r1.state.seq, give: 'wheat', target: 'p2' }], r2.state);
    expect(labels(r3.events, 'p1')).toEqual(['麥田', '礦場', '麵包店', '不換']);
    expect(values(r3.events, 'p1')[1]).toBe(`bizTake:${r1.state.seq}:wheat:mine:p2`);
    const { state, events } = run([{ type: 'bizTake', user: 'p1', seq: r1.state.seq, give: 'wheat', take: 'mine', target: 'p2' }], r3.state);
    expect(P(state, 'p1').cards).toEqual({ bakery: 1, business: 1, mine: 1 });
    expect(P(state, 'p2').cards).toEqual({ wheat: 2, bakery: 1, stadium: 1 });
    expect(state.turn!.step).toBe('buy');
    expect(boards(events)[0].text).toContain('<@p1> 用麥田換走 <@p2> 的礦場');
  });

  it('紫色建築不能選', () => {
    const r1 = biz((s) => (P(s, 'p2').cards = { forest: 1, stadium: 1 }));
    const r2 = run([{ type: 'bizGive', user: 'p1', seq: r1.state.seq, card: 'business' }], r1.state);
    expect(r2.state).toBe(r1.state);
    const r3 = run(
      [
        { type: 'bizGive', user: 'p1', seq: r1.state.seq, card: 'wheat' },
        { type: 'bizPlayer', user: 'p1', seq: r1.state.seq, give: 'wheat', target: 'p2' },
      ],
      r1.state,
    );
    expect(labels(r3.events, 'p1')).toEqual(['森林', '不換']);
    const bad = run([{ type: 'bizTake', user: 'p1', seq: r1.state.seq, give: 'wheat', take: 'stadium', target: 'p2' }], r3.state);
    expect(bad.state).toBe(r3.state);
  });

  it('每一步都可以不換', () => {
    const r1 = biz();
    const skip = run([{ type: 'bizSkip', user: 'p1', seq: r1.state.seq }], r1.state);
    expect(skip.state.turn!.step).toBe('buy');
    expect(P(skip.state, 'p1').cards).toEqual(P(r1.state, 'p1').cards);
    const r2 = run([{ type: 'bizGive', user: 'p1', seq: r1.state.seq, card: 'wheat' }], r1.state);
    expect(run([{ type: 'bizSkip', user: 'p1', seq: r1.state.seq }], r2.state).state.turn!.step).toBe('buy');
  });

  it('自己沒有可以換的建築就直接跳過', () => {
    expect(biz((s) => (P(s, 'p1').cards = { business: 1 })).state.turn!.step).toBe('buy');
  });

  it('逾時時不換', () => {
    const { state } = fire(biz().state);
    expect(P(state, 'p1').cards).toEqual({ wheat: 1, bakery: 1, business: 1 });
    expect(state.current).toBe(1);
  });

  it('同時擲 6 有多張紫色：體育館 → 電視台 → 商業中心', () => {
    const r1 = roll(setup((s) => Object.assign(P(s, 'p1').cards, { stadium: 1, tv: 1, business: 1 })));
    expect(r1.state.turn!.step).toBe('tv');
    expect(r1.state.turn!.log.join()).toContain('體育館');
    const r2 = run([{ type: 'tv', user: 'p1', seq: r1.state.seq, target: 'p2' }], r1.state);
    expect(r2.state.turn!.step).toBe('bizGive');
  });
});

const results = (events: GameEvent[]) => events.filter((e) => e.type === 'result') as { players: string[]; winners: string[] }[];

describe('machikoro/scoring: 勝負', () => {
  const FIVE = ['harbor', 'station', 'mall', 'park', 'radio'];
  // 已經有 5 個地標、30 元；擲完骰子保留 (有廣播塔)
  const almost = (r: () => number) => {
    const s = setup((s) => {
      P(s, 'p1').landmarks.push(...FIVE);
      P(s, 'p1').coins = 30;
    });
    return run([{ type: 'roll', user: 'p1', seq: s.seq, n: 2 }, { type: 'keep', user: 'p1', seq: s.seq }], s, r).state;
  };

  it('蓋好最後一個地標立刻獲勝：公告、result、再來一局', () => {
    const s = almost(dice(1, 2));
    const { state, events } = buy(s, 'airport');
    expect(state).toMatchObject({ phase: 'ended', winners: ['p1'], reason: 'landmarks' });
    expect(results(events)).toEqual([{ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p1'] }]);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 獲勝');
    expect(text).toContain('蓋好全部 6 個地標');
    expect(text).toContain('<@p2> 地標 0 個｜3 元｜建築 2 張');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
    expect(boards(events)[0].options).toEqual([]);
  });

  it('擲出相同點數時獲勝不給額外回合', () => {
    const s = almost(dice(2, 2));
    const { state, events } = buy(s, 'airport');
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).not.toContain('再一回合');
  });

  const atLimit = (mut: (s: MState) => void) =>
    skipTurn(
      setup((s) => {
        s.round = 30;
        s.current = 3;
        mut(s);
      }),
    );

  it('第 30 輪結束：公告上限，比地標數', () => {
    const s = setup((s) => {
      s.round = 30;
      s.current = 3;
      P(s, 'p1').landmarks.push(...FIVE);
      P(s, 'p2').landmarks.push('harbor', 'station', 'mall', 'park');
      P(s, 'p2').coins = 50;
    });
    const { state, events } = pass(roll(s).state);
    expect(state).toMatchObject({ phase: 'ended', winners: ['p1'], reason: 'limit' });
    expect(announces(events).join()).toContain('已達 30 輪上限');
    expect(results(events)[0].winners).toEqual(['p1']);
  });

  it('地標一樣多比現金；完全同分並列', () => {
    const four = ['harbor', 'station', 'mall', 'park'];
    const byCoins = atLimit((s) => {
      P(s, 'p1').landmarks.push(...four);
      P(s, 'p2').landmarks.push(...four);
      P(s, 'p1').coins = 12;
      P(s, 'p2').coins = 20;
    });
    expect(byCoins.winners).toEqual(['p2']);
    const tie = atLimit((s) => {
      P(s, 'p1').landmarks.push(...four);
      P(s, 'p2').landmarks.push(...four);
      P(s, 'p1').coins = 20;
      P(s, 'p2').coins = 20;
    });
    expect(tie.winners).toEqual(['p1', 'p2']);
  });

  it('第 30 輪還沒結束不會提早判定', () => {
    const s = atLimit((s) => (s.current = 2));
    expect(s.phase).toBe('play');
  });

  it('結束後按舊按鈕被忽略；再來一局只有上一局玩家', () => {
    const s = buy(almost(dice(1, 2)), 'airport').state;
    const old = run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s);
    expect(old.state).toBe(s);
    expect(old.events).toEqual([]);
    const outsider = run([{ type: 'rematch', user: 'x', channel: 'C1' }], s);
    expect(outsider.state).toBe(s);
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], s);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p2' });
  });

  it('房主取消：公告取消，沒有 result、沒有再來一局；非房主被拒', () => {
    const s = setup();
    const denied = run([{ type: 'cancel', user: 'p2' }], s);
    expect(denied.state.phase).toBe('play');
    expect(ephemeralTo(denied.events, 'p2').join()).toContain('只有房主可以取消遊戲');
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
    expect(results(events)).toEqual([]);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).state).toBe(state);
  });
});

describe('machikoro/bots: 擲骰、重擲與港口', () => {
  const me = (cards: Record<string, number>, landmarks: string[] = []) => ({ id: 'bot:1:B', coins: 0, cards, landmarks: ['cityhall', ...landmarks] });

  it('有火車站而且有骰點 7 以上的藍綠建築才擲 2 顆', () => {
    expect(botDice(me({ wheat: 1, bakery: 1, family: 1 }, ['station']))).toBe(1);
    expect(botDice(me({ wheat: 1, mine: 1 }, ['station']))).toBe(2);
    expect(botDice(me({ wheat: 1, mine: 1 }))).toBe(1);
  });

  it('有廣播塔：這次點數對自己沒收入才重擲', () => {
    const radio = (n: number) => roll(setup((s) => P(s, 'p1').landmarks.push('radio')), 1, dice(n)).state;
    expect(autoMove(radio(5), true)).toEqual({ type: 'reroll', user: 'p1', seq: radio(5).seq, n: 1 });
    expect(autoMove(radio(3), true).type).toBe('keep');
  });

  it('有港口：+2 收入比較多才加', () => {
    const harbor = (cards: Record<string, number>) =>
      roll(
        setup((s) => {
          P(s, 'p1').landmarks.push('harbor', 'station');
          Object.assign(P(s, 'p1').cards, cards);
        }),
        2,
        dice(6, 5),
      ).state;
    expect(autoMove(harbor({ warehouse: 1, cafe: 2 }), true)).toMatchObject({ type: 'harbor', yes: true });
    expect(autoMove(harbor({ produce: 1 }), true)).toMatchObject({ type: 'harbor', yes: false });
  });
});

describe('machikoro/bots: 紫色建築與買建築', () => {
  it('電視台選現金最多的對手，同樣多時從下一位開始', () => {
    const s = setup((s) => {
      P(s, 'p2').coins = 4;
      P(s, 'p3').coins = 9;
    });
    expect(richest(s)).toBe('p3');
    const tie = setup((s) => {
      s.current = 2;
      P(s, 'p1').coins = 9;
      P(s, 'p2').coins = 9;
    });
    expect(richest(tie)).toBe('p1');
  });

  it('商業中心一律不換', () => {
    const s = roll(setup((s) => (P(s, 'p1').cards.business = 1))).state;
    expect(autoMove(s, true).type).toBe('bizSkip');
  });

  // 直接進到買建築這一步
  const atBuy = (coins: number, market: Record<string, number>, mut: (p: MState['players'][number]) => void = () => {}) =>
    setup((s) => {
      s.turn!.step = 'buy';
      s.market = market;
      P(s, 'p1').coins = coins;
      mut(P(s, 'p1'));
    });
  const choice = (s: MState) => {
    const a = autoMove(s, true);
    return a.type === 'buy' ? a.code : a.type;
  };

  it('先蓋買得起、費用最低的地標', () => {
    expect(choice(atBuy(5, { mine: 1 }))).toBe('harbor');
  });

  it('少於 10 張時買用得到而且最貴的建築', () => {
    const s = atBuy(6, { mine: 1, forest: 1, tuna: 1 }, (p) => {
      p.landmarks.push('harbor', 'station');
      p.cards = { wheat: 2, bakery: 2 };
    });
    expect(choice(s)).toBe('mine');
  });

  it('沒有火車站時不買大骰點建築', () => {
    expect(choice(atBuy(3, { apple: 1, wheat: 1 }, (p) => p.landmarks.push('harbor')))).toBe('wheat');
  });

  it('有港口時船和壽司店用得到；自己有的紫色不算', () => {
    expect(choice(atBuy(4, { sushi: 1, mackerel: 1, ranch: 1 }, (p) => p.landmarks.push('harbor', 'station')))).toBe('sushi');
    const owned = atBuy(1, { tax: 1, wheat: 1 }, (p) => {
      p.landmarks.push('harbor', 'station');
      p.cards.tax = 1;
      p.coins = 4;
    });
    expect(choice(owned)).toBe('wheat');
  });

  it('同價時取市場顯示順序在前的', () => {
    expect(choice(atBuy(1, { ranch: 1, wheat: 1 }, (p) => p.landmarks.push('harbor')))).toBe('wheat');
  });

  it('建築夠多就存錢', () => {
    const s = atBuy(9, { wheat: 3 }, (p) => {
      p.landmarks.push('harbor', 'station');
      p.cards = { wheat: 5, bakery: 5 };
    });
    expect(choice(s)).toBe('pass');
  });
});

describe('machikoro/bots: 一個人也能玩完整局', () => {
  // 固定種子的亂數，骰子點數有變化
  const seeded = (seed: number) => () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };

  it('bot 輪到時立刻行動，直到輪到真人', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    const { state } = run([{ type: 'start', user: 'p1' }], lobby, () => 0.5);
    expect(state.phase).toBe('play');
    expect(cur(state)).toBe('p1');
  });

  it('1 位真人 + 3 個 bot，真人每次都逾時，30 輪內結束並送出 result', () => {
    for (const seed of [1, 2, 3]) {
      const r = seeded(seed);
      const lobby = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
      let { state, events } = run([{ type: 'start', user: 'p1' }], lobby, r);
      const all = [...events];
      for (let i = 0; i < 200 && state.phase === 'play'; i++) {
        expect(cur(state)).toBe('p1');
        ({ state, events } = fire(state, r));
        all.push(...events);
      }
      expect(state.phase).toBe('ended');
      expect(state.round).toBeLessThanOrEqual(31);
      expect(results(all)).toHaveLength(1);
      expect(results(all)[0].players).toHaveLength(4);
    }
  });
});

describe('machikoro/setup: Slack 設定', () => {
  it('遊戲資訊：🏘️ 骰子街、2～5 人、心理戰分類', () => {
    expect(machikoro).toMatchObject({ kind: 'machikoro', emoji: '🏘️', name: '骰子街', players: '2～5 人', category: 'strategy' });
    expect(machikoro.desc).toBeTruthy();
    expect(machikoro.apply).toBe(applyMachikoro);
  });

  it('指令解析：new、start、cancel、addbot、removebot', () => {
    expect(machikoro.parse('new', 'u', 'C1')).toEqual({ type: 'new', user: 'u', channel: 'C1' });
    expect(machikoro.parse('start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(machikoro.parse('cancel', 'u', 'C1')).toEqual({ type: 'cancel', user: 'u' });
    expect(machikoro.parse('addbot 3', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 3 });
    expect(machikoro.parse('removebot', 'u', 'C1')).toEqual({ type: 'removeBot', user: 'u', count: 1 });
  });

  it('help 和不認識的子指令回傳 null (顯示說明)，說明列出所有指令和按鈕', () => {
    expect(machikoro.parse('help', 'u', 'C1')).toBeNull();
    expect(machikoro.parse('roll', 'u', 'C1')).toBeNull();
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(machikoro.help).toContain(`/game machikoro ${cmd}`);
    expect(machikoro.help).toContain('🏘️ 行動');
    expect(machikoro.help).toContain('📋 城鎮一覽');
  });

  it('按鈕路由：房間按鈕和遊戲中的每種按鈕 (bot id 含冒號)', () => {
    const b = (value: string, kind = 'machikoro') => machikoro.button(kind, value, 'u', 'C1');
    const bot = 'bot:2:Lily';
    expect(b('join', 'join')).toEqual({ type: 'join', user: 'u' });
    expect(b('leave', 'leave')).toEqual({ type: 'leave', user: 'u' });
    expect(b('start', 'start')).toEqual({ type: 'start', user: 'u' });
    expect(b('rematch', 'rematch')).toEqual({ type: 'rematch', user: 'u', channel: 'C1' });
    expect(b('town')).toEqual({ type: 'town', user: 'u' });
    expect(b('turnMenu:7')).toEqual({ type: 'turnMenu', user: 'u', seq: 7 });
    expect(b('roll:7:1')).toEqual({ type: 'roll', user: 'u', seq: 7, n: 1 });
    expect(b('roll:7:2')).toEqual({ type: 'roll', user: 'u', seq: 7, n: 2 });
    expect(b('roll:7:3')).toBeNull();
    expect(b('keep:7')).toEqual({ type: 'keep', user: 'u', seq: 7 });
    expect(b('reroll:7:2')).toEqual({ type: 'reroll', user: 'u', seq: 7, n: 2 });
    expect(b('harbor:7:yes')).toEqual({ type: 'harbor', user: 'u', seq: 7, yes: true });
    expect(b('harbor:7:no')).toEqual({ type: 'harbor', user: 'u', seq: 7, yes: false });
    expect(b(`tv:7:${bot}`)).toEqual({ type: 'tv', user: 'u', seq: 7, target: bot });
    expect(b('bizGive:7:wheat')).toEqual({ type: 'bizGive', user: 'u', seq: 7, card: 'wheat' });
    expect(b(`bizPlayer:7:wheat:${bot}`)).toEqual({ type: 'bizPlayer', user: 'u', seq: 7, give: 'wheat', target: bot });
    expect(b(`bizTake:7:wheat:mine:${bot}`)).toEqual({ type: 'bizTake', user: 'u', seq: 7, give: 'wheat', take: 'mine', target: bot });
    expect(b('bizSkip:7')).toEqual({ type: 'bizSkip', user: 'u', seq: 7 });
    expect(b('buy:7:cafe')).toEqual({ type: 'buy', user: 'u', seq: 7, code: 'cafe' });
    expect(b('buy:7:airport')).toEqual({ type: 'buy', user: 'u', seq: 7, code: 'airport' });
    expect(b('pass:7')).toEqual({ type: 'pass', user: 'u', seq: 7 });
    expect(b('nope:7')).toBeNull();
    expect(b('turnMenu:7', 'other')).toBeNull();
  });

  it('選單上的每顆按鈕都能被路由回同樣的 action', () => {
    const s = roll(setup((s) => Object.assign(P(s, 'p1').cards, { business: 1 }))).state;
    for (const o of menuOf(turnMenu(s).events, 'p1')!.options) expect(machikoro.button('machikoro', o.value, 'p1', 'C1')).not.toBeNull();
  });
});
