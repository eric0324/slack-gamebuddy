import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyWavecoop, type WCAction, type WCState } from '../src/wavecoop.js';

const rng = () => 0.99999;

function run(actions: WCAction[], start?: WCState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyWavecoop(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as WCAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind: string) =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const timeout = (s: WCState) => run([{ type: 'timeout', id: s.timers.phase! }], s);

// rng 固定時不洗牌：出題順序是 p1、p2、p3…；目標是 10
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);

describe('wavecoop/setup: 心電感應（合作）的房間', () => {
  it('開房：公告標示心電感應（合作）', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'wavecoop', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '心電感應（合作）', players: ['A'] });
  });

  it('人數不足：至少 2 人；2 人可以開始', () => {
    const one = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(one.state.phase).toBe('lobby');
    expect(ephemeralTo(one.events, 'p1')!.text).toContain('至少需要 2 人');
    expect(started(2).state.phase).toBe('clue');
  });

  it('房間已滿：最多 12 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(12).state);
    expect(full.state.players).toHaveLength(12);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('心電感應（合作）不支援 bot。');
  });

  it('加入、離開、房主離開取消、房主取消；非房主不能開始；頻道已有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobby).events, 'p2')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'join', user: 'p2' }], lobby).events, 'p2')!.text).toContain('已經在房間');
    expect(ephemeralTo(run([{ type: 'new', user: 'x', channel: 'C1' }], lobby).events, 'x')!.text).toContain('已經有遊戲');
  });
});

describe('wavecoop/setup: 出題順序與題數', () => {
  it('開局公告玩家、出題順序和基本 7 題', () => {
    const { state, events } = started(3);
    expect(state).toMatchObject({ order: ['p1', 'p2', 'p3'], total: 7, round: 0, score: 0 });
    const text = announces(events).join('\n');
    expect(text).toContain('共 7 題');
    expect(text).toContain('<@p1> → <@p2> → <@p3>');
  });

  it('兩人輪流：A、B、A、B、A、B、A', () => {
    let { state } = started(2);
    const psychics: string[] = [];
    for (let i = 0; i < 7; i++) {
      psychics.push((run([{ type: 'openClue', user: 'p1' }], state).events[0] as { type: string }).type === 'modal' ? 'p1' : 'p2');
      state = timeout(state).state;
    }
    expect(psychics).toEqual(['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1']);
    expect(state.phase).toBe('ended');
  });

  it('人數比題數多：9 人時後 2 位不出題', () => {
    let { state, events } = started(9);
    const psychics: string[] = [];
    while (state.phase !== 'ended') {
      psychics.push((events.find((e) => e.type === 'dm') as { to: string }).to);
      ({ state, events } = timeout(state));
    }
    expect(psychics).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('光譜卡同一局不重複', () => {
    let { state } = started(2);
    state = { ...state, total: 12 };
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(state.spectrum!.join('|'));
      state = timeout(state).state;
    }
    expect(new Set(seen).size).toBe(12);
  });
});

describe('wavecoop/rounds: 出題', () => {
  it('私訊出題者光譜和目標，頻道公告第幾題、總分，附上寫提示按鈕', () => {
    const { state, events } = started(3);
    expect(state).toMatchObject({ phase: 'clue', target: 10 });
    const [l, r] = state.spectrum!;
    const dm = events.find((e) => e.type === 'dm') as { to: string; text: string };
    expect(dm.to).toBe('p1');
    expect(dm.text).toContain(`「${l} ↔ ${r}」`);
    expect(dm.text).toContain('目標在 10');
    const text = announces(events).at(-1)!;
    expect(text).toContain('第 1／7 題');
    expect(text).toContain('<@p1> 出題');
    expect(text).toContain('總分 0');
    expect(text).toContain(l);
    expect(values(prompts(events, 'wavecoop').at(-1)!)).toEqual(['clue']);
    expect(lastTimer(events).ms).toBe(180_000);
  });

  it('出題者按寫提示：跳出視窗；其他人被拒絕', () => {
    const s = started(3).state;
    expect(run([{ type: 'openClue', user: 'p1' }], s).events).toEqual([
      { type: 'modal', to: 'p1', kind: 'wavecoopClue', title: '寫提示', label: '提示詞（1～30 字）' },
    ]);
    const other = run([{ type: 'openClue', user: 'p2' }], s);
    expect(other.events.some((e) => e.type === 'modal')).toBe(false);
    expect(ephemeralTo(other.events, 'p2')!.text).toContain('現在不是你出題');
  });

  it('送出提示：公告提示，進入大家猜位置，0～10 按鈕分兩列', () => {
    const { state, events } = run([{ type: 'clue', user: 'p1', text: ' 火鍋 ' }], started(3).state);
    expect(state).toMatchObject({ phase: 'guess', clue: '火鍋' });
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 的提示：「火鍋」');
    expect(text).toContain('<@p2>、<@p3>');
    const p = prompts(events, 'wavecoop').at(-1)!;
    expect(values(p)).toEqual(Array.from({ length: 11 }, (_, i) => `guess:${i}`));
    expect(p.perRow).toBe(6);
  });

  it('提示要 1～30 字；不是出題者不能送出', () => {
    const s = started(3).state;
    expect(ephemeralTo(run([{ type: 'clue', user: 'p1', text: '  ' }], s).events, 'p1')!.text).toContain('1～30');
    expect(ephemeralTo(run([{ type: 'clue', user: 'p1', text: '字'.repeat(31) }], s).events, 'p1')!.text).toContain('1～30');
    const other = run([{ type: 'clue', user: 'p2', text: '火鍋' }], s);
    expect(other.state.phase).toBe('clue');
    expect(ephemeralTo(other.events, 'p2')!.text).toContain('現在不是你出題');
  });

  it('出題超時：這題跳過、0 分，用掉一題', () => {
    const st = started(3);
    const { state, events } = run([{ type: 'timeout', id: lastTimer(st.events).id }], st.state);
    expect(announces(events).join('\n')).toContain('<@p1> 沒有寫提示，這題跳過');
    expect(state).toMatchObject({ round: 1, phase: 'clue', score: 0, total: 7 });
    expect(announces(events).at(-1)).toContain('第 2／7 題');
  });

  it('舊的計時器被忽略', () => {
    const st = started(3);
    const clued = run([{ type: 'clue', user: 'p1', text: '火鍋' }], st.state).state;
    expect(run([{ type: 'timeout', id: lastTimer(st.events).id }], clued).state).toEqual(clued);
  });
});

// 3 人局：p1 出題，p2、p3 猜；目標 10
const clued = (n = 3) => run([{ type: 'clue', user: 'p1', text: '火鍋' }], started(n).state).state;
const guess = (user: string, value: number, s: WCState) => run([{ type: 'guess', user, value }], s);

describe('wavecoop/rounds: 全員猜位置', () => {
  it('全部猜完提早結束，全隊答案是平均四捨五入；不公告每個人選幾', () => {
    const a = guess('p2', 6, { ...clued(), target: 8 });
    expect(a.state.phase).toBe('guess');
    const b = guess('p3', 9, a.state);
    expect(b.state).toMatchObject({ round: 1, phase: 'clue', score: 4 });
    const text = announces(b.events).join('\n');
    expect(text).toContain('全隊答案 8');
    expect(text).not.toContain('6');
  });

  it('兩人局：唯一的猜題者選完就結束', () => {
    const s = run([{ type: 'clue', user: 'p1', text: '火鍋' }], started(2).state).state;
    const b = guess('p2', 4, { ...s, target: 4 });
    expect(b.state).toMatchObject({ round: 1, score: 4 });
  });

  it('改選：只有自己看到目前選了幾', () => {
    const a = guess('p2', 3, clued());
    const b = guess('p2', 5, a.state);
    expect(b.state.guesses).toEqual({ p2: 5 });
    expect(ephemeralTo(b.events, 'p2')!.text).toContain('你選了 5');
    expect(announces(b.events)).toEqual([]);
  });

  it('出題者和不在遊戲中的人不能猜', () => {
    for (const user of ['p1', 'x']) {
      const res = guess(user, 5, clued());
      expect(res.state.guesses).toEqual({});
      expect(ephemeralTo(res.events, user)!.text).toContain('現在不是你猜位置');
    }
  });

  it('超時只算有選的人；沒人猜就 0 分並公布目標', () => {
    let s = clued(4);
    s = guess('p2', 2, { ...s, target: 3 }).state;
    s = guess('p3', 3, s).state;
    const timed = timeout(s);
    expect(announces(timed.events).join('\n')).toContain('全隊答案 3');
    expect(timed.state.score).toBe(4);
    const none = timeout(clued());
    const text = announces(none.events).join('\n');
    expect(text).toContain('沒有人猜');
    expect(text).toContain('目標 10');
    expect(none.state).toMatchObject({ round: 1, phase: 'clue', score: 0, total: 7 });
  });
});

describe('wavecoop/rounds: 計分與加題', () => {
  const answer = (target: number, value: number, s = clued(2)) => guess('p2', value, { ...s, target });

  it('差 1 得 3 分、差 2 得 2 分、差 3 以上 0 分，題數不變', () => {
    const one = answer(7, 8);
    expect(one.state).toMatchObject({ score: 3, total: 7 });
    const text = announces(one.events).join('\n');
    expect(text).toContain('提示「火鍋」');
    expect(text).toContain('目標 7');
    expect(text).toContain('+3');
    expect(text).toContain('總分 3');
    expect(answer(5, 7).state.score).toBe(2);
    expect(answer(2, 6).state.score).toBe(0);
  });

  it('正中得 4 分並加一題；最後一題正中會多第 8 題', () => {
    const last = { ...clued(2), round: 6 };
    const hit = answer(7, 7, last);
    expect(hit.state).toMatchObject({ score: 4, total: 8, round: 7, phase: 'clue' });
    const text = announces(hit.events).join('\n');
    expect(text).toContain('🎯 正中！加一題');
    expect(text).toContain('第 8／8 題');
  });
});

describe('wavecoop/rounds: 結束與評價', () => {
  const finish = (score: number) => timeout({ ...started(2).state, round: 6, score });

  it('題數用完：公告總分、評價和再來一局', () => {
    const { state, events } = finish(14);
    expect(state.phase).toBe('ended');
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players, winners: [], score: 14 });
    const text = announces(events).join('\n');
    expect(text).toContain('總分 14');
    expect(text).toContain('🔥 心有靈犀');
    expect(values(prompts(events, 'rematch')[0])).toEqual(['rematch']);
  });

  it('評價邊界', () => {
    const cases: [number, string][] = [
      [0, '📻 訊號不良'], [3, '📻 訊號不良'], [4, '🤔 有點默契'], [6, '🤔 有點默契'], [7, '🙂 不錯喔'], [9, '🙂 不錯喔'],
      [10, '😎 很有默契'], [12, '😎 很有默契'], [13, '🔥 心有靈犀'], [15, '🔥 心有靈犀'], [16, '🧠 你們是不是共用一顆腦'],
      [18, '🧠 你們是不是共用一顆腦'], [19, '🛸 心電感應大師'], [21, '🛸 心電感應大師'], [22, '🌌 宇宙級腦波同步'], [30, '🌌 宇宙級腦波同步'],
    ];
    for (const [score, text] of cases) expect(announces(finish(score).events).join('\n'), String(score)).toContain(text);
  });

  it('再來一局：上一局的玩家開新房；不在上一局的人不行；取消的遊戲不能再來一局', () => {
    const ended = finish(5).state;
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p2', players: ['p2'] });
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')).toBeDefined();
    const cancelled = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(announces(cancelled.events).join('\n')).toContain('取消');
    expect(prompts(cancelled.events, 'rematch')).toEqual([]);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], cancelled.state).state.phase).toBe('ended');
  });
});
