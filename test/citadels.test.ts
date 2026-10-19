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

// 依目前的選角順序替每個人選角（ranks 依序）
function pickAll(s: CState, ranks: Rank[]) {
  let state = s;
  for (const rank of ranks) state = run([{ type: 'pick', user: state.players[state.draft!.order[state.draft!.at]].id, rank }], state).state;
  return state;
}
const roundAnnounce = (events: GameEvent[]) => announces(events).find((t) => t.includes('輪開始'))!;

describe('citadels/draft: 選角前的棄牌', () => {
  it('4 人：1 張面朝下、2 張面朝上，剩 5 張；公告面朝上的、不公開面朝下的', () => {
    const { state, events } = started(4);
    expect(state.draft).toMatchObject({ faceDown: 1, faceUp: [2, 3], pool: [4, 5, 6, 7, 8] });
    const text = roundAnnounce(events);
    expect(text).toContain('第 1 輪開始');
    expect(text).toContain('🦹 盜賊');
    expect(text).toContain('🔮 魔術師');
    expect(text).not.toContain('刺客');
    expect(text).toContain('<@p4> → <@p1> → <@p2> → <@p3>');
  });

  it('5 人：1 下 1 上，剩 6 張', () => {
    const { state } = started(5);
    expect(state.draft!.faceUp).toHaveLength(1);
    expect(state.draft!.pool).toHaveLength(6);
  });

  it('6 人和 7 人：只有 1 張面朝下，剩 7 張', () => {
    for (const n of [6, 7]) {
      const { state } = started(n);
      expect(state.draft!.faceUp).toEqual([]);
      expect(state.draft!.pool).toHaveLength(7);
    }
  });

  it('國王不會面朝上棄掉：改棄另一張', () => {
    const { state } = started(4, () => 0); // 角色洗成 2,3,4,5,…：面朝下 2，面朝上翻到 3、4（國王）→ 改棄 5
    expect(state.draft!.faceUp).toEqual([3, 5]);
    expect(state.draft!.pool).toContain(4);
  });
});

describe('citadels/draft: 祕密選角', () => {
  it('選角訊息：提及輪到的人、已選 0/4、附「🎭 選角色」，45 秒', () => {
    const { events } = started(4);
    const msg = draftMsgs(events).at(-1)!;
    expect(msg.ref).toBe('citadels:draft:1');
    expect(msg.text).toContain('<@p4>');
    expect(msg.text).toContain('已選 0/4');
    expect(msg.options).toEqual([{ value: 'pickMenu', label: '🎭 選角色' }]);
    expect(timers(events).at(-1)!.ms).toBe(45_000);
  });

  it('輪到的人打開選單：只列剩下的角色和面朝上的棄牌；不改 state', () => {
    const s = started(4).state;
    const { state, events } = run([{ type: 'pickMenu', user: 'p4' }], s);
    expect(state).toBe(s);
    expect(values(events, 'p4')).toEqual(['pick:4', 'pick:5', 'pick:6', 'pick:7', 'pick:8']);
    expect(menuOf(events, 'p4')!.text).toContain('面朝上棄掉：🦹 盜賊、🔮 魔術師');
  });

  it('還沒輪到你', () => {
    const s = started(4).state;
    const menu = run([{ type: 'pickMenu', user: 'p1' }], s);
    expect(ephemeralTo(menu.events, 'p1')).toEqual(['還沒輪到你。']);
    const pick = run([{ type: 'pick', user: 'p1', rank: 4 }], s);
    expect(pick.state).toBe(s);
    expect(ephemeralTo(pick.events, 'p1')).toEqual(['還沒輪到你。']);
    expect(ephemeralTo(run([{ type: 'pickMenu', user: 'Z' }], s).events, 'Z')).toEqual(['你不在這局遊戲裡。']);
  });

  it('選角：只讓本人知道，訊息更新已選 1/4 並提及下一位；選過的不能再選', () => {
    const { state, events } = run([{ type: 'pick', user: 'p4', rank: 7 }], started(4).state);
    expect(P(state, 'p4').char).toBe(7);
    expect(ephemeralTo(events, 'p4')).toEqual(['你選了 📐 建築師。']);
    expect(announces(events).join()).not.toContain('建築師');
    const msg = draftMsgs(events).at(-1)!;
    expect(msg.ref).toBe('citadels:draft:1');
    expect(msg.text).toContain('已選 1/4');
    expect(msg.text).toContain('<@p1>');
    expect(msg.text).not.toContain('建築師');
    expect(values(run([{ type: 'pickMenu', user: 'p1' }], state).events, 'p1')).not.toContain('pick:7');
    const again = run([{ type: 'pick', user: 'p1', rank: 7 }], state);
    expect(again.state).toBe(state);
  });

  it('45 秒逾時：隨機選一張，只告訴本人，輪到下一位；舊計時器被忽略', () => {
    const s = started(4).state;
    const { state, events } = fire(s);
    expect(P(state, 'p4').char).toBe(8);
    expect(ephemeralTo(events, 'p4')[0]).toContain('⚔️ 軍閥');
    expect(state.draft!.at).toBe(1);
    const stale = run([{ type: 'timeout', id: s.timers.phase! }], state);
    expect(stale.state).toBe(state);
  });

  it('最後一位選完：剩下的面朝下棄掉，選角訊息改成選角完成', () => {
    const s = pickAll(started(4).state, [4, 5, 6]);
    const { state, events } = run([{ type: 'pick', user: 'p3', rank: 8 }], s);
    expect(state.players.map((p) => p.char)).toEqual([5, 6, 8, 4]);
    expect(state.phase).not.toBe('draft');
    const msg = draftMsgs(events).find((m) => m.text.includes('選角完成'))!;
    expect(msg.ref).toBe('citadels:draft:1');
    expect(msg.options).toEqual([]);
  });
});

describe('citadels/draft: 7 人局的最後一位', () => {
  const lastOf7 = () => pickAll(started(7).state, [2, 4, 5, 6, 7, 8]); // 剩魔術師，面朝下是刺客

  it('選單有剩下的那張和面朝下的棄牌，二選一；另一張不公開', () => {
    const s = lastOf7();
    expect(s.draft!.order[s.draft!.at]).toBe(5);
    const { events } = run([{ type: 'pickMenu', user: 'p6' }], s);
    expect(labels(events, 'p6')).toEqual(['🔮 魔術師', '🗡️ 刺客（面朝下的棄牌）']);
    const picked = run([{ type: 'pick', user: 'p6', rank: 1 }], s);
    expect(P(picked.state, 'p6').char).toBe(1);
    expect(picked.state.players.some((p) => p.char === 3)).toBe(false);
    expect(announces(picked.events).join()).not.toContain('魔術師');
  });

  it('逾時從兩張隨機選', () => {
    const { state } = fire(lastOf7());
    expect(P(state, 'p6').char).toBe(1);
  });
});

const cur = (s: CState) => s.players[s.turn!.player].id;
// 目前的玩家拿金後結束回合
const passTurn = (s: CState) => run([{ type: 'gather', user: cur(s), seq: s.seq, kind: 'gold' }, { type: 'end', user: cur(s), seq: s.seq }], s);
// 一直結束別人的回合，直到輪到 id
function until(s: CState, id: string) {
  while (cur(s) !== id) s = passTurn(s).state;
  return s;
}
const STALE = '這個選單已經過期，請重新按「🏰 我的回合」。';

describe('citadels/turns: 叫號', () => {
  it('依編號叫號：A 2 號、B 4 號、C 6 號、D 7 號，依序行動，跳過的附註在下一則牌桌訊息', () => {
    const first = calling([2, 4, 6, 7]);
    expect(first.state.phase).toBe('turn');
    expect(cur(first.state)).toBe('p1');
    expect(announces(first.events).join('\n')).toContain('2 號 🦹 盜賊 是 <@p1>');
    const board = boards(first.events).at(-1)!;
    expect(board.ref).toBe(`citadels:${first.state.seq}`);
    expect(board.text).toContain('第 1 輪');
    expect(board.text).toContain('🦹 盜賊 <@p1>');
    expect(board.text).toContain('沒有人是 1 號 🗡️ 刺客');
    expect(board.options).toEqual([
      { value: `turnMenu:${first.state.seq}`, label: '🏰 我的回合' },
      { value: 'status', label: '📜 我的狀態' },
    ]);
    expect(timers(first.events).at(-1)!.ms).toBe(90_000);
    const order = [cur(first.state)];
    let s = first.state;
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = passTurn(s);
      s = next.state;
      order.push(cur(s));
      texts.push(boards(next.events).at(-1)!.text);
    }
    expect(order).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(texts[0]).toContain('沒有人是 3 號 🔮 魔術師');
    expect(texts[1]).toContain('沒有人是 5 號 ⛪ 主教');
    expect(texts[2]).not.toContain('沒有人是');
  });

  it('牌桌訊息：王冠、已翻開的角色、每人金幣手牌城市，不透露手牌內容', () => {
    const { events } = calling([2, 4, 6, 7], { hands: [['castle'], [], [], []], cities: [[], ['tavern'], [], []], crown: 1 });
    const text = boards(events).at(-1)!.text;
    expect(text).toContain('👑 王冠：<@p2>');
    expect(text).toContain('<@p1>：💰 2 金｜🃏 1 張｜🏘️ 0 棟');
    expect(text).toContain('<@p2>：💰 2 金｜🃏 0 張｜🏘️ 1 棟：🟢 酒館（1）');
    expect(text).not.toContain('城堡');
    expect(text).not.toMatch(/國王|商人|建築師/);
  });

  it('回合結束：牌桌訊息改成回合結束、沒有按鈕，下一則用新的 ref', () => {
    const s = gatherGold(calling([2, 4, 6, 7]).state).state;
    const { state, events } = run([{ type: 'end', user: 'p1', seq: s.seq }], s);
    const old = boards(events).find((b) => b.ref === `citadels:${s.seq}`)!;
    expect(old.text).toContain('回合結束');
    expect(old.options).toEqual([]);
    expect(boards(events).at(-1)!.ref).toBe(`citadels:${state.seq}`);
    expect(state.seq).toBe(s.seq + 1);
  });
});

describe('citadels/turns: 回合選單', () => {
  it('回合一開始只有拿金和抽牌；不改 state、不重設計時器', () => {
    const s = calling([2, 4, 6, 7]).state;
    const { state, events } = run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s);
    expect(state).toBe(s);
    expect(timers(events)).toHaveLength(0);
    expect(labels(events, 'p1')).toEqual(['💰 拿 2 金', '🃏 抽牌']);
    expect(values(events, 'p1')).toEqual([`gather:${s.seq}:gold`, `gather:${s.seq}:draw`]);
  });

  it('收集之後：建造、收稅、結束回合', () => {
    const s = gatherGold(calling([4, 5, 6, 7], { hands: [['tavern'], [], [], []] }).state).state;
    const { events } = run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s);
    expect(labels(events, 'p1')).toEqual(['🔨 建造', '💰 收稅', '✅ 結束回合']);
  });

  it('不是輪到的人被拒；過期選單被拒', () => {
    const s = calling([2, 4, 6, 7]).state;
    expect(ephemeralTo(run([{ type: 'turnMenu', user: 'p2', seq: s.seq }], s).events, 'p2')).toEqual(['還沒輪到你。']);
    expect(ephemeralTo(run([{ type: 'turnMenu', user: 'Z', seq: s.seq }], s).events, 'Z')).toEqual(['你不在這局遊戲裡。']);
    const stale = run([{ type: 'gather', user: 'p1', seq: s.seq - 1, kind: 'gold' }], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1')).toEqual([STALE]);
    const twice = run([{ type: 'gather', user: 'p1', seq: s.seq, kind: 'gold' }], gatherGold(s).state);
    expect(ephemeralTo(twice.events, 'p1')).toEqual([STALE]);
  });

  it('收集之前不能建造或結束回合', () => {
    const s = calling([2, 4, 6, 7], { hands: [['tavern'], [], [], []] }).state;
    expect(run([{ type: 'build', user: 'p1', seq: s.seq, card: 'tavern' }], s).state).toBe(s);
    expect(run([{ type: 'end', user: 'p1', seq: s.seq }], s).state).toBe(s);
  });

  it('上一個回合的選單按建造被拒', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { hands: [['tavern'], ['tavern'], [], []] }).state).state;
    const next = run([{ type: 'end', user: 'p1', seq: s.seq }], s).state;
    const nextGathered = gatherGold(next).state;
    const { state, events } = run([{ type: 'build', user: 'p2', seq: s.seq, card: 'tavern' }], nextGathered);
    expect(state).toBe(nextGathered);
    expect(ephemeralTo(events, 'p2')).toEqual([STALE]);
  });
});

describe('citadels/turns: 收集資源', () => {
  it('拿 2 金', () => {
    const s = calling([2, 4, 6, 7], { gold: [1, 2, 2, 2] }).state;
    const { state, events } = run([{ type: 'gather', user: 'p1', seq: s.seq, kind: 'gold' }], s);
    expect(P(state, 'p1').gold).toBe(3);
    expect(announces(events).join()).toContain('<@p1> 拿了 2 金');
    expect(boards(events).at(-1)!.ref).toBe(`citadels:${s.seq}`);
  });

  it('抽 2 留 1：另一張放到牌堆底，頻道只公告抽了牌', () => {
    const s = calling([2, 4, 6, 7], { deck: ['castle', 'tavern', 'manor'] }).state;
    const drew = run([{ type: 'gather', user: 'p1', seq: s.seq, kind: 'draw' }], s);
    expect(announces(drew.events).join()).toContain('<@p1> 抽了牌');
    expect(announces(drew.events).join()).not.toMatch(/城堡|酒館/);
    expect(values(drew.events, 'p1')).toEqual([`keep:${s.seq}:castle`, `keep:${s.seq}:tavern`]);
    expect(labels(drew.events, 'p1')).toEqual(['🟡 城堡（4）', '🟢 酒館（1）']);
    const { state } = run([{ type: 'keep', user: 'p1', seq: s.seq, card: 'castle' }], drew.state);
    expect(P(state, 'p1').hand).toEqual(['castle']);
    expect(state.deck).toEqual(['manor', 'tavern']);
    expect(state.turn!.gathered).toBe(true);
  });

  it('牌堆不夠：能抽幾張算幾張', () => {
    const one = calling([2, 4, 6, 7], { deck: ['castle'] }).state;
    const a = run([{ type: 'gather', user: 'p1', seq: one.seq, kind: 'draw' }], one).state;
    expect(P(a, 'p1').hand).toEqual(['castle']);
    expect(a.turn!.gathered).toBe(true);
    const none = calling([2, 4, 6, 7], { deck: [] }).state;
    const b = run([{ type: 'gather', user: 'p1', seq: none.seq, kind: 'draw' }], none).state;
    expect(P(b, 'p1').hand).toEqual([]);
    expect(b.turn!.gathered).toBe(true);
  });
});

describe('citadels/turns: 建造', () => {
  it('付費建造，公告並更新同一則牌桌訊息', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { hands: [['castle', 'tavern'], [], [], []] }).state).state;
    const list = run([{ type: 'turnMenu', user: 'p1', seq: s.seq, sub: 'build' }], s);
    expect(list.state).toBe(s);
    expect(values(list.events, 'p1')).toEqual([`build:${s.seq}:castle`, `build:${s.seq}:tavern`]);
    const { state, events } = run([{ type: 'build', user: 'p1', seq: s.seq, card: 'castle' }], s);
    expect(P(state, 'p1').gold).toBe(0);
    expect(P(state, 'p1').hand).toEqual(['tavern']);
    expect(P(state, 'p1').city.map((x) => x.card)).toEqual(['castle']);
    expect(announces(events).join()).toContain('<@p1> 建了 🟡 城堡（4）');
    expect(boards(events).map((b) => b.ref)).toEqual([`citadels:${s.seq}`]);
    expect(boards(events)[0].text).toContain('🏘️ 1 棟：🟡 城堡（4）');
  });

  it('金幣不夠：選單沒有建造', () => {
    const s = calling([2, 4, 6, 7], { hands: [['palace'], [], [], []], gold: [0, 2, 2, 2] }).state;
    const { events } = run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], gatherGold(s).state);
    expect(labels(events, 'p1')).not.toContain('🔨 建造');
  });

  it('不能蓋同名建築', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { hands: [['market', 'tavern'], [], [], []], cities: [['market'], [], [], []] }).state).state;
    const list = run([{ type: 'turnMenu', user: 'p1', seq: s.seq, sub: 'build' }], s);
    expect(values(list.events, 'p1')).toEqual([`build:${s.seq}:tavern`]);
    expect(run([{ type: 'build', user: 'p1', seq: s.seq, card: 'market' }], s).state).toBe(s);
  });

  it('一回合只能建一棟', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { hands: [['temple', 'tavern'], [], [], []], gold: [5, 2, 2, 2] }).state).state;
    const built = run([{ type: 'build', user: 'p1', seq: s.seq, card: 'temple' }], s).state;
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], built).events, 'p1')).not.toContain('🔨 建造');
    const again = run([{ type: 'build', user: 'p1', seq: s.seq, card: 'tavern' }], built);
    expect(again.state).toBe(built);
    expect(ephemeralTo(again.events, 'p1')).toEqual([STALE]);
  });
});

describe('citadels/turns: 收稅', () => {
  it('主教建造後收稅：每棟宗教 1 金，一回合一次', () => {
    const s = gatherGold(calling([5, 6, 7, 8], { hands: [['church'], [], [], []], cities: [['temple', 'castle'], [], [], []], gold: [0, 2, 2, 2] }).state).state;
    const built = run([{ type: 'build', user: 'p1', seq: s.seq, card: 'church' }], s).state;
    const { state, events } = run([{ type: 'tax', user: 'p1', seq: s.seq }], built);
    expect(P(state, 'p1').gold).toBe(2);
    expect(announces(events).join()).toContain('<@p1> 收稅 2 金');
    expect(run([{ type: 'tax', user: 'p1', seq: s.seq }], state).state).toBe(state);
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], state).events, 'p1')).not.toContain('💰 收稅');
  });

  it('四個收稅角色各收自己的顏色', () => {
    const city = ['manor', 'castle', 'temple', 'tavern', 'market', 'docks', 'prison'];
    const taxOf = (rank: Rank) => {
      const others = ([1, 2, 3, 7] as Rank[]).slice(0, 3);
      const s = gatherGold(until(calling([rank, ...others], { cities: [city, [], [], []], gold: [0, 0, 0, 0] }).state, 'p1')).state;
      return P(run([{ type: 'tax', user: 'p1', seq: s.seq }], s).state, 'p1').gold - P(s, 'p1').gold;
    };
    expect([taxOf(4), taxOf(5), taxOf(6), taxOf(8)]).toEqual([2, 1, 3, 1]);
  });

  it('不是收稅角色沒有收稅按鈕', () => {
    const s = gatherGold(calling([2, 4, 6, 7]).state).state;
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s).events, 'p1')).not.toContain('💰 收稅');
    expect(run([{ type: 'tax', user: 'p1', seq: s.seq }], s).state).toBe(s);
  });

  it('忘了收稅：結束回合時自動收並公告', () => {
    const s = gatherGold(calling([4, 5, 6, 7], { cities: [['manor', 'castle'], [], [], []], gold: [0, 2, 2, 2] }).state).state;
    const { state, events } = run([{ type: 'end', user: 'p1', seq: s.seq }], s);
    expect(P(state, 'p1').gold).toBe(4);
    expect(announces(events).join()).toContain('<@p1> 收稅 2 金');
  });
});

describe('citadels/turns: 回合計時', () => {
  it('90 秒逾時：自動拿 2 金、自動收稅、不建造，結束回合並公告時間到', () => {
    const s = calling([4, 5, 6, 7], { cities: [['manor'], [], [], []], hands: [['tavern'], [], [], []], gold: [0, 2, 2, 2] }).state;
    const { state, events } = fire(s);
    expect(P(state, 'p1').gold).toBe(3);
    expect(P(state, 'p1').hand).toEqual(['tavern']);
    expect(announces(events).join()).toContain('時間到');
    expect(cur(state)).toBe('p2');
  });

  it('選牌時逾時：留第一張，另一張放到牌堆底', () => {
    const s = calling([2, 4, 6, 7], { deck: ['castle', 'tavern', 'manor'] }).state;
    const drew = run([{ type: 'gather', user: 'p1', seq: s.seq, kind: 'draw' }], s).state;
    const { state } = fire(drew);
    expect(P(state, 'p1').hand).toEqual(['castle']);
    expect(state.deck).toEqual(['manor', 'tavern']);
    expect(cur(state)).toBe('p2');
  });

  it('按結束回合立刻結束；舊計時器被忽略', () => {
    const s = gatherGold(calling([2, 4, 6, 7]).state).state;
    const { state } = run([{ type: 'end', user: 'p1', seq: s.seq }], s);
    expect(cur(state)).toBe('p2');
    expect(run([{ type: 'timeout', id: s.timers.phase! }], state).state).toBe(state);
  });
});

// 目前的玩家拿金，然後做 actions
const act = (s: CState, actions: CAction[]) => run(actions, gatherGold(s).state);
const sub = (s: CState, user: string, which: Extract<CAction, { type: 'turnMenu' }>['sub']) => run([{ type: 'turnMenu', user, seq: s.seq, sub: which }], s);
// 把整輪打完（每個人拿金後結束），回傳每一步的公告
function finishRound(s: CState) {
  const all: string[] = [];
  const round = s.round;
  while (s.round === round && s.phase === 'turn') {
    const next = passTurn(s);
    s = next.state;
    all.push(...announces(next.events));
  }
  return { state: s, texts: all };
}

describe('citadels/turns: 刺客', () => {
  it('目標清單排除 1 號和面朝上的角色；刺殺公告不公開是誰；被殺的角色跳過', () => {
    const s = gatherGold(calling([1, 2, 6, 7], { faceUp: [3, 5] }).state).state;
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s).events, 'p1')).toContain('🗡️ 刺殺');
    expect(values(sub(s, 'p1', 'kill').events, 'p1')).toEqual([2, 4, 6, 7, 8].map((r) => `kill:${s.seq}:${r}`));
    const killed = run([{ type: 'kill', user: 'p1', seq: s.seq, rank: 7 }], s);
    expect(announces(killed.events).join()).toContain('刺殺了 7 號 📐 建築師');
    expect(announces(killed.events).join()).not.toContain('<@p4>');
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], killed.state).events, 'p1')).not.toContain('🗡️ 刺殺');
    const ended = run([{ type: 'end', user: 'p1', seq: s.seq }], killed.state).state;
    const { state, texts } = finishRound(ended);
    const skip = texts.find((t) => t.includes('被刺殺了'))!;
    expect(skip).toContain('7 號 📐 建築師 被刺殺了，跳過');
    expect(skip).not.toContain('<@p4>');
    expect(texts.join()).not.toContain('📐 建築師 是 <@p4>');
    expect(state.round).toBe(2);
  });
});

describe('citadels/turns: 盜賊', () => {
  it('翻開時在收集前拿走全部金幣，公告偷了多少', () => {
    const s = calling([2, 4, 6, 7], { gold: [2, 2, 5, 2] }).state;
    const robbed = act(s, [{ type: 'rob', user: 'p1', seq: s.seq, rank: 6 }]);
    expect(announces(robbed.events).join()).toContain('要偷 6 號 💰 商人');
    const p2 = run([{ type: 'end', user: 'p1', seq: s.seq }], robbed.state).state;
    const { state, events } = passTurn(p2);
    expect(cur(state)).toBe('p3');
    expect(P(state, 'p3').gold).toBe(0);
    expect(P(state, 'p1').gold).toBe(9);
    expect(announces(events).join()).toMatch(/偷走了 <@p3> 的 5 金/);
    expect(state.turn!.gathered).toBe(false);
  });

  it('偷到沒人拿的角色：沒有人被偷', () => {
    const s = calling([2, 4, 6, 7], { gold: [2, 3, 3, 3] }).state;
    const robbed = act(s, [{ type: 'rob', user: 'p1', seq: s.seq, rank: 5 }, { type: 'end', user: 'p1', seq: s.seq }]).state;
    const { texts } = finishRound(robbed);
    expect(texts.join()).not.toContain('偷走了');
  });

  it('不能偷 1、2 號、面朝上和被刺殺的角色', () => {
    const s = calling([1, 2, 6, 7], { faceUp: [3, 8] }).state;
    const killed = act(s, [{ type: 'kill', user: 'p1', seq: s.seq, rank: 5 }, { type: 'end', user: 'p1', seq: s.seq }]).state;
    const thief = gatherGold(killed).state;
    expect(values(sub(thief, 'p2', 'rob').events, 'p2')).toEqual([4, 6, 7].map((r) => `rob:${thief.seq}:${r}`));
    expect(run([{ type: 'rob', user: 'p2', seq: thief.seq, rank: 5 }], thief).state).toBe(thief);
  });
});

describe('citadels/turns: 魔術師', () => {
  it('換手牌：全部交換，頻道只公告張數，新手牌只讓兩人看到', () => {
    const hands = [['tavern'], ['castle', 'manor', 'palace', 'temple', 'church'], [], []];
    const s = gatherGold(calling([3, 4, 6, 7], { hands }).state).state;
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], s).events, 'p1')).toEqual(['🔄 換手牌', '♻️ 棄牌重抽', '🔨 建造', '✅ 結束回合']);
    expect(values(sub(s, 'p1', 'swap').events, 'p1')).toEqual(['p2', 'p3', 'p4'].map((p) => `swap:${s.seq}:${p}`));
    const { state, events } = run([{ type: 'swap', user: 'p1', seq: s.seq, target: 'p2' }], s);
    expect(P(state, 'p1').hand).toEqual(hands[1]);
    expect(P(state, 'p2').hand).toEqual(['tavern']);
    const text = announces(events).join();
    expect(text).toContain('<@p1> 和 <@p2> 交換手牌');
    expect(text).not.toMatch(/酒館|城堡/);
    expect(ephemeralTo(events, 'p1').join()).toContain('城堡');
    expect(ephemeralTo(events, 'p2').join()).toContain('酒館');
    expect(labels(run([{ type: 'turnMenu', user: 'p1', seq: s.seq }], state).events, 'p1')).toEqual(['🔨 建造', '✅ 結束回合']);
  });

  it('自己沒手牌也可以換', () => {
    const s = gatherGold(calling([3, 4, 6, 7], { hands: [[], ['castle', 'manor'], [], []] }).state).state;
    const { state } = run([{ type: 'swap', user: 'p1', seq: s.seq, target: 'p2' }], s);
    expect(P(state, 'p1').hand).toEqual(['castle', 'manor']);
    expect(P(state, 'p2').hand).toEqual([]);
  });

  it('棄牌重抽：選任意張放到牌堆底，從上方抽同樣張數，頻道只公告張數', () => {
    const s = gatherGold(calling([3, 4, 6, 7], { hands: [['tavern', 'market', 'temple'], [], [], []], deck: ['palace', 'manor'] }).state).state;
    const menu0 = sub(s, 'p1', 'redraw');
    expect(menu0.state).toBe(s);
    expect(values(menu0.events, 'p1')).toEqual([`redrawToggle:${s.seq}:0`, `redrawToggle:${s.seq}:1`, `redrawToggle:${s.seq}:2`]);
    const menu1 = run([{ type: 'redrawToggle', user: 'p1', seq: s.seq, picked: [0] }], s);
    expect(menu1.state).toBe(s);
    expect(values(menu1.events, 'p1')).toEqual([`redrawToggle:${s.seq}:`, `redrawToggle:${s.seq}:0,1`, `redrawToggle:${s.seq}:0,2`, `redraw:${s.seq}:0`]);
    expect(labels(menu1.events, 'p1')[0]).toContain('✅');
    const { state, events } = run([{ type: 'redraw', user: 'p1', seq: s.seq, picked: [0, 2] }], s);
    expect(P(state, 'p1').hand).toEqual(['market', 'palace', 'manor']);
    expect(state.deck).toEqual(['tavern', 'temple']);
    expect(announces(events).join()).toContain('<@p1> 棄了 2 張手牌重抽');
    expect(announces(events).join()).not.toMatch(/酒館|宮殿/);
    expect(run([{ type: 'redraw', user: 'p1', seq: s.seq, picked: [0] }], state).state).toBe(state);
  });
});

describe('citadels/turns: 國王與王冠', () => {
  it('國王翻開立刻拿王冠，下一輪從他開始選角', () => {
    const s = calling([2, 4, 6, 7], { crown: 0 }).state;
    const p2 = passTurn(s);
    expect(p2.state.crown).toBe(1);
    expect(announces(p2.events).join()).toContain('<@p2> 拿到王冠');
    const { state } = finishRound(p2.state);
    expect(state.draft!.order[0]).toBe(1);
  });

  it('被刺殺的國王：沒有回合，這一輪結束時拿到王冠', () => {
    const s = calling([1, 4, 6, 7], { crown: 0 }).state;
    const killed = act(s, [{ type: 'kill', user: 'p1', seq: s.seq, rank: 4 }, { type: 'end', user: 'p1', seq: s.seq }]);
    expect(cur(killed.state)).toBe('p3');
    expect(killed.state.crown).toBe(0);
    const { state, texts } = finishRound(killed.state);
    expect(state.crown).toBe(1);
    expect(texts.join()).toContain('<@p2> 是國王的繼承人');
  });

  it('沒人當國王：王冠不動', () => {
    const { state } = finishRound(calling([2, 3, 6, 7], { crown: 2 }).state);
    expect(state.crown).toBe(2);
  });
});

describe('citadels/turns: 商人與建築師', () => {
  it('商人拿 2 金一共拿到 3 金', () => {
    const s = until(calling([2, 4, 6, 7]).state, 'p3');
    const { state, events } = gatherGold(s);
    expect(P(state, 'p3').gold).toBe(P(s, 'p3').gold + 3);
    expect(announces(events).join()).toContain('多拿 1 金');
  });

  it('掛機的商人：自動拿 2 金、多 1 金、自動收稅', () => {
    const s = until(calling([2, 4, 6, 7], { cities: [[], [], ['tavern', 'market'], []] }).state, 'p3');
    const { state } = fire(s);
    expect(P(state, 'p3').gold).toBe(P(s, 'p3').gold + 5);
    expect(cur(state)).toBe('p4');
  });

  it('建築師抽牌留 1 張後多抽 2 張，手牌多 3 張；這回合可以建 3 棟', () => {
    const s = until(calling([2, 4, 6, 7], { deck: ['castle', 'tavern', 'manor', 'palace', 'temple'], gold: [2, 2, 2, 20] }).state, 'p4');
    const drew = run([{ type: 'gather', user: 'p4', seq: s.seq, kind: 'draw' }, { type: 'keep', user: 'p4', seq: s.seq, card: 'castle' }], s);
    expect(P(drew.state, 'p4').hand).toEqual(['castle', 'manor', 'palace']);
    expect(ephemeralTo(drew.events, 'p4').join()).toContain('🟡 莊園（3）');
    let st = run([{ type: 'gather', user: 'p4', seq: s.seq, kind: 'draw' }, { type: 'keep', user: 'p4', seq: s.seq, card: 'castle' }], s).state;
    for (const card of ['castle', 'manor', 'palace']) st = run([{ type: 'build', user: 'p4', seq: s.seq, card }], st).state;
    expect(P(st, 'p4').city).toHaveLength(3);
    expect(labels(run([{ type: 'turnMenu', user: 'p4', seq: s.seq }], st).events, 'p4')).not.toContain('🔨 建造');
  });
});

describe('citadels/turns: 軍閥', () => {
  const warlord = (o: Setup, chars: Rank[] = [2, 4, 6, 8]) => gatherGold(until(calling(chars, o).state, 'p4')).state;

  it('付「費用 − 1」破壞，被破壞的放到牌堆底；公告', () => {
    const s = warlord({ cities: [['market'], [], [], []], gold: [2, 2, 2, 1], deck: ['temple'] });
    expect(labels(run([{ type: 'turnMenu', user: 'p4', seq: s.seq }], s).events, 'p4')).toContain('💥 破壞');
    expect(values(sub(s, 'p4', 'destroy').events, 'p4')).toEqual([`destroy:${s.seq}:market:p1`]);
    expect(labels(sub(s, 'p4', 'destroy').events, 'p4')).toEqual(['p1 的 🟢 市集（2）：1 金']);
    const { state, events } = run([{ type: 'destroy', user: 'p4', seq: s.seq, target: 'p1', card: 'market' }], s);
    expect(P(state, 'p4').gold).toBe(2);
    expect(P(state, 'p1').city).toEqual([]);
    expect(state.deck.at(-1)).toBe('market');
    expect(announces(events).join()).toContain('<@p4> 花 1 金破壞了 <@p1> 的 🟢 市集（2）');
    expect(run([{ type: 'turnMenu', user: 'p4', seq: s.seq }], state).events.length).toBeGreaterThan(0);
    expect(labels(run([{ type: 'turnMenu', user: 'p4', seq: s.seq }], state).events, 'p4')).not.toContain('💥 破壞');
  });

  it('費用 1 的免費；可以破壞自己的；付不起的不列出', () => {
    const s = warlord({ cities: [['watchtower', 'palace'], [], [], ['tavern']], gold: [2, 2, 2, -2] });
    expect(P(s, 'p4').gold).toBe(0);
    expect(values(sub(s, 'p4', 'destroy').events, 'p4')).toEqual([`destroy:${s.seq}:watchtower:p1`, `destroy:${s.seq}:tavern:p4`]);
  });

  it('建滿 8 棟的城市不能破壞', () => {
    const eight = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'tavern', 'market'];
    const s = warlord({ cities: [eight, ['tavern'], [], []], gold: [2, 2, 2, 8] });
    expect(values(sub(s, 'p4', 'destroy').events, 'p4')).toEqual([`destroy:${s.seq}:tavern:p2`]);
  });

  it('主教的建築受保護；被刺殺的主教沒有保護', () => {
    const safe = warlord({ cities: [[], ['temple'], [], []] }, [2, 5, 6, 8]);
    expect(labels(run([{ type: 'turnMenu', user: 'p4', seq: safe.seq }], safe).events, 'p4')).not.toContain('💥 破壞');
    const s = calling([1, 5, 6, 8], { cities: [[], ['temple'], [], []] }).state;
    const killed = act(s, [{ type: 'kill', user: 'p1', seq: s.seq, rank: 5 }, { type: 'end', user: 'p1', seq: s.seq }]).state;
    const w = gatherGold(until(killed, 'p4')).state;
    expect(values(sub(w, 'p4', 'destroy').events, 'p4')).toEqual([`destroy:${w.seq}:temple:p2`]);
  });
});
