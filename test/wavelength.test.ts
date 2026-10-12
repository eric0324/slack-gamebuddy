import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyWavelength, type WAction, type WState } from '../src/wavelength.js';

const rng = () => 0.99999;

function run(actions: WAction[], start?: WState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyWavelength(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as WAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind: string) =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;

// rng 固定時不洗牌：p1、p3… 是橘隊，p2、p4… 是紫隊，紫隊先出題；目標是 10
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);

describe('wavelength/setup: 心電感應的房間', () => {
  it('開房：公告標示心電感應', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'wavelength', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '心電感應', players: ['A'] });
  });

  it('人數不足：至少 4 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 4 人');
  });

  it('房間已滿：最多 12 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(12).state);
    expect(full.state.players).toHaveLength(12);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(4).state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('心電感應不支援 bot。');
  });

  it('加入、離開、房主離開取消、房主取消；非房主不能開始', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(3);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobby).events, 'p2')).toBeDefined();
  });
});

describe('wavelength/setup: 分隊與出題順序', () => {
  it('5 人分隊：一隊 3 人、一隊 2 人，總共 5 題，每人出一題', () => {
    const { state, events } = started(5);
    const teams = state.players.map((p) => p.team);
    expect(teams.filter((t) => t === 'orange')).toHaveLength(3);
    expect(teams.filter((t) => t === 'purple')).toHaveLength(2);
    expect(state.order).toEqual(['p2', 'p1', 'p4', 'p3', 'p5']);
    const text = announces(events).join('\n');
    expect(text).toContain('🟠 橘隊：<@p1>、<@p3>、<@p5>');
    expect(text).toContain('🟣 紫隊：<@p2>、<@p4>');
    expect(text).toContain('共 5 題');
  });

  it('出題兩隊輪流', () => {
    const { state } = started(4);
    const teamOf = (id: string) => state.players.find((p) => p.id === id)!.team;
    expect(state.order.map(teamOf)).toEqual(['purple', 'orange', 'purple', 'orange']);
  });

  it('光譜卡同一局不重複', () => {
    let { state } = started(12);
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) {
      seen.push(state.spectrum!.join('|'));
      state = run([{ type: 'timeout', id: state.timers.phase! }], state).state;
    }
    expect(new Set(seen).size).toBe(12);
  });
});

describe('wavelength/rounds: 出題', () => {
  it('私訊出題者光譜和目標，頻道公告輪到誰並附上寫提示按鈕', () => {
    const { state, events } = started(4);
    expect(state).toMatchObject({ phase: 'clue', round: 0, target: 10 });
    const [l, r] = state.spectrum!;
    const dm = events.find((e) => e.type === 'dm') as { to: string; text: string };
    expect(dm.to).toBe('p2');
    expect(dm.text).toContain(`「${l} ↔ ${r}」`);
    expect(dm.text).toContain('目標在 10');
    const text = announces(events).at(-1)!;
    expect(text).toContain('第 1／4 題');
    expect(text).toContain('<@p2> 出題');
    expect(text).toContain(l);
    expect(values(prompts(events, 'wavelength').at(-1)!)).toEqual(['clue']);
    expect(lastTimer(events).ms).toBe(180_000);
  });

  it('出題者按寫提示：跳出視窗；其他人被拒絕', () => {
    const s = started(4).state;
    expect(run([{ type: 'openClue', user: 'p2' }], s).events).toEqual([
      { type: 'modal', to: 'p2', kind: 'wavelengthClue', title: '寫提示', label: '提示詞（1～30 字）' },
    ]);
    const other = run([{ type: 'openClue', user: 'p1' }], s);
    expect(other.events.some((e) => e.type === 'modal')).toBe(false);
    expect(ephemeralTo(other.events, 'p1')!.text).toContain('現在不是你出題');
  });

  it('送出提示：公告提示，進入隊友猜位置，0～10 按鈕分兩列', () => {
    const { state, events } = run([{ type: 'clue', user: 'p2', text: ' 火鍋 ' }], started(4).state);
    expect(state).toMatchObject({ phase: 'guess', clue: '火鍋' });
    expect(announces(events).join('\n')).toContain('<@p2> 的提示：「火鍋」');
    const p = prompts(events, 'wavelength').at(-1)!;
    expect(values(p)).toEqual(Array.from({ length: 11 }, (_, i) => `guess:${i}`));
    expect(p.perRow).toBe(6);
  });

  it('提示要 1～30 字；不是出題者不能送出', () => {
    const s = started(4).state;
    expect(ephemeralTo(run([{ type: 'clue', user: 'p2', text: '  ' }], s).events, 'p2')!.text).toContain('1～30');
    expect(ephemeralTo(run([{ type: 'clue', user: 'p2', text: '字'.repeat(31) }], s).events, 'p2')!.text).toContain('1～30');
    const other = run([{ type: 'clue', user: 'p1', text: '火鍋' }], s);
    expect(other.state.phase).toBe('clue');
    expect(ephemeralTo(other.events, 'p1')!.text).toContain('現在不是你出題');
  });

  it('出題超時：這題跳過，兩隊都不得分，換下一題', () => {
    const st = started(4);
    const { state, events } = run([{ type: 'timeout', id: lastTimer(st.events).id }], st.state);
    expect(announces(events).join('\n')).toContain('<@p2> 沒有寫提示，這題跳過');
    expect(state).toMatchObject({ round: 1, phase: 'clue', scores: { orange: 0, purple: 0 } });
  });
});

// 4 人局：紫隊 p2 出題，隊友 p4；對手橘隊 p1、p3；目標 10
const clued = (n = 4) => run([{ type: 'clue', user: 'p2', text: '火鍋' }], started(n).state).state;
const guess = (user: string, value: number, s: WState) => run([{ type: 'guess', user, value }], s);
const side = (user: string, value: 'left' | 'right', s: WState) => run([{ type: 'side', user, value }], s);

describe('wavelength/rounds: 隊友猜位置', () => {
  it('全部猜完提早結束，全隊答案是平均四捨五入；不公告每個人選幾', () => {
    // 6 人：紫隊 p2、p4、p6，p2 出題
    const a = guess('p4', 6, clued(6));
    expect(a.state.phase).toBe('guess');
    const b = guess('p6', 9, a.state);
    expect(b.state).toMatchObject({ phase: 'side', answer: 8 });
    const text = announces(b.events).join('\n');
    expect(text).toContain('🟣 紫隊的答案：8');
    expect(text).not.toContain('6');
    expect(values(prompts(b.events, 'wavelength').at(-1)!)).toEqual(['side:left', 'side:right']);
  });

  it('改選：只有自己看到目前選了幾', () => {
    const a = guess('p4', 3, clued(6));
    const b = guess('p4', 5, a.state);
    expect(b.state.guesses).toEqual({ p4: 5 });
    expect(ephemeralTo(b.events, 'p4')!.text).toContain('你選了 5');
    expect(announces(b.events)).toEqual([]);
  });

  it('對手和出題者不能猜位置', () => {
    for (const user of ['p1', 'p2']) {
      const res = guess(user, 5, clued());
      expect(res.state.guesses).toEqual({});
      expect(ephemeralTo(res.events, user)!.text).toContain('現在不是你猜位置');
    }
  });

  it('超時：用已經選的人算答案；沒人選就 0 分並直接公布', () => {
    const a = guess('p4', 4, clued(6));
    const timed = run([{ type: 'timeout', id: a.state.timers.phase! }], a.state);
    expect(timed.state).toMatchObject({ phase: 'side', answer: 4 });
    const s = clued();
    const none = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(announces(none.events).join('\n')).toContain('沒有人猜');
    expect(none.state).toMatchObject({ round: 1, phase: 'clue', scores: { orange: 0, purple: 0 } });
  });
});

describe('wavelength/rounds: 對手猜左右與計分', () => {
  const answered = (value: number) => guess('p4', value, clued()).state; // 對手 p1、p3

  it('多數決：對手猜對方向得 1 分；差 1 出題隊得 3 分', () => {
    const a = side('p1', 'right', answered(9));
    expect(a.state.phase).toBe('side');
    expect(ephemeralTo(a.events, 'p1')!.text).toContain('你選了偏右');
    const b = side('p3', 'right', a.state);
    expect(b.state).toMatchObject({ phase: 'clue', round: 1, scores: { purple: 3, orange: 1 } });
    const text = announces(b.events).join('\n');
    expect(text).toContain('目標 10');
    expect(text).toContain('🟣 紫隊 +3');
    expect(text).toContain('🟠 橘隊 +1');
  });

  it('平手視為沒猜', () => {
    const b = side('p3', 'left', side('p1', 'right', answered(9)).state);
    expect(b.state.scores).toEqual({ purple: 3, orange: 0 });
  });

  it('正中目標得 4 分，對手不得分', () => {
    const b = side('p3', 'right', side('p1', 'right', answered(10)).state);
    expect(b.state.scores).toEqual({ purple: 4, orange: 0 });
  });

  it('差 2 得 2 分、差 3 以上 0 分；猜錯方向對手不得分', () => {
    expect(side('p3', 'left', side('p1', 'left', answered(8)).state).state.scores).toEqual({ purple: 2, orange: 0 });
    expect(side('p3', 'left', side('p1', 'left', answered(7)).state).state.scores).toEqual({ purple: 0, orange: 0 });
  });

  it('出題隊不能猜左右；超時用已經選的人多數決', () => {
    const res = side('p4', 'left', answered(9));
    expect(ephemeralTo(res.events, 'p4')!.text).toContain('現在不是你猜左右');
    const a = side('p1', 'right', answered(9)).state;
    expect(run([{ type: 'timeout', id: a.timers.phase! }], a).state.scores).toEqual({ purple: 3, orange: 1 });
  });
});

describe('wavelength/rounds: 結束', () => {
  const finish = (s: WState, scores: WState['scores']) => {
    const last = { ...s, round: s.order.length - 1, scores };
    return run([{ type: 'timeout', id: last.timers.phase! }], last);
  };

  it('每人都出過題後結束，公告獲勝隊伍和再來一局', () => {
    const { state, events } = finish(started(4).state, { orange: 15, purple: 12 });
    expect(state).toMatchObject({ phase: 'ended', winner: 'orange' });
    expect(announces(events).join('\n')).toContain('🟠 橘隊獲勝');
    expect(values(prompts(events, 'rematch')[0])).toEqual(['rematch']);
  });

  it('同分平手', () => {
    const { state, events } = finish(started(4).state, { orange: 10, purple: 10 });
    expect(state.winner).toBe('tie');
    expect(announces(events).join('\n')).toContain('平手');
  });

  it('再來一局：上一局的玩家開新房；取消的遊戲不能再來一局', () => {
    const ended = finish(started(4).state, { orange: 1, purple: 0 }).state;
    expect(run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p3' });
    const cancelled = run([{ type: 'cancel', user: 'p1' }], started(4).state);
    expect(prompts(cancelled.events, 'rematch')).toEqual([]);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], cancelled.state).state.phase).toBe('ended');
  });
});
