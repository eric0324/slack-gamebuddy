import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyCriminal, buildDeck, FULL_DECK, type Card, type CAction, type CState } from '../src/criminal.js';
import { criminal } from '../src/games/criminal.js';

const rng = () => 0.99999;

function run(actions: CAction[], start?: CState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyCriminal(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CAction)]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const values = (p?: { options: { value: string }[] }) => p?.options.map((o) => o.value) ?? [];
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number }[]).at(-1)!;
const count = (cards: Card[], c: Card) => cards.filter((x) => x === c).length;
const result = (events: GameEvent[]) => events.find((e) => e.type === 'result') as { players: string[]; winners: string[] } | undefined;

// 直接擺出局面：輪到 turn 的人出牌，序號 seq = 1；ids 預設 p1..pn
function table(hands: Card[][], opts: { turn?: number; lap?: number; accomplice?: number[]; ids?: string[] } = {}): CState {
  const ids = opts.ids ?? hands.map((_, i) => `p${i + 1}`);
  const s = lobbyWith(1).state;
  return {
    ...s,
    players: hands.map((hand, i) => ({ id: ids[i], hand, played: [], accomplice: opts.accomplice?.includes(i) ?? false })),
    phase: 'turn',
    turn: opts.turn ?? 0,
    lap: opts.lap ?? 2,
    first: 0,
    seq: 1,
  };
}
const play = (user: string, index: number, seq = 1): CAction => ({ type: 'play', user, seq, index });

describe('criminal/setup: 房間', () => {
  it('開房：公告標示犯人在跳舞', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'criminal', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '犯人在跳舞', host: 'A', players: ['A'], open: true });
  });

  it('人數不足：至少 3 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')[0]).toContain('至少需要 3 人');
  });

  it('房間已滿：最多 8 人', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(state.players).toHaveLength(8);
    expect(ephemeralTo(events, 'x')[0]).toContain('房間已滿');
  });

  it('房主開始前離開：取消房間', () => {
    const { state, events } = run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join()).toContain('取消');
  });

  it('頻道已經有遊戲', () => {
    const { events } = run([{ type: 'new', user: 'Z', channel: 'C1' }], lobbyWith(3).state);
    expect(ephemeralTo(events, 'Z')[0]).toBe('這個頻道已經有遊戲了。');
  });
});

describe('criminal/setup: bot', () => {
  it('一個人加 2 個 bot 就能開始', () => {
    const { state } = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state);
    expect(state.players).toHaveLength(3);
    expect(state.players.filter((p) => p.id.startsWith('bot:'))).toHaveLength(2);
  });

  it('加 bot 超過 8 人只加到滿', () => {
    const { state, events } = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(7).state);
    expect(state.players).toHaveLength(8);
    expect(ephemeralTo(events, 'p1')[0]).toContain('房間已滿');
  });

  it('非房主不能加 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'p2')[0]).toBe('只有房主可以加入 bot。');
  });

  it('removebot 從最後加入的移除', () => {
    const added = run([{ type: 'addBot', user: 'p1', count: 2 }], lobbyWith(1).state).state;
    const { state } = run([{ type: 'removeBot', user: 'p1', count: 1 }], added);
    expect(state.players.map((p) => p.id)).toEqual(added.players.slice(0, 2).map((p) => p.id));
  });
});

describe('criminal/setup: 組牌組與發牌', () => {
  it('全套 32 張，情報交換 3 張', () => {
    expect(FULL_DECK).toHaveLength(32);
    expect(count(FULL_DECK, 'exchange')).toBe(3);
    expect(count(FULL_DECK, 'detective')).toBe(4);
    expect(count(FULL_DECK, 'alibi')).toBe(5);
    expect(count(FULL_DECK, 'trade')).toBe(5);
  });

  it.each([
    [3, { detective: 1, alibi: 1, accomplice: 0 }],
    [4, { detective: 1, alibi: 1, accomplice: 1 }],
    [5, { detective: 1, alibi: 2, accomplice: 1 }],
    [6, { detective: 2, alibi: 2, accomplice: 2 }],
    [7, { detective: 2, alibi: 3, accomplice: 2 }],
  ])('%i 人：人數 × 4 張，必放的牌都在', (n, need) => {
    for (const r of [() => 0, () => 0.5, rng]) {
      const deck = buildDeck(n, r);
      expect(deck).toHaveLength(n * 4);
      expect(count(deck, 'first')).toBe(1);
      expect(count(deck, 'culprit')).toBe(1);
      expect(count(deck, 'detective')).toBeGreaterThanOrEqual(need.detective);
      expect(count(deck, 'alibi')).toBeGreaterThanOrEqual(need.alibi);
      expect(count(deck, 'accomplice')).toBeGreaterThanOrEqual(need.accomplice);
    }
  });

  it('8 人用全部 32 張', () => {
    expect([...buildDeck(8, () => 0.3)].sort()).toEqual([...FULL_DECK].sort());
  });

  it('開始後每人 4 張 (第一發現者打出後持有者剩 3 張)', () => {
    const { state } = run([{ type: 'start', user: 'p1' }], lobbyWith(5).state);
    const sizes = state.players.map((p) => p.hand.length + p.played.length);
    expect(sizes).toEqual([4, 4, 4, 4, 4]);
  });
});

describe('criminal/setup: 開局', () => {
  it('公告座位和勝利條件、私訊手牌、自動打出第一發現者、輪到下一位、第 1 圈', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(4).state);
    const holder = state.players.findIndex((p) => p.played.includes('first'));
    expect(holder).toBeGreaterThanOrEqual(0);
    const text = announces(events).join('\n');
    expect(text).toContain('座位');
    expect(text).toContain('共犯');
    expect(text).toContain(`<@${state.players[holder].id}> 打出 🔎 第一發現者`);
    for (const p of state.players) expect(dmTo(events, p.id)[0]).toContain('你的手牌');
    expect(state.turn).toBe((holder + 1) % 4);
    expect(state.lap).toBe(1);
    expect(state.phase).toBe('turn');
  });
});

describe('criminal/rounds: 牌桌訊息', () => {
  it('第幾圈、輪到誰、手牌張數、出過的牌、共犯；不透露手牌', () => {
    const s = table([['citizen', 'rumor'], ['culprit', 'alibi'], ['accomplice', 'trade'], ['citizen']], { turn: 3, accomplice: [2] });
    s.players[2].played = ['accomplice'];
    const { events } = run([play('p4', 0)], s);
    const board = prompts(events).find((p) => p.audience === 'channel' && p.kind === 'criminal')!;
    expect(board.text).toContain('第 3 圈');
    expect(board.text).toContain('輪到 <@p1>');
    expect(board.text).toContain('🤝');
    expect(board.text).toContain('2 張');
    expect(board.text).not.toContain('犯人');
    expect(values(board)).toEqual(['hand']);
  });
});

describe('criminal/rounds: 手牌選單與出牌', () => {
  it('輪到的人看到可以出的牌按鈕，不能出的寫原因；不改 state', () => {
    const s = table([['culprit', 'trade', 'detective'], ['citizen']], { lap: 1 });
    const { state, events } = run([{ type: 'hand', user: 'p1' }], s);
    expect(state).toBe(s);
    const menu = menuOf(events, 'p1')!;
    expect(values(menu)).toEqual(['play:1:1']);
    expect(menu.text).toContain('手上只剩這張時才能出');
    expect(menu.text).toContain('第 2 圈開始才能出');
  });

  it('不在這局的人', () => {
    const { events } = run([{ type: 'hand', user: 'x' }], table([['citizen'], ['citizen']]));
    expect(ephemeralTo(events, 'x')[0]).toBe('你不在這局遊戲裡。');
  });

  it('出不需要對象的牌：公告，輪到下一位', () => {
    const { state, events } = run([play('p1', 0)], table([['citizen', 'rumor'], ['alibi', 'trade'], ['witness', 'boy']]));
    expect(announces(events)).toContain('🃏 <@p1> 打出 🧍 普通人。');
    expect(state.turn).toBe(1);
    expect(state.players[0].played).toEqual(['citizen']);
  });

  it('沒輪到的人被拒；過期選單被拒', () => {
    const s = table([['citizen', 'rumor'], ['alibi', 'trade'], ['witness']]);
    expect(ephemeralTo(run([play('p2', 0)], s).events, 'p2')[0]).toBe('還沒輪到你。');
    const stale = run([play('p1', 0, 0)], s);
    expect(stale.state).toBe(s);
    expect(ephemeralTo(stale.events, 'p1')[0]).toBe('這個選單已經過期了。');
  });

  it('需要對象的牌：只給出牌的人對象選單 (手上有牌的其他人)，選了才打出', () => {
    const s = table([['witness', 'citizen'], [], ['culprit', 'alibi']]);
    const picked = run([play('p1', 0)], s);
    expect(picked.state.phase).toBe('target');
    expect(values(menuOf(picked.events, 'p1'))).toEqual([`target:${picked.state.seq}:p3`]);
    const done = run([{ type: 'target', user: 'p1', seq: picked.state.seq, target: 'p3' }], picked.state);
    expect(announces(done.events)).toContain('🃏 <@p1> 對 <@p3> 打出 👀 目擊者。');
    expect(dmTo(done.events, 'p1')[0]).toContain('🔪 犯人');
    expect(dmTo(done.events, 'p3')).toEqual([]);
  });

  it('沒有合法對象：直接打出、沒有效果', () => {
    const { state, events } = run([play('p1', 0)], table([['witness', 'citizen'], [], []]));
    expect(announces(events).join()).toContain('沒有可以選的對象');
    expect(state.players[0].played).toEqual(['witness']);
  });
});

describe('criminal/rounds: 出牌限制', () => {
  it('第 1 圈手上只剩偵探和犯人：可以出偵探', () => {
    const { events } = run([{ type: 'hand', user: 'p1' }], table([['detective', 'culprit'], ['citizen']], { lap: 1 }));
    expect(values(menuOf(events, 'p1'))).toEqual(['play:1:0']);
  });

  it('只剩犯人：只能出犯人', () => {
    const { events } = run([{ type: 'hand', user: 'p1' }], table([['culprit'], ['citizen']]));
    expect(values(menuOf(events, 'p1'))).toEqual(['play:1:0']);
  });

  it('不能出的牌按了被拒', () => {
    const { events } = run([play('p1', 0)], table([['culprit', 'citizen'], ['citizen']]));
    expect(ephemeralTo(events, 'p1')[0]).toBe('這張牌現在不能出。');
  });
});

describe('criminal/rounds: 各張牌的效果', () => {
  const target = (s: CState, user: string, t: string) => run([{ type: 'target', user, seq: s.seq, target: t }], s);
  const pickTarget = (s: CState, user: string, index: number, t: string) => target(run([play(user, index)], s).state, user, t);

  it('偵探抓到犯人：只有出偵探的人贏', () => {
    const { state, events } = pickTarget(table([['detective', 'citizen'], ['citizen'], ['culprit', 'rumor']]), 'p1', 0, 'p3');
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('<@p1> 抓到犯人 <@p3>');
    expect(result(events)).toEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1'] });
  });

  it('不在場證明擋下偵探：只公告不是犯人', () => {
    const { state, events } = pickTarget(table([['detective', 'citizen'], ['citizen'], ['culprit', 'alibi']]), 'p1', 0, 'p3');
    expect(state.phase).toBe('turn');
    expect(announces(events).join()).toContain('<@p3> 不是犯人');
  });

  it('犯人逃跑：打出犯人的人和共犯贏', () => {
    const s = table([['culprit'], ['citizen'], ['rumor'], ['trade']], { accomplice: [2] });
    const { events } = run([play('p1', 0)], s);
    expect(announces(events).join('\n')).toContain('逃跑成功');
    expect(result(events)!.winners).toEqual(['p1', 'p3']);
  });

  it('共犯：公開加入犯人陣營', () => {
    const { state, events } = run([play('p1', 0)], table([['accomplice', 'citizen'], ['citizen']]));
    expect(state.players[0].accomplice).toBe(true);
    expect(announces(events).join()).toContain('加入犯人陣營');
  });

  it('共犯用偵探抓到犯人：沒有人獲勝', () => {
    const s = table([['detective', 'citizen'], ['citizen'], ['culprit', 'rumor']], { accomplice: [0] });
    const { events } = pickTarget(s, 'p1', 0, 'p3');
    expect(announces(events).join('\n')).toContain('沒有人獲勝');
    expect(result(events)!.winners).toEqual([]);
  });

  it('少年：只有出牌的人知道誰拿著犯人', () => {
    const { events } = run([play('p1', 0)], table([['boy', 'citizen'], ['citizen'], ['culprit', 'rumor']]));
    expect(dmTo(events, 'p1').join()).toContain('<@p3>');
    expect(announces(events).join()).not.toContain('<@p3>');
  });

  it('謠言：從上一位有牌的人隨機抽，跳過沒牌的人', () => {
    const s = table([['rumor', 'alibi'], ['trade'], [], ['witness']]);
    const { state, events } = run([play('p1', 0)], s);
    // p1 剩 alibi；有牌的 p1、p2、p4：p1 抽 p4、p2 抽 p1、p4 抽 p2
    expect(state.players.map((p) => p.hand)).toEqual([['witness'], ['alibi'], [], ['trade']]);
    expect(dmTo(events, 'p2')[0]).toContain('🛡️ 不在場證明');
  });

  it('情報交換：同時選、傳給下一位有牌的人、每人只看到拿到的牌', () => {
    const s = table([['exchange', 'alibi'], ['trade', 'citizen'], [], ['witness']]);
    let r = run([play('p1', 0)], s);
    expect(r.state.phase).toBe('choose');
    expect(announces(r.events).join()).toContain('<@p1>');
    const seq = r.state.seq;
    expect(values(menuOf(r.events, 'p2'))).toEqual([`give:${seq}:0`, `give:${seq}:1`]);
    r = run([{ type: 'give', user: 'p1', seq, index: 0 }, { type: 'give', user: 'p2', seq, index: 1 }], r.state);
    expect(r.state.phase).toBe('choose');
    r = run([{ type: 'give', user: 'p4', seq, index: 0 }], r.state);
    expect(r.state.players.map((p) => p.hand)).toEqual([['witness'], ['trade', 'alibi'], [], ['citizen']]);
    expect(dmTo(r.events, 'p4')[0]).toContain('🧍 普通人');
  });

  it('同時選牌：不能改選、不需要選的人被拒、過期選單被拒', () => {
    const s = table([['trade', 'alibi'], ['citizen', 'rumor'], ['witness']]);
    const chosen = pickTarget(s, 'p1', 0, 'p2').state;
    const seq = chosen.seq;
    const once = run([{ type: 'give', user: 'p1', seq, index: 0 }], chosen).state;
    expect(ephemeralTo(run([{ type: 'give', user: 'p1', seq, index: 0 }], once).events, 'p1')[0]).toBe('你已經選好了。');
    expect(ephemeralTo(run([{ type: 'give', user: 'p3', seq, index: 0 }], once).events, 'p3')[0]).toBe('現在不需要你選牌。');
    expect(ephemeralTo(run([{ type: 'give', user: 'p2', seq: seq - 1, index: 0 }], once).events, 'p2')[0]).toBe('這個選單已經過期了。');
    const done = run([{ type: 'give', user: 'p2', seq, index: 1 }], once).state;
    expect(done.players[0].hand).toEqual(['rumor']);
    expect(done.players[1].hand).toEqual(['citizen', 'alibi']);
  });

  it('交易：打出後手上沒牌就沒效果', () => {
    const { state, events } = run([play('p1', 0)], table([['trade'], ['citizen'], ['rumor']]));
    expect(announces(events).join()).toContain('沒有效果');
    expect(state.phase).toBe('turn');
  });

  it('神犬：盲抽選單只給出牌者，抽到犯人就抓到 (不看不在場證明)', () => {
    const s = table([['dog', 'citizen'], ['citizen'], ['culprit', 'alibi']]);
    const d = pickTarget(s, 'p1', 0, 'p3');
    expect(d.state.phase).toBe('dog');
    const menu = menuOf(d.events, 'p1')!;
    expect(menu.options.map((o) => o.label)).toEqual(['第 1 張', '第 2 張']);
    expect(menu.text).not.toContain('犯人');
    const slot = d.state.dog!.order.indexOf(0);
    const { events } = run([{ type: 'draw', user: 'p1', seq: d.state.seq, slot }], d.state);
    expect(announces(events).join('\n')).toContain('抽到 🔪 犯人');
    expect(result(events)!.winners).toEqual(['p1']);
  });

  it('神犬沒抓到：那張回到對方手上，神犬也進對方手牌', () => {
    const s = table([['dog', 'citizen'], ['citizen'], ['culprit', 'citizen']]);
    const d = pickTarget(s, 'p1', 0, 'p3');
    const slot = d.state.dog!.order.indexOf(1);
    const { state, events } = run([{ type: 'draw', user: 'p1', seq: d.state.seq, slot }], d.state);
    expect(announces(events).join()).toContain('抽到 🧍 普通人');
    expect(state.players[2].hand).toEqual(['culprit', 'citizen', 'dog']);
    expect(dmTo(events, 'p3')[0]).toContain('神犬');
    expect(state.turn).toBe(1);
  });
});

describe('criminal/rounds: 超時', () => {
  it('出牌超時：隨機出合法的牌，公告超時自動；舊計時器被忽略', () => {
    const s = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state).state;
    const id = s.timers.phase!;
    const { state, events } = run([{ type: 'timeout', id }], s);
    expect(announces(events).join()).toContain('超時自動');
    expect(state.seq).toBeGreaterThan(s.seq);
    expect(run([{ type: 'timeout', id }], state).state).toBe(state);
  });

  it('選牌超時：替沒選的人選，接著結算', () => {
    const s = table([['exchange', 'alibi'], ['trade', 'citizen'], ['witness']]);
    const r = run([play('p1', 0)], s);
    const { state, events } = run([{ type: 'timeout', id: lastTimer(r.events).id }], r.state);
    expect(state.phase).toBe('turn');
    expect(announces(events).join()).toContain('超時自動');
  });

  it('神犬盲抽超時：隨機抽', () => {
    const s = table([['dog', 'citizen'], ['citizen'], ['culprit', 'citizen']]);
    const r = run([play('p1', 0)], s);
    const d = run([{ type: 'target', user: 'p1', seq: r.state.seq, target: 'p3' }], r.state);
    const { state, events } = run([{ type: 'timeout', id: lastTimer(d.events).id }], d.state);
    expect(announces(events).join()).toContain('超時自動');
    expect(state.phase === 'ended' || state.phase === 'turn').toBe(true);
  });
});

describe('criminal/rounds: 勝負與結束', () => {
  it('結束公告犯人、共犯、每人手牌，貼再來一局；結束後舊按鈕被忽略', () => {
    const s = table([['culprit'], ['citizen'], ['rumor']], { accomplice: [1] });
    const { state, events } = run([play('p1', 0)], s);
    const text = announces(events).join('\n');
    expect(text).toContain('共犯');
    expect(text).toContain('<@p2>');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
    expect(run([play('p2', 0, state.seq)], state).state).toBe(state);
  });

  it('再來一局：上一局玩家才能按', () => {
    const ended = run([play('p1', 0)], table([['culprit'], ['citizen'], ['rumor']])).state;
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')[0]).toContain('只有上一局的玩家');
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p2' });
  });

  it('取消：沒有 result 也沒有再來一局', () => {
    const s = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state).state;
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(result(events)).toBeUndefined();
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
  });
});

describe('criminal/bots', () => {
  const B = 'bot:1:阿明';

  it('知道犯人就出偵探指認', () => {
    const s = table([['citizen', 'rumor'], ['detective', 'citizen', 'alibi'], ['culprit', 'trade']], { turn: 0, ids: ['p1', B, 'p3'] });
    s.knows = { [B]: 'p3' };
    const { events } = run([play('p1', 0)], s);
    expect(announces(events).join('\n')).toContain(`${'🤖阿明'} 抓到犯人 <@p3>`);
  });

  it('留著不在場證明', () => {
    for (const r of [() => 0, () => 0.5, rng]) {
      const s = table([['citizen', 'rumor'], ['alibi', 'citizen', 'witness'], ['culprit', 'trade', 'trade']], { ids: ['p1', B, 'p3'] });
      const { state } = run([play('p1', 0)], s, r);
      expect(state.players[1].played).not.toContain('alibi');
    }
  });

  it('拿著犯人時情報交換交出別張', () => {
    for (const r of [() => 0, () => 0.5, rng]) {
      const s = table([['exchange', 'citizen'], ['culprit', 'trade'], ['witness']], { ids: ['p1', B, 'p3'] });
      const { state } = run([play('p1', 0)], s, r);
      expect(state.choose!.picks[B]).toBe(1);
    }
  });

  it('牌移動後清掉 bot 的記憶', () => {
    const s = table([['rumor', 'citizen'], ['citizen', 'alibi'], ['culprit', 'trade']], { ids: ['p1', B, 'p3'] });
    s.knows = { [B]: 'p3' };
    expect(run([play('p1', 0)], s).state.knows).toEqual({});
  });

  it('1 位真人 + 2 個 bot，真人不操作也會結束並送出 result', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let x = seed;
      const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      let { state, events } = run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state, r);
      let all = [...events];
      for (let i = 0; i < 200 && state.phase !== 'ended'; i++) {
        ({ state, events } = run([{ type: 'timeout', id: state.timers.phase! }], state, r));
        all = all.concat(events);
      }
      expect(state.phase).toBe('ended');
      expect(result(all)).toBeDefined();
    }
  });
});

describe('criminal: Slack 設定', () => {
  it('大廳資訊', () => {
    expect(criminal).toMatchObject({ kind: 'criminal', emoji: '🕺', name: '犯人在跳舞', players: '3～8 人', category: 'bluff' });
    expect(criminal.help).toContain('/game criminal new');
  });

  it('指令解析：房間指令；不認識的子指令回 null (顯示說明)', () => {
    expect(criminal.parse('new', 'A', 'C')).toEqual({ type: 'new', user: 'A', channel: 'C' });
    expect(criminal.parse('addbot 2', 'A', 'C')).toEqual({ type: 'addBot', user: 'A', count: 2 });
    expect(criminal.parse('foo', 'A', 'C')).toBeNull();
  });

  it('按鈕路由', () => {
    expect(criminal.button('join', '', 'A', 'C')).toEqual({ type: 'join', user: 'A' });
    expect(criminal.button('rematch', '', 'A', 'C')).toEqual({ type: 'rematch', user: 'A', channel: 'C' });
    expect(criminal.button('criminal', 'hand', 'A', 'C')).toEqual({ type: 'hand', user: 'A' });
    expect(criminal.button('criminal', 'play:3:1', 'A', 'C')).toEqual({ type: 'play', user: 'A', seq: 3, index: 1 });
    expect(criminal.button('criminal', `target:3:${'bot:1:阿明'}`, 'A', 'C')).toEqual({ type: 'target', user: 'A', seq: 3, target: 'bot:1:阿明' });
    expect(criminal.button('criminal', 'give:4:0', 'A', 'C')).toEqual({ type: 'give', user: 'A', seq: 4, index: 0 });
    expect(criminal.button('criminal', 'draw:5:2', 'A', 'C')).toEqual({ type: 'draw', user: 'A', seq: 5, slot: 2 });
  });
});
