import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySkull, type Disc, type SkAction, type SkState } from '../src/skull.js';

const rng = () => 0.99999;

function run(actions: SkAction[], start?: SkState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySkull(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as SkAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'dm' && e.to === user) as { text: string } | undefined;
type Prompt = Extract<GameEvent, { type: 'prompt' }>;
const prompts = (events: GameEvent[]) => events.filter((e): e is Prompt => e.type === 'prompt');
const lastChannelPrompt = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel').at(-1)!;
const menuFor = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user)!;
const values = (p: Prompt) => p.options.map((o) => o.value);

// rng 固定為 0.99999：起始玩家是最後一位
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const disc = (s: SkState, user: string, d: Disc): SkAction => ({ type: 'disc', user, step: s.step, disc: d });
const bid = (s: SkState, user: string, n: number): SkAction => ({ type: 'bid', user, step: s.step, n });
const pass = (s: SkState, user: string): SkAction => ({ type: 'pass', user, step: s.step });
const flip = (s: SkState, user: string, target: string): SkAction => ({ type: 'flip', user, step: s.step, target });
const timeout = (s: SkState): SkAction => ({ type: 'timeout', id: s.timers.phase! });
const step = (s: SkState, make: (s: SkState) => SkAction, r: () => number = rng) => run([make(s)], s, r);

// 直接擺好牌疊、進入輪流階段（輪到第 turn 位）
function table(stacks: Disc[][], turn = 0): SkState {
  const s = structuredClone(started(stacks.length).state);
  s.phase = 'turn';
  s.turn = turn;
  s.step += 1;
  s.players.forEach((p, i) => {
    const hand: Disc[] = ['rose', 'rose', 'rose', 'skull'];
    for (const d of stacks[i]) hand.splice(hand.indexOf(d), 1);
    p.hand = hand;
    p.stack = [...stacks[i]];
  });
  return s;
}

describe('skull/setup: 骷髏與玫瑰的房間', () => {
  it('開房：公告標示骷髏與玫瑰', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'skull', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '骷髏與玫瑰', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 3 人');
  });

  it('房間已滿（6 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(6).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'x')!.text).toContain('房間已滿');
  });

  it('用 bot 補人數；非房主不能加 bot；可以移除 bot', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(3);
    expect(state.players.slice(1).every((p) => p.id.startsWith('bot:'))).toBe(true);
    expect(run([{ type: 'start', user: 'p1' }], state).state.phase).toBe('place');
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state).events, 'p2')).toBeDefined();
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], state).state.players).toHaveLength(2);
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')!.text).toContain('這個頻道已經有遊戲了');
  });
});

describe('skull/setup: 發牌與座位', () => {
  it('每人 3 朵玫瑰 1 個骷髏，座位是加入順序，起始玩家隨機', () => {
    const { state, events } = started(4);
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (const p of state.players) {
      expect([...p.hand].sort()).toEqual(['rose', 'rose', 'rose', 'skull']);
      expect(p).toMatchObject({ stack: [], wins: 0 });
      expect(dmTo(events, p.id)).toBeDefined();
    }
    expect(state.starter).toBe(3);
    expect(started(4, () => 0).state.starter).toBe(0);
    const text = announces(events).join('\n');
    for (const s of ['<@p1> → <@p2> → <@p3> → <@p4>', '起始', '2 次']) expect(text).toContain(s);
  });
});

describe('skull/rounds: 蓋第一張牌', () => {
  it('開始後同時蓋第一張，頻道有蓋牌和我的牌按鈕', () => {
    const { state, events } = started(3);
    expect(state.phase).toBe('place');
    expect(values(lastChannelPrompt(events))).toEqual(['place', 'mine']);
  });

  it('蓋牌選單只列手上有的牌種', () => {
    const s = started(3).state;
    expect(values(menuFor(run([{ type: 'placeMenu', user: 'p1' }], s).events, 'p1'))).toEqual([`disc:${s.step}:rose`, `disc:${s.step}:skull`]);
    const noSkull = structuredClone(s);
    noSkull.players[1].hand = ['rose', 'rose'];
    expect(values(menuFor(run([{ type: 'placeMenu', user: 'p2' }], noSkull).events, 'p2'))).toEqual([`disc:${s.step}:rose`]);
  });

  it('蓋牌不外洩；重複蓋被拒', () => {
    const s = started(3).state;
    const { state, events } = step(s, (x) => disc(x, 'p1', 'skull'));
    expect(state.players[0].stack).toEqual(['skull']);
    const text = announces(events).join('\n');
    expect(text).toContain('蓋了一張牌');
    expect(text).not.toMatch(/骷髏|💀|玫瑰|🌹/);
    const again = step(state, (x) => disc(x, 'p1', 'rose'));
    expect(again.state.players[0].stack).toEqual(['skull']);
    expect(ephemeralTo(again.events, 'p1')!.text).toContain('已經蓋過');
  });

  it('全部蓋好提早開始，輪到起始玩家', () => {
    let s = started(3).state;
    for (const u of ['p1', 'p2', 'p3']) s = step(s, (x) => disc(x, u, 'rose')).state;
    expect(s.phase).toBe('turn');
    expect(s.turn).toBe(2);
  });

  it('超時自動蓋玫瑰（只剩骷髏就蓋骷髏）；超時後按舊選單被拒', () => {
    const s0 = started(3).state;
    const s1 = step(s0, (x) => disc(x, 'p1', 'skull')).state;
    const only = structuredClone(s1);
    only.players[2].hand = ['skull'];
    const { state } = step(only, timeout);
    expect(state.phase).toBe('turn');
    expect(state.players.map((p) => p.stack)).toEqual([['skull'], ['rose'], ['skull']]);
    const stale = run([{ type: 'disc', user: 'p2', step: s1.step, disc: 'skull' }], state);
    expect(stale.state).toBe(state);
    expect(ephemeralTo(stale.events, 'p2')!.text).toContain('這個選單已經過期');
  });
});

describe('skull/rounds: 輪到時再蓋一張或開始挑戰', () => {
  it('再蓋一張後輪到下一位，公告列出牌疊和手牌張數', () => {
    const s = table([['rose'], ['rose'], ['rose']]);
    const { state, events } = step(s, (x) => disc(x, 'p1', 'rose'));
    expect(state.players[0].stack).toEqual(['rose', 'rose']);
    expect(state.turn).toBe(1);
    expect(announces(events).join('\n')).toContain('再蓋一張');
    expect(announces(events).join('\n')).toMatch(/疊 2 張/);
  });

  it('手上沒牌時沒有再蓋一張', () => {
    const s = table([['rose', 'rose', 'rose', 'skull'], ['rose'], ['rose']], 2);
    const { events } = step(s, (x) => disc(x, 'p3', 'rose'));
    expect(values(lastChannelPrompt(events))).toEqual(['challenge', 'mine']);
  });

  it('開始挑戰選單 1～總張數；不是輪到的人被拒', () => {
    const s = table([['rose', 'rose'], ['rose'], ['skull']]);
    const menu = menuFor(run([{ type: 'challengeMenu', user: 'p1' }], s).events, 'p1');
    expect(values(menu)).toEqual([1, 2, 3, 4].map((n) => `bid:${s.step}:${n}`));
    expect(ephemeralTo(run([{ type: 'challengeMenu', user: 'p2' }], s).events, 'p2')!.text).toContain('還沒輪到你');
    expect(ephemeralTo(run([{ type: 'placeMenu', user: 'p2' }], s).events, 'p2')!.text).toContain('還沒輪到你');
  });

  it('喊數後進入喊數階段，下一位看到更大的數字和放棄，不能再蓋牌', () => {
    const s = table([['rose', 'rose'], ['rose'], ['skull']]);
    const { state, events } = step(s, (x) => bid(x, 'p1', 2));
    expect(state).toMatchObject({ phase: 'bid', bid: { n: 2, by: 'p1' }, turn: 1 });
    expect(values(lastChannelPrompt(events))).toEqual([`bid:${state.step}:3`, `bid:${state.step}:4`, `pass:${state.step}`, 'mine']);
    expect(ephemeralTo(run([{ type: 'placeMenu', user: 'p2' }], state).events, 'p2')).toBeDefined();
    expect(step(state, (x) => disc(x, 'p2', 'rose')).state.players[1].stack).toEqual(['rose']);
  });

  it('超時：有牌就再蓋玫瑰，沒牌就喊 1', () => {
    const s = table([['rose'], ['rose'], ['rose']]);
    const a = step(s, timeout).state;
    expect(a.players[0].stack).toEqual(['rose', 'rose']);
    expect(a.turn).toBe(1);
    const empty = table([['rose', 'rose', 'rose', 'skull'], ['rose'], ['rose']]);
    expect(step(empty, timeout).state).toMatchObject({ phase: 'bid', bid: { n: 1, by: 'p1' } });
  });
});

describe('skull/rounds: 喊數', () => {
  const bidding = () => step(table([['rose', 'rose'], ['rose'], ['rose'], ['rose']]), (x) => bid(x, 'p1', 2)).state;

  it('只能喊更大、最多到總張數', () => {
    const s = bidding();
    expect(step(s, (x) => bid(x, 'p2', 2)).state).toBe(s);
    expect(step(s, (x) => bid(x, 'p2', 6)).state).toBe(s);
    expect(step(s, (x) => bid(x, 'p2', 4)).state).toMatchObject({ bid: { n: 4, by: 'p2' }, turn: 2 });
  });

  it('放棄的人不再輪到；其他人都放棄時最高喊數者成為挑戰者', () => {
    let s = bidding();
    s = step(s, (x) => pass(x, 'p2')).state;
    expect(s.turn).toBe(2);
    s = step(s, (x) => bid(x, 'p3', 3)).state;
    s = step(s, (x) => pass(x, 'p4')).state;
    expect(s.turn).toBe(0);
    s = step(s, (x) => pass(x, 'p1')).state;
    expect(s.phase).toBe('flip');
    expect(s.bid).toEqual({ n: 3, by: 'p3' });
  });

  it('喊到總張數立刻結束喊數', () => {
    const s = step(bidding(), (x) => bid(x, 'p2', 5)).state;
    expect(s.phase).not.toBe('bid');
  });

  it('超時算放棄', () => {
    const s = step(bidding(), timeout).state;
    expect(s.passed).toEqual(['p2']);
    expect(s.turn).toBe(2);
  });
});

describe('skull/rounds: 翻牌', () => {
  // p1 喊 n，其他人都放棄
  function challenge(stacks: Disc[][], n: number) {
    let s = step(table(stacks), (x) => bid(x, 'p1', n)).state;
    let events: GameEvent[] = [];
    while (s.phase === 'bid') ({ state: s, events } = step(s, (x) => pass(x, x.players[x.turn].id)));
    return { state: s, events };
  }

  it('先自動翻開自己全部的牌，再選別人（只列還有沒翻開牌的人）', () => {
    const { state, events } = challenge([['rose', 'rose'], ['rose'], ['rose', 'skull']], 4);
    expect(state).toMatchObject({ phase: 'flip', revealed: 2 });
    expect(announces(events).join('\n')).toContain('🌹 🌹');
    const p = lastChannelPrompt(events);
    expect(values(p)).toEqual([`flip:${state.step}:p2`, `flip:${state.step}:p3`, 'mine']);
    expect(p.options[1].label).toContain('p3');
  });

  it('自己的骷髏：挑戰失敗', () => {
    const { state, events } = challenge([['skull', 'rose'], ['rose'], ['rose']], 3);
    expect(state.round).toBe(2);
    expect(announces(events).join('\n')).toContain('挑戰失敗');
    expect(state.players[0].hand.length + state.players[0].stack.length).toBe(3);
  });

  it('喊數比自己的牌疊少，也要翻完自己全部的牌', () => {
    const { state, events } = challenge([['skull', 'rose'], ['rose'], ['rose']], 1);
    expect(state.players[0].wins).toBe(0);
    expect(announces(events).join('\n')).toContain('挑戰失敗');
  });

  it('翻別人最上面的玫瑰達到喊數：挑戰成功，下一輪挑戰者起始', () => {
    const { state } = challenge([['rose'], ['skull', 'rose'], ['rose']], 2);
    const { state: next, events } = step(state, (x) => flip(x, 'p1', 'p2'));
    expect(next.players[0].wins).toBe(1);
    expect(next).toMatchObject({ phase: 'place', round: 2, starter: 0 });
    expect(announces(events).join('\n')).toContain('挑戰成功');
  });

  it('翻到別人的骷髏：失敗並公告是誰的骷髏；不是挑戰者被拒', () => {
    const { state } = challenge([['rose'], ['rose', 'skull'], ['rose']], 3);
    expect(ephemeralTo(step(state, (x) => flip(x, 'p3', 'p2')).events, 'p3')).toBeDefined();
    const { events } = step(state, (x) => flip(x, 'p1', 'p2'));
    expect(announces(events).join('\n')).toMatch(/<@p2> 的骷髏/);
  });

  it('翻牌超時：隨機翻一位', () => {
    const { state } = challenge([['rose'], ['rose'], ['rose', 'rose']], 3);
    const next = step(state, timeout).state;
    expect(next.revealed).toBe(2);
    expect(next.players[2].flipped).toBe(1);
  });
});

describe('skull/rounds: 挑戰成功與失敗', () => {
  const flipState = (stacks: Disc[][], n: number, mutate?: (s: SkState) => void) => {
    const s = table(stacks);
    mutate?.(s);
    let x = step(s, (y) => bid(y, 'p1', n)).state;
    while (x.phase === 'bid') x = step(x, (y) => pass(y, y.players[y.turn].id)).state;
    return x;
  };

  it('失去一張牌：頻道不公開牌種，私訊挑戰者', () => {
    const s = flipState([['rose'], ['skull'], ['rose']], 2);
    const { state, events } = step(s, (x) => flip(x, 'p1', 'p2'));
    expect(state.players[0].hand).toHaveLength(3);
    const lost = announces(events).find((t) => t.includes('失去一張牌'))!;
    expect(lost).toContain('剩 3 張');
    expect(lost).not.toMatch(/玫瑰|骷髏/);
    expect(dmTo(events, 'p1')!.text).toMatch(/失去了.*(玫瑰|骷髏)/);
  });

  it('出局：下一輪由骷髏的主人起始', () => {
    const s = flipState([['rose'], ['skull'], ['rose']], 2, (x) => {
      x.players[0].hand = [];
    });
    const { state, events } = step(s, (x) => flip(x, 'p1', 'p2'));
    expect(state.players[0].hand).toHaveLength(0);
    expect(announces(events).join('\n')).toContain('出局');
    expect(state.starter).toBe(1);
  });

  it('被自己的骷髏淘汰：下一輪由座位下一位起始', () => {
    const s = table([['skull'], ['rose'], ['rose']]);
    s.players[0].hand = [];
    let x = step(s, (y) => bid(y, 'p1', 1)).state;
    while (x.phase === 'bid') x = step(x, (y) => pass(y, y.players[y.turn].id)).state;
    expect(x.starter).toBe(1);
    expect(x.round).toBe(2);
  });

  it('只剩最後一人時獲勝', () => {
    const s = flipState([['rose'], ['skull'], ['rose']], 2, (x) => {
      x.players[0].hand = [];
      x.players[2].hand = [];
      x.players[2].stack = [];
    });
    const { state } = step(s, (x) => flip(x, 'p1', 'p2'));
    expect(state).toMatchObject({ phase: 'ended', winner: 'p2' });
  });

  it('第二次成功獲勝，公告成功次數和剩幾張，有再來一局', () => {
    const s = flipState([['rose'], ['rose'], ['rose']], 2, (x) => {
      x.players[0].wins = 1;
    });
    const { state, events } = step(s, (x) => flip(x, 'p1', 'p2'));
    expect(state).toMatchObject({ phase: 'ended', winner: 'p1' });
    const text = announces(events).join('\n');
    expect(text).toContain('獲勝');
    expect(text).toContain('成功 2 次');
    expect(text).toContain('剩 4 張');
    expect(values(lastChannelPrompt(events))).toEqual(['rematch']);
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state).state.phase).toBe('lobby');
    expect(run([{ type: 'rematch', user: 'x', channel: 'C1' }], state).state).toBe(state);
  });

  it('取消後沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(state.phase).toBe('ended');
    expect(prompts(events)).toHaveLength(0);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).state).toBe(state);
  });
});

describe('skull/rounds: 我的牌', () => {
  it('只讓自己看到手牌和牌疊，不改狀態；不在遊戲被拒', () => {
    const s = table([['rose', 'skull'], ['rose'], ['rose']]);
    const mine = run([{ type: 'mine', user: 'p1' }], s);
    expect(mine.state).toBe(s);
    expect(ephemeralTo(mine.events, 'p1')!.text).toContain('2 朵玫瑰');
    expect(ephemeralTo(mine.events, 'p1')!.text).toContain('🌹 → 💀');
    expect(ephemeralTo(run([{ type: 'mine', user: 'D' }], s).events, 'D')!.text).toContain('你不在這局遊戲裡');
  });
});

describe('skull/bots', () => {
  const botTable = (stacks: Disc[][]) => {
    const s = table(stacks);
    s.players[1].id = 'bot:1:Sam';
    return s;
  };

  it('牌疊有骷髏時放棄', () => {
    const s = step(botTable([['rose'], ['skull'], ['rose']]), (x) => bid(x, 'p1', 1)).state;
    expect(s.passed).toContain('bot:1:Sam');
  });

  it('牌疊 2 朵玫瑰、目前喊數 2 時加注到 3', () => {
    const s = step(botTable([['rose'], ['rose', 'rose'], ['rose']]), (x) => bid(x, 'p1', 2)).state;
    expect(s.bid).toEqual({ n: 3, by: 'bot:1:Sam' });
  });

  it('1 位真人加 2 個 bot，真人完全不操作也會結束', () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      let x = seed;
      const r = () => (x = (x * 9301 + 49297) % 233280 / 233280);
      let s = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state, r).state;
      s = run([{ type: 'start', user: 'p1' }], s, r).state;
      for (let i = 0; i < 500 && s.phase !== 'ended'; i++) s = run([timeout(s)], s, r).state;
      expect(s.phase).toBe('ended');
    }
  });
});
