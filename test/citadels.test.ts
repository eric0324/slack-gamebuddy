import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyCitadels, scoreOf, winnersOf, type CAction, type CState } from '../src/citadels.js';
import type { Rank } from '../src/citadelsCards.js';
import { citadels } from '../src/games/citadels.js';

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
    expect(board.text.split('\n')[0]).toBe('*👉 現在輪到：<@p1>（2 號 🦹 盜賊）⏳ 90 秒*');
    expect(board.text).toContain('已翻開：🦹 盜賊 {{name:p1}}');
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
    expect(text).toContain('👑 王冠：{{name:p2}}');
    expect(text).toContain('👉 • {{name:p1}}：💰 2 金｜🃏 1 張｜🏘️ 0 棟');
    expect(text).toContain('\n• {{name:p2}}：💰 2 金｜🃏 0 張｜🏘️ 1 棟：🟢 酒館（1）');
    expect(text).not.toContain('城堡');
    expect(text).not.toMatch(/國王|商人|建築師/);
  });

  it('牌桌訊息只有第一行 @ 輪到的人，其他人只顯示名字', () => {
    const { events } = calling([2, 4, 6, 7], { crown: 1 });
    const text = boards(events).at(-1)!.text;
    expect(text.match(/<@/g)).toHaveLength(1);
    for (const p of ['p1', 'p2', 'p3', 'p4']) expect(text).toContain(`{{name:${p}}}`);
  });

  it('回合結束：牌桌訊息改成回合結束、沒有按鈕，下一則用新的 ref', () => {
    const s = gatherGold(calling([2, 4, 6, 7]).state).state;
    const { state, events } = run([{ type: 'end', user: 'p1', seq: s.seq }], s);
    const old = boards(events).find((b) => b.ref === `citadels:${s.seq}`)!;
    expect(old.text).toBe('✅ 第 1 輪 2 號 🦹 盜賊 {{name:p1}} 的回合結束');
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

const mainMenu = (s: CState) => labels(run([{ type: 'turnMenu', user: cur(s), seq: s.seq }], s).events, cur(s));
const warlordOf = (o: Setup, chars: Rank[] = [2, 4, 6, 8]) => gatherGold(until(calling(chars, o).state, 'p4')).state;

describe('citadels/districts: 要塞與城牆', () => {
  it('要塞不能被破壞', () => {
    const s = warlordOf({ cities: [['keep', 'tavern'], [], [], []], gold: [2, 2, 2, 8] });
    expect(values(sub(s, 'p4', 'destroy').events, 'p4')).toEqual([`destroy:${s.seq}:tavern:p1`]);
  });

  it('城牆讓其他建築的破壞費用 +1，城牆本身照一般費用', () => {
    const s = warlordOf({ cities: [['greatWall', 'market'], [], [], []], gold: [2, 2, 2, 8] });
    expect(labels(sub(s, 'p4', 'destroy').events, 'p4')).toEqual(['p1 的 🟣 城牆（6）：5 金', 'p1 的 🟢 市集（2）：2 金']);
  });
});

describe('citadels/districts: 實驗室與鐵匠鋪', () => {
  it('實驗室：棄 1 張手牌到牌堆底、拿 1 金，每回合一次', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { cities: [['laboratory'], [], [], []], hands: [['tavern', 'palace'], [], [], []], gold: [0, 2, 2, 2] }).state).state;
    expect(mainMenu(s)).toContain('🧪 實驗室');
    expect(values(sub(s, 'p1', 'lab').events, 'p1')).toEqual([`lab:${s.seq}:tavern`, `lab:${s.seq}:palace`]);
    const { state, events } = run([{ type: 'lab', user: 'p1', seq: s.seq, card: 'tavern' }], s);
    expect(P(state, 'p1').gold).toBe(3);
    expect(P(state, 'p1').hand).toEqual(['palace']);
    expect(state.deck.at(-1)).toBe('tavern');
    expect(announces(events).join()).toContain('🧪');
    expect(mainMenu(state)).not.toContain('🧪 實驗室');
    expect(run([{ type: 'lab', user: 'p1', seq: s.seq, card: 'palace' }], state).state).toBe(state);
  });

  it('鐵匠鋪：付 2 金抽 3 張；金幣不到 2 沒有按鈕', () => {
    const s = gatherGold(calling([2, 4, 6, 7], { cities: [['smithy'], [], [], []], gold: [1, 2, 2, 2], deck: ['castle', 'tavern', 'manor', 'palace'] }).state).state;
    expect(mainMenu(s)).toContain('⚒️ 鐵匠鋪');
    const { state } = run([{ type: 'smithy', user: 'p1', seq: s.seq }], s);
    expect(P(state, 'p1').gold).toBe(1);
    expect(P(state, 'p1').hand).toEqual(['castle', 'tavern', 'manor']);
    expect(mainMenu(state)).not.toContain('⚒️ 鐵匠鋪');
    const poor = gatherGold(calling([2, 4, 6, 7], { cities: [['smithy'], [], [], []], gold: [-1, 2, 2, 2] }).state).state;
    expect(mainMenu(poor)).not.toContain('⚒️ 鐵匠鋪');
    expect(run([{ type: 'smithy', user: 'p1', seq: poor.seq }], poor).state).toBe(poor);
  });
});

describe('citadels/districts: 天文台與圖書館', () => {
  const deck = ['castle', 'tavern', 'manor', 'palace'];
  const drawWith = (city: string[]) => {
    const s = calling([2, 4, 6, 7], { cities: [city, [], [], []], deck }).state;
    return run([{ type: 'gather', user: 'p1', seq: s.seq, kind: 'draw' }], s);
  };

  it('天文台：看 3 張留 1 張，另外 2 張到牌堆底', () => {
    const drew = drawWith(['observatory']);
    expect(values(drew.events, 'p1')).toHaveLength(3);
    const { state } = run([{ type: 'keep', user: 'p1', seq: drew.state.seq, card: 'manor' }], drew.state);
    expect(P(state, 'p1').hand).toEqual(['manor']);
    expect(state.deck).toEqual(['palace', 'castle', 'tavern']);
  });

  it('圖書館：抽 2 張全部留下', () => {
    const { state } = drawWith(['library']);
    expect(P(state, 'p1').hand).toEqual(['castle', 'tavern']);
    expect(state.turn!.gathered).toBe(true);
  });

  it('兩棟都有：看 3 張留 2 張', () => {
    const drew = drawWith(['observatory', 'library']);
    expect(values(drew.events, 'p1')).toHaveLength(3);
    const one = run([{ type: 'keep', user: 'p1', seq: drew.state.seq, card: 'tavern' }], drew.state);
    expect(one.state.turn!.gathered).toBe(false);
    expect(values(one.events, 'p1')).toHaveLength(2);
    const { state } = run([{ type: 'keep', user: 'p1', seq: drew.state.seq, card: 'manor' }], one.state);
    expect(P(state, 'p1').hand).toEqual(['tavern', 'manor']);
    expect(state.deck).toEqual(['palace', 'castle']);
    expect(state.turn!.gathered).toBe(true);
  });
});

describe('citadels/districts: 魔法學校', () => {
  it('收稅時算成該角色的顏色', () => {
    const s = gatherGold(until(calling([2, 4, 6, 7], { cities: [[], [], ['tavern', 'market', 'schoolOfMagic'], []] }).state, 'p3')).state;
    const { state } = run([{ type: 'tax', user: 'p3', seq: s.seq }], s);
    expect(P(state, 'p3').gold).toBe(P(s, 'p3').gold + 3);
  });
});

describe('citadels/districts: 墓地', () => {
  const destroyWith = (cities: string[][], gold = [2, 2, 2, 8], target = 'p2', card = 'castle') => {
    const s = warlordOf({ cities, gold });
    return { before: s, ...run([{ type: 'destroy', user: 'p4', seq: s.seq, target, card }], s) };
  };

  it('詢問墓地主人；付 1 金收回，軍閥的回合繼續', () => {
    const asked = destroyWith([[], ['castle'], ['graveyard'], []]);
    expect(asked.state.phase).toBe('graveyard');
    const dm = prompts(asked.events).find((p) => p.audience === 'user' && p.user === 'p3')!;
    expect(dm.text).toContain('要不要付 1 金把 🟡 城堡（4） 收回手上');
    expect(dm.options).toEqual([{ value: 'grave:yes', label: '付 1 金收回' }, { value: 'grave:no', label: '不用' }]);
    expect(timers(asked.events).at(-1)!.ms).toBe(20_000);
    expect(run([{ type: 'end', user: 'p4', seq: asked.before.seq }], asked.state).state).toBe(asked.state);
    expect(run([{ type: 'grave', user: 'p2', yes: true }], asked.state).state).toBe(asked.state);
    const { state, events } = run([{ type: 'grave', user: 'p3', yes: true }], asked.state);
    expect(P(state, 'p3').gold).toBe(P(asked.state, 'p3').gold - 1);
    expect(P(state, 'p3').hand).toContain('castle');
    expect(state.deck).not.toContain('castle');
    expect(state.phase).toBe('turn');
    expect(timers(events).at(-1)!.ms).toBe(90_000);
    expect(announces(events).join()).toContain('墓地');
    expect(cur(state)).toBe('p4');
  });

  it('被破壞的人自己有墓地也會被詢問', () => {
    const { state } = destroyWith([[], [], ['graveyard', 'market'], []], undefined, 'p3', 'market');
    expect(state.phase).toBe('graveyard');
    expect(state.graveyard).toMatchObject({ owner: 'p3', card: 'market' });
  });

  it('不用或 20 秒逾時：牌放到牌堆底，軍閥的回合繼續', () => {
    const asked = destroyWith([[], ['castle'], ['graveyard'], []]);
    const no = run([{ type: 'grave', user: 'p3', yes: false }], asked.state).state;
    expect(no.deck.at(-1)).toBe('castle');
    expect(no.phase).toBe('turn');
    const timedOut = fire(asked.state).state;
    expect(timedOut.deck.at(-1)).toBe('castle');
    expect(P(timedOut, 'p3').hand).not.toContain('castle');
    expect(timedOut.phase).toBe('turn');
    expect(cur(timedOut)).toBe('p4');
  });

  it('軍閥自己有墓地、墓地本身被破壞、主人沒有金幣：都不詢問', () => {
    expect(destroyWith([[], ['castle'], [], ['graveyard']]).state.phase).toBe('turn');
    const self = destroyWith([[], ['graveyard'], [], []], undefined, 'p2', 'graveyard').state;
    expect(self.phase).toBe('turn');
    expect(self.deck.at(-1)).toBe('graveyard');
    const s = warlordOf({ cities: [[], ['castle'], ['graveyard'], []], gold: [2, 2, 2, 8] });
    s.players[2].gold = 0;
    expect(run([{ type: 'destroy', user: 'p4', seq: s.seq, target: 'p2', card: 'castle' }], s).state.phase).toBe('turn');
  });
});

const SEVEN = ['manor', 'castle', 'palace', 'temple', 'church', 'tavern', 'market'];
const results = (events: GameEvent[]) => events.filter((e) => e.type === 'result') as { players: string[]; winners: string[] }[];

describe('citadels/turns: 遊戲結束的觸發', () => {
  it('建滿 8 棟：公告、記錄第一個建滿的人，這一輪打完後計分、不再選角', () => {
    const s = gatherGold(until(calling([2, 4, 6, 7], { cities: [[], SEVEN, [], []], hands: [[], ['docks'], [], []] }).state, 'p2')).state;
    const built = run([{ type: 'build', user: 'p2', seq: s.seq, card: 'docks' }], s);
    expect(announces(built.events).join()).toContain('<@p2> 建滿 8 棟！這一輪結束後遊戲結束');
    expect(built.state.firstComplete).toBe('p2');
    expect(built.state.lastRound).toBe(1);
    const p3 = run([{ type: 'end', user: 'p2', seq: s.seq }], built.state).state;
    expect(cur(p3)).toBe('p3');
    const p4 = passTurn(p3).state;
    expect(cur(p4)).toBe('p4');
    const { state, events } = passTurn(p4);
    expect(state.phase).toBe('ended');
    expect(results(events)).toHaveLength(1);
    expect(draftMsgs(events)).toHaveLength(0);
  });

  it('第 20 輪結束時沒人建滿：公告上限，直接計分', () => {
    const { state, texts } = finishRound(calling([2, 4, 6, 7], { round: 20 }).state);
    expect(state.phase).toBe('ended');
    expect(texts.join()).toContain('已達 20 輪上限');
    const not20 = finishRound(calling([2, 4, 6, 7], { round: 19 }).state).state;
    expect(not20.phase).toBe('draft');
  });
});

describe('citadels/scoring: 計分', () => {
  const FIVE24 = ['manor', 'castle', 'palace', 'temple', 'cathedral', 'market', 'watchtower', 'keep'];
  const NOFIVE28 = ['university', 'manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'market'];
  const ended = (cities: string[][], o: { first?: string; lastRound?: number; rounds?: number[][]; gold?: number[] } = {}) => {
    const s = structuredClone(started(cities.length).state);
    s.players.forEach((p, i) => {
      p.city = cities[i].map((card, j) => ({ card, round: o.rounds?.[i]?.[j] ?? 1 }));
      p.gold = o.gold?.[i] ?? 0;
    });
    s.firstComplete = o.first;
    s.lastRound = o.lastRound;
    return s;
  };

  it('第一個建滿 8 棟：費用 24 + 五色 3 + 4 = 31；其他建滿、有大學：28 + 2 = 30；沒建滿 20', () => {
    const s = ended([FIVE24, NOFIVE28, ['palace', 'cathedral', 'townHall', 'fortress'], []], { first: 'p1' });
    expect(scoreOf(s, s.players[0])).toMatchObject({ cost: 24, bonus: 0, five: 3, complete: 4, total: 31 });
    expect(scoreOf(s, s.players[1])).toMatchObject({ cost: 26, bonus: 2, five: 0, complete: 2, total: 30 });
    expect(scoreOf(s, s.players[2]).total).toBe(20);
  });

  it('鬼城補顏色；最後一輪建的不能補；魔法學校不補五色', () => {
    const ghost = ['manor', 'temple', 'tavern', 'keep', 'hauntedCity'];
    const early = ended([ghost, [], [], []], { lastRound: 6, rounds: [[1, 1, 1, 1, 3]] });
    expect(scoreOf(early, early.players[0]).five).toBe(3);
    const late = ended([ghost, [], [], []], { lastRound: 6, rounds: [[1, 1, 1, 1, 6]] });
    expect(scoreOf(late, late.players[0]).five).toBe(0);
    const school = ended([['manor', 'temple', 'tavern', 'schoolOfMagic', 'keep'], [], [], []]);
    expect(scoreOf(school, school.players[0]).five).toBe(0);
    const onlyGhost = ended([['manor', 'temple', 'tavern', 'hauntedCity'], [], [], []]);
    expect(scoreOf(onlyGhost, onlyGhost.players[0]).five).toBe(0);
  });

  it('最高分獲勝；同分比建築費用、再比金幣、完全相同並列', () => {
    const FIVE23 = ['manor', 'castle', 'palace', 'temple', 'cathedral', 'tavern', 'watchtower', 'keep'];
    expect(winnersOf(ended([FIVE23, NOFIVE28, [], []], { first: 'p1' }))).toEqual(['p2']);
    expect(winnersOf(ended([['palace'], ['palace'], [], []], { gold: [3, 1, 0, 0] }))).toEqual(['p1']);
    expect(winnersOf(ended([['palace'], ['palace'], [], []], { gold: [2, 2, 0, 0] }))).toEqual(['p1', 'p2']);
    expect(winnersOf(ended([FIVE24, NOFIVE28, [], []], { first: 'p1' }))).toEqual(['p1']);
  });
});

describe('citadels/scoring: 結束公告、再來一局、取消', () => {
  const finished = () => {
    const s = gatherGold(until(calling([2, 4, 6, 7], { cities: [['university'], SEVEN, [], []], hands: [[], ['docks'], [], []] }).state, 'p2')).state;
    const built = run([{ type: 'build', user: 'p2', seq: s.seq, card: 'docks' }, { type: 'end', user: 'p2', seq: s.seq }], s).state;
    return finishRound(built).state;
  };

  it('公告分數明細和名次，result 的 players／winners，貼再來一局', () => {
    const s = gatherGold(until(calling([2, 4, 6, 7], { cities: [['university'], SEVEN, [], []], hands: [[], ['docks'], [], []] }).state, 'p2')).state;
    let st = run([{ type: 'build', user: 'p2', seq: s.seq, card: 'docks' }, { type: 'end', user: 'p2', seq: s.seq }], s).state;
    let events: GameEvent[] = [];
    while (st.phase !== 'ended') ({ state: st, events } = passTurn(st));
    expect(results(events)).toEqual([{ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p2'] }]);
    expect(st.winners).toEqual(['p2']);
    const text = announces(events).find((t) => t.includes('遊戲結束'))!;
    expect(text).toContain('1. <@p2>');
    expect(text).toContain('總分 25');
    expect(text).toContain('建滿 +4');
    expect(text).toContain('紫卡 +2');
    expect(text).toContain('計分算 8 分');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('結束後舊按鈕和計時器被忽略；再來一局只有上一局玩家，按的人是新房主', () => {
    const s = finished();
    expect(s.phase).toBe('ended');
    expect(run([{ type: 'status', user: 'p1' }], s).events).toEqual([]);
    expect(run([{ type: 'timeout', id: s.timerSeq }], s).state).toBe(s);
    expect(ephemeralTo(run([{ type: 'rematch', user: 'Z', channel: 'C1' }], s).events, 'Z')[0]).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'p3', channel: 'C1' }], s).state;
    expect(again).toMatchObject({ phase: 'lobby', host: 'p3' });
    expect(again.players.map((p) => p.id)).toEqual(['p3']);
  });

  it('房主取消：公告目前建築費用，沒有 result、沒有再來一局；非房主被拒', () => {
    const s = calling([2, 4, 6, 7], { cities: [['palace'], [], [], []] }).state;
    const denied = run([{ type: 'cancel', user: 'p2' }], s);
    expect(denied.state).toBe(s);
    expect(ephemeralTo(denied.events, 'p2')).toEqual(['只有房主可以取消遊戲。']);
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
    expect(announces(events).join()).toContain('<@p1> 5');
    expect(results(events)).toEqual([]);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });
});

const BOT = (i: number) => `bot:${i}:B${i}`;
// 把第 i 位（0 起）改成 bot
function asBot(s: CState, i: number, city: string[] = []) {
  const st = structuredClone(s);
  st.players[i].id = BOT(i + 1);
  st.players[i].city = city.map((card) => ({ card, round: 1 }));
  return st;
}
// 自訂叫號局面，p1 是 bot、其他人是真人；回傳 bot 行動完之後的局面和所有事件
function botCalling(chars: Rank[], o: Setup = {}, r: () => number = rng) {
  const n = chars.length;
  const s = structuredClone(started(n).state);
  s.players.forEach((p, i) => {
    p.gold = o.gold?.[i] ?? 2;
    p.hand = [...(o.hands?.[i] ?? [])];
    p.city = (o.cities?.[i] ?? []).map((card) => ({ card, round: 1 }));
    p.char = i < n - 1 ? chars[i] : undefined;
  });
  s.players[0].id = BOT(1);
  if (o.deck) s.deck = [...o.deck];
  s.crown = 0;
  s.round = 1;
  const faceUp = o.faceUp ?? [];
  const rest = ([1, 2, 3, 4, 5, 6, 7, 8] as Rank[]).filter((x) => !chars.includes(x) && !faceUp.includes(x));
  s.draft = { pool: [chars[n - 1], ...rest.slice(1)], faceUp, faceDown: rest[0], order: chars.map((_, i) => i), at: n - 1 };
  let res = run([{ type: 'pick', user: `p${n}`, rank: chars[n - 1] }], s, r);
  const events = [...res.events];
  // 編號比 bot 小的真人先拿金結束，bot 會接著自動行動
  while (res.state.phase === 'turn' && !isBot(cur(res.state)) && current(res.state).char! < chars[0]) {
    res = passTurn(res.state);
    events.push(...res.events);
  }
  return { state: res.state, events };
}
const current = (s: CState) => s.players[s.turn!.player];
const B1 = (s: CState) => P(s, BOT(1));

describe('citadels/bots: bot 選角', () => {
  it('城市有同色 2 棟：選對應的收稅角色', () => {
    const s = asBot(started(4).state, 0, ['watchtower', 'prison']);
    const { state } = run([{ type: 'pick', user: 'p4', rank: 4 }], s);
    expect(P(state, BOT(1)).char).toBe(8);
  });

  it('棟數最多的顏色優先；一樣多依編號小的', () => {
    const more = asBot(started(4).state, 0, ['watchtower', 'prison', 'tavern', 'market', 'docks']);
    expect(P(run([{ type: 'pick', user: 'p4', rank: 7 }], more).state, BOT(1)).char).toBe(6);
    const tie = asBot(started(4).state, 0, ['manor', 'castle', 'temple', 'church']);
    expect(P(run([{ type: 'pick', user: 'p4', rank: 7 }], tie).state, BOT(1)).char).toBe(4);
  });

  it('預設順序：商人被選走就選建築師', () => {
    const s = asBot(started(4).state, 0);
    expect(P(run([{ type: 'pick', user: 'p4', rank: 6 }], s).state, BOT(1)).char).toBe(7);
  });

  it('7 人局最後一位是 bot：從兩張中照同樣規則選', () => {
    const s = started(7, () => 0).state; // 面朝下是盜賊，王冠在 p1
    const before = pickAll(s, [1, 3, 4, 5, 6]);
    const { state } = run([{ type: 'pick', user: 'p6', rank: 7 }], asBot(before, 6));
    expect(P(state, BOT(7)).char).toBe(2);
  });
});

describe('citadels/bots: bot 的回合', () => {
  it('bot 商人：拿 2 金、多 1 金、收稅，建最貴付得起的，結束回合', () => {
    const { state, events } = botCalling([6, 2, 3, 7], { hands: [['castle', 'tavern'], [], [], []] });
    expect(B1(state).city.map((x) => x.card)).toEqual(['castle']);
    expect(B1(state).hand).toEqual(['tavern']);
    expect(B1(state).gold).toBe(1);
    const text = announces(events).join('\n');
    expect(text).toContain('🤖B1 拿了 2 金');
    expect(text).toContain('🤖B1 收稅 0 金');
    expect(text).toContain('🤖B1 建了 🟡 城堡（4）');
  });

  it('沒有能蓋的牌就抽牌，留費用最高、不重複的', () => {
    const none = botCalling([6, 2, 3, 7], { deck: ['tavern', 'palace', 'manor'] }).state;
    expect(B1(none).hand.concat(B1(none).city.map((x) => x.card))).toContain('palace');
    expect(none.deck).toContain('tavern');
    const dup = botCalling([7, 2, 3, 8], { hands: [['market'], [], [], []], cities: [['market', 'palace'], [], [], []], deck: ['palace', 'temple', 'castle', 'manor'], gold: [0, 2, 2, 2] }).state;
    expect(B1(dup).hand).toContain('temple');
    expect(dup.deck).toContain('palace');
  });

  it('國王收稅；建築師建到 3 棟', () => {
    const king = botCalling([4, 5, 6, 7], { hands: [['palace'], [], [], []], cities: [['manor', 'castle'], [], [], []], gold: [0, 2, 2, 2] }).state;
    expect(B1(king).gold).toBe(4);
    const arch = botCalling([7, 8, 6, 5], { hands: [['temple', 'tavern', 'watchtower', 'market'], [], [], []], gold: [10, 2, 2, 2], deck: [] }).state;
    expect(B1(arch).city.map((x) => x.card)).toEqual(['market', 'temple', 'tavern']);
  });

  it('刺客、盜賊隨機選目標', () => {
    const a = botCalling([1, 2, 6, 7], { faceUp: [3, 5] }).state;
    expect(a.killed).toBe(8);
    const t = botCalling([2, 4, 6, 7], {}, () => 0).state;
    expect(t.robbed).toBe(3);
  });

  it('魔術師：有人手牌比自己多 2 張以上就和手牌最多的人換，否則不用', () => {
    const hands = [['tavern'], ['castle', 'manor', 'palace'], ['temple', 'church', 'market'], []];
    const swapped = botCalling([3, 4, 6, 7], { hands, gold: [0, 2, 2, 2] });
    expect(P(swapped.state, 'p2').hand).toEqual(['tavern']);
    expect(announces(swapped.events).join()).toContain('交換手牌');
    const kept = botCalling([3, 4, 6, 7], { hands: [['tavern'], ['castle', 'manor'], [], []], gold: [0, 2, 2, 2] });
    expect(announces(kept.events).join()).not.toContain('交換手牌');
  });

  it('軍閥建造之後，破壞城市棟數最多的其他玩家最便宜、付得起的建築', () => {
    const s = botCalling([8, 4, 6, 7], { hands: [['castle'], [], [], []], cities: [[], ['tavern'], ['palace', 'market', 'temple'], ['castle', 'watchtower', 'manor']], gold: [3, 2, 2, 2] }).state;
    expect(B1(s).city.map((x) => x.card)).toEqual(['castle']);
    expect(P(s, 'p3').city.map((x) => x.card)).toEqual(['palace', 'market']);
    expect(B1(s).gold).toBe(1);
  });

  it('bot 有墓地有金幣就收回', () => {
    const s = warlordOf({ cities: [[], ['castle'], ['graveyard'], []], gold: [2, 2, 3, 8] });
    const st = asBot(s, 2, ['graveyard']);
    const { state } = run([{ type: 'destroy', user: 'p4', seq: st.seq, target: 'p2', card: 'castle' }], st);
    expect(state.phase).toBe('turn');
    expect(P(state, BOT(3)).hand).toContain('castle');
    expect(P(state, BOT(3)).gold).toBe(P(st, BOT(3)).gold - 1);
  });
});

describe('citadels/bots: 一個人也能玩完整局', () => {
  it('1 位真人 + 3 個 bot、真人完全不操作：遊戲會結束並送出 result', () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      let x = seed;
      const r = () => (x = (x * 9301 + 0.49297) % 1);
      let { state, events } = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'addBot', user: 'p1', count: 3 }, { type: 'start', user: 'p1' }], undefined, r);
      let all = [...events];
      for (let i = 0; i < 3000 && state.phase !== 'ended'; i++) {
        ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state, r));
        all.push(...events);
      }
      expect(state.phase).toBe('ended');
      const result = all.find((e) => e.type === 'result') as { players: string[]; winners: string[] };
      expect(result.players).toHaveLength(4);
      expect(result.winners.length).toBeGreaterThan(0);
      all = [];
    }
  });
});

describe('citadels/setup: 遊戲清單與指令說明（GameDef）', () => {
  it('大廳資訊', () => {
    expect(citadels).toMatchObject({ kind: 'citadels', emoji: '🏛️', name: '富饒之城', players: '4～7 人', category: 'bluff' });
    expect(citadels.desc.length).toBeGreaterThan(0);
  });

  it('help 列出指令和按鈕用法；不認識的子指令回傳 null（顯示說明）', () => {
    for (const w of ['new', 'addbot', 'removebot', 'start', 'cancel', '🎭 選角色', '🏰 我的回合', '📜 我的狀態']) expect(citadels.help).toContain(w);
    expect(citadels.parse('foo', 'U', 'C')).toBeNull();
    expect(citadels.parse('help', 'U', 'C')).toBeNull();
    expect(citadels.parse('new', 'U', 'C')).toEqual({ type: 'new', user: 'U', channel: 'C' });
    expect(citadels.parse('start', 'U', 'C')).toEqual({ type: 'start', user: 'U' });
    expect(citadels.parse('cancel', 'U', 'C')).toEqual({ type: 'cancel', user: 'U' });
    expect(citadels.parse('addbot 2', 'U', 'C')).toEqual({ type: 'addBot', user: 'U', count: 2 });
    expect(citadels.parse('removebot', 'U', 'C')).toEqual({ type: 'removeBot', user: 'U', count: 1 });
  });

  it('按鈕對應 action', () => {
    const b = (kind: string, value: string) => citadels.button(kind, value, 'U', 'C');
    expect(b('join', '')).toEqual({ type: 'join', user: 'U' });
    expect(b('leave', '')).toEqual({ type: 'leave', user: 'U' });
    expect(b('start', '')).toEqual({ type: 'start', user: 'U' });
    expect(b('rematch', '')).toEqual({ type: 'rematch', user: 'U', channel: 'C' });
    expect(b('citadels', 'status')).toEqual({ type: 'status', user: 'U' });
    expect(b('citadels', 'pickMenu')).toEqual({ type: 'pickMenu', user: 'U' });
    expect(b('citadels', 'pick:7')).toEqual({ type: 'pick', user: 'U', rank: 7 });
    expect(b('citadels', 'turnMenu:3')).toEqual({ type: 'turnMenu', user: 'U', seq: 3 });
    expect(b('citadels', 'turnMenu:3:build')).toEqual({ type: 'turnMenu', user: 'U', seq: 3, sub: 'build' });
    expect(b('citadels', 'gather:3:draw')).toEqual({ type: 'gather', user: 'U', seq: 3, kind: 'draw' });
    expect(b('citadels', 'keep:3:castle')).toEqual({ type: 'keep', user: 'U', seq: 3, card: 'castle' });
    expect(b('citadels', 'build:3:castle')).toEqual({ type: 'build', user: 'U', seq: 3, card: 'castle' });
    expect(b('citadels', 'tax:3')).toEqual({ type: 'tax', user: 'U', seq: 3 });
    expect(b('citadels', 'kill:3:5')).toEqual({ type: 'kill', user: 'U', seq: 3, rank: 5 });
    expect(b('citadels', 'rob:3:6')).toEqual({ type: 'rob', user: 'U', seq: 3, rank: 6 });
    expect(b('citadels', 'swap:3:bot:2:小明')).toEqual({ type: 'swap', user: 'U', seq: 3, target: 'bot:2:小明' });
    expect(b('citadels', 'redrawToggle:3:0,2')).toEqual({ type: 'redrawToggle', user: 'U', seq: 3, picked: [0, 2] });
    expect(b('citadels', 'redrawToggle:3:')).toEqual({ type: 'redrawToggle', user: 'U', seq: 3, picked: [] });
    expect(b('citadels', 'redraw:3:1')).toEqual({ type: 'redraw', user: 'U', seq: 3, picked: [1] });
    expect(b('citadels', 'destroy:3:market:bot:1:阿華')).toEqual({ type: 'destroy', user: 'U', seq: 3, target: 'bot:1:阿華', card: 'market' });
    expect(b('citadels', 'lab:3:tavern')).toEqual({ type: 'lab', user: 'U', seq: 3, card: 'tavern' });
    expect(b('citadels', 'smithy:3')).toEqual({ type: 'smithy', user: 'U', seq: 3 });
    expect(b('citadels', 'grave:yes')).toEqual({ type: 'grave', user: 'U', yes: true });
    expect(b('citadels', 'grave:no')).toEqual({ type: 'grave', user: 'U', yes: false });
    expect(b('citadels', 'end:3')).toEqual({ type: 'end', user: 'U', seq: 3 });
    expect(b('citadels', 'pick:9')).toBeNull();
    expect(b('citadels', 'build:3:spaceship')).toBeNull();
    expect(b('citadels', 'turnMenu:3:fly')).toBeNull();
    expect(b('coup', 'status')).toBeNull();
  });
});
