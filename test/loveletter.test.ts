import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyLoveLetter, CARDS, TOKENS_TO_WIN, type LAction, type LState, type Role } from '../src/loveletter.js';

const rng = () => 0.99999;

function run(actions: LAction[], start?: LState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyLoveLetter(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as LAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'dm' && e.to === user) as { text: string }[];
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;

// rng 固定時不洗牌：牌堆依 CARDS 的順序 (間諜×2、衛兵×6、神父×2…公主)；先蓋 1 張，再依序發給 p1、p2…；第一位是最後一位玩家
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);

// 直接擺出一個局面：輪到 hands[turn] 的人，他的兩張牌已經在手上
function table(hands: Role[][], deck: Role[], opts: { turn?: number; protect?: number[]; out?: number[]; burned?: Role; ids?: string[]; discards?: Record<number, Role[]>; tokens?: number[] } = {}): LState {
  const s = started(hands.length).state;
  const ids = opts.ids ?? s.players.map((p) => p.id);
  return {
    ...s,
    players: hands.map((hand, i) => ({
      id: ids[i],
      hand,
      discards: opts.discards?.[i] ?? [],
      out: opts.out?.includes(i) ?? false,
      protected: opts.protect?.includes(i) ?? false,
      tokens: opts.tokens?.[i] ?? 0,
    })),
    deck,
    burned: opts.burned ?? 'guard',
    faceUp: [],
    turn: opts.turn ?? 0,
    turnSeq: 1,
    phase: 'turn',
  };
}

describe('loveletter/setup: 情書的房間', () => {
  it('開房：公告標示情書', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'loveletter', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '情書', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 2 人');
  });

  it('房間已滿 (6 人) 時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(6).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'x')?.text).toContain('房間已滿');
  });

  it('加 bot 補位後可以開始', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.players).toHaveLength(3);
    expect(state.phase).not.toBe('lobby');
  });

  it('bot 超過上限只加到 6 人', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(5).state);
    expect(state.players).toHaveLength(6);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('加入、離開、移除 bot、房主離開取消、房主取消', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    const bots = run([{ type: 'addBot', user: 'p1', count: 2 }], lobby).state;
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], bots).state.players).toHaveLength(4);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
  });
});

describe('loveletter/setup: 牌堆與每輪發牌', () => {
  it('牌堆 21 張，各角色張數照 2019 版', () => {
    const count = Object.fromEntries(CARDS.map((c) => [c.role, c.count]));
    expect(count).toEqual({ spy: 2, guard: 6, priest: 2, baron: 2, handmaid: 2, prince: 2, chancellor: 2, king: 1, countess: 1, princess: 1 });
    expect(CARDS.map((c) => c.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('4 人：蓋 1 張、每人 1 張，牌堆剩 16 張 (第一位再抽 1 張)', () => {
    const { state } = started(4);
    expect(state.burned).toBe('spy');
    expect(state.faceUp).toEqual([]);
    expect(state.players.map((p) => p.hand.length)).toEqual([1, 1, 1, 2]);
    expect(state.deck.length + 1).toBe(16);
    const all = [state.burned!, ...state.deck, ...state.players.flatMap((p) => p.hand)];
    expect(all).toHaveLength(21);
  });

  it('2 人：蓋 1 張、翻開 3 張並公告，牌堆剩 15 張', () => {
    const { state, events } = started(2);
    expect(state.faceUp).toEqual(['spy', 'guard', 'guard']);
    expect(state.deck.length + 1).toBe(15);
    expect(announces(events).join('\n')).toContain('翻開');
  });

  it('真人收到手牌和角色說明的私訊，bot 不收；頻道公告不含手牌', () => {
    const { events } = run([{ type: 'addBot', user: 'p1', count: 1 }, { type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(dmTo(events, 'p2')[0].text).toContain('你的手牌：1 衛兵');
    expect(dmTo(events, 'p2')[0].text).toContain('公主');
    expect(events.some((e) => e.type === 'dm' && e.to.startsWith('bot:'))).toBe(false);
    const text = announces(events)[0];
    expect(text).toContain('第 1 輪');
    expect(text).toContain('5 個');
    expect(text).not.toContain('衛兵');
  });

  it('第 1 輪隨機先手', () => {
    expect(started(3).state.turn).toBe(2);
    expect(started(3, () => 0).state.turn).toBe(0);
  });
});

describe('loveletter/setup: 看手牌', () => {
  it('只讓本人看到手牌、保護狀態和好感數', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy'], { protect: [1] });
    const { events, state } = run([{ type: 'hand', user: 'p2' }], s);
    expect(state).toBe(s);
    const text = ephemeralTo(events, 'p2')!.text;
    expect(text).toContain('你的手牌：2 神父');
    expect(text).toContain('侍女');
    expect(text).toContain('💌');
  });

  it('不在遊戲裡或已出局的人被拒絕', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy'], { out: [2] });
    expect(ephemeralTo(run([{ type: 'hand', user: 'zz' }], s).events, 'zz')!.text).toContain('你不在這一輪');
    expect(ephemeralTo(run([{ type: 'hand', user: 'p3' }], s).events, 'p3')!.text).toContain('你不在這一輪');
  });
});

const play = (s: LState, user: string, index: number, target?: string, guess?: Role) =>
  run([{ type: 'play', user, seq: s.turnSeq, index, target, guess }], s);
const ephPrompt = (events: GameEvent[], user: string) =>
  prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user).at(-1)!;
const player = (s: LState, id: string) => s.players.find((p) => p.id === id)!;

describe('loveletter/rounds: 輪到與出牌', () => {
  it('輪到時抽 1 張、解除自己的保護，頻道有出牌、手牌、棄牌紀錄按鈕，2 分鐘', () => {
    const s = table([['handmaid', 'guard'], ['priest'], ['baron']], ['king', 'spy'], { protect: [1] });
    const { state, events } = play(s, 'p1', 0);
    expect(state.turn).toBe(1);
    expect(player(state, 'p2')).toMatchObject({ hand: ['priest', 'king'], protected: false });
    expect(player(state, 'p1').protected).toBe(true);
    const p = prompts(events).filter((x) => x.audience === 'channel').at(-1)!;
    expect(values(p)).toEqual(['menu', 'hand', 'log']);
    expect(p.text).toContain('<@p2>');
    expect(announces(events).join('\n')).toContain('牌堆剩 1 張');
    expect(lastTimer(events).ms).toBe(120_000);
  });

  it('不是輪到的人按出牌被拒絕', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy']);
    expect(ephemeralTo(run([{ type: 'menu', user: 'p2' }], s).events, 'p2')!.text).toContain('還沒輪到你');
  });

  it('出牌 → 選目標 → 猜角色 (9 個、沒有衛兵)', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy']);
    const menu = ephPrompt(run([{ type: 'menu', user: 'p1' }], s).events, 'p1');
    expect(values(menu)).toEqual(['pick:1:0', 'pick:1:1']);
    expect(menu.options[0].label).toBe('1 衛兵');
    const targets = ephPrompt(run([{ type: 'pick', user: 'p1', seq: 1, index: 0 }], s).events, 'p1');
    expect(values(targets)).toEqual(['tgt:1:0:p2', 'tgt:1:0:p3']);
    expect(targets.options[0].label).toBe('p2');
    const guesses = ephPrompt(run([{ type: 'target', user: 'p1', seq: 1, index: 0, target: 'p2' }], s).events, 'p1');
    expect(guesses.options).toHaveLength(9);
    expect(values(guesses)).not.toContain('guess:1:0:guard:p2');
    expect(values(guesses)).toContain('guess:1:0:priest:p2');
  });

  it('衛兵猜中：頻道公告，目標出局', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2', 'priest');
    expect(player(state, 'p2').out).toBe(true);
    expect(player(state, 'p1').discards).toEqual(['guard']);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1>');
    expect(text).toContain('2 神父');
    expect(text).toContain('出局');
  });

  it('舊選單被拒絕，狀態不變', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy']);
    const { state, events } = run([{ type: 'play', user: 'p1', seq: 0, index: 1, target: 'p2' }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p1')!.text).toContain('過期');
  });
});

describe('loveletter/rounds: 伯爵夫人與公主、保護與沒有目標', () => {
  it('伯爵夫人和王子同時在手只能出伯爵夫人', () => {
    const s = table([['countess', 'prince'], ['priest'], ['baron']], ['spy']);
    expect(values(ephPrompt(run([{ type: 'menu', user: 'p1' }], s).events, 'p1'))).toEqual(['pick:1:0']);
    expect(run([{ type: 'play', user: 'p1', seq: 1, index: 1, target: 'p2' }], s).state).toBe(s);
    const king = table([['king', 'countess'], ['priest'], ['baron']], ['spy']);
    expect(values(ephPrompt(run([{ type: 'menu', user: 'p1' }], king).events, 'p1'))).toEqual(['pick:1:1']);
  });

  it('公主不在可以出的選項', () => {
    const s = table([['princess', 'guard'], ['priest'], ['baron']], ['spy']);
    expect(values(ephPrompt(run([{ type: 'menu', user: 'p1' }], s).events, 'p1'))).toEqual(['pick:1:1']);
    expect(run([{ type: 'play', user: 'p1', seq: 1, index: 0 }], s).state).toBe(s);
  });

  it('保護中和出局的人不在目標選單', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron'], ['spy']], ['spy'], { protect: [1], out: [3] });
    const targets = ephPrompt(run([{ type: 'pick', user: 'p1', seq: 1, index: 0 }], s).events, 'p1');
    expect(values(targets)).toEqual(['tgt:1:0:p3']);
    expect(run([{ type: 'play', user: 'p1', seq: 1, index: 0, target: 'p2', guess: 'priest' }], s).state).toBe(s);
  });

  it('沒有目標時直接打出，沒有效果', () => {
    const s = table([['baron', 'guard'], ['priest'], ['baron']], ['spy', 'spy'], { protect: [1, 2] });
    const { state, events } = run([{ type: 'pick', user: 'p1', seq: 1, index: 0 }], s);
    expect(player(state, 'p1').discards).toEqual(['baron']);
    expect(state.players.every((p) => !p.out)).toBe(true);
    expect(announces(events).join('\n')).toContain('沒有可以選的目標');
    expect(state.turn).toBe(1);
  });

  it('王子在其他人都保護時只能選自己', () => {
    const s = table([['prince', 'guard'], ['priest'], ['baron']], ['spy', 'spy'], { protect: [1, 2] });
    expect(values(ephPrompt(run([{ type: 'pick', user: 'p1', seq: 1, index: 0 }], s).events, 'p1'))).toEqual(['tgt:1:0:p1']);
  });

  it('不需要目標的牌選了就打出', () => {
    const s = table([['countess', 'guard'], ['priest'], ['baron']], ['spy', 'spy']);
    const { state } = run([{ type: 'pick', user: 'p1', seq: 1, index: 0 }], s);
    expect(player(state, 'p1')).toMatchObject({ hand: ['guard'], discards: ['countess'] });
  });
});

describe('loveletter/rounds: 角色效果', () => {
  it('衛兵猜錯沒事；不能猜衛兵', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy', 'spy']);
    expect(player(play(s, 'p1', 0, 'p2', 'king').state, 'p2').out).toBe(false);
    expect(play(s, 'p1', 0, 'p2', 'guard').state).toBe(s);
  });

  it('神父：私訊出牌的人目標的手牌，頻道不公開', () => {
    const s = table([['priest', 'guard'], ['king'], ['baron']], ['spy', 'spy']);
    const { events } = play(s, 'p1', 0, 'p2');
    expect(dmTo(events, 'p1')[0].text).toContain('<@p2> 的手牌是 7 國王');
    const text = announces(events).join('\n');
    expect(text).toContain('偷看');
    expect(text).not.toContain('國王');
  });

  it('男爵：點數小的出局並公開，勝方不公開', () => {
    const s = table([['baron', 'prince'], ['guard'], ['spy']], ['spy', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2');
    expect(player(state, 'p2')).toMatchObject({ out: true, hand: [], discards: ['guard'] });
    expect(dmTo(events, 'p1')[0].text).toContain('1 衛兵');
    expect(dmTo(events, 'p2')[0].text).toContain('5 王子');
    const text = announces(events).join('\n');
    expect(text).toContain('1 衛兵');
    expect(text).not.toContain('王子');
  });

  it('男爵同點：都沒事，只公告平手', () => {
    const s = table([['baron', 'priest'], ['priest'], ['spy']], ['spy', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2');
    expect(state.players.every((p) => !p.out)).toBe(true);
    expect(announces(events).join('\n')).toContain('平手');
  });

  it('王子：目標棄牌重抽並收到私訊；棄掉公主出局', () => {
    const s = table([['prince', 'guard'], ['king'], ['princess']], ['priest', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2');
    expect(player(state, 'p2').hand[0]).toBe('priest');
    expect(player(state, 'p2').discards).toEqual(['king']);
    expect(dmTo(events, 'p2')[0].text).toContain('2 神父');
    const out = play(s, 'p1', 0, 'p3').state;
    expect(player(out, 'p3')).toMatchObject({ out: true, hand: [], discards: ['princess'] });
    expect(out.deck).toEqual(['spy']); // p3 沒有再抽，下一位 p2 抽了 priest
  });

  it('牌堆空了出王子：拿蓋掉的那張', () => {
    const s = table([['prince', 'guard'], ['priest'], ['spy']], [], { burned: 'king' });
    const { events } = play(s, 'p1', 0, 'p1');
    expect(dmTo(events, 'p1')[0].text).toContain('7 國王');
    expect(announces(events).join('\n')).toMatch(/<@p1> 贏/);
  });

  it('宰相：抽 2 張，選 1 張留下，其他放牌堆底；放回公主不出局', () => {
    const s = table([['chancellor', 'guard'], ['priest'], ['spy']], ['princess', 'king', 'spy', 'spy', 'baron']);
    const mid = play(s, 'p1', 0);
    expect(mid.state.phase).toBe('chancellor');
    expect(mid.state.deck).toHaveLength(3);
    const keep = ephPrompt(mid.events, 'p1');
    expect(keep.options.map((o) => o.label)).toEqual(['1 衛兵', '9 公主', '7 國王']);
    const { state } = run([{ type: 'keep', user: 'p1', seq: mid.state.turnSeq, index: 2 }], mid.state);
    expect(player(state, 'p1')).toMatchObject({ hand: ['king'], out: false, discards: ['chancellor'] });
    expect(state.deck).toHaveLength(4); // 3 + 放回 2 張 - p2 抽 1 張
    expect([...state.deck.slice(-2)].sort()).toEqual(['guard', 'princess']);
  });

  it('宰相：牌堆只剩 1 張就抽 1 張', () => {
    const s = table([['chancellor', 'guard'], ['priest'], ['spy']], ['king']);
    expect(play(s, 'p1', 0).state.chancellor!.pool).toEqual(['guard', 'king']);
  });

  it('國王：交換手牌並私訊兩人', () => {
    const s = table([['king', 'guard'], ['priest'], ['spy']], ['spy', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2');
    expect(player(state, 'p1').hand).toEqual(['priest']);
    expect(player(state, 'p2').hand[0]).toBe('guard');
    expect(dmTo(events, 'p1')[0].text).toContain('2 神父');
    expect(dmTo(events, 'p2')[0].text).toContain('1 衛兵');
  });

  it('出局的人之後被跳過', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy', 'spy']);
    expect(play(s, 'p1', 0, 'p2', 'priest').state.turn).toBe(2);
  });
});

describe('loveletter/rounds: 一輪結束與好感標記', () => {
  it('只剩一人：他贏這輪，下一輪由他先開始', () => {
    const s = table([['guard', 'king'], ['priest']], ['spy', 'spy', 'spy']);
    const { state, events } = play(s, 'p1', 0, 'p2', 'priest');
    expect(player(state, 'p1').tokens).toBe(1);
    expect(state.round).toBe(2);
    expect(state.turn).toBe(0);
    expect(player(state, 'p2').out).toBe(false);
    expect(announces(events).join('\n')).toContain('第 2 輪');
  });

  it('牌堆抽完比點數；公告手牌和蓋掉的牌', () => {
    const s = table([['handmaid', 'guard'], ['king'], ['priest']], [], { burned: 'baron' });
    const { state, events } = play(s, 'p1', 0);
    expect(state.players.map((p) => p.tokens)).toEqual([0, 1, 0]);
    const text = announces(events).join('\n');
    expect(text).toContain('7 國王');
    expect(text).toContain('3 男爵');
  });

  it('同點都贏', () => {
    const s = table([['handmaid', 'guard'], ['baron'], ['baron']], []);
    expect(play(s, 'p1', 0).state.players.map((p) => p.tokens)).toEqual([0, 1, 1]);
  });

  it('間諜加分：只有一位在場的人出過間諜', () => {
    const s = table([['handmaid', 'king'], ['guard'], ['priest']], [], { discards: { 2: ['spy'] } });
    expect(play(s, 'p1', 0).state.players.map((p) => p.tokens)).toEqual([1, 0, 1]);
  });

  it('兩位都出過間諜就沒有加分；出局的人不算', () => {
    const s = table([['handmaid', 'king'], ['guard'], ['priest']], [], { discards: { 1: ['spy'], 2: ['spy'] } });
    expect(play(s, 'p1', 0).state.players.map((p) => p.tokens)).toEqual([1, 0, 0]);
    const out = table([['handmaid', 'king'], ['guard'], ['priest'], ['spy']], [], { discards: { 2: ['spy'], 3: ['spy'] }, out: [3] });
    expect(play(out, 'p1', 0).state.players.map((p) => p.tokens)).toEqual([1, 0, 1, 0]);
  });
});

describe('loveletter/rounds: 勝負與結束', () => {
  it('好感目標依人數', () => {
    expect(TOKENS_TO_WIN).toEqual({ 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 });
  });

  it('4 人局拿到 4 個：遊戲結束，有再來一局', () => {
    const s = table([['handmaid', 'king'], ['guard'], ['priest'], ['spy']], [], { tokens: [3, 0, 0, 0] });
    const { state, events } = play(s, 'p1', 0);
    expect(state).toMatchObject({ phase: 'ended', winners: ['p1'] });
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: ['p1'] });
    expect(announces(events).join('\n')).toContain('<@p1>');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state).state).toMatchObject({ phase: 'lobby', host: 'p2' });
  });

  it('同時達到：最多的人贏；同分一起贏', () => {
    const hands: Role[][] = [['handmaid', 'king'], ['guard'], ['priest'], ['guard'], ['guard']];
    const a = table(hands, [], { tokens: [3, 0, 2, 0, 0], discards: { 2: ['spy'] } });
    expect(play(a, 'p1', 0).state.winners).toEqual(['p1']);
    const b = table(hands, [], { tokens: [2, 0, 2, 0, 0], discards: { 2: ['spy'] } });
    expect(play(b, 'p1', 0).state.winners).toEqual(['p1', 'p3']);
  });

  it('取消後沒有再來一局', () => {
    const s = table([['guard', 'king'], ['priest']], ['spy']);
    const cancelled = run([{ type: 'cancel', user: 'p1' }], s).state;
    expect(cancelled.phase).toBe('ended');
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], cancelled).events).toEqual([]);
  });
});

describe('loveletter/rounds: 計時與超時', () => {
  const timeout = (s: LState) => run([{ type: 'timeout', id: s.timers.phase! }], s);

  it('超時出點數小的牌，隨機目標和猜測', () => {
    const s = table([['king', 'guard'], ['priest'], ['baron']], ['spy', 'spy']);
    const { state, events } = timeout(s);
    expect(player(state, 'p1').discards).toEqual(['guard']);
    expect(announces(events).join('\n')).toContain('超時');
  });

  it('超時遵守伯爵夫人限制、不出公主', () => {
    expect(player(timeout(table([['prince', 'countess'], ['priest'], ['baron']], ['spy', 'spy'])).state, 'p1').discards).toEqual(['countess']);
    expect(player(timeout(table([['princess', 'baron'], ['priest'], ['baron']], ['spy', 'spy'])).state, 'p1').discards[0]).toBe('baron');
  });

  it('宰相選牌超時留原本的牌', () => {
    const mid = play(table([['chancellor', 'guard'], ['priest'], ['spy']], ['princess', 'king', 'spy']), 'p1', 0);
    expect(lastTimer(mid.events).ms).toBe(120_000);
    expect(player(timeout(mid.state).state, 'p1').hand).toEqual(['guard']);
  });

  it('過期的計時器不影響', () => {
    const s = table([['king', 'guard'], ['priest'], ['baron']], ['spy', 'spy']);
    expect(run([{ type: 'timeout', id: -1 }], s).state).toBe(s);
  });
});

describe('loveletter/rounds: bot', () => {
  const BOT = 'bot:1:小明';
  const ids = ['p1', BOT, 'p3'];

  it('bot 有伯爵夫人和國王時出伯爵夫人', () => {
    const s = table([['handmaid', 'guard'], ['countess'], ['priest']], ['king', 'spy', 'spy'], { ids });
    expect(player(play(s, 'p1', 0).state, BOT).discards).toEqual(['countess']);
  });

  it('bot 有侍女先出侍女，否則出小的', () => {
    const s = table([['handmaid', 'guard'], ['prince'], ['priest']], ['handmaid', 'spy', 'spy'], { ids });
    expect(player(play(s, 'p1', 0).state, BOT).discards).toEqual(['handmaid']);
    const t = table([['handmaid', 'guard'], ['king'], ['priest']], ['spy', 'spy', 'spy'], { ids });
    expect(player(play(t, 'p1', 0).state, BOT).discards).toEqual(['spy']);
  });

  it('bot 用宰相時留點數最大的牌', () => {
    const s = table([['handmaid', 'guard'], ['princess'], ['priest']], ['chancellor', 'guard', 'king', 'spy'], { ids });
    expect(player(play(s, 'p1', 0).state, BOT)).toMatchObject({ hand: ['princess'], discards: ['chancellor'] });
  });

  it('bot 的衛兵只猜還沒公開出現的角色', () => {
    const seen: Role[] = ['spy', 'spy', 'priest', 'priest', 'baron', 'baron', 'handmaid', 'prince', 'prince', 'chancellor', 'chancellor', 'king', 'countess'];
    const s = table([['handmaid', 'guard'], ['guard'], ['priest']], ['guard', 'spy', 'spy'], { ids, discards: { 0: seen } });
    expect(announces(play(s, 'p1', 0).events).join('\n')).toContain('9 公主');
  });

  it('1 位真人 + 2 個 bot，真人不操作也會結束', () => {
    let seed = 7;
    const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let { state } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state, r);
    for (let i = 0; i < 500 && state.phase !== 'ended'; i++) state = run([{ type: 'timeout', id: state.timers.phase! }], state, r).state;
    expect(state.phase).toBe('ended');
    expect(Math.max(...state.players.map((p) => p.tokens))).toBeGreaterThanOrEqual(5);
  });
});

describe('loveletter/rounds: 棄牌紀錄', () => {
  it('任何人可看，內容包含每人棄牌、出局、保護、好感數、未公開張數，不改變狀態', () => {
    const s = table([['guard', 'king'], ['priest'], ['baron']], ['spy'], { discards: { 0: ['guard', 'priest'] }, protect: [1], out: [2], tokens: [1, 0, 0] });
    const { state, events } = run([{ type: 'log', user: 'zz' }], s);
    expect(state).toBe(s);
    const text = ephemeralTo(events, 'zz')!.text;
    expect(text).toContain('1 衛兵、2 神父');
    expect(text).toContain('出局');
    expect(text).toContain('侍女');
    expect(text).toContain('💌');
    expect(text).toContain('衛兵 5');
    expect(text).toContain('神父 1');
  });
});
