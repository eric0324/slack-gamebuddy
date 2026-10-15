import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyKittens, type Card, type KAction, type KState } from '../src/kittens.js';
import { kittens } from '../src/games/kittens.js';

const rng = () => 0.99999; // 洗牌不動；第一位是最後一位玩家

function run(actions: KAction[], start?: KState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyKittens(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as KAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);

const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'kittens' && p.audience === 'channel' && p.ref?.match(/^kittens:\d+$/));
const nopePrompts = (events: GameEvent[]) => prompts(events).filter((p) => p.ref?.startsWith('kittens:nope:'));
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const timers = (events: GameEvent[]) => events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[];
const count = (cards: Card[], card: Card) => cards.filter((c) => c === card).length;

// 自訂局面：3 人（p1、p2、p3），輪到 turn 那位，手牌和牌堆照指定
function table(hands: Card[][], deck: Card[], turn = 0, turnsLeft = 1): KState {
  const s = structuredClone(started(hands.length).state);
  s.players.forEach((p, i) => (p.hand = [...hands[i]]));
  s.deck = [...deck];
  s.turn = turn;
  s.turnsLeft = turnsLeft;
  return s;
}
const fire = (s: KState, r: () => number = rng) => run([{ type: 'timeout', id: s.timers.phase! }], s, r);
const FILL: Card[] = ['taco', 'melon', 'potato', 'beard', 'rainbow', 'taco', 'melon', 'potato'];

describe('kittens/setup: 房間', () => {
  it('開房：公告標示炸彈貓', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'kittens', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '炸彈貓', players: ['A'] });
  });

  it('人數不足：至少 2 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')[0]).toContain('至少需要 2 人');
  });

  it('房間已滿：最多 5 人', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(5).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'x')[0]).toContain('房間已滿');
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

describe('kittens/setup: 加入與移除 bot', () => {
  it('一個人加 bot 就能開始', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(2);
    expect(isBot(state.players[1].id)).toBe(true);
    expect(run([{ type: 'start', user: 'p1' }], state).state.phase).toBe('play');
  });

  it('加 bot 超過上限只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(4).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'p1')).toContain('房間已滿。');
  });

  it('非房主加 bot 被拒', () => {
    const { events } = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'p2')).toContain('只有房主可以加入 bot。');
  });

  it('removebot 從最後加入的移除', () => {
    const withBots = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    const { state } = run([{ type: 'removeBot', user: 'p1', count: 1 }], withBots);
    expect(state.players.map((p) => p.id)).toEqual(withBots.players.slice(0, 2).map((p) => p.id));
  });
});

describe('kittens/setup: 牌組與發牌', () => {
  it('2 人：每人 8 張含拆解，牌堆 35 張、1 張炸彈', () => {
    const { state } = started(2);
    for (const p of state.players) {
      expect(p.hand).toHaveLength(8);
      expect(count(p.hand, 'defuse')).toBeGreaterThanOrEqual(1);
      expect(p.hand).not.toContain('bomb');
    }
    expect(state.deck).toHaveLength(35);
    expect(count(state.deck, 'bomb')).toBe(1);
    expect(count(state.deck, 'defuse')).toBe(2);
  });

  it('5 人：牌堆 16 張、4 張炸彈、1 張拆解', () => {
    const { state } = started(5);
    expect(state.players.every((p) => p.hand.length === 8 && !p.hand.includes('bomb'))).toBe(true);
    expect(state.deck).toHaveLength(16);
    expect(count(state.deck, 'bomb')).toBe(4);
    expect(count(state.deck, 'defuse')).toBe(1);
  });

  it('牌數守恆：3 人局 46 張＋3 拆解＋2 拆解放回＋2 炸彈', () => {
    const { state } = started(3);
    const all = [...state.deck, ...state.players.flatMap((p) => p.hand)];
    expect(all).toHaveLength(46 + 3 + 2 + 2);
    expect(count(all, 'defuse')).toBe(5);
    expect(count(all, 'bomb')).toBe(2);
  });
});

describe('kittens/setup: 開局公告', () => {
  it('公告座位、炸彈數、勝利條件；真人收到手牌私訊；第一張牌桌訊息', () => {
    const { state, events } = started(3);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> → <@p2> → <@p3>');
    expect(text).toContain('2 張炸彈');
    expect(text).toContain('最後活下來的人贏');
    expect(events.filter((e) => e.type === 'dm').map((e) => (e as { to: string }).to)).toEqual(['p1', 'p2', 'p3']);
    const board = boards(events).at(-1)!;
    expect(board.ref).toBe(`kittens:${state.seq}`);
    expect(board.text).toContain(`<@${state.players[state.turn].id}>`);
  });
});

describe('kittens/setup: 指令與按鈕', () => {
  it('help 列出指令；不認識的子指令回傳 null（顯示說明）', () => {
    for (const w of ['new', 'addbot', 'removebot', 'start', 'cancel', '我的手牌', '抽牌', '反對']) expect(kittens.help).toContain(w);
    expect(kittens.parse('foo', 'U', 'C')).toBeNull();
    expect(kittens.parse('new', 'U', 'C')).toEqual({ type: 'new', user: 'U', channel: 'C' });
    expect(kittens.parse('addbot 2', 'U', 'C')).toEqual({ type: 'addBot', user: 'U', count: 2 });
  });

  it('按鈕對應 action', () => {
    const b = (kind: string, value: string) => kittens.button(kind, value, 'U', 'C');
    expect(b('join', '')).toEqual({ type: 'join', user: 'U' });
    expect(b('rematch', '')).toEqual({ type: 'rematch', user: 'U', channel: 'C' });
    expect(b('kittens', 'hand')).toEqual({ type: 'hand', user: 'U' });
    expect(b('kittens', 'nope')).toEqual({ type: 'nope', user: 'U' });
    expect(b('kittens', 'draw:3')).toEqual({ type: 'draw', user: 'U', seq: 3 });
    expect(b('kittens', 'play:3:attack')).toEqual({ type: 'play', user: 'U', seq: 3, card: 'attack' });
    expect(b('kittens', 'play:3:pair:taco')).toEqual({ type: 'play', user: 'U', seq: 3, card: 'taco', pair: true });
    expect(b('kittens', 'target:3:p2')).toEqual({ type: 'target', user: 'U', seq: 3, target: 'p2' });
    expect(b('kittens', 'give:melon')).toEqual({ type: 'give', user: 'U', card: 'melon' });
    expect(b('kittens', 'place:bottom')).toEqual({ type: 'place', user: 'U', pos: 'bottom' });
    expect(b('kittens', 'play:3:bomb')).toBeNull();
  });
});

describe('kittens/rounds: 牌桌訊息', () => {
  it('回合開始：輪到誰、牌堆張數、手牌數、兩顆按鈕，不透露手牌', () => {
    const s = table([['defuse', 'attack'], ['defuse'], ['defuse', 'skip', 'taco']], ['taco', 'melon', 'bomb']);
    const { state, events } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    const board = boards(events).at(-1)!;
    expect(board.ref).toBe(`kittens:${state.seq}`);
    expect(board.text).toContain('輪到 <@p2>');
    expect(board.text).toContain('牌堆 2 張');
    expect(board.text).toContain('<@p1>：3 張');
    expect(board.text).not.toMatch(/拆解|攻擊|塔可/);
    expect(board.options.map((o) => o.value)).toEqual(['hand', `draw:${state.seq}`]);
  });

  it('出牌後用同一個 ref 更新，手牌數少 1', () => {
    const s = table([['shuffle', 'defuse'], ['defuse'], ['defuse']], ['taco', 'bomb']);
    const { events } = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'shuffle' }], s);
    const board = boards(events).at(-1)!;
    expect(board.ref).toBe(`kittens:${s.seq}`);
    expect(board.text).toContain('🔀 洗牌');
    expect(board.text).toContain('<@p1>：1 張');
  });

  it('被攻擊：顯示還要 2 回合', () => {
    const s = table([['attack'], ['defuse'], ['defuse']], ['taco', 'bomb']);
    const played = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'attack' }], s).state;
    const { events } = fire(played);
    expect(boards(events).at(-1)!.text).toContain('輪到 <@p2>（還要 2 回合）');
  });
});

describe('kittens/rounds: 手牌選單', () => {
  const s = table([['defuse', 'attack', 'taco', 'taco', 'melon', 'nope'], ['defuse', 'skip'], ['defuse']], ['taco', 'bomb']);

  it('輪到自己：可以出的牌有按鈕，拆解、反對、單張貓咪沒有', () => {
    const { state, events } = run([{ type: 'hand', user: 'p1' }], s);
    expect(state).toBe(s);
    expect(timers(events)).toHaveLength(0);
    const menu = menuOf(events, 'p1')!;
    expect(menu.text).toContain('🧯 拆解 ×1');
    expect(menu.options.map((o) => o.value)).toEqual([`play:${s.seq}:attack`, `play:${s.seq}:pair:taco`]);
    expect(menu.options[1].label).toContain('打出一對');
  });

  it('不是自己的回合：只有手牌，沒有按鈕', () => {
    const menu = menuOf(run([{ type: 'hand', user: 'p2' }], s).events, 'p2')!;
    expect(menu.text).toContain('⏭️ 跳過 ×1');
    expect(menu.options).toEqual([]);
  });

  it('局外人和出局的人被拒', () => {
    expect(ephemeralTo(run([{ type: 'hand', user: 'Z' }], s).events, 'Z')).toEqual(['你不在這局遊戲裡。']);
    const out = structuredClone(s);
    out.players[2].out = 1;
    expect(ephemeralTo(run([{ type: 'hand', user: 'p3' }], out).events, 'p3')).toEqual(['你已經出局了。']);
  });

  it('過期選單被拒，state 不變', () => {
    const { state, events } = run([{ type: 'play', user: 'p1', seq: s.seq - 1, card: 'attack' }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p1')[0]).toContain('這個選單已經過期');
  });

  it('沒有可以指定的對象時，沒有索取和一對貓咪按鈕', () => {
    const t = table([['favor', 'taco', 'taco'], [], []], ['taco', 'bomb']);
    expect(menuOf(run([{ type: 'hand', user: 'p1' }], t).events, 'p1')!.options).toEqual([]);
  });
});

describe('kittens/rounds: 抽牌', () => {
  it('抽到一般牌：只有本人知道，回合結束換下一位', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['skip', 'bomb']);
    const { state, events } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(state.players[0].hand).toEqual(['defuse', 'skip']);
    expect(ephemeralTo(events, 'p1')[0]).toContain('⏭️ 跳過');
    expect(announces(events).join()).not.toContain('跳過');
    expect(state.turn).toBe(1);
    const ended = boards(events).find((b) => b.ref === `kittens:${s.seq}`)!;
    expect(ended.options).toEqual([]);
    expect(ended.text).toContain('回合結束');
  });

  it('不是自己的回合不能抽', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['skip', 'bomb']);
    const { state, events } = run([{ type: 'draw', user: 'p2', seq: s.seq }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p2')[0]).toContain('還沒輪到你');
  });
});

describe('kittens/rounds: 出牌與反對', () => {
  const base = () => table([['shuffle', 'attack', 'favor', 'nope'], ['defuse', 'nope'], ['defuse', 'taco']], ['taco', 'melon', 'bomb']);

  it('出牌後等 5 秒反對，期間不能出牌或抽牌；沒人反對就生效', () => {
    const s = base();
    const { state, events } = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'shuffle' }], s);
    expect(state.phase).toBe('nope');
    expect(state.players[0].hand).not.toContain('shuffle');
    expect(announces(events).join()).toContain('<@p1> 出了 🔀 洗牌');
    expect(nopePrompts(events)[0].options.map((o) => o.value)).toEqual(['nope']);
    expect(timers(events).at(-1)!.ms).toBe(5000);
    expect(run([{ type: 'draw', user: 'p1', seq: s.seq }], state).state).toBe(state);
    const done = fire(state);
    expect(done.state.phase).toBe('play');
    expect(announces(done.events).join()).toContain('洗牌生效');
    expect(timers(done.events).at(-1)!.ms).toBe(60_000);
    expect(nopePrompts(done.events).at(-1)!.options).toEqual([]);
  });

  it('被反對：攻擊失效，回合沒結束', () => {
    const s = base();
    const played = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'attack' }], s).state;
    const noped = run([{ type: 'nope', user: 'p2' }], played);
    expect(noped.state.players[1].hand).toEqual(['defuse']);
    expect(announces(noped.events).join()).toContain('<@p2> 反對');
    expect(timers(noped.events).at(-1)!.ms).toBe(5000);
    const { state, events } = fire(noped.state);
    expect(announces(events).join()).toContain('失效');
    expect(state.turn).toBe(0);
    expect(state.phase).toBe('play');
  });

  it('反對被反對（偶數）照常生效', () => {
    const s = base();
    let r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'favor' }], s);
    r = run([{ type: 'target', user: 'p1', seq: s.seq, target: 'p2' }], r.state);
    r = run([{ type: 'nope', user: 'p2' }, { type: 'nope', user: 'p1' }], r.state);
    expect(r.state.pending!.nopes).toBe(2);
    expect(fire(r.state).state.phase).toBe('favor');
  });

  it('沒有反對卡的人按反對：只有他看到提示，計時不變', () => {
    const played = run([{ type: 'play', user: 'p1', seq: base().seq, card: 'shuffle' }], base()).state;
    const { state, events } = run([{ type: 'nope', user: 'p3' }], played);
    expect(state).toBe(played);
    expect(events).toEqual([{ type: 'ephemeral', to: 'p3', text: '你手上沒有反對。' }]);
    expect(ephemeralTo(run([{ type: 'nope', user: 'Z' }], played).events, 'Z')).toEqual(['你不在這局遊戲裡。']);
  });

  it('等待結束後才按反對：來不及了', () => {
    const { events } = run([{ type: 'nope', user: 'p2' }], base());
    expect(ephemeralTo(events, 'p2')).toEqual(['來不及了。']);
  });
});

describe('kittens/rounds: 功能牌效果', () => {
  it('攻擊：不抽牌，下一位 2 回合', () => {
    const s = table([['attack'], ['defuse'], ['defuse']], ['taco', 'bomb']);
    const { state } = fire(run([{ type: 'play', user: 'p1', seq: s.seq, card: 'attack' }], s).state);
    expect(state.players[0].hand).toEqual([]);
    expect(state.deck).toHaveLength(2);
    expect(state).toMatchObject({ turn: 1, turnsLeft: 2 });
  });

  it('被攻擊的人再攻擊：下一位仍然是 2 回合', () => {
    const s = table([['defuse'], ['attack'], ['defuse']], ['taco', 'bomb'], 1, 2);
    const { state } = fire(run([{ type: 'play', user: 'p2', seq: s.seq, card: 'attack' }], s).state);
    expect(state).toMatchObject({ turn: 2, turnsLeft: 2 });
  });

  it('被攻擊時跳過：只結束 1 回合', () => {
    const s = table([['defuse'], ['skip'], ['defuse']], ['taco', 'bomb'], 1, 2);
    const { state } = fire(run([{ type: 'play', user: 'p2', seq: s.seq, card: 'skip' }], s).state);
    expect(state).toMatchObject({ turn: 1, turnsLeft: 1, phase: 'play' });
    expect(state.seq).toBe(s.seq + 1);
  });

  it('洗牌：牌堆重新洗', () => {
    const s = table([['shuffle'], ['defuse'], ['defuse']], ['taco', 'melon', 'bomb']);
    const played = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'shuffle' }], s).state;
    const { state } = fire(played, () => 0);
    expect(state.deck).toEqual(['melon', 'bomb', 'taco']);
  });

  it('預見未來：只給本人看最上面 3 張', () => {
    const s = table([['future'], ['defuse'], ['defuse']], ['taco', 'bomb', 'melon', 'skip']);
    const { events } = fire(run([{ type: 'play', user: 'p1', seq: s.seq, card: 'future' }], s).state);
    expect(ephemeralTo(events, 'p1')[0]).toContain('🌮 塔可貓 → 💣 炸彈貓 → 🍉 西瓜貓');
    expect(ephemeralTo(events, 'p1')[0]).not.toContain('跳過');
    expect(announces(events).join()).toContain('<@p1> 看了未來');
    expect(announces(events).join()).not.toContain('炸彈貓 →');
  });

  it('索取：對象選一張給出牌者，只有兩人知道', () => {
    const s = table([['favor'], ['defuse', 'attack'], ['defuse']], ['taco', 'bomb']);
    let r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'favor' }], s);
    expect(menuOf(r.events, 'p1')!.options.map((o) => o.value)).toEqual([`target:${s.seq}:p2`, `target:${s.seq}:p3`]);
    r = fire(run([{ type: 'target', user: 'p1', seq: s.seq, target: 'p2' }], r.state).state);
    expect(r.state.phase).toBe('favor');
    expect(menuOf(r.events, 'p2')!.options.map((o) => o.value)).toEqual(['give:defuse', 'give:attack']);
    const { state, events } = run([{ type: 'give', user: 'p2', card: 'attack' }], r.state);
    expect(state.players[0].hand).toEqual(['attack']);
    expect(state.players[1].hand).toEqual(['defuse']);
    expect(ephemeralTo(events, 'p1')[0]).toContain('⚔️ 攻擊');
    expect(ephemeralTo(events, 'p2')[0]).toContain('⚔️ 攻擊');
    expect(announces(events)).toContain('🙏 <@p2> 給了 <@p1> 一張牌。');
    expect(state.phase).toBe('play');
  });

  it('索取超時：隨機給一張', () => {
    const s = table([['favor'], ['defuse', 'attack'], ['defuse']], ['taco', 'bomb']);
    let r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'favor' }, { type: 'target', user: 'p1', seq: s.seq, target: 'p2' }], s);
    r = fire(fire(r.state).state);
    expect(r.state.players[0].hand).toEqual(['attack']);
    expect(r.state.players[1].hand).toEqual(['defuse']);
  });

  it('一對貓咪：從對象隨機偷一張，只有兩人知道', () => {
    const s = table([['taco', 'taco', 'melon'], ['defuse'], ['skip', 'nope']], ['taco', 'bomb']);
    let r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'taco', pair: true }, { type: 'target', user: 'p1', seq: s.seq, target: 'p3' }], s);
    expect(r.state.players[0].hand).toEqual(['melon']);
    expect(announces(r.events).join()).toContain('對 <@p3>');
    r = fire(r.state);
    expect(r.state.players[0].hand).toEqual(['melon', 'nope']);
    expect(r.state.players[2].hand).toEqual(['skip']);
    expect(ephemeralTo(r.events, 'p1')[0]).toContain('🚫 反對');
    expect(ephemeralTo(r.events, 'p3')[0]).toContain('🚫 反對');
    expect(announces(r.events).join()).not.toContain('🚫 反對');
  });
});

describe('kittens/rounds: 抽牌與炸彈', () => {
  it('拆解炸彈：自動用掉拆解，私下選位置，頻道不公開位置', () => {
    const s = table([['defuse', 'taco'], ['defuse'], ['defuse']], ['bomb', 'taco', 'melon', 'skip']);
    const drew = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(drew.state.phase).toBe('place');
    expect(drew.state.players[0].hand).toEqual(['taco']);
    expect(announces(drew.events).join()).toContain('抽到 💣 炸彈貓');
    expect(announces(drew.events).join()).toContain('拆解成功');
    expect(menuOf(drew.events, 'p1')!.options.map((o) => o.value)).toEqual(['place:top', 'place:2', 'place:3', 'place:bottom', 'place:random']);
    expect(timers(drew.events).at(-1)!.ms).toBe(30_000);
    const { state, events } = run([{ type: 'place', user: 'p1', pos: 'top' }], drew.state);
    expect(state.deck).toEqual(['bomb', 'taco', 'melon', 'skip']);
    expect(announces(events)).toContain('💣 炸彈已經放回牌堆。');
    expect(announces(events).join()).not.toMatch(/最上面|第 2 張|最底下/);
    expect(state.turn).toBe(1);
  });

  it('放第 2 張、最底下', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['bomb', 'taco', 'melon', 'skip']);
    const drew = run([{ type: 'draw', user: 'p1', seq: s.seq }], s).state;
    expect(run([{ type: 'place', user: 'p1', pos: '2' }], drew).state.deck).toEqual(['taco', 'bomb', 'melon', 'skip']);
    expect(run([{ type: 'place', user: 'p1', pos: 'bottom' }], drew).state.deck).toEqual(['taco', 'melon', 'skip', 'bomb']);
  });

  it('牌堆太少時選項變少', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['bomb', 'taco']);
    const { events } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(menuOf(events, 'p1')!.options.map((o) => o.value)).toEqual(['place:top', 'place:bottom', 'place:random']);
  });

  it('放置超時：隨機放回', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['bomb', 'taco', 'melon']);
    const drew = run([{ type: 'draw', user: 'p1', seq: s.seq }], s).state;
    const { state, events } = fire(drew);
    expect(count(state.deck, 'bomb')).toBe(1);
    expect(state.deck).toHaveLength(3);
    expect(announces(events)).toContain('💣 炸彈已經放回牌堆。');
  });

  it('沒有拆解：出局，手牌丟掉，換下一位', () => {
    const s = table([['defuse'], ['taco', 'skip'], ['defuse']], ['bomb', 'taco', 'bomb'], 1);
    const { state, events } = run([{ type: 'draw', user: 'p2', seq: s.seq }], s);
    expect(state.players[1]).toMatchObject({ hand: [], out: 1 });
    expect(announces(events).join()).toContain('<@p2> 出局');
    expect(state.deck).toEqual(['taco', 'bomb']);
    expect(state).toMatchObject({ turn: 2, turnsLeft: 1 });
  });

  it('被攻擊時爆炸：剩下的回合取消', () => {
    const s = table([['defuse'], ['taco'], ['defuse']], ['bomb', 'taco', 'bomb'], 1, 2);
    expect(run([{ type: 'draw', user: 'p2', seq: s.seq }], s).state).toMatchObject({ turn: 2, turnsLeft: 1 });
  });
});

describe('kittens/rounds: 計時', () => {
  it('出牌超時：自動抽牌', () => {
    const s = table([['defuse'], ['defuse'], ['defuse']], ['skip', 'bomb']);
    const { state, events } = fire(s);
    expect(state.players[0].hand).toEqual(['defuse', 'skip']);
    expect(announces(events).join()).toContain('<@p1> 超時，自動抽牌');
    expect(state.turn).toBe(1);
  });

  it('舊計時器被忽略', () => {
    const s = table([['shuffle'], ['defuse'], ['defuse']], ['skip', 'bomb']);
    const played = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'shuffle' }], s).state;
    expect(run([{ type: 'timeout', id: s.timers.phase! }], played).state).toBe(played);
  });

  it('選對象時超時：自動抽牌', () => {
    const s = table([['favor'], ['defuse'], ['defuse']], ['skip', 'bomb']);
    const choosing = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'favor' }], s).state;
    expect(choosing.phase).toBe('target');
    const { state } = fire(choosing);
    expect(state.players[0].hand).toEqual(['favor', 'skip']);
    expect(state.turn).toBe(1);
  });
});

describe('kittens/rounds: 勝負與結束', () => {
  it('最後存活：公告名次，送出 result，貼再來一局', () => {
    const s = table([['defuse'], ['taco'], ['skip']], ['bomb', 'taco', 'bomb'], 2);
    let r = run([{ type: 'draw', user: 'p3', seq: s.seq }], s); // p3 出局
    r = run([{ type: 'draw', user: 'p1', seq: r.state.seq }], r.state); // p1 抽到 taco
    r = run([{ type: 'draw', user: 'p2', seq: r.state.seq }], r.state); // p2 出局
    expect(r.state.phase).toBe('ended');
    expect(r.state.winners).toEqual(['p1']);
    expect(r.events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1'] });
    const text = announces(r.events).join('\n');
    expect(text).toContain('1. <@p1>');
    expect(text).toContain('2. <@p2>');
    expect(text).toContain('3. <@p3>');
    expect(prompts(r.events).some((p) => p.kind === 'rematch')).toBe(true);
    // 結束後舊按鈕被忽略
    expect(run([{ type: 'hand', user: 'p1' }], r.state).events).toEqual([]);
    // 再來一局：上一局玩家才能開
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], r.state).state).toMatchObject({ phase: 'lobby', host: 'p2' });
    expect(ephemeralTo(run([{ type: 'rematch', user: 'Z', channel: 'C1' }], r.state).events, 'Z')[0]).toContain('只有上一局的玩家');
  });

  it('取消：沒有 result、沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(state.phase).toBe('ended');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
  });
});

describe('kittens/bots', () => {
  // p1 真人、p2 是 bot、p3 真人
  function botTable(hands: Card[][], deck: Card[], turn = 0, turnsLeft = 1): KState {
    const s = table(hands, deck, turn, turnsLeft);
    s.players[1].id = 'bot:1:小明';
    return s;
  }
  const BOT = 'bot:1:小明';

  it('看未來後閃開炸彈', () => {
    const s = botTable([['defuse'], ['future', 'skip'], ['defuse']], ['taco', 'bomb', 'melon']);
    let r = run([{ type: 'draw', user: 'p1', seq: s.seq }], s); // 輪到 bot，bot 出預見未來
    expect(announces(r.events).join()).toContain('出了 🔮 預見未來');
    r = fire(r.state); // 預見未來生效，bot 看到炸彈 → 出跳過
    expect(announces(r.events).join()).toContain('出了 ⏭️ 跳過');
    r = fire(r.state);
    expect(r.state.turn).toBe(2);
    expect(r.state.players[1].hand).toEqual([]);
    expect(r.state.deck[0]).toBe('bomb');
  });

  it('沒什麼牌就抽牌', () => {
    const s = botTable([['defuse'], ['defuse', 'taco', 'melon'], ['defuse']], ['taco', 'skip', 'bomb']);
    const { state } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(state.players[1].hand).toEqual(['defuse', 'taco', 'melon', 'skip']);
    expect(state.turn).toBe(2);
  });

  it('一對貓咪指定手牌最多的人', () => {
    const s = botTable([['defuse'], ['taco', 'taco'], ['defuse', 'skip', 'nope']], ['melon', 'skip', 'bomb']);
    const { state } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(state.pending).toMatchObject({ card: 'taco', pair: true, by: BOT, target: 'p3' });
  });

  it('反對對自己不利的攻擊，不反對洗牌', () => {
    const s = botTable([['attack', 'shuffle'], ['nope', 'defuse'], ['defuse']], ['taco', 'bomb']);
    const attacked = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'attack' }], s);
    expect(attacked.state.pending!.nopes).toBe(1);
    expect(attacked.state.players[1].hand).toEqual(['defuse']);
    const shuffled = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'shuffle' }], s);
    expect(shuffled.state.pending!.nopes).toBe(0);
  });

  it('被索取給最不重要的牌', () => {
    const s = botTable([['favor'], ['defuse', 'attack', 'melon'], ['defuse']], ['taco', 'bomb']);
    const r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 'favor' }, { type: 'target', user: 'p1', seq: s.seq, target: BOT }], s);
    const { state } = fire(r.state);
    expect(state.players[0].hand).toEqual(['melon']);
    expect(state.phase).toBe('play');
  });

  it('拆解後隨機放回', () => {
    const s = botTable([['defuse'], ['defuse'], ['defuse']], ['taco', 'bomb', 'melon']);
    const { state } = run([{ type: 'draw', user: 'p1', seq: s.seq }], s);
    expect(state.players[1].hand).toEqual([]);
    expect(count(state.deck, 'bomb')).toBe(1);
    expect(state.turn).toBe(2);
  });

  it('1 位真人 + 2 個 bot，真人不操作也會結束並送出 result', () => {
    let seed = 7;
    const r = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let res = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], undefined, r);
    const all: GameEvent[] = [...res.events];
    for (let i = 0; i < 500 && res.state.phase !== 'ended'; i++) {
      res = fire(res.state, r);
      all.push(...res.events);
    }
    expect(res.state.phase).toBe('ended');
    expect(all.some((e) => e.type === 'result')).toBe(true);
  });
});
