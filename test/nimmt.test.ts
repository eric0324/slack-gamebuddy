import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyNimmt, botCard, bullheads, cheapestRow, type NAction, type NState } from '../src/nimmt.js';

const rng = () => 0.99999; // 洗牌不動：牌組是 1～104 的順序

function run(actions: NAction[], start?: NState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyNimmt(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as NAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];

describe('nimmt/setup: 牌與牛頭數', () => {
  it('官方牛頭數', () => {
    expect([55, 44, 30, 25, 7].map(bullheads)).toEqual([7, 5, 3, 2, 1]);
    expect([11, 99, 10, 100, 5, 95, 104].map(bullheads)).toEqual([5, 5, 3, 3, 2, 2, 1]);
  });

  it('1～104 的牛頭總數是 171', () => {
    expect(Array.from({ length: 104 }, (_, i) => bullheads(i + 1)).reduce((a, b) => a + b, 0)).toBe(171);
  });
});

describe('nimmt/setup: 誰是牛頭王的房間', () => {
  it('開房：公告標示誰是牛頭王', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'nimmt', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '誰是牛頭王', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 2 人');
  });

  it('房間已滿（10 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(10).state);
    expect(state.players).toHaveLength(10);
    expect(ephemeralTo(events, 'x')?.text).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、房主取消、非房主不能開始', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    const left = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(left.state.phase).toBe('ended');
    expect(announces(left.events).join()).toContain('取消');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobby).events, 'p2')).toBeDefined();
  });
});

describe('nimmt/setup: bot', () => {
  it('addbot、removebot 從最後加入的移除', () => {
    const bots = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state).state;
    expect(bots.players).toHaveLength(4);
    expect(bots.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    const ids = bots.players.map((p) => p.id);
    expect(run([{ type: 'removeBot', user: 'p1', count: 2 }], bots).state.players.map((p) => p.id)).toEqual(ids.slice(0, 2));
  });

  it('超過 10 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 5 }], lobbyWith(8).state);
    expect(state.players).toHaveLength(10);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('非房主或開始後不能加減 bot', () => {
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state).events, 'p2')).toBeDefined();
    const s = started(2).state;
    expect(run([{ type: 'addBot', user: 'p1', count: 1 }], s).state.players).toHaveLength(2);
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], s).state.players).toHaveLength(2);
  });
});

describe('nimmt/setup: 發牌', () => {
  it('4 人：每人 10 張、4 列各 1 張，共 44 張不重複', () => {
    const { state } = started(4);
    expect(state.phase).toBe('pick');
    expect(state.players.every((p) => p.hand.length === 10)).toBe(true);
    expect(state.rows.map((r) => r.length)).toEqual([1, 1, 1, 1]);
    const all = [...state.players.flatMap((p) => p.hand), ...state.rows.flat()];
    expect(new Set(all).size).toBe(44);
    expect(all.every((c) => c >= 1 && c <= 104)).toBe(true);
  });

  it('私訊自己的手牌，頻道不洩漏手牌', () => {
    const { state, events } = started(2);
    for (const p of state.players) {
      const dm = events.find((e) => e.type === 'dm' && e.to === p.id) as { text: string };
      for (const c of p.hand) expect(dm.text).toContain(String(c));
    }
    const channel = [...announces(events), ...prompts(events).filter((p) => p.audience === 'channel').map((p) => p.text)].join('\n');
    // 手牌是 1～20，四列是 21～24
    expect(channel).toContain('21');
    for (const p of state.players) {
      expect(channel).not.toContain(p.hand.slice(0, 3).join(' '));
      expect(channel).not.toContain(p.hand.slice(0, 3).join('、'));
    }
  });
});

// 指定手牌和四列（seq 是 1，第 1 輪第 1 回合）
function table(n: number, hands: number[][], rows: number[][], bots = 0) {
  let lobby = lobbyWith(n - bots).state;
  if (bots) lobby = run([{ type: 'addBot', user: 'p1', count: bots }], lobby).state;
  const s = structuredClone(run([{ type: 'start', user: 'p1' }], lobby).state);
  s.players.forEach((p, i) => {
    p.hand = hands[i];
    p.pick = undefined;
  });
  s.rows = rows;
  return s;
}
const pick = (user: string, card: number, seq = 1): NAction => ({ type: 'pick', user, card, seq });
const timeoutOf = (s: NState): NAction => ({ type: 'timeout', id: s.timers.phase! });

describe('nimmt/rounds: 同時選牌', () => {
  it('按「🃏 選牌」只讓自己看到由小到大的手牌按鈕，每列 5 個，標示牛頭', () => {
    const s = table(2, [[55, 3, 10, 11, 25, 7, 8, 9, 1, 2], [40, 41, 42, 43, 44, 45, 46, 47, 48, 49]], [[60], [70], [80], [90]]);
    const { events } = run([{ type: 'hand', user: 'p1' }], s);
    const [menu] = prompts(events);
    expect(menu).toMatchObject({ audience: 'ephemeral', user: 'p1', perRow: 5 });
    expect(menu.options.map((o) => o.value)).toEqual([1, 2, 3, 7, 8, 9, 10, 11, 25, 55].map((c) => `pick:1:${c}`));
    expect(menu.options.at(-1)!.label).toContain('🐮7');
  });

  it('不在這局的人被拒', () => {
    const s = started(2).state;
    expect(ephemeralTo(run([{ type: 'hand', user: 'x' }], s).events, 'x')?.text).toContain('你不在這局遊戲中');
    expect(ephemeralTo(run([pick('x', 1)], s).events, 'x')?.text).toContain('你不在這局遊戲中');
  });

  it('選牌、改選、指令選牌（不帶 seq）', () => {
    const s = started(2).state;
    const a = run([pick('p1', 3)], s);
    expect(a.state.players[0].pick).toBe(3);
    expect(ephemeralTo(a.events, 'p1')?.text).toContain('你選了 3');
    expect(run([pick('p1', 7)], a.state).state.players[0].pick).toBe(7);
    expect(run([{ type: 'pick', user: 'p1', card: 5 }], s).state.players[0].pick).toBe(5);
  });

  it('不在手上的牌、上一回合的選單、選列中都被拒', () => {
    const s = started(2).state;
    expect(ephemeralTo(run([pick('p1', 50)], s).events, 'p1')?.text).toContain('手上沒有');
    const old = run([pick('p1', 3, 0)], s);
    expect(old.state.players[0].pick).toBeUndefined();
    expect(ephemeralTo(old.events, 'p1')?.text).toContain('🃏 選牌');
    const choosing = run([pick('p1', 1), pick('p2', 11)], s).state;
    expect(choosing.phase).toBe('chooseRow');
    expect(ephemeralTo(run([pick('p2', 12, 1)], choosing).events, 'p2')?.text).toContain('擺牌');
  });
});

describe('nimmt/rounds: 選牌進度', () => {
  it('第一次選好時用同一個 ref 更新「已選 N/M」和還沒選的人，不洩漏牌', () => {
    const s = table(3, [[77, 2], [5, 6], [8, 9]], [[1], [20], [30], [40]]);
    const first = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(prompts(first.events).find((p) => p.audience === 'channel')).toMatchObject({ ref: 'nimmt:1', text: expect.stringContaining('已選 0/3') });
    const a = run([pick('p1', 77)], s);
    const progress = prompts(a.events).find((p) => p.audience === 'channel')!;
    expect(progress.ref).toBe('nimmt:1');
    expect(progress.text).toContain('已選 1/3');
    expect(progress.text).toContain('<@p2>');
    expect(progress.text).toContain('<@p3>');
    expect(progress.text.split('還沒選')[1]).not.toContain('<@p1>');
    expect(progress.text).not.toContain('77');
    expect(prompts(run([pick('p1', 2)], a.state).events)).toHaveLength(0);
  });

  it('揭曉時選牌訊息拿掉按鈕', () => {
    const s = table(2, [[41, 42], [51, 52]], [[40], [50], [60], [70]]);
    const { events } = run([pick('p1', 41), pick('p2', 51)], s);
    expect(prompts(events)).toContainEqual(expect.objectContaining({ ref: 'nimmt:1', options: [] }));
  });

  it('bot 在回合開始就選好，算在已選裡', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state);
    expect(state.players.filter((p) => isBot(p.id)).every((p) => p.pick !== undefined)).toBe(true);
    expect(prompts(events).find((p) => p.audience === 'channel')!.text).toContain('已選 2/3');
  });
});

describe('nimmt/rounds: 揭曉與超時', () => {
  it('全部選好立刻揭曉，進入下一回合', () => {
    const s = table(2, [[41, 42], [51, 52]], [[40], [50], [60], [70]]);
    const { state, events } = run([pick('p1', 41), pick('p2', 51)], s);
    expect(announces(events).join('\n')).toMatch(/<@p1> 41.*<@p2> 51/s);
    expect(state.players.map((p) => p.hand)).toEqual([[42], [52]]);
    expect(state).toMatchObject({ phase: 'pick', turn: 2, seq: 2 });
  });

  it('2 分鐘到了沒選的人自動出最小的牌，舊計時器被忽略', () => {
    const s = table(2, [[41, 42], [53, 51]], [[40], [50], [60], [70]]);
    const a = run([pick('p1', 42)], s);
    expect(run([{ type: 'timeout', id: a.state.timers.phase! - 1 }], a.state).state.turn).toBe(1);
    const { state, events } = run([timeoutOf(a.state)], a.state);
    expect(state.rows[1]).toEqual([50, 51]);
    expect(announces(events).join('\n')).toContain('<@p2> 51（超時自動出牌）');
  });
});

describe('nimmt/rounds: 擺牌與收列', () => {
  it('接在列尾比它小、差距最小的那一列', () => {
    const s = table(2, [[40, 1], [95, 2]], [[12], [35], [48], [90]]);
    const { state } = run([pick('p1', 40), pick('p2', 95)], s);
    expect(state.rows).toEqual([[12], [35, 40], [48], [90, 95]]);
  });

  it('依牌號由小到大擺', () => {
    const s = table(2, [[50, 1], [41, 2]], [[40], [60], [70], [80]]);
    expect(run([pick('p1', 50), pick('p2', 41)], s).state.rows[0]).toEqual([40, 41, 50]);
  });

  it('第 6 張收走前 5 張並計牛頭', () => {
    const s = table(2, [[45, 1], [99, 2]], [[10, 20, 30, 35, 40], [60], [70], [80]]);
    const { state, events } = run([pick('p1', 45), pick('p2', 99)], s);
    expect(state.rows[0]).toEqual([45]);
    expect(state.players[0]).toMatchObject({ total: 14, roundHeads: 14 });
    expect(announces(events).join('\n')).toContain('收走第 1 列');
  });
});

describe('nimmt/rounds: 選一列收走', () => {
  const s = table(2, [[3, 1], [50, 2]], [[10], [20, 25], [30], [40]]);

  it('暫停擺牌，公告 4 個按鈕，只有出牌的人能選', () => {
    const { state, events } = run([pick('p1', 3), pick('p2', 50)], s);
    expect(state.phase).toBe('chooseRow');
    const menu = prompts(events).find((p) => p.options.length === 4)!;
    expect(menu.audience).toBe('channel');
    expect(menu.options.map((o) => o.value)).toEqual(['row:1:0', 'row:1:1', 'row:1:2', 'row:1:3']);
    expect(events).toContainEqual({ type: 'startTimer', id: state.timers.phase, ms: 60_000 });
    const other = run([{ type: 'row', user: 'p2', row: 0, seq: 1 }], state);
    expect(ephemeralTo(other.events, 'p2')?.text).toContain('現在是 <@p1> 在選列');
  });

  it('選列後收走那一列，繼續擺其他牌', () => {
    const choosing = run([pick('p1', 3), pick('p2', 50)], s).state;
    const { state } = run([{ type: 'row', user: 'p1', row: 1, seq: 1 }], choosing);
    expect(state.rows).toEqual([[10], [3], [30], [40, 50]]);
    expect(state.players[0].total).toBe(5);
    expect(state).toMatchObject({ phase: 'pick', turn: 2 });
  });

  it('60 秒沒選，自動選牛頭最少（同分列號最小）的列', () => {
    const t = table(2, [[3, 1], [60, 2]], [[11], [12, 13], [55], [16, 17]]);
    const choosing = run([pick('p1', 3), pick('p2', 60)], t).state;
    const { state } = run([timeoutOf(choosing)], choosing);
    expect(state.rows[1]).toEqual([3]);
    expect(state.players[0].total).toBe(2);
  });

  it('超時自動出的牌和 bot 直接自動選列，不暫停', () => {
    const auto = run([pick('p2', 50)], s);
    expect(run([timeoutOf(auto.state)], auto.state).state).toMatchObject({ phase: 'pick', turn: 2 });
    const b = table(2, [[50, 1], [3, 2]], [[10], [20, 25], [30], [40]], 1);
    b.players[1].pick = 3;
    const { state } = run([pick('p1', 50)], b);
    expect(state).toMatchObject({ phase: 'pick', turn: 2 });
    expect(state.rows[0]).toEqual([3]);
  });
});

describe('nimmt/rounds: 牌桌與分數顯示', () => {
  it('擺完公告四列的牌、每列牛頭和每人累積', () => {
    const s = table(2, [[41, 1], [51, 2]], [[40], [50], [60], [70]]);
    const text = announces(run([pick('p1', 41), pick('p2', 51)], s).events).join('\n');
    expect(text).toContain('第 1 列：40 41（🐮4）');
    expect(text).toContain('累積');
  });
});

describe('nimmt/rounds: 輪與勝負', () => {
  const last = (totals: number[]) => {
    const s = table(totals.length, totals.map((_, i) => [41 + i]), [[40], [60], [70], [80]]);
    s.turn = 10;
    s.players.forEach((p, i) => (p.total = totals[i]));
    return s;
  };
  const playAll = (s: NState) => run(s.players.map((p) => pick(p.id, p.hand[0])), s);

  it('10 回合一輪，沒人到 66 就開下一輪', () => {
    let s = started(2).state;
    for (let i = 0; i < 10; i++) s = run([timeoutOf(s)], s).state;
    expect(s).toMatchObject({ round: 2, turn: 1, phase: 'pick' });
    expect(s.players.every((p) => p.hand.length === 10)).toBe(true);
  });

  it('輪結束公告這輪和累積牛頭', () => {
    const { events } = playAll(last([10, 20]));
    expect(announces(events).join('\n')).toContain('第 1 輪結束');
  });

  it('有人到 66 結束，最少者勝，公告排名和再來一局', () => {
    const { state, events } = playAll(last([70, 21, 35]));
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['p2']);
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: ['p2'] });
    const text = announces(events).at(-1)!;
    expect(text.indexOf('<@p2>')).toBeLessThan(text.indexOf('<@p3>'));
    expect(text.indexOf('<@p3>')).toBeLessThan(text.indexOf('<@p1>'));
    expect(prompts(events)).toContainEqual(expect.objectContaining({ kind: 'rematch' }));
    expect(run([{ type: 'rematch', user: 'p3', channel: 'C1' }], state).state).toMatchObject({ phase: 'lobby', host: 'p3' });
  });

  it('同分並列獲勝', () => {
    expect(playAll(last([70, 21, 21])).state.winners).toEqual(['p2', 'p3']);
  });

  it('取消後沒有再來一局', () => {
    const s = run([{ type: 'cancel', user: 'p1' }], started(2).state).state;
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], s).events).toHaveLength(0);
  });
});

describe('nimmt/rounds: bot', () => {
  it('避開第 6 張', () => {
    expect(botCard([41, 60], [[3, 7, 20, 33, 40], [55], [70], [80]])).toBe(60);
  });

  it('避開比所有列尾都小的牌；同風險出最小的', () => {
    expect(botCard([5, 45], [[10], [20], [30], [40]])).toBe(45);
    expect(botCard([42, 41], [[40], [50], [60], [70]])).toBe(41);
  });

  it('選牛頭最少的列，同分列號最小', () => {
    expect(cheapestRow([[11], [12, 13], [55], [16, 17]])).toBe(1);
  });

  it('1 位真人加 2 個 bot，真人不操作也會結束', () => {
    const lobby = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    let s = run([{ type: 'start', user: 'p1' }], lobby).state;
    for (let i = 0; i < 2000 && s.phase !== 'ended'; i++) s = run([timeoutOf(s)], s).state;
    expect(s.phase).toBe('ended');
    expect(s.players.some((p) => p.total >= 66)).toBe(true);
  });
});
