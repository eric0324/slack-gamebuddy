import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applySushiGo, botCard, newDeck, scorePudding, scoreRound, type Card, type SGAction, type SGState } from '../src/sushigo.js';

const rng = () => 0.99999; // 洗牌不動：牌組照 newDeck() 的順序

function run(actions: SGAction[], start?: SGState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySushiGo(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as SGAction),
  ]);
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'sushigo' && p.audience === 'channel');
const menus = (events: GameEvent[], user: string) => prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user);
const sortCards = (cards: Card[]) => [...cards].sort();

const totals = (tables: Card[][]) => scoreRound(tables).map((r) => r.total);
const one = (table: Card[]) => scoreRound([table])[0];
const rep = (card: Card, n: number): Card[] => Array.from({ length: n }, () => card);

describe('sushigo/rounds: 每輪計分', () => {
  it('天婦羅每 2 張 5 分、生魚片每 3 張 10 分', () => {
    expect(one([...rep('tempura', 3), ...rep('sashimi', 4)]).detail).toMatchObject({ tempura: 5, sashimi: 10 });
    expect(one(rep('tempura', 4)).total).toBe(10);
    expect(one(rep('sashimi', 6)).total).toBe(20);
    expect(one(rep('sashimi', 2)).total).toBe(0);
  });

  it('煎餃 1～5 張 1/3/6/10/15，6 張以上還是 15', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => one(rep('dumpling', n)).total)).toEqual([1, 3, 6, 10, 15, 15]);
  });

  it('握壽司 1/2/3、筷子 0、布丁這一輪不計分', () => {
    expect(one(['egg', 'salmon', 'squid']).total).toBe(6);
    expect(one(['chopsticks', 'pudding', 'pudding']).total).toBe(0);
  });

  it('芥末讓之後的一張握壽司 ×3', () => {
    expect(one(['wasabi', 'salmon', 'squid', 'wasabi']).detail.nigiri).toBe(9);
    expect(one(['egg', 'wasabi']).total).toBe(1);
    expect(one(['wasabi', 'wasabi', 'squid', 'egg']).total).toBe(12);
    expect(one(['wasabi']).total).toBe(0);
  });

  it('壽司捲：最多 6 分，第二多平分 3 分', () => {
    expect(totals([['maki3', 'maki2'], ['maki3'], ['maki2', 'maki1']])).toEqual([6, 1, 1]);
  });

  it('壽司捲：最多同分平分 6，沒有第二名', () => {
    expect(totals([['maki3', 'maki1'], ['maki2', 'maki2'], ['maki2']])).toEqual([3, 3, 0]);
  });

  it('壽司捲：沒有壽司捲不得分；只有一人有', () => {
    expect(totals([['maki2'], ['tempura'], []])).toEqual([6, 0, 0]);
    expect(totals([['maki1'], ['maki2'], ['maki3'], []])).toEqual([0, 3, 6, 0]);
  });
});

describe('sushigo/rounds: 布丁計分', () => {
  it('最多 +6、最少 −6，同分平分捨去小數', () => {
    expect(scorePudding([3, 1, 1])).toEqual([6, -3, -3]);
    expect(scorePudding([2, 2, 1, 0])).toEqual([3, 3, 0, -6]);
    expect(scorePudding([5, 1, 1, 1, 1])).toEqual([6, -1, -1, -1, -1]);
  });

  it('2 人局不扣分；大家一樣多都不加不減', () => {
    expect(scorePudding([3, 1])).toEqual([6, 0]);
    expect(scorePudding([2, 2, 2])).toEqual([0, 0, 0]);
  });
});

describe('sushigo/setup: 壽司派對的房間', () => {
  it('開房：公告標示壽司派對', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'sushigo', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '壽司派對', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 2 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 2 人');
  });

  it('房間已滿（5 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(5).state);
    expect(state.players).toHaveLength(5);
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

describe('sushigo/setup: 加入與移除 bot', () => {
  it('addbot／removebot、數量', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(1).state).state;
    expect(added.players).toHaveLength(2);
    expect(isBot(added.players[1].id)).toBe(true);
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], added).state.players).toHaveLength(1);
  });

  it('超過 5 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(4).state);
    expect(state.players).toHaveLength(5);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('非房主或開始後被拒', () => {
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state).events, 'p2')?.text).toContain('只有房主可以加入 bot');
    const s = started(2).state;
    expect(run([{ type: 'addBot', user: 'p1', count: 1 }], s).state.players).toHaveLength(2);
  });
});

describe('sushigo/setup: 牌組與發牌、開局', () => {
  it('牌組 108 張，各牌種張數照官方', () => {
    const deck = newDeck();
    expect(deck).toHaveLength(108);
    const n = (c: Card) => deck.filter((x) => x === c).length;
    expect([n('tempura'), n('sashimi'), n('dumpling'), n('maki1'), n('maki2'), n('maki3')]).toEqual([14, 14, 14, 6, 12, 8]);
    expect([n('egg'), n('salmon'), n('squid'), n('pudding'), n('wasabi'), n('chopsticks')]).toEqual([5, 10, 5, 10, 6, 4]);
  });

  it('手牌 2 人 10、3 人 9、4 人 8、5 人 7；手牌＋牌組＝108', () => {
    for (const [n, h] of [[2, 10], [3, 9], [4, 8], [5, 7]]) {
      const s = started(n).state;
      expect(s.players.every((p) => p.hand.length === h)).toBe(true);
      expect(s.deck).toHaveLength(108 - n * h);
      expect(sortCards([...s.deck, ...s.players.flatMap((p) => p.hand)])).toEqual(sortCards(newDeck()));
    }
  });

  it('座位是加入順序，公告座位、3 輪、手牌張數、勝利條件，真人收到規則私訊，發出第 1 輪第 1 回合牌桌', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 1 }, { type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.players.map((p) => p.id).slice(0, 3)).toEqual(['p1', 'p2', 'p3']);
    expect(state).toMatchObject({ phase: 'pick', round: 1, turn: 1 });
    const text = announces(events).join('\n');
    for (const s of ['<@p1> → <@p2> → <@p3>', '3 輪', '8 張', '總分最高', '布丁']) expect(text).toContain(s);
    const dms = events.filter((e) => e.type === 'dm').map((e) => (e as { to: string }).to);
    expect(dms).toEqual(['p1', 'p2', 'p3']);
    const b = boards(events).at(-1)!;
    expect(b.ref).toBe(`sushigo:${state.seq}`);
    expect(b.text).toContain('第 1/3 輪第 1/8 回合');
  });
});

// 開一局 n 人，然後把 state 改成想要的樣子
function custom(patch: (s: SGState) => void, n = 3) {
  const s = structuredClone(started(n).state);
  patch(s);
  return s;
}
const pick = (s: SGState, user: string, card: Card): SGAction => ({ type: 'pick', user, seq: s.seq, card });
const extra = (s: SGState, user: string, card: Card | 'none'): SGAction => ({ type: 'extra', user, seq: s.seq, card });
const hands = (h: Card[][]) => (s: SGState) => s.players.forEach((p, i) => (p.hand = [...h[i]]));

describe('sushigo/rounds: 牌桌訊息與選牌進度', () => {
  it('開局牌桌：已選 0/N、還沒選的 @、我的手牌按鈕', () => {
    const first = boards(started(3).events).at(-1)!;
    expect(first.text).toContain('已選 0/3，還沒選：<@p1> <@p2> <@p3>');
    expect(first.options).toEqual([{ value: 'hand', label: '🍣 我的手牌' }]);
  });

  it('每人桌上的牌合併張數、布丁、累積分數；不含任何人的手牌和選擇', () => {
    const s = custom((s) => {
      hands([['squid', 'squid'], ['egg', 'egg'], ['egg', 'egg']])(s);
      s.players[1].table = ['tempura', 'tempura', 'chopsticks'];
      s.players[1].puddings = 2;
      s.players[1].rounds = [12];
    });
    const text = boards(run([pick(s, 'p1', 'squid')], s).events)[0].text;
    expect(text).toContain('<@p2>：🍤 天婦羅 ×2、🥢 筷子 ×1｜🍮 2｜累積 12 分');
    expect(text).not.toContain('魷魚');
    expect(text).not.toContain('玉子');
  });

  it('有人第一次選好：同一個 ref 更新「已選 1/3」；改選不改進度', () => {
    const s = custom(hands([['tempura', 'dumpling'], ['egg', 'egg'], ['wasabi', 'pudding']]));
    const a = run([pick(s, 'p1', 'tempura')], s);
    const b = boards(a.events);
    expect(b).toHaveLength(1);
    expect(b[0].ref).toBe(`sushigo:${s.seq}`);
    expect(b[0].text).toContain('已選 1/3，還沒選：<@p2> <@p3>');
    const again = run([pick(s, 'p1', 'dumpling')], a.state);
    expect(boards(again.events)).toHaveLength(0);
    expect(again.state.players[0].pick).toBe('dumpling');
    expect(ephemeralTo(again.events, 'p1')?.text).toBe('你選了 🥟 煎餃（揭曉前可以改）');
  });
});

describe('sushigo/rounds: 手牌選單與選牌', () => {
  it('只給本人、相同牌合併 ×N、依牌種順序、value 帶 seq；不改 state、不重設計時器', () => {
    const s = custom(hands([['wasabi', 'tempura', 'pudding', 'tempura', 'dumpling'], ['egg'], ['egg']]));
    const { state, events } = run([{ type: 'hand', user: 'p1' }], s);
    expect(state).toBe(s);
    expect(events.some((e) => e.type === 'startTimer')).toBe(false);
    const m = menus(events, 'p1')[0];
    expect(m.kind).toBe('sushigo');
    expect(m.options.map((o) => o.label)).toEqual(['🍤 天婦羅 ×2', '🥟 煎餃 ×1', '🍮 布丁 ×1', '🟢 芥末 ×1']);
    expect(m.options[0].value).toBe(`pick:${s.seq}:tempura`);
  });

  it('不在遊戲被拒', () => {
    const s = started(3).state;
    expect(ephemeralTo(run([{ type: 'hand', user: 'x' }], s).events, 'x')?.text).toBe('你不在這局遊戲裡。');
    expect(ephemeralTo(run([pick(s, 'x', 'tempura')], s).events, 'x')?.text).toBe('你不在這局遊戲裡。');
  });

  it('過期的選單、手上沒有的牌被拒，state 不變', () => {
    const s = custom(hands([['tempura', 'egg'], ['egg', 'egg'], ['wasabi', 'pudding']]));
    const stale = run([{ type: 'pick', user: 'p1', seq: s.seq - 1, card: 'tempura' }], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1')?.text).toBe('這個選單已經過期，請重新按「🍣 我的手牌」。');
    const missing = run([pick(s, 'p1', 'squid')], s);
    expect(missing.state).toBe(s);
    expect(ephemeralTo(missing.events, 'p1')?.text).toBe('你手上沒有 🦑 魷魚握壽司。');
  });
});

describe('sushigo/rounds: 揭曉與傳牌', () => {
  it('全部選好立刻揭曉：牌桌同一 ref 改成已揭曉、公告每人出的牌、上桌、手牌傳給下一位、下一回合新的 ref', () => {
    const s = custom(hands([['tempura', 'pudding', 'egg'], ['dumpling', 'wasabi', 'egg'], ['chopsticks', 'sashimi', 'egg']]));
    const seq = s.seq;
    const { state, events } = run([pick(s, 'p1', 'egg'), pick(s, 'p2', 'egg'), pick(s, 'p3', 'egg')], s);
    const b = boards(events);
    expect(b[0]).toMatchObject({ ref: `sushigo:${seq}`, options: [] });
    expect(b[0].text).toContain('已揭曉');
    expect(announces(events).join()).toContain('揭曉：<@p1> 🍳 玉子握壽司、<@p2> 🍳 玉子握壽司、<@p3> 🍳 玉子握壽司');
    expect(state.players.map((p) => p.table)).toEqual([['egg'], ['egg'], ['egg']]);
    expect(state.players.map((p) => p.hand)).toEqual([
      ['chopsticks', 'sashimi'],
      ['tempura', 'pudding'],
      ['dumpling', 'wasabi'],
    ]);
    expect(state.seq).toBe(seq + 1);
    expect(state.turn).toBe(s.turn + 1);
    expect(b.at(-1)!.ref).toBe(`sushigo:${seq + 1}`);
    expect(events.some((e) => e.type === 'startTimer')).toBe(true);
  });
});

describe('sushigo/rounds: 用筷子出兩張', () => {
  const withChop = () =>
    custom((s) => {
      hands([['salmon', 'squid', 'pudding'], ['egg', 'egg', 'egg'], ['tempura', 'tempura', 'tempura']])(s);
      s.players[0].table = ['chopsticks'];
    });

  it('有可用筷子：選完第一張收到筷子選單（剩下的牌＋不用筷子）', () => {
    const s = withChop();
    const { events } = run([pick(s, 'p1', 'salmon')], s);
    const m = menus(events, 'p1')[0];
    expect(m.text).toContain('🥢 要用筷子再出一張嗎？');
    expect(m.options).toEqual([
      { value: `extra:${s.seq}:squid`, label: '🦑 魷魚握壽司 ×1' },
      { value: `extra:${s.seq}:pudding`, label: '🍮 布丁 ×1' },
      { value: `extra:${s.seq}:none`, label: '不用筷子' },
    ]);
  });

  it('沒有筷子、手牌只剩 1 張時不會出現筷子選單', () => {
    const s = custom(hands([['salmon', 'squid'], ['egg', 'egg'], ['egg', 'egg']]));
    expect(menus(run([pick(s, 'p1', 'salmon')], s).events, 'p1')).toHaveLength(0);
    const last = custom((s) => {
      hands([['salmon'], ['egg'], ['egg']])(s);
      s.players[0].table = ['chopsticks'];
    });
    expect(run([pick(last, 'p1', 'salmon')], last).state.players[0].extra).toBeNull();
  });

  it('同回合才出的筷子不能用：揭曉後下一回合才有筷子選單', () => {
    const s = custom(hands([['chopsticks', 'egg', 'egg'], ['egg', 'egg', 'egg'], ['egg', 'egg', 'egg']]));
    const r = run([pick(s, 'p1', 'chopsticks'), pick(s, 'p2', 'egg'), pick(s, 'p3', 'egg')], s);
    expect(menus(r.events, 'p1')).toHaveLength(0);
    const next = run([pick(r.state, 'p1', 'egg')], r.state);
    expect(menus(next.events, 'p1')).toHaveLength(1);
  });

  it('還沒回答筷子不算選好、不揭曉；選「不用筷子」算選好', () => {
    const s = withChop();
    const a = run([pick(s, 'p2', 'egg'), pick(s, 'p3', 'tempura'), pick(s, 'p1', 'salmon')], s);
    expect(a.state.seq).toBe(s.seq);
    expect(a.state.players[0].extra).toBeUndefined();
    const b = run([extra(s, 'p1', 'none')], a.state);
    expect(b.state.seq).toBe(s.seq + 1);
    expect(b.state.players[0].table).toEqual(['chopsticks', 'salmon']);
  });

  it('還沒回答筷子時進度不算他', () => {
    const s = withChop();
    const a = run([pick(s, 'p1', 'salmon')], s);
    expect(boards(a.events)).toHaveLength(0);
    const b = run([extra(s, 'p1', 'squid')], a.state);
    expect(boards(b.events)[0].text).toContain('已選 1/3');
  });

  it('改選第一張會清掉第二張並重送筷子選單', () => {
    const s = withChop();
    const a = run([pick(s, 'p1', 'salmon'), extra(s, 'p1', 'squid'), pick(s, 'p1', 'pudding')], s);
    expect(a.state.players[0]).toMatchObject({ pick: 'pudding', extra: undefined });
    expect(menus(a.events, 'p1')[0].options.map((o) => o.value)).toContain(`extra:${s.seq}:salmon`);
  });

  it('揭曉：兩張依序上桌、桌上筷子少一張、筷子回到手牌傳給下一位、公告標示 🥢', () => {
    const s = withChop();
    const { state, events } = run([pick(s, 'p1', 'salmon'), extra(s, 'p1', 'squid'), pick(s, 'p2', 'egg'), pick(s, 'p3', 'tempura')], s);
    expect(state.players[0].table).toEqual(['salmon', 'squid']);
    expect(sortCards(state.players[1].hand)).toEqual(sortCards(['pudding', 'chopsticks']));
    expect(announces(events).join()).toContain('<@p1> 🥢 🍣 鮭魚握壽司＋🦑 魷魚握壽司');
  });

  it('先放第一張：芥末＋魷魚用筷子一起出，魷魚放在這張芥末上', () => {
    const s = custom((s) => {
      hands([['wasabi', 'squid', 'egg'], ['egg', 'egg', 'egg'], ['egg', 'egg', 'egg']])(s);
      s.players[0].table = ['chopsticks'];
    });
    const { state } = run([pick(s, 'p1', 'wasabi'), extra(s, 'p1', 'squid'), pick(s, 'p2', 'egg'), pick(s, 'p3', 'egg')], s);
    expect(scoreRound([state.players[0].table])[0].detail.nigiri).toBe(9);
  });

  it('沒有筷子、還沒選第一張、扣掉第一張後沒有這張都被拒，state 不變', () => {
    const s = withChop();
    const noChop = run([pick(s, 'p2', 'egg')], s).state;
    const r1 = run([extra(s, 'p2', 'egg')], noChop);
    expect(r1.state).toBe(noChop);
    expect(ephemeralTo(r1.events, 'p2')?.text).toBe('你桌上沒有筷子。');
    const r2 = run([extra(s, 'p1', 'squid')], s);
    expect(r2.state).toBe(s);
    expect(ephemeralTo(r2.events, 'p1')?.text).toBe('請先選第一張牌。');
    const picked = run([pick(s, 'p1', 'salmon')], s).state;
    const r3 = run([extra(s, 'p1', 'salmon')], picked);
    expect(r3.state).toBe(picked);
    expect(ephemeralTo(r3.events, 'p1')?.text).toBe('你手上沒有第二張 🍣 鮭魚握壽司。');
    const r4 = run([{ type: 'extra', user: 'p1', seq: s.seq - 1, card: 'squid' }], picked);
    expect(ephemeralTo(r4.events, 'p1')?.text).toBe('這個選單已經過期，請重新按「🍣 我的手牌」。');
  });
});

describe('sushigo/rounds: 超時', () => {
  it('沒選的人依 bot 規則出牌、選了第一張沒回答筷子只出第一張、公告標示超時、舊計時器被忽略', () => {
    const s = custom((s) => {
      hands([['egg', 'squid', 'tempura'], ['tempura', 'egg', 'egg'], ['egg', 'egg', 'egg']])(s);
      s.players[1].table = ['chopsticks'];
    });
    const a = run([pick(s, 'p2', 'tempura'), pick(s, 'p3', 'egg')], s);
    expect(a.state.players[1].extra).toBeUndefined();
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! }], a.state);
    expect(state.players[0].table).toEqual(['squid']);
    expect(state.players[1].table).toEqual(['chopsticks', 'tempura']);
    const text = announces(events).join();
    expect(text).toContain('<@p1> 🦑 魷魚握壽司（超時自動出牌）');
    expect(text).toContain('<@p2> 🍤 天婦羅、');
    const old = run([{ type: 'timeout', id: s.timers.phase! }], state);
    expect(old.state).toBe(state);
  });
});

// 3 人局某一輪的最後一回合：每人手上只剩一張
function lastTurn(round: number, opts: { rounds?: number[][]; puddings?: number[]; tables?: Card[][]; last: Card[] }) {
  return custom((s) => {
    s.round = round;
    s.players.forEach((p, i) => {
      p.hand = [opts.last[i]];
      p.table = [...(opts.tables?.[i] ?? [])];
      p.rounds = [...(opts.rounds?.[i] ?? [])];
      p.puddings = opts.puddings?.[i] ?? 0;
    });
  });
}
const finish = (s: SGState) => run(s.players.map((p) => pick(s, p.id, p.hand[0])), s);

describe('sushigo/rounds: 每輪計分', () => {
  it('手牌出完就計分：公告每人各項分數、這輪合計、累積和布丁；布丁累積、桌面清空；第 2 輪從剩下的牌組發牌', () => {
    const s = lastTurn(1, {
      tables: [['tempura', 'maki3', 'pudding'], ['sashimi', 'sashimi'], ['dumpling', 'dumpling', 'wasabi']],
      last: ['tempura', 'sashimi', 'squid'],
    });
    const deck = s.deck.length;
    const { state, events } = finish(s);
    expect(state.players.map((p) => p.rounds)).toEqual([[11], [10], [12]]);
    expect(state.players.map((p) => p.puddings)).toEqual([1, 0, 0]);
    const text = announces(events).find((t) => t.includes('第 1 輪計分'))!;
    expect(text).toContain('<@p1>：天婦羅 5、壽司捲 6 → 本輪 11 分，累積 11 分，🍮 1');
    expect(text).toContain('<@p3>：煎餃 3、握壽司 9 → 本輪 12 分，累積 12 分，🍮 0');
    expect(state).toMatchObject({ round: 2, turn: 1, phase: 'pick' });
    expect(state.players.every((p) => p.hand.length === 9 && p.table.length === 0)).toBe(true);
    expect(state.deck).toHaveLength(deck - 27);
  });
});

describe('sushigo/rounds: 布丁計分與勝負', () => {
  it('第 3 輪結束：布丁加減分、總分、名次由高到低、獲勝者、再來一局；result 的 winners 是最高分', () => {
    const s = lastTurn(3, { rounds: [[10, 10], [20, 20], [5, 5]], puddings: [3, 0, 1], last: ['egg', 'egg', 'egg'] });
    const { state, events } = finish(s);
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['p2']);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p2'] });
    const text = announces(events).join('\n');
    expect(text).toContain('🍮 布丁：<@p1> 3 個 +6、<@p2> 0 個 −6、<@p3> 1 個 0');
    expect(text).toMatch(/1\. <@p2> 35 分.*🏆\n2\. <@p1> 27 分.*\n3\. <@p3> 11 分/);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分比布丁', () => {
    const s = lastTurn(3, { rounds: [[20, 20], [26, 20], [0, 0]], puddings: [4, 2, 0], last: ['egg', 'egg', 'egg'] });
    expect(finish(s).state.winners).toEqual(['p1']);
  });

  it('同分同布丁並列都在 winners', () => {
    const s = lastTurn(3, { rounds: [[20, 20], [20, 20], [0, 0]], puddings: [2, 2, 0], last: ['egg', 'egg', 'egg'] });
    const { state, events } = finish(s);
    expect(state.winners).toEqual(['p1', 'p2']);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1', 'p2'] });
  });

  it('取消：沒有 result、沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(state.phase).toBe('ended');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    const again = run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state);
    expect(again.state).toBe(state);
  });

  it('再來一局只有上一局玩家；結束後的選單被忽略', () => {
    const s = lastTurn(3, { last: ['egg', 'egg', 'egg'] });
    const ended = finish(s).state;
    expect(run([{ type: 'hand', user: 'p1' }], ended).events).toEqual([]);
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')?.text).toContain('只有上一局的玩家');
    const re = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state;
    expect(re).toMatchObject({ phase: 'lobby', host: 'p2' });
  });
});

describe('sushigo/bots: bot 的選牌策略', () => {
  it('依價值選牌', () => {
    expect(botCard(['tempura', 'salmon', 'pudding'], ['tempura'])).toBe('tempura');
    expect(botCard(['squid', 'tempura'], ['wasabi'])).toBe('squid');
    expect(botCard(['sashimi', 'maki3'], ['sashimi', 'sashimi'])).toBe('sashimi');
    expect(botCard(['dumpling', 'maki3'], rep('dumpling', 4))).toBe('dumpling');
    expect(botCard(['dumpling', 'egg'], rep('dumpling', 5))).toBe('egg');
  });

  it('芥末：手牌 3 張以上 3，否則 0', () => {
    expect(botCard(['wasabi', 'egg', 'egg'], [])).toBe('wasabi');
    expect(botCard(['wasabi', 'egg'], [])).toBe('egg');
  });

  it('同分依牌種順序；只剩筷子就出筷子', () => {
    expect(botCard(['pudding', 'tempura'], [])).toBe('tempura');
    expect(botCard(['chopsticks'], ['chopsticks'])).toBe('chopsticks');
  });
});

describe('sushigo/bots: bot 行動', () => {
  const withBots = () => run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state);

  it('bot 在回合開始就選好，算在已選裡；真人選好就立刻揭曉', () => {
    const { state, events } = withBots();
    expect(boards(events).at(-1)!.text).toContain('已選 2/3，還沒選：<@p1>');
    expect(state.players.slice(1).every((p) => p.pick && p.extra === null)).toBe(true);
    const next = run([pick(state, 'p1', state.players[0].hand[0])], state).state;
    expect(next.turn).toBe(2);
  });

  it('bot 不使用筷子', () => {
    const { state } = withBots();
    const s = structuredClone(state);
    s.players[1].table = ['chopsticks'];
    const next = run([pick(s, 'p1', s.players[0].hand[0])], s).state;
    expect(next.players[1].extra).toBeNull();
    expect(next.players[1].table).toContain('chopsticks');
  });

  it('1 位真人 + 2 個 bot，真人完全不操作，3 輪 27 回合後結束並送出 result', () => {
    let { state } = withBots();
    let turns = 0;
    let events: GameEvent[] = [];
    while (state.phase !== 'ended' && turns < 100) {
      ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state));
      turns++;
    }
    expect(turns).toBe(27);
    expect(state.phase).toBe('ended');
    expect(events.find((e) => e.type === 'result')).toMatchObject({ players: state.players.map((p) => p.id) });
  });
});
