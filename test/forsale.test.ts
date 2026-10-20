import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyForSale, CHECKS, money, PROPERTIES, type FAction, type FState } from '../src/forsale.js';

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
    expect(text).toContain('🏠 3、🏠 17、🏠 25');
    expect(text).toContain('$9,000、$4,000');
    expect(text).toContain('總額 $13,000');
  });

  it('局外人被拒', () => {
    const { events } = run([{ type: 'status', user: 'x' }], started(4).state);
    expect(ephemeralTo(events, 'x')?.text).toContain('你不在這局遊戲中');
  });
});
