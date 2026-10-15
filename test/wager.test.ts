import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { wager } from '../src/games/wager.js';
import { applyWager, type WAction, type WState } from '../src/wager.js';
import { WAGER_QUESTIONS } from '../src/wagerQuestions.js';

const rng = () => 0.99999; // 洗牌不動：題目照 WAGER_QUESTIONS 的順序

function run(actions: WAction[], start?: WState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyWager(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'A', channel: 'C1' },
    ...['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].slice(0, n - 1).map((user) => ({ type: 'join', user }) as WAction),
  ]);
const started = (n = 3) => run([{ type: 'start', user: 'A' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'wager' && p.audience === 'channel');
const menu = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const channelText = (events: GameEvent[]) => [...announces(events), ...boards(events).map((b) => b.text)].join('\n');
const score = (s: WState, id: string) => s.players.find((p) => p.id === id)!.score;
const Q = (s: WState) => WAGER_QUESTIONS[s.q!];
const answer = (user: string, text: string): WAction => ({ type: 'answer', user, text });
const bet = (s: WState, user: string, slot: number): WAction => ({ type: 'bet', user, seq: s.seq, slot });
const slotOf = (s: WState, value: number | null) => s.slots.findIndex((x) => x.value === value);

// 3 人各答一個數字，進入押注
const answered = (a: number, b: number, c: number, from = started().state) =>
  run([answer('A', String(a)), answer('B', String(b)), answer('C', String(c))], from);

describe('wager/setup: 猜猜看的房間', () => {
  it('房間公告標題是猜猜看', () => {
    expect(lobbyWith(1).events).toContainEqual(expect.objectContaining({ type: 'lobby', title: '猜猜看', host: 'A' }));
  });

  it('人數不足：至少 3 人', () => {
    const { state, events } = run([{ type: 'start', user: 'A' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'A')!.text).toContain('至少需要 3 人');
  });

  it('房間已滿：最多 10 人', () => {
    const full = run([{ type: 'join', user: 'Z' }], lobbyWith(10).state);
    expect(full.state.players).toHaveLength(10);
    expect(ephemeralTo(full.events, 'Z')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'A', count: 1 }], lobbyWith(3).state);
    expect(ephemeralTo(events, 'A')!.text).toBe('猜猜看不支援 bot。');
  });

  it('頻道已經有遊戲', () => {
    const { events } = run([{ type: 'new', user: 'Z', channel: 'C1' }], started().state);
    expect(ephemeralTo(events, 'Z')!.text).toContain('這個頻道已經有遊戲了');
  });
});

describe('wager/setup: 開局', () => {
  it('公告玩家、7 題和規則摘要，接著出第 1 題', () => {
    const { state, events } = started();
    const text = announces(events).join('\n');
    expect(text).toContain('7 題');
    expect(text).toContain('<@A>');
    expect(text).toContain('2 個標記');
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0]);
    const board = boards(events).at(-1)!;
    expect(board.text).toContain('第 1／7 題');
    expect(board.text).toContain(Q(state).q);
    expect(board.text).toContain(Q(state).unit);
    expect(board.text).toContain('60 秒');
    expect(board.options.map((o) => o.value)).toEqual(['answer']);
    expect(state.phase).toBe('answer');
  });

  it('「✍️ 寫答案」打開視窗', () => {
    const { events } = run([{ type: 'openAnswer', user: 'B' }], started().state);
    expect(events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'B', kind: 'wagerAnswer' }));
  });
});

describe('wager/setup: 題庫不重複', () => {
  // 每題大家都不作答，時間到就換下一題
  const skipAll = (s: WState) => {
    const seen: number[] = [];
    while (s.phase !== 'ended') {
      seen.push(s.q!);
      s = run([{ type: 'timeout', id: s.timers.phase! }], s).state;
    }
    return { seen, s };
  };

  it('同一局 7 題不重複', () => {
    const { seen } = skipAll(started().state);
    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });

  it('連續幾局也不重複：新的一局接著上一局剩下的題目', () => {
    const first = skipAll(started().state);
    for (const action of [{ type: 'rematch' }, { type: 'new' }] as const) {
      const lobby = run([{ ...action, user: 'B', channel: 'C1' }], first.s).state;
      expect(lobby.deck).toEqual(first.s.deck);
      const s = run([{ type: 'join', user: 'A' }, { type: 'join', user: 'C' }, { type: 'start', user: 'B' }], lobby).state;
      expect(first.seen).not.toContain(s.q);
    }
  });
});

describe('wager/rounds: 作答', () => {
  it('私下確認數字和單位，頻道只更新已答人數', () => {
    const s = started().state;
    const { state, events } = run([answer('A', '1200')], s);
    expect(ephemeralTo(events, 'A')!.text).toBe(`已收到：1,200 ${Q(s).unit}`);
    expect(boards(events).at(-1)!.text).toContain('已答 1/3');
    expect(boards(events).at(-1)!.ref).toBe(boards(started().events).at(-1)!.ref);
    expect(channelText(events)).not.toMatch(/1,?200/);
    expect(state.answers).toEqual({ A: 1200 });
  });

  it('截止前可以改答案，已答人數不變', () => {
    const { state, events } = run([answer('A', '1200'), answer('A', '1500')], started().state);
    expect(state.answers).toEqual({ A: 1500 });
    expect(channelText(events)).not.toContain('已答 2/3');
  });

  it('全員答完提前進入押注', () => {
    const { state } = answered(1, 2, 3);
    expect(state.phase).toBe('bet');
  });

  it('時間到：用已作答的答案進入押注', () => {
    const s = run([answer('A', '10'), answer('B', '20')], started().state).state;
    const { state } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.phase).toBe('bet');
    expect(state.slots.map((x) => x.value)).toEqual([null, 10, 20]);
  });

  it('不是玩家：拒絕', () => {
    const s = started().state;
    const { state, events } = run([answer('Z', '5')], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'Z')!.text).toContain('不在這局遊戲');
  });
});

describe('wager/rounds: 答案格式', () => {
  it('逗號、全形和小數可以', () => {
    const s = started().state;
    expect(run([answer('A', '1,200')], s).state.answers.A).toBe(1200);
    expect(run([answer('A', '１２００')], s).state.answers.A).toBe(1200);
    expect(run([answer('A', ' 3.5 ')], s).state.answers.A).toBe(3.5);
  });

  it('中文數字、單位字、負號和其他文字被拒絕，答案不變', () => {
    const s = run([answer('A', '7')], started().state).state;
    for (const text of ['兩千', '2300萬', '-5', '大概100', '', '1.2.3']) {
      const { state, events } = run([answer('A', text)], s);
      expect(state.answers.A, text).toBe(7);
      expect(ephemeralTo(events, 'A')!.text, text).toBe('請輸入數字，例如 1200 或 3.5');
    }
  });
});

describe('wager/rounds: 沒有人作答', () => {
  it('公告沒有人作答和正解，不計分，接著出下一題', () => {
    const s = started().state;
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    const text = announces(events).join('\n');
    expect(text).toContain('沒有人作答');
    expect(text).toContain(Q(s).note);
    expect(state.players.every((p) => p.score === 0)).toBe(true);
    expect(boards(events).at(-1)!.text).toContain('第 2／7 題');
  });
});

describe('wager/rounds: 押注板', () => {
  it('相同數字合併、由小到大、標示作者，最前面是全部太大', () => {
    const { state, events } = answered(300, 100, 300);
    expect(state.slots).toEqual([
      { value: null, by: [] },
      { value: 100, by: ['B'] },
      { value: 300, by: ['A', 'C'] },
    ]);
    const board = boards(events).at(-1)!;
    expect(board.text).toMatch(/🔺 全部太大[\s\S]*100（<@B>）[\s\S]*300（<@A>、<@C>）/);
    expect(board.text).toContain('45 秒');
    expect(board.options.map((o) => o.value)).toEqual(['betMenu']);
  });

  it('按「🎯 押注」只讓自己看到每一格和重押', () => {
    const s = answered(300, 100, 300).state;
    const m = menu(run([{ type: 'betMenu', user: 'B' }], s).events, 'B')!;
    expect(m.options.map((o) => o.label)).toEqual(['🔺 全部太大', '100', '300', '↩️ 重押']);
    expect(m.options.map((o) => o.value)).toEqual([`bet:${s.seq}:0`, `bet:${s.seq}:1`, `bet:${s.seq}:2`, `rebet:${s.seq}`]);
  });
});

describe('wager/rounds: 押注', () => {
  it('2 個標記可以押同一格，頻道只更新已押完人數', () => {
    const s = answered(300, 100, 300).state;
    const { state, events } = run([bet(s, 'A', 2), bet(s, 'A', 2)], s);
    expect(state.bets.A).toEqual([2, 2]);
    expect(ephemeralTo(events, 'A')!.text).toContain('300');
    expect(boards(events).at(-1)!.text).toContain('已押完 1/3');
  });

  it('第 3 個標記被拒絕，提示可以重押', () => {
    const s0 = answered(300, 100, 300).state;
    const s = run([bet(s0, 'A', 1), bet(s0, 'A', 1)], s0).state;
    const { state, events } = run([bet(s, 'A', 2)], s);
    expect(state.bets.A).toEqual([1, 1]);
    expect(ephemeralTo(events, 'A')!.text).toContain('重押');
  });

  it('重押收回自己的標記', () => {
    const s = answered(300, 100, 300).state;
    const { state } = run([bet(s, 'A', 2), bet(s, 'A', 2), { type: 'rebet', user: 'A', seq: s.seq }, bet(s, 'A', 1)], s);
    expect(state.bets.A).toEqual([1]);
  });

  it('沒作答的人也可以押注；舊選單被拒絕', () => {
    const s0 = run([answer('A', '10'), answer('B', '20')], started().state).state;
    const s = run([{ type: 'timeout', id: s0.timers.phase! }], s0).state;
    expect(run([bet(s, 'C', 1)], s).state.bets.C).toEqual([1]);
    const stale = run([{ type: 'bet', user: 'C', seq: s.seq - 1, slot: 1 }], s);
    expect(stale.state).toBe(s);
  });

  it('全員押完立刻揭曉', () => {
    const s = answered(300, 100, 300).state;
    const { state } = run(['A', 'B', 'C'].flatMap((u) => [bet(s, u, 1), bet(s, u, 1)]), s);
    expect(state.round).toBe(2);
    expect(state.phase).toBe('answer');
  });

  it('時間到：揭曉，沒放的標記作廢、放了的照常計分', () => {
    const ans = WAGER_QUESTIONS[0].answer;
    const s = answered(ans / 2, ans * 2, ans * 2).state;
    const t = run([bet(s, 'B', slotOf(s, ans / 2))], s).state;
    const { state } = run([{ type: 'timeout', id: t.timers.phase! }], t);
    expect(score(state, 'B')).toBe(1);
    expect(score(state, 'A')).toBe(1); // 作者分
  });
});

describe('wager/rounds: 揭曉與計分', () => {
  // 第 1 題的正解是 ans；用相對的數字設計押注板
  const ans = WAGER_QUESTIONS[0].answer;

  it('最接近但不超過：作者 +1、每個押中的標記 +1', () => {
    const s = answered(ans * 2, ans / 2, ans * 2).state;
    const low = slotOf(s, ans / 2);
    const high = slotOf(s, ans * 2);
    const { state, events } = run([bet(s, 'A', low), bet(s, 'A', low), bet(s, 'B', low), bet(s, 'B', 0), bet(s, 'C', high), bet(s, 'C', high)], s);
    expect([score(state, 'A'), score(state, 'B'), score(state, 'C')]).toEqual([2, 2, 0]);
    const text = announces(events).join('\n');
    expect(text).toContain(WAGER_QUESTIONS[0].unit);
    expect(text).toContain(WAGER_QUESTIONS[0].note);
    expect(text).toContain('<@A> +2');
    expect(text).toContain('<@B> +2');
    expect(text).toContain('目前總分');
  });

  it('剛好等於正解：合併格的每位作者都 +1', () => {
    const s = answered(ans, ans / 2, ans).state;
    const exact = slotOf(s, ans);
    const { state } = run(['A', 'B', 'C'].flatMap((u) => [bet(s, u, 0), bet(s, u, 0)]), s);
    expect([score(state, 'A'), score(state, 'B'), score(state, 'C')]).toEqual([1, 0, 1]);
    expect(exact).toBeGreaterThan(0);
  });

  it('全部太大：只有押在這格的標記得分，作者不加分', () => {
    const s = answered(ans * 2 + 1, ans * 3 + 1, ans * 2 + 1).state;
    const { state } = run([bet(s, 'A', 0), bet(s, 'A', 1), bet(s, 'B', 1), bet(s, 'B', 1), bet(s, 'C', 0), bet(s, 'C', 0)], s);
    expect([score(state, 'A'), score(state, 'B'), score(state, 'C')]).toEqual([1, 0, 2]);
  });

  it('寫出贏的答案又兩個標記都押中：這題 3 分', () => {
    const s = answered(ans * 2, ans / 2, ans * 2).state;
    const low = slotOf(s, ans / 2);
    const { state } = run([bet(s, 'B', low), bet(s, 'B', low), bet(s, 'A', 0), bet(s, 'A', 0), bet(s, 'C', 0), bet(s, 'C', 0)], s);
    expect(score(state, 'B')).toBe(3);
  });

  it('舊的計時器被忽略', () => {
    const s = answered(1, 2, 3).state;
    const old = run([{ type: 'timeout', id: s.timers.phase! - 1 }], s);
    expect(old.state).toBe(s);
  });
});

describe('wager/rounds: 勝負與結束', () => {
  // 每題 A 答正解、B 和 C 答太大的數字，大家都押 A 的答案；scorer 拿到作者分
  const playGame = (scorer: string | null) => {
    let s = started().state;
    while (s.phase !== 'ended') {
      const a = Q(s).answer;
      const big = String(a * 10 + 10);
      s = run(['A', 'B', 'C'].map((u) => answer(u, u === scorer ? String(a) : big)), s).state;
      const win = scorer ? slotOf(s, a) : 0;
      const r = run(['A', 'B', 'C'].flatMap((u) => [bet(s, u, win), bet(s, u, win)]), s);
      s = r.state;
      if (s.phase === 'ended') return r;
    }
    throw new Error('unreachable');
  };

  it('7 題後最高分獲勝：公告排名，送出 result，有再來一局', () => {
    const { state, events } = playGame('A');
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['A']);
    expect(announces(events).join('\n')).toContain('<@A> 獲勝');
    expect(events).toContainEqual({ type: 'result', players: ['A', 'B', 'C'], winners: ['A'] });
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分並列獲勝', () => {
    const { state, events } = playGame(null);
    expect(state.winners).toEqual(['A', 'B', 'C']);
    expect(events).toContainEqual({ type: 'result', players: ['A', 'B', 'C'], winners: ['A', 'B', 'C'] });
  });

  it('再來一局：上一局玩家才能按，新房主是按的人', () => {
    const ended = playGame('A').state;
    const outsider = run([{ type: 'rematch', user: 'Z', channel: 'C1' }], ended);
    expect(ephemeralTo(outsider.events, 'Z')!.text).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'C', channel: 'C1' }], ended);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'C', players: [{ id: 'C', score: 0 }] });
  });

  it('房主取消：公告目前分數，沒有 result 也沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'A' }], started().state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toMatch(/取消[\s\S]*<@A> 0/);
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
  });

  it('非房主取消被拒', () => {
    const s = started().state;
    const { state, events } = run([{ type: 'cancel', user: 'B' }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'B')!.text).toContain('只有房主');
  });
});

describe('wager/setup: 指令與按鈕', () => {
  it('子指令：answer、房間指令；help 和不認識的回傳 null', () => {
    expect(wager.parse('answer 1,200', 'U1', 'C1')).toEqual({ type: 'answer', user: 'U1', text: '1,200' });
    expect(wager.parse('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(wager.parse('addbot', 'U1', 'C1')).toMatchObject({ type: 'addBot', user: 'U1' });
    expect(wager.parse('help', 'U1', 'C1')).toBeNull();
    expect(wager.parse('xyz', 'U1', 'C1')).toBeNull();
  });

  it('按鈕：寫答案、押注選單、押注、重押、房間按鈕', () => {
    expect(wager.button('wager', 'answer', 'U1', 'C1')).toEqual({ type: 'openAnswer', user: 'U1' });
    expect(wager.button('wager', 'betMenu', 'U1', 'C1')).toEqual({ type: 'betMenu', user: 'U1' });
    expect(wager.button('wager', 'bet:4:2', 'U1', 'C1')).toEqual({ type: 'bet', user: 'U1', seq: 4, slot: 2 });
    expect(wager.button('wager', 'rebet:4', 'U1', 'C1')).toEqual({ type: 'rebet', user: 'U1', seq: 4 });
    expect(wager.button('join', '', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(wager.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
  });

  it('視窗送出交給 engine 當作答案', () => {
    expect(wager.modals.wagerAnswer.action('U1', ['1200'])).toEqual({ type: 'answer', user: 'U1', text: '1200' });
    expect(wager.modals.wagerAnswer.fallback).toContain('/game wager answer');
  });

  it('大廳資訊：💰 猜猜看、3～10 人、心理戰、不支援 bot；help 條列所有指令', () => {
    expect(wager).toMatchObject({ kind: 'wager', emoji: '💰', name: '猜猜看', players: '3～10 人', category: 'bluff', noBots: true });
    for (const cmd of ['new', 'start', 'answer', 'cancel']) expect(wager.help).toContain(`/game wager ${cmd}`);
  });
});
