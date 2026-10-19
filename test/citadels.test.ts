import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyCitadels, type CAction, type CState } from '../src/citadels.js';
import type { Rank } from '../src/citadelsCards.js';

const rng = () => 0.99999; // 洗牌不動；王冠給最後一位

function run(actions: CAction[], start?: CState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyCitadels(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CAction),
  ]);
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);

const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const channelPrompts = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel');
const boards = (events: GameEvent[]) => channelPrompts(events).filter((p) => /^citadels:\d+$/.test(p.ref ?? ''));
const draftMsgs = (events: GameEvent[]) => channelPrompts(events).filter((p) => p.ref?.startsWith('citadels:draft:'));
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const labels = (events: GameEvent[], user: string) => menuOf(events, user)?.options.map((o) => o.label) ?? [];
const values = (events: GameEvent[], user: string) => menuOf(events, user)?.options.map((o) => o.value) ?? [];
const timers = (events: GameEvent[]) => events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[];
const fire = (s: CState, r: () => number = rng) => run([{ type: 'timeout', id: s.timers.phase! }], s, r);
const P = (s: CState, id: string) => s.players.find((p) => p.id === id)!;

// 自訂局面：n 人（p1…pn），chars[i] 是 p(i+1) 這輪的角色；直接跳到選角最後一位選完，開始叫號
type Setup = { gold?: number[]; hands?: string[][]; cities?: string[][]; faceUp?: Rank[]; deck?: string[]; crown?: number; round?: number; cityRound?: number };
function calling(chars: Rank[], o: Setup = {}, r: () => number = rng) {
  const n = chars.length;
  const s = structuredClone(started(n).state);
  s.players.forEach((p, i) => {
    p.gold = o.gold?.[i] ?? 2;
    p.hand = [...(o.hands?.[i] ?? [])];
    p.city = (o.cities?.[i] ?? []).map((card) => ({ card, round: o.cityRound ?? 1 }));
    p.char = i < n - 1 ? chars[i] : undefined;
  });
  if (o.deck) s.deck = [...o.deck];
  s.crown = o.crown ?? 0;
  s.round = o.round ?? 1;
  const faceUp = o.faceUp ?? [];
  const rest = ([1, 2, 3, 4, 5, 6, 7, 8] as Rank[]).filter((x) => !chars.includes(x) && !faceUp.includes(x));
  s.draft = { pool: [chars[n - 1], ...rest.slice(1)], faceUp, faceDown: rest[0], order: chars.map((_, i) => i), at: n - 1 };
  return run([{ type: 'pick', user: `p${n}`, rank: chars[n - 1] }], s, r);
}
// 目前回合的 seq
const seqOf = (s: CState) => s.seq;
// 讓目前的玩家拿金（收集資源）
const gatherGold = (s: CState) => run([{ type: 'gather', user: s.players[s.turn!.player].id, seq: s.seq, kind: 'gold' }], s);

describe('citadels/setup: 房間', () => {
  it('開房：公告標示富饒之城', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'citadels', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '富饒之城', players: ['A'] });
  });

  it('人數不足：至少 4 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')[0]).toContain('至少需要 4 人');
  });

  it('房間已滿：最多 7 人', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(7).state);
    expect(state.players).toHaveLength(7);
    expect(ephemeralTo(events, 'x')[0]).toContain('房間已滿');
  });

  it('加入與離開', () => {
    const joined = run([{ type: 'join', user: 'p2' }], lobbyWith(1).state);
    expect(joined.state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
    const left = run([{ type: 'leave', user: 'p2' }], joined.state);
    expect(left.state.players.map((p) => p.id)).toEqual(['p1']);
  });

  it('房主開始前離開：取消房間', () => {
    const { state, events } = run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
  });

  it('頻道已經有遊戲', () => {
    const { events } = run([{ type: 'new', user: 'Z', channel: 'C1' }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'Z')[0]).toBe('這個頻道已經有遊戲了。');
  });
});

describe('citadels/setup: 加入與移除 bot', () => {
  it('一個人加 3 個 bot 就能開始', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(4);
    expect(state.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    expect(run([{ type: 'start', user: 'p1' }], state).state.phase).toBe('draft');
  });

  it('加 bot 超過上限只加到 7 人', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(6).state);
    expect(state.players).toHaveLength(7);
    expect(ephemeralTo(events, 'p1')).toContain('房間已滿。');
  });

  it('非房主加 bot 被拒', () => {
    const { events } = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'p2')).toContain('只有房主可以加入 bot。');
  });

  it('開始後加 bot 被拒', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 1 }], started(4).state);
    expect(state.players).toHaveLength(4);
    expect(ephemeralTo(events, 'p1')).toContain('遊戲已經開始了。');
  });

  it('removebot 從最後加入的移除', () => {
    const withBots = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    const { state } = run([{ type: 'removeBot', user: 'p1', count: 1 }], withBots);
    expect(state.players.map((p) => p.id)).toEqual(withBots.players.slice(0, 2).map((p) => p.id));
  });
});

describe('citadels/setup: 開局', () => {
  it('每人 4 張、2 金；牌堆 50 張；王冠隨機；公告座位、王冠、勝利條件', () => {
    const { state, events } = started(4);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(4);
      expect(p.gold).toBe(2);
      expect(p.city).toEqual([]);
    }
    expect(state.deck).toHaveLength(50);
    expect(state.crown).toBe(3);
    expect(started(4, () => 0).state.crown).toBe(0);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> → <@p2> → <@p3> → <@p4>');
    expect(text).toContain('王冠：<@p4>');
    expect(text).toContain('建滿 8 棟');
    expect(text).toContain('🗡️ 刺客');
  });

  it('真人收到規則和手牌私訊，bot 不會；接著開始第 1 輪選角', () => {
    const withBot = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(3).state).state;
    const { state, events } = run([{ type: 'start', user: 'p1' }], withBot);
    const dms = events.filter((e) => e.type === 'dm') as { to: string; text: string }[];
    expect(dms.map((d) => d.to)).toEqual(['p1', 'p2', 'p3']);
    expect(dms[0].text).toContain('你的手牌');
    expect(state.round).toBe(1);
    expect(state.phase).toBe('draft');
  });
});

describe('citadels/setup: 我的狀態', () => {
  it('只給本人：手牌、金幣、角色、城市，紫卡附說明；不改 state、不重設計時器', () => {
    const s = structuredClone(started(4).state);
    Object.assign(s.players[0], { hand: ['library', 'castle'], city: [{ card: 'tavern', round: 1 }], gold: 5, char: 2 });
    const { state, events } = run([{ type: 'status', user: 'p1' }], s);
    expect(state).toBe(s);
    expect(timers(events)).toHaveLength(0);
    const text = ephemeralTo(events, 'p1')[0];
    expect(text).toContain('🟣 圖書館（6）');
    expect(text).toContain('抽牌時全部留下');
    expect(text).toContain('🟡 城堡（4）');
    expect(text).toContain('5 金');
    expect(text).toContain('🦹 盜賊');
    expect(text).toContain('🟢 酒館（1）');
    expect(events.every((e) => e.type === 'ephemeral' && e.to === 'p1')).toBe(true);
  });

  it('局外人被拒', () => {
    const { events } = run([{ type: 'status', user: 'Z' }], started(4).state);
    expect(ephemeralTo(events, 'Z')).toEqual(['你不在這局遊戲裡。']);
  });
});
