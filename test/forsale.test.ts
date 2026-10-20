import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { forsale } from '../src/games/forsale.js';
import { applyForSale, botBid, botSell, CHECKS, money, PROPERTIES, type FAction, type FState } from '../src/forsale.js';

const rng = () => 0.99999; // 洗牌不動：房產 1～30、支票由小到大；移除的是最前面幾張；起始玩家是最後一位

function run(actions: FAction[], start?: FState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyForSale(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as FAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string; replace?: boolean } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'forsale' && p.audience === 'channel');
const lastBoard = (events: GameEvent[]) => boards(events).at(-1)!;
const menuTo = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const resultOf = (events: GameEvent[]) => events.find((e) => e.type === 'result');
const labels = (p: { options: { label: string }[] }) => p.options.map((o) => o.label);
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

describe('forsale/setup: 地產大亨的房間', () => {
  it('開房：公告標示地產大亨', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'forsale', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '地產大亨', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 3 人');
  });

  it('房間已滿（6 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(6).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'x')?.text).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p2' }], lobby).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    const hostLeft = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(hostLeft.state.phase).toBe('ended');
    expect(announces(hostLeft.events).join()).toContain('取消');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')?.text).toBe('這個頻道已經有遊戲了。');
  });
});

describe('forsale/setup: 加入與移除 bot', () => {
  it('一個人加 2 個 bot 就能開始；removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(3);
    expect(added.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const removed = run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state;
    expect(removed.players.map((p) => p.id)).toEqual(added.players.slice(0, 2).map((p) => p.id));
    expect(run([{ type: 'start', user: 'p1' }], added).state.phase).toBe('bid');
  });

  it('超過 6 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(5).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('非房主或開始後被拒', () => {
    const notHost = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(3).state);
    expect(notHost.state.players).toHaveLength(3);
    expect(ephemeralTo(notHost.events, 'p2')?.text).toContain('只有房主可以加入 bot');
    const afterStart = run([{ type: 'addBot', user: 'p1', count: 1 }], started(3).state);
    expect(afterStart.state.players).toHaveLength(3);
    expect(ephemeralTo(afterStart.events, 'p1')?.text).toContain('遊戲已經開始了');
  });
});

describe('forsale/setup: 房產、支票與起始金幣', () => {
  it('房產 1～30 各一張；支票 $0 兩張、$2,000～$15,000 各兩張，沒有 $1,000', () => {
    expect(PROPERTIES).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(CHECKS).toHaveLength(30);
    expect(CHECKS.filter((c) => c === 0)).toHaveLength(2);
    expect(CHECKS).not.toContain(1);
    for (let v = 2; v <= 15; v++) expect(CHECKS.filter((c) => c === v)).toHaveLength(2);
  });

  it.each([
    [3, 24, 8, 18],
    [4, 28, 7, 18],
    [5, 30, 6, 14],
    [6, 30, 5, 14],
  ])('%i 人：各用 %i 張、每階段 %i 輪、每人 $%i,000', (n, cards, rounds, coins) => {
    const { state } = started(n);
    expect(state.rounds).toBe(rounds);
    // 第 1 輪已經翻出 n 張房產
    expect(state.propDeck.length + state.table.length).toBe(cards);
    expect(state.checkDeck).toHaveLength(cards);
    expect(state.players.every((p) => p.money === coins)).toBe(true);
  });

  it('開局公告玩家、起始金幣、輪數和規則摘要，接著發出第一階段第 1/7 輪的喊價面板', () => {
    const { events } = started(4);
    const text = announces(events).join('\n');
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect(text).toContain(`<@${p}>`);
    expect(text).toContain('每人 $18,000');
    expect(text).toContain('每階段 7 輪');
    expect(text).toContain('放棄的人拿桌上最小的房產');
    expect(text).toContain('拿回一半');
    expect(text).toContain('大的換到大的支票');
    expect(lastBoard(events).text).toContain('第一階段第 1/7 輪');
  });

  it('起始玩家隨機決定', () => {
    expect(run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, rng).state.turn).toBe(3);
    // 開局先抽起始玩家，再洗牌：第一次 rng 回傳 0 時起始玩家是第一位
    let calls = 0;
    const firstStarter = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, () => (++calls === 1 ? 0 : 0.99999)).state;
    expect(firstStarter.turn).toBe(0);
  });

  it('money() 顯示 $0、$4,000、$15,000', () => {
    expect(money(0)).toBe('$0');
    expect(money(4)).toBe('$4,000');
    expect(money(15)).toBe('$15,000');
  });
});

describe('forsale/setup: 我的狀態', () => {
  it('只有本人看到金幣、這輪出價、房產由小到大、支票與總額；state 不變', () => {
    const s = structuredClone(started(4).state);
    Object.assign(s.players[0], { money: 11, props: [25, 3, 17], checks: [9, 4], bid: 3 });
    const { state, events } = run([{ type: 'status', user: 'p1' }], s);
    expect(state).toBe(s);
    expect(events).toHaveLength(1);
    const text = ephemeralTo(events, 'p1')!.text;
    expect(text).toContain('金幣 $11,000');
    expect(text).toContain('這輪出價 $3,000');
    expect(text).toContain('🏠 房產：3、17、25');
    expect(text).toContain('$9,000、$4,000');
    expect(text).toContain('總額 $13,000');
  });

  it('局外人被拒', () => {
    const { events } = run([{ type: 'status', user: 'x' }], started(4).state);
    expect(ephemeralTo(events, 'x')?.text).toContain('你不在這局遊戲中');
  });
});

// 4 人局第 1 輪，桌上換成指定的房產、從 players[turn] 開始出價
function bidRound(table = [4, 12, 21, 30], turn = 0, n = 4): FState {
  const s = structuredClone(started(n).state);
  Object.assign(s, { table, turn, starter: turn });
  return s;
}
const bid = (s: FState, user: string, amount: number): FAction => ({ type: 'bid', user, seq: s.seq, amount });
const pass = (s: FState, user: string): FAction => ({ type: 'pass', user, seq: s.seq });
// 依序做動作，每一步都帶當下的 seq
function play(s: FState, steps: [string, number | 'pass'][]) {
  let r = { state: s, events: [] as GameEvent[] };
  const seen: GameEvent[] = [];
  for (const [user, act] of steps) {
    r = run([act === 'pass' ? pass(r.state, user) : bid(r.state, user, act)], r.state);
    seen.push(...r.events);
  }
  return { ...r, seen };
}

describe('forsale/bidding: 每輪翻開房產', () => {
  it('翻開人數張房產，由小到大放在桌上', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, seeded(7));
    expect(state.table).toHaveLength(4);
    expect(state.table).toEqual([...state.table].sort((a, b) => a - b));
    expect(state.propDeck).toHaveLength(24);
    expect(lastBoard(events).text).toContain(`🏠 桌上：${state.table.join('、')}`);
    expect(lastBoard(events).text).toContain('房產牌庫剩 24 張');
  });
});

describe('forsale/bidding: 喊價面板', () => {
  it('A 出價 $3,000 後輪到 B：最高價、👉、還沒出價、上一步、6 顆按鈕與金額；不顯示金幣', () => {
    const s = bidRound();
    const { state, events } = run([bid(s, 'p1', 3)], s);
    const b = lastBoard(events);
    expect(b.ref).toBe('forsale:bid:1');
    expect(b.perRow).toBe(5);
    expect(b.text).toContain('第一階段第 1/7 輪');
    expect(b.text).toContain('🏠 桌上：4、12、21、30');
    expect(b.text).toContain('目前最高 $3,000（<@p1>）');
    expect(b.text).toContain('<@p1> 出價 $3,000');
    expect(b.text).toContain('👉 <@p2>');
    expect(b.text).toContain('<@p3> 還沒出價');
    expect(b.text).toContain('<@p4> 還沒出價');
    expect(b.text).toContain('上一步：<@p1> 出價 $3,000');
    expect(b.text).not.toContain('$18,000');
    expect(labels(b)).toEqual(['出 $4,000（+1）', '出 $5,000（+2）', '出 $8,000（+5）', '🔢 其他金額', '🙅 放棄', '💰 我的狀態']);
    const q = state.seq;
    expect(values(b)).toEqual([`bid:${q}:4`, `bid:${q}:5`, `bid:${q}:8`, `bidMenu:${q}`, `pass:${q}`, 'status']);
  });

  it('還沒有人出價時從 $1,000 起跳', () => {
    const b = lastBoard(started(4).events);
    expect(b.text).toContain('目前最高：還沒有人出價');
    expect(labels(b).slice(0, 3)).toEqual(['出 $1,000（+1）', '出 $2,000（+2）', '出 $5,000（+5）']);
  });
});

describe('forsale/bidding: 出價', () => {
  it('B 按「出 $5,000（+2）」：出價變 $5,000，輪到下一位，重設 30 秒計時', () => {
    const s = play(bidRound(), [['p1', 3]]).state;
    const { state, events } = run([bid(s, 'p2', 5)], s);
    expect(state.players[1].bid).toBe(5);
    expect(state).toMatchObject({ high: 5, highBy: 'p2', turn: 2 });
    expect(state.players[1].money).toBe(18); // 錢在這一輪結算時才扣
    expect(lastBoard(events).text).toContain('目前最高 $5,000（<@p2>）');
    expect(events).toContainEqual({ type: 'startTimer', id: state.timers.phase, ms: 30_000 });
  });

  it('錢不夠：只讓 C 看到最多能出多少，state 不變', () => {
    const s = play(bidRound(), [['p1', 3], ['p2', 9]]).state;
    s.players[2].money = 10;
    const { state, events } = run([bid(s, 'p3', 14)], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p3')?.text).toContain('你的錢不夠，最多能出 $10,000');
  });

  it('沒有比目前最高高（或是 $0）被拒', () => {
    const s = play(bidRound(), [['p1', 3]]).state;
    expect(run([bid(s, 'p2', 3)], s).state).toBe(s);
    const s0 = bidRound();
    expect(run([bid(s0, 'p1', 0)], s0).state).toBe(s0);
  });

  it('不是輪到的人、局外人、舊 seq 被拒，state 不變', () => {
    const s = play(bidRound(), [['p1', 3]]).state;
    const notMe = run([bid(s, 'p1', 4)], s);
    expect(notMe.state).toBe(s);
    expect(ephemeralTo(notMe.events, 'p1')?.text).toContain('還沒輪到你');
    expect(ephemeralTo(run([bid(s, 'x', 4)], s).events, 'x')?.text).toContain('你不在這局遊戲中');
    const stale = run([{ type: 'bid', user: 'p2', seq: s.seq - 1, amount: 4 }], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p2')?.text).toContain('按鈕已過期');
  });

  it('出價後跳過已放棄的人', () => {
    const { state } = play(bidRound(), [['p1', 'pass'], ['p2', 2], ['p3', 'pass'], ['p4', 3]]);
    expect(state.turn).toBe(1);
  });

  it('「🔢 其他金額」：只讓 B 看到 $4,000～$8,000 和放棄；state 不變、不重設計時器', () => {
    const s = play(bidRound(), [['p1', 3]]).state;
    s.players[1].money = 8;
    const { state, events } = run([{ type: 'bidMenu', user: 'p2', seq: s.seq }], s);
    expect(state).toBe(s);
    expect(events.some((e) => e.type === 'startTimer')).toBe(false);
    const m = menuTo(events, 'p2')!;
    expect(m.perRow).toBe(6);
    expect(labels(m)).toEqual(['$4,000', '$5,000', '$6,000', '$7,000', '$8,000', '🙅 放棄']);
    expect(values(m)).toEqual([4, 5, 6, 7, 8].map((n) => `bid:${s.seq}:${n}`).concat(`pass:${s.seq}`));
  });

  it('「🔢 其他金額」出不起任何金額時只有放棄；不是輪到的人被拒', () => {
    const s = play(bidRound(), [['p1', 3]]).state;
    s.players[1].money = 3;
    const m = menuTo(run([{ type: 'bidMenu', user: 'p2', seq: s.seq }], s).events, 'p2')!;
    expect(m.text).toContain('你的錢不夠出價');
    expect(labels(m)).toEqual(['🙅 放棄']);
    expect(ephemeralTo(run([{ type: 'bidMenu', user: 'p3', seq: s.seq }], s).events, 'p3')?.text).toContain('還沒輪到你');
  });
});

describe('forsale/bidding: 放棄與最後一位', () => {
  it('出過價再放棄：拿最小、拿回一半無條件捨去，之後跳過他', () => {
    const s = bidRound();
    Object.assign(s, { high: 3, highBy: 'p1' });
    s.players[0].bid = 3;
    const { state, events } = run([pass(s, 'p1')], s);
    expect(state.players[0]).toMatchObject({ props: [4], money: 16, passed: true });
    expect(state.table).toEqual([12, 21, 30]);
    expect(state.turn).toBe(1);
    const b = lastBoard(events);
    expect(b.text).toContain('<@p1> 放棄，拿走房產 4，拿回 $1,000');
    expect(b.text).toContain('<@p1> 已放棄（拿走房產 4）');
  });

  it('沒出價就放棄：免費拿最小的', () => {
    const s = bidRound([12, 21, 30], 3);
    const { state } = run([pass(s, 'p4')], s);
    expect(state.players[3]).toMatchObject({ props: [12], money: 18 });
  });

  it('A、B、D 放棄，C 出 $6,000：C 拿最大付全額，面板改成結果並拿掉按鈕，下一輪從 C 開始', () => {
    const { state, seen } = play(bidRound(), [['p1', 'pass'], ['p2', 'pass'], ['p3', 6], ['p4', 'pass']]);
    expect(state.players[2]).toMatchObject({ props: [30], money: 12 });
    expect(state.players[3].props).toEqual([21]);
    const done = boards(seen).filter((b) => b.ref === 'forsale:bid:1').at(-1)!;
    expect(done.options).toEqual([]);
    expect(done.text).toContain('<@p3> 拿走房產 30，付 $6,000');
    expect(done.text).toContain('<@p1> 拿走房產 4，付 $0');
    expect(state).toMatchObject({ round: 2, starter: 2, turn: 2 });
    expect(lastBoard(seen).ref).toBe('forsale:bid:2');
    expect(lastBoard(seen).text).toContain('👉 <@p3>');
  });

  it('全部人都直接放棄：前三位依序拿最小的，最後一位沒出價也拿最大付 $0', () => {
    const { state } = play(bidRound(), [['p1', 'pass'], ['p2', 'pass'], ['p3', 'pass']]);
    expect(state.players.map((p) => p.props)).toEqual([[4], [12], [21], [30]]);
    expect(state.players.map((p) => p.money)).toEqual([18, 18, 18, 18]);
    expect(state.starter).toBe(3);
  });
});

describe('forsale/bidding: 喊價計時與第一階段結束', () => {
  it('30 秒逾時視為放棄：B 出過 $4,000，拿最小、拿回 $2,000，標示逾時自動放棄', () => {
    const s = bidRound([4, 12, 21, 30], 1);
    Object.assign(s, { high: 4, highBy: 'p2' });
    s.players[1].bid = 4;
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.players[1]).toMatchObject({ props: [4], money: 16, passed: true });
    expect(state.turn).toBe(2);
    expect(lastBoard(events).text).toContain('逾時，自動放棄');
  });

  it('舊計時器被忽略', () => {
    const s = bidRound();
    expect(run([{ type: 'timeout', id: s.timers.phase! - 1 }], s).state).toBe(s);
  });

  it('房產賣完：公告第一階段結束，真人私下收到房產和金幣，進入第二階段', () => {
    const s = bidRound();
    s.propDeck = [];
    s.players[1].props = [17, 2];
    const { state, seen } = play(s, [['p1', 'pass'], ['p2', 'pass'], ['p3', 'pass']]);
    expect(announces(seen).join('\n')).toContain('第一階段結束');
    expect(ephemeralTo(seen, 'p2')?.text).toContain('你的房產：2、12、17');
    expect(ephemeralTo(seen, 'p2')?.text).toContain('金幣 $18,000');
    expect(state.phase).toBe('sell');
  });
});

// 進入第二階段第 1 輪：第一階段最後一輪 p1、p2…依序放棄（桌上 4、12、21、30 的前 n 間），
// 放棄前手上的房產照 before、支票牌庫照 checks；setup 可以再改 state
function toSell(checks: number[], before: number[][] = [[1, 25], [3, 5], [18, 19], [2, 6]], n = 4, setup = (_: FState) => {}) {
  const s = bidRound([4, 12, 21, 30].slice(0, n), 0, n);
  s.propDeck = [];
  s.checkDeck = checks;
  s.players.forEach((p, i) => (p.props = [...(before[i] ?? [])]));
  setup(s);
  return play(s, s.players.slice(0, -1).map((p) => [p.id, 'pass'] as [string, 'pass']));
}
// 手上：p1 1、4、25｜p2 3、5、12｜p3 18、19、21｜p4 2、6、30
const CHECKS3 = [0, 9, 15, 4, 2, 3, 5, 6, 7, 8, 10, 11];
const sell = (s: FState, user: string, prop: number): FAction => ({ type: 'sell', user, seq: s.seq, prop });
function sells(s: FState, picks: [string, number][]) {
  let r = { state: s, events: [] as GameEvent[] };
  const seen: GameEvent[] = [];
  for (const [user, prop] of picks) {
    r = run([sell(r.state, user, prop)], r.state);
    seen.push(...r.events);
  }
  return { ...r, seen };
}

describe('forsale/selling: 每輪翻開支票與賣房產面板', () => {
  it('支票由大到小；面板顯示輪數、支票、每人房產數、已選 0/4、還沒選的人和兩顆按鈕', () => {
    const { state, seen } = toSell(CHECKS3);
    expect(state.phase).toBe('sell');
    const b = lastBoard(seen);
    expect(b.ref).toBe('forsale:sell:1');
    expect(b.text).toContain('第二階段第 1/7 輪');
    expect(b.text).toContain('$15,000、$9,000、$4,000、$0');
    expect(b.text).toContain('<@p1> 3 間');
    expect(b.text).toContain('已選 0/4');
    expect(b.text).toContain('還沒選：<@p1> <@p2> <@p3> <@p4>');
    expect(labels(b)).toEqual(['🏠 選房產', '💰 我的狀態']);
    expect(values(b)).toEqual([`sellMenu:${state.seq}`, 'status']);
    expect(seen).toContainEqual({ type: 'startTimer', id: state.timers.phase, ms: 45_000 });
  });
});

describe('forsale/selling: 同時選擇', () => {
  it('「🏠 選房產」：私下列出手上每一間（由小到大），state 不變', () => {
    const s = toSell(CHECKS3).state;
    const { state, events } = run([{ type: 'sellMenu', user: 'p1', seq: s.seq }], s);
    expect(state).toBe(s);
    const m = menuTo(events, 'p1')!;
    expect(labels(m)).toEqual(['房產 1', '房產 4', '房產 25']);
    expect(values(m)).toEqual([1, 4, 25].map((n) => `sell:${s.seq}:${n}`));
  });

  it('選擇私下確認、頻道只更新已選 1/4；揭曉前可以改，已選人數不變', () => {
    const s = toSell(CHECKS3).state;
    const first = run([sell(s, 'p1', 25)], s);
    expect(ephemeralTo(first.events, 'p1')).toMatchObject({ text: '你選了房產 25（揭曉前可以改）', replace: true });
    expect(lastBoard(first.events).text).toContain('已選 1/4');
    expect(lastBoard(first.events).text).not.toContain('房產 25');
    const changed = run([sell(first.state, 'p1', 1)], first.state);
    expect(changed.state.players[0].choice).toBe(1);
    expect(boards(changed.events).every((b) => b.text.includes('已選 1/4'))).toBe(true);
  });

  it('局外人、舊 seq、手上沒有的房產被拒，state 不變', () => {
    const s = toSell(CHECKS3).state;
    expect(ephemeralTo(run([sell(s, 'x', 25)], s).events, 'x')?.text).toContain('你不在這局遊戲中');
    expect(ephemeralTo(run([{ type: 'sellMenu', user: 'x', seq: s.seq }], s).events, 'x')?.text).toContain('你不在這局遊戲中');
    const stale = run([{ type: 'sell', user: 'p1', seq: s.seq - 1, prop: 25 }], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1')?.text).toContain('按鈕已過期');
    expect(run([sell(s, 'p1', 30)], s).state).toBe(s);
  });
});

describe('forsale/selling: 揭曉與分配支票', () => {
  it('最大房產拿最大支票依序分配，出掉的房產移除，面板改成結果並拿掉按鈕，接著下一輪', () => {
    const { state, seen } = sells(toSell(CHECKS3).state, [['p1', 25], ['p2', 3], ['p3', 18], ['p4', 30]]);
    expect(state.players.map((p) => p.checks)).toEqual([[9], [0], [4], [15]]);
    expect(state.players.map((p) => p.props)).toEqual([[1, 4], [5, 12], [19, 21], [2, 6]]);
    const done = boards(seen).filter((b) => b.ref === 'forsale:sell:1').at(-1)!;
    expect(done.options).toEqual([]);
    expect(done.text).toContain('<@p4> 房產 30 → $15,000');
    expect(done.text).toContain('<@p1> 房產 25 → $9,000');
    expect(done.text).toContain('<@p3> 房產 18 → $4,000');
    expect(done.text).toContain('<@p2> 房產 3 → $0');
    expect(state.round).toBe(2);
    expect(lastBoard(seen).ref).toBe('forsale:sell:2');
  });

  it('最後一輪每人只剩一間：直接揭曉、不顯示選房產按鈕', () => {
    const { state, seen } = toSell([0, 9, 15, 4], [[], [], [], []]);
    const sellBoards = boards(seen).filter((b) => b.ref?.startsWith('forsale:sell:'));
    expect(sellBoards.length).toBeGreaterThan(0);
    expect(sellBoards.every((b) => b.options.length === 0)).toBe(true);
    expect(state.players.map((p) => p.checks)).toEqual([[0], [4], [9], [15]]);
    expect(state.phase).toBe('ended');
  });

  it('45 秒逾時：沒選的真人出最小的，標示逾時自動出最小；舊計時器被忽略', () => {
    const { state } = sells(toSell(CHECKS3).state, [['p1', 25], ['p3', 18], ['p4', 30]]);
    expect(run([{ type: 'timeout', id: state.timers.phase! - 1 }], state).state).toBe(state);
    const { state: after, events } = run([{ type: 'timeout', id: state.timers.phase! }], state);
    expect(after.players[1].props).toEqual([5, 12]);
    expect(boards(events).find((b) => b.ref === 'forsale:sell:1')!.text).toContain('<@p2> 房產 3 → $0（逾時，自動出最小）');
  });
});

describe('forsale/selling: 計分、勝負與結束', () => {
  // 3 人局最後一輪每人一間、支票都是 $0：總分就是事先設好的支票加金幣
  const finish = (checks: number[][], coins: number[]) =>
    toSell([0, 0, 0], [[], [], []], 3, (s) => s.players.forEach((p, i) => Object.assign(p, { checks: checks[i], money: coins[i] })));

  it('最高分獲勝：公告支票、金幣、總分、排名，送出 result，附再來一局', () => {
    const { state, seen } = finish([[15, 15, 12, 10], [15, 15, 9, 8], [10, 10, 10, 10]], [3, 6, 2]);
    expect(state.phase).toBe('ended');
    const text = announces(seen).join('\n');
    expect(text).toContain('<@p1> 獲勝');
    expect(text).toContain('1. <@p1> $55,000（支票 $52,000＋金幣 $3,000）');
    expect(text).toContain('2. <@p2> $53,000（支票 $47,000＋金幣 $6,000）');
    expect(text).toContain('3. <@p3> $42,000（支票 $40,000＋金幣 $2,000）');
    expect(resultOf(seen)).toEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1'] });
    expect(prompts(seen).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分比剩下金幣；再同分並列', () => {
    expect(resultOf(finish([[48], [45], [10]], [2, 5, 0]).seen)).toMatchObject({ winners: ['p2'] });
    expect(resultOf(finish([[46], [46], [10]], [4, 4, 0]).seen)).toMatchObject({ winners: ['p1', 'p2'] });
  });

  it('再來一局只有上一局玩家可以按，按的人成為新房主；結束後舊按鈕被忽略', () => {
    const { state } = finish([[1], [2], [3]], [0, 0, 0]);
    const outsider = run([{ type: 'rematch', user: 'x', channel: 'C1' }], state);
    expect(ephemeralTo(outsider.events, 'x')?.text).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p2' });
    const old = run([{ type: 'status', user: 'p1' }, sell(state, 'p1', 4)], state);
    expect(old).toEqual({ state, events: [] });
  });

  it('房主在第二階段取消：公告已取消，沒有 result、沒有再來一局；非房主取消被拒', () => {
    const s = toSell(CHECKS3).state;
    const cancelled = run([{ type: 'cancel', user: 'p1' }], s);
    expect(cancelled.state.phase).toBe('ended');
    expect(announces(cancelled.events).join()).toContain('取消');
    expect(resultOf(cancelled.events)).toBeUndefined();
    expect(prompts(cancelled.events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], cancelled.state).events).toEqual([]);
    const notHost = run([{ type: 'cancel', user: 'p2' }], s);
    expect(notHost.state).toBe(s);
    expect(ephemeralTo(notHost.events, 'p2')?.text).toContain('只有房主可以取消遊戲');
  });
});

const BOT = 'bot:1:阿明';

describe('forsale/bots: bot 的喊價策略', () => {
  const at = (table: number[], high: number, coins: number) => {
    const s = bidRound(table);
    s.high = high;
    s.players[1] = { ...s.players[1], id: BOT, money: coins };
    return botBid(s, s.players[1]);
  };

  it('上限 = (桌上最大 − 最小) ÷ 5 無條件捨去，和剩下金幣取小；上限內出目前最高 + 1，超過就放棄', () => {
    expect(at([4, 12, 21, 30], 3, 18)).toBe(4);
    expect(at([4, 12, 21, 30], 4, 18)).toBe(5);
    expect(at([4, 12, 21, 30], 5, 18)).toBe('pass');
    expect(at([1, 30], 1, 1)).toBe('pass');
    expect(at([1, 30], 0, 1)).toBe(1);
  });

  it('輪到 bot 就立刻行動：出價或放棄拿最小的', () => {
    const s = bidRound();
    s.players[1].id = BOT;
    const raised = play(s, [['p1', 3]]);
    expect(raised.state.players[1].bid).toBe(4);
    expect(raised.state.turn).toBe(2);
    const passed = play(s, [['p1', 5]]);
    expect(passed.state.players[1]).toMatchObject({ passed: true, props: [4] });
    expect(lastBoard(passed.seen).text).toContain('🤖阿明 放棄，拿走房產 4');
  });
});

describe('forsale/bots: bot 的賣房產策略', () => {
  it('最大支票 ≥ $12,000 出最大的房產，否則出最小的', () => {
    const s = structuredClone(started(4).state);
    const me = { ...s.players[0], id: BOT, props: [5, 19, 27] };
    expect(botSell({ ...s, checks: [15, 9, 4, 0] }, me)).toBe(27);
    expect(botSell({ ...s, checks: [12, 9, 4, 0] }, me)).toBe(27);
    expect(botSell({ ...s, checks: [10, 7, 2, 0] }, me)).toBe(5);
  });

  it('開輪就選好，算在已選裡，揭曉前不公開', () => {
    // p4 是 bot：手上 2、6、30，支票最大 $15,000 → 出房產 30
    const { state, seen } = toSell(CHECKS3, undefined, 4, (s) => (s.players[3].id = BOT));
    expect(state.players[3].choice).toBe(30);
    const b = lastBoard(seen);
    expect(b.text).toContain('已選 1/4');
    expect(b.text).toContain('還沒選：<@p1> <@p2> <@p3>');
    expect(b.text).not.toContain('房產 30');
  });
});

describe('forsale/bots: 一個人也能玩完整局', () => {
  it('1 位真人 + 2 個 bot，真人不操作、每次都逾時，兩個階段跑完並送出 result；bot 不會收到私下訊息', () => {
    for (const seed of [1, 2, 3, 42, 2026]) {
      const r = seeded(seed);
      let { state, events } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state, r);
      const seen: GameEvent[] = [...events];
      for (let i = 0; i < 100 && state.phase !== 'ended'; i++) {
        ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state, r));
        seen.push(...events);
      }
      expect(state.phase).toBe('ended');
      expect(state.players.every((p) => p.props.length === 0)).toBe(true);
      expect(resultOf(seen)).toMatchObject({ players: state.players.map((p) => p.id) });
      expect(seen.filter((e) => e.type === 'ephemeral' && isBot(e.to))).toEqual([]);
      expect(boards(seen).some((b) => b.text.includes('<@p1> 放棄') && b.text.includes('逾時，自動放棄'))).toBe(true);
      expect(boards(seen).some((b) => b.text.includes('逾時，自動出最小'))).toBe(true);
    }
  });

  it('3 個 bot 輪流時，真人放棄後喊價會自己推進到下一輪', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 3 }, { type: 'start', user: 'p1' }], lobbyWith(1).state);
    // 起始玩家是最後一位 bot；桌上 3、4、5、6 落差小，bot 直接放棄，輪到真人
    expect(state).toMatchObject({ phase: 'bid', round: 1, turn: 0 });
    const after = run([pass(state, 'p1')], state).state;
    expect(after).toMatchObject({ phase: 'bid', round: 2, turn: 0 });
  });
});

describe('forsale/setup: 指令解析與按鈕（GameDef）', () => {
  it('大廳資訊：🏠 地產大亨、3～6 人、心理戰', () => {
    expect(forsale).toMatchObject({ kind: 'forsale', emoji: '🏠', name: '地產大亨', players: '3～6 人', category: 'bluff' });
    expect(forsale.desc).toBeTruthy();
    expect(forsale.apply).toBe(applyForSale);
  });

  it('指令解析：new、start、cancel、addbot、removebot', () => {
    expect(forsale.parse('new', 'u', 'C1')).toEqual({ type: 'new', user: 'u', channel: 'C1' });
    expect(forsale.parse('start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(forsale.parse('cancel', 'u', 'C1')).toEqual({ type: 'cancel', user: 'u' });
    expect(forsale.parse('addbot', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 1 });
    expect(forsale.parse('addbot 3', 'u', 'C1')).toEqual({ type: 'addBot', user: 'u', count: 3 });
    expect(forsale.parse('removebot 2', 'u', 'C1')).toEqual({ type: 'removeBot', user: 'u', count: 2 });
  });

  it('help 和不認識的子指令回傳 null（顯示說明），說明條列所有指令和遊戲中的按鈕', () => {
    expect(forsale.parse('help', 'u', 'C1')).toBeNull();
    expect(forsale.parse('buy', 'u', 'C1')).toBeNull();
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(forsale.help).toContain(`/game forsale ${cmd}`);
    for (const button of ['🔢 其他金額', '🙅 放棄', '🏠 選房產', '💰 我的狀態']) expect(forsale.help).toContain(button);
  });

  it('按鈕路由：join、leave、start、rematch 和每一種 forsale 按鈕', () => {
    expect(forsale.button('join', 'join', 'u', 'C1')).toEqual({ type: 'join', user: 'u' });
    expect(forsale.button('leave', 'leave', 'u', 'C1')).toEqual({ type: 'leave', user: 'u' });
    expect(forsale.button('start', 'start', 'u', 'C1')).toEqual({ type: 'start', user: 'u' });
    expect(forsale.button('rematch', 'rematch', 'u', 'C1')).toEqual({ type: 'rematch', user: 'u', channel: 'C1' });
    expect(forsale.button('forsale', 'bid:7:4', 'u', 'C1')).toEqual({ type: 'bid', user: 'u', seq: 7, amount: 4 });
    expect(forsale.button('forsale', 'bidMenu:7', 'u', 'C1')).toEqual({ type: 'bidMenu', user: 'u', seq: 7 });
    expect(forsale.button('forsale', 'pass:7', 'u', 'C1')).toEqual({ type: 'pass', user: 'u', seq: 7 });
    expect(forsale.button('forsale', 'sellMenu:7', 'u', 'C1')).toEqual({ type: 'sellMenu', user: 'u', seq: 7 });
    expect(forsale.button('forsale', 'sell:7:25', 'u', 'C1')).toEqual({ type: 'sell', user: 'u', seq: 7, prop: 25 });
    expect(forsale.button('forsale', 'status', 'u', 'C1')).toEqual({ type: 'status', user: 'u' });
    expect(forsale.button('forsale', 'dig:7', 'u', 'C1')).toBeNull();
    expect(forsale.button('incan', 'pass:7', 'u', 'C1')).toBeNull();
  });
});
