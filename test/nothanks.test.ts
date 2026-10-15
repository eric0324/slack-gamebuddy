import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyNoThanks, botTakes, runsText, score, type NTAction, type NTState } from '../src/nothanks.js';

const rng = () => 0.99999; // 洗牌不動：3～35 照順序，拿掉 3～11，牌堆是 12～35；起始玩家是最後一位

function run(actions: NTAction[], start?: NTState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyNoThanks(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as NTAction),
  ]);
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'nothanks');
const cur = (s: NTState) => s.players[s.turn];
const pass = (s: NTState, user = cur(s).id): NTAction => ({ type: 'pass', user, step: s.step });
const take = (s: NTState, user = cur(s).id): NTAction => ({ type: 'take', user, step: s.step });

// 開一局 3 人，然後把 state 改成想要的樣子
function custom(patch: (s: NTState) => void, n = 3) {
  const s = structuredClone(started(n).state);
  patch(s);
  return s;
}

describe('nothanks: 計分', () => {
  it('連號只算最小那張，再減籌碼', () => {
    expect(score([5, 6, 7, 19, 30], 4)).toBe(50);
    expect(score([], 11)).toBe(-11);
    expect(score([20, 6, 5], 7)).toBe(18);
  });

  it('連號顯示成一組', () => {
    expect(runsText([5, 6, 7, 19])).toBe('5-7 · 19');
    expect(runsText([20, 5, 6])).toBe('5-6 · 20');
    expect(runsText([])).toBe('（還沒有）');
  });
});

describe('nothanks/setup: 不要謝謝的房間', () => {
  it('開房：公告標示不要謝謝', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'nothanks', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '不要謝謝', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 3 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')?.text).toContain('至少需要 3 人');
  });

  it('房間已滿（7 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(7).state);
    expect(state.players).toHaveLength(7);
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

describe('nothanks/setup: 加入與移除 bot', () => {
  it('addbot／removebot、數量', () => {
    const one = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'addBot', user: 'p1', count: 2 }]).state;
    expect(one.players).toHaveLength(3);
    expect(one.players.slice(1).every((p) => isBot(p.id))).toBe(true);
    expect(run([{ type: 'removeBot', user: 'p1', count: 1 }], one).state.players).toHaveLength(2);
  });

  it('超過 7 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(6).state);
    expect(state.players).toHaveLength(7);
    expect(ephemeralTo(events, 'p1')?.text).toContain('房間已滿');
  });

  it('非房主或開始後被拒', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(3).state);
    expect(state.players).toHaveLength(3);
    expect(ephemeralTo(events, 'p2')?.text).toContain('只有房主可以加入 bot');
    const after = run([{ type: 'addBot', user: 'p1', count: 1 }], started(3).state);
    expect(after.state.players).toHaveLength(3);
    expect(ephemeralTo(after.events, 'p1')?.text).toContain('遊戲已經開始了');
  });
});

describe('nothanks/setup: 牌組、籌碼與開局', () => {
  it('牌堆 24 張、拿掉 9 張，合起來是 3～35', () => {
    const { state } = started(4, Math.random);
    const deckAll = [...state.deck, state.card!];
    expect(deckAll).toHaveLength(24);
    expect(state.removed).toHaveLength(9);
    expect([...deckAll, ...state.removed].sort((a, b) => a - b)).toEqual(Array.from({ length: 33 }, (_, i) => i + 3));
  });

  it('籌碼：3～5 人 11 個、6 人 9 個、7 人 7 個', () => {
    for (const [n, chips] of [[3, 11], [5, 11], [6, 9], [7, 7]]) {
      expect(started(n).state.players.every((p) => p.chips === chips), `${n} 人`).toBe(true);
    }
  });

  it('座位是加入順序，起始玩家隨機，公告座位、起始玩家、籌碼和勝利條件，真人收到私訊，翻開第一張', () => {
    const { state, events } = started(4);
    expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state.turn).toBe(3);
    expect(run([{ type: 'start', user: 'p1' }], lobbyWith(4).state, () => 0).state.turn).toBe(0);
    const text = announces(events).join('\n');
    for (const s of ['<@p1>', '<@p4>', '11 個籌碼', '分數最低']) expect(text).toContain(s);
    expect(events.filter((e) => e.type === 'dm').map((e) => (e as { to: string }).to)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(state).toMatchObject({ phase: 'turn', card: 12, pot: 0 });
    expect(state.deck).toHaveLength(23);
    expect(boards(events)).toHaveLength(1);
  });
});

describe('nothanks/rounds: 牌桌公告', () => {
  it('目前的牌、牌上籌碼、牌堆剩幾張、每人收下的牌、輪到誰、三個按鈕、ref，不顯示籌碼數', () => {
    const s0 = custom((s) => {
      s.players[0].cards = [5, 6, 7, 19];
    });
    const { state, events } = run([pass(s0)], s0);
    const b = boards(events)[0];
    expect(b.audience).toBe('channel');
    expect(b.ref).toBe(`nothanks:${state.cardNo}`);
    for (const s of ['12', '牌上 🪙 1', '牌堆剩 23', '5-7 · 19', `輪到 <@${cur(state).id}>`]) expect(b.text).toContain(s);
    expect(b.text).not.toMatch(/11 個籌碼|10 個籌碼/);
    expect(b.options.map((o) => o.value)).toEqual([`pass:${state.step}`, `take:${state.step}`, 'mine']);
  });
});

describe('nothanks/rounds: 不要謝謝', () => {
  it('籌碼 −1、牌上 +1、輪到下一位，用同一個 ref 更新，不發新訊息', () => {
    const s0 = started(3).state;
    const { state, events } = run([pass(s0)], s0);
    expect(state.players[2].chips).toBe(10);
    expect(state.pot).toBe(1);
    expect(state.turn).toBe(0);
    expect(boards(events)[0].ref).toBe(`nothanks:${s0.cardNo}`);
    expect(announces(events)).toEqual([]);
    expect(boards(events)[0].text).toContain('<@p3> 不要謝謝');
  });

  it('沒有籌碼被拒，state 不變', () => {
    const s0 = custom((s) => {
      s.players[2].chips = 0;
    });
    const { state, events } = run([pass(s0)], s0);
    expect(state).toBe(s0);
    expect(ephemeralTo(events, 'p3')?.text).toBe('你沒有籌碼了，只能收下。');
  });
});

describe('nothanks/rounds: 收下', () => {
  it('牌和牌上籌碼歸他、公告、翻下一張還是輪到他、新的 ref', () => {
    const s0 = custom((s) => {
      s.pot = 4;
      s.card = 14;
    });
    const { state, events } = run([take(s0)], s0);
    expect(state.players[2]).toMatchObject({ cards: [14], chips: 15 });
    expect(announces(events).join()).toContain('<@p3> 收下 14 和 4 個籌碼');
    expect(state).toMatchObject({ turn: 2, pot: 0, card: 13, cardNo: s0.cardNo + 1 });
    const refs = boards(events).map((b) => b.ref);
    expect(refs).toEqual([`nothanks:${s0.cardNo}`, `nothanks:${s0.cardNo + 1}`]);
    expect(boards(events)[0].options).toEqual([]);
  });
});

describe('nothanks/rounds: 只有輪到的人能操作、過期的按鈕', () => {
  it('不是輪到的人、不在遊戲的人、過期的 step 都被拒且 state 不變', () => {
    const s0 = started(3).state;
    const notTurn = run([take(s0, 'p1')], s0);
    expect(notTurn.state).toBe(s0);
    expect(ephemeralTo(notTurn.events, 'p1')?.text).toBe('還沒輪到你。');
    const outsider = run([take(s0, 'x')], s0);
    expect(outsider.state).toBe(s0);
    expect(ephemeralTo(outsider.events, 'x')?.text).toBe('你不在這局遊戲裡。');
    const stale = run([{ type: 'take', user: 'p3', step: s0.step - 1 }], s0);
    expect(stale.state).toBe(s0);
    expect(ephemeralTo(stale.events, 'p3')?.text).toBe('這個按鈕已經過期。');
  });

  it('超時後才按舊按鈕被拒', () => {
    const s0 = started(3).state; // 輪到 p3
    let s = run([{ type: 'timeout', id: s0.timers.phase! }], s0).state; // 系統替 p3 不要謝謝
    s = run([pass(s)], s).state; // p1
    s = run([pass(s)], s).state; // p2
    expect(cur(s).id).toBe('p3');
    const { state, events } = run([take(s0)], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p3')?.text).toBe('這個按鈕已經過期。');
  });
});

describe('nothanks/rounds: 我的籌碼', () => {
  it('只讓本人看到籌碼、牌、分數；不改 state、不重設計時器', () => {
    const s0 = custom((s) => {
      s.players[0].chips = 7;
      s.players[0].cards = [5, 6, 20];
    });
    const { state, events } = run([{ type: 'mine', user: 'p1' }], s0);
    expect(state).toBe(s0);
    expect(events).toHaveLength(1);
    const text = ephemeralTo(events, 'p1')!.text;
    for (const s of ['7 個籌碼', '5-6 · 20', '18']) expect(text).toContain(s);
  });

  it('不在遊戲被拒', () => {
    const s0 = started(3).state;
    const { state, events } = run([{ type: 'mine', user: 'x' }], s0);
    expect(state).toBe(s0);
    expect(ephemeralTo(events, 'x')?.text).toBe('你不在這局遊戲裡。');
  });
});

describe('nothanks/rounds: 超時', () => {
  it('有籌碼自動不要謝謝，標示超時', () => {
    const s0 = started(3).state;
    const { state, events } = run([{ type: 'timeout', id: s0.timers.phase! }], s0);
    expect(state.players[2].chips).toBe(10);
    expect(state.turn).toBe(0);
    expect(boards(events)[0].text).toContain('超時');
  });

  it('沒有籌碼自動收下，翻下一張還是輪到他', () => {
    const s0 = custom((s) => {
      s.players[2].chips = 0;
    });
    const { state, events } = run([{ type: 'timeout', id: s0.timers.phase! }], s0);
    expect(state.players[2].cards).toEqual([12]);
    expect(state.turn).toBe(2);
    expect(announces(events).join()).toContain('超時');
  });

  it('舊計時器被忽略', () => {
    const s0 = started(3).state;
    const s1 = run([pass(s0)], s0).state;
    const { state } = run([{ type: 'timeout', id: s0.timers.phase! }], s1);
    expect(state).toBe(s1);
  });
});

describe('nothanks/rounds: 勝負與結束', () => {
  // 牌堆只剩目前這張，p3 收下就結束
  const lastCard = (scores: [number[], number][]) =>
    custom((s) => {
      s.deck = [];
      s.card = 35;
      s.pot = 0;
      scores.forEach(([cards, chips], i) => Object.assign(s.players[i], { cards, chips }));
    });

  it('最後一張被收下就結束，公告名次、牌、籌碼、分數、被拿掉的牌，按鈕消失，有再來一局', () => {
    const s0 = lastCard([[[20, 30], 0], [[3], 1], [[10], 5]]);
    const { state, events } = run([take(s0)], s0);
    expect(state.phase).toBe('ended');
    const text = announces(events).join('\n');
    // p1：50、p2：2、p3：10 + 35 − 5 = 40
    expect(text).toMatch(/1\. <@p2>.*2[\s\S]*2\. <@p3>.*40[\s\S]*3\. <@p1>.*50/);
    expect(text).toContain('10 · 35');
    expect(text).toContain('3 4 5 6 7 8 9 10 11');
    expect(text).toContain('<@p2>');
    expect(boards(events).at(-1)!.options).toEqual([]);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p2'] });
  });

  it('同分並列都在 winners', () => {
    const s0 = lastCard([[[30], 0], [[45], 0], [[], 5]]); // p3 收下 35 − 5 = 30
    const { events } = run([take(s0)], s0);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1', 'p3'] });
  });

  it('取消：沒有 result、沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(state.phase).toBe('ended');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });

  it('再來一局只有上一局玩家；結束後的按鈕被忽略', () => {
    const s0 = lastCard([[[20], 0], [[3], 1], [[10], 5]]);
    const ended = run([take(s0)], s0).state;
    const again = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p2' });
    const stranger = run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended);
    expect(ephemeralTo(stranger.events, 'x')?.text).toContain('只有上一局的玩家');
    expect(run([take(ended, 'p3')], ended).events).toEqual([]);
  });
});

describe('nothanks/bots', () => {
  const p = (cards: number[], chips: number) => ({ id: 'bot:1:Sam', cards, chips });

  it('收牌策略', () => {
    expect(botTakes(p([], 0), 35, 0)).toBe(true); // 沒籌碼
    expect(botTakes(p([20], 5), 21, 0)).toBe(true); // 連號
    expect(botTakes(p([20], 5), 19, 0)).toBe(true); // 連號且變小
    expect(botTakes(p([], 5), 12, 4)).toBe(true); // 4 × 3 ≥ 12
    expect(botTakes(p([], 5), 30, 2)).toBe(false); // 2 × 3 < 30
  });

  it('bot 立刻行動；收下後繼續輪到自己也會繼續行動', () => {
    // 1 真人 + 2 bot，起始玩家是最後一位 bot；牌堆照順序 12～35
    const lobby = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'addBot', user: 'p1', count: 2 }]).state;
    const { state } = run([{ type: 'start', user: 'p1' }], lobby);
    expect(cur(state).id).toBe('p1');
    expect(state.pot).toBe(1); // bot2 對 12 不要謝謝
    // p1 不要謝謝 → bot1（2 個）、bot2（3 個）都不要謝謝 → 輪回 p1
    const s1 = run([pass(state)], state).state;
    expect(s1).toMatchObject({ pot: 4, turn: 0 });
    // p1 再不要謝謝 → bot1 看到 5 個，5 × 3 ≥ 12 收下，之後 13、14…都連號，一路收到結束
    const s2 = run([pass(s1)], s1).state;
    expect(s2.players[1].cards.slice(0, 3)).toEqual([12, 13, 14]);
    expect(s2.phase).toBe('ended');
  });

  it('1 位真人 + 2 個 bot，真人完全不操作，遊戲一定結束並送出 result', () => {
    const lobby = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'addBot', user: 'p1', count: 2 }], undefined, Math.random).state;
    let { state, events } = run([{ type: 'start', user: 'p1' }], lobby, Math.random);
    const all = [...events];
    for (let i = 0; i < 200 && state.phase !== 'ended'; i++) {
      ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state, Math.random));
      all.push(...events);
    }
    expect(state.phase).toBe('ended');
    expect(state.players.reduce((n, p) => n + p.cards.length, 0)).toBe(24);
    expect(all.some((e) => e.type === 'result')).toBe(true);
  });
});
