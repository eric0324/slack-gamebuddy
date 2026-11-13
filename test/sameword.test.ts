import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySameword, type SamewordAction, type SamewordState } from '../src/sameword.js';
import { sameword, parseSamewordCommand } from '../src/games/sameword.js';

const rng = () => 0.5;

function run(actions: SamewordAction[], start?: SamewordState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySameword(state, action, rng));
  return { state: state!, events };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as SamewordAction)]);
const started = (n = 4) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const board = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'sameword' && p.options.some((o) => o.value === 'write')).at(-1);
const judge = (events: GameEvent[]) => prompts(events).find((p) => p.kind === 'sameword' && p.options.some((o) => o.value.startsWith('same:')));
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const word = (user: string, text: string): SamewordAction => ({ type: 'word', user, text });
// words[i] 是 p(i+1) 的詞；undefined 表示不寫
const writeAll = (s: SamewordState, words: (string | undefined)[]) =>
  run(words.flatMap((t, i) => (t === undefined ? [] : [word(`p${i + 1}`, t)])), s);
// 寫完一輪沒相遇，房主按下一輪
const missRound = (s: SamewordState, words: string[]) => run([{ type: 'next', user: 'p1', seq: writeAll(s, words).state.seq }], writeAll(s, words).state);
const result = (events: GameEvent[]) => events.find((e) => e.type === 'result');

describe('sameword/setup: 同詞相遇的房間', () => {
  it('開房：公告標示同詞相遇', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'sameword', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '同詞相遇', players: ['A'] });
  });

  it('人數不足：至少 3 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 3 人');
  });

  it('房間已滿：最多 10 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(10).state);
    expect(full.state.players).toHaveLength(10);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('離開；房主離開就取消房間', () => {
    expect(run([{ type: 'leave', user: 'p2' }], lobbyWith(3).state).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state).state.phase).toBe('ended');
  });

  it('非房主開始被拒', () => {
    const { state, events } = run([{ type: 'start', user: 'p2' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p2')!.text).toContain('只有房主可以開始遊戲');
  });

  it('不支援 bot：addbot、removebot 都被拒，名單不變', () => {
    for (const type of ['addBot', 'removeBot'] as const) {
      const { state, events } = run([{ type, user: 'p1', count: 1 }], lobbyWith(3).state);
      expect(state.players).toHaveLength(3);
      expect(ephemeralTo(events, 'p1')!.text).toBe('同詞相遇不支援 bot。');
    }
  });

  it('頻道已經有遊戲：拒絕開房', () => {
    const { events } = run([{ type: 'new', user: 'p9', channel: 'C1' }], started().state);
    expect(ephemeralTo(events, 'p9')!.text).toBe('這個頻道已經有遊戲了。');
  });

  it('開局：公告規則和玩家，接著出第 1 輪寫詞面板', () => {
    const { state, events } = started(4);
    const text = announces(events).join('\n');
    expect(text).toContain('同詞相遇開始');
    expect(text).toContain('<@p4>');
    expect(text).toContain('10 輪');
    expect(text).toContain('出現過的詞不能再寫');
    expect(state).toMatchObject({ phase: 'write', round: 1 });
    const b = board(events)!;
    expect(b.text).toContain('第 1/10 輪');
    expect(b.text).toContain('先隨便想一個詞');
    expect(b.options).toEqual([{ value: 'write', label: '✍️ 寫詞' }]);
    expect(b.ref).toBe(`sameword:${state.seq}`);
    expect(lastTimer(events).ms).toBe(90_000);
  });
});

describe('sameword/rounds: 寫詞', () => {
  it('按寫詞開視窗；局外人被拒', () => {
    const s = started().state;
    expect(run([{ type: 'openWrite', user: 'p2' }], s).events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'p2', kind: 'samewordWord' }));
    expect(ephemeralTo(run([{ type: 'openWrite', user: 'x' }], s).events, 'x')!.text).toContain('不在這局');
  });

  it('寫詞：只有自己看到已收到，面板顯示已寫 1/4 和還沒寫的人，沒有洩漏詞', () => {
    const { state, events } = run([word('p1', '蘋果')], started().state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已收到');
    const b = board(events)!;
    expect(b.text).toContain('已寫 1/4');
    expect(b.text).toContain('<@p2> <@p3> <@p4>');
    expect(b.text).not.toContain('蘋果');
    expect(b.ref).toBe(`sameword:${state.seq}`);
    expect(JSON.stringify(events)).not.toContain('蘋果');
  });

  it('揭曉前改詞：覆蓋並顯示已更新', () => {
    const { state, events } = run([word('p1', '蘋果'), word('p1', '香蕉')], started().state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已更新');
    expect(state.words).toEqual([{ user: 'p1', text: '香蕉' }]);
  });

  it('詞太長、正規化後空白、局外人都被拒', () => {
    const s = started().state;
    expect(ephemeralTo(run([word('p1', '字'.repeat(21))], s).events, 'p1')!.text).toContain('最多 20 個字');
    expect(run([word('p1', '字'.repeat(20))], s).state.words).toHaveLength(1);
    const empty = run([word('p1', ' ！？ ')], s);
    expect(empty.state.words).toEqual([]);
    expect(ephemeralTo(empty.events, 'p1')!.text).toContain('不能是空的');
    expect(ephemeralTo(run([word('x', '蘋果')], s).events, 'x')!.text).toContain('不在這局');
  });

  it('全部寫完立刻揭曉', () => {
    const { state, events } = writeAll(started().state, ['蘋果', '牛頓', '手機', '紅色']);
    expect(state.phase).toBe('judge');
    expect(announces(events).join('\n')).toContain('蘋果');
  });

  it('90 秒逾時：用已寫的詞揭曉；舊計時器被忽略', () => {
    const s0 = started();
    const timer = lastTimer(s0.events).id;
    const partial = writeAll(s0.state, ['牛頓', '牛頓', '牛頓']).state;
    const { state, events } = run([{ type: 'timeout', id: timer }], partial);
    expect(announces(events).join('\n')).toContain('(沒寫)');
    expect(state.round).toBe(2);
    expect(run([{ type: 'timeout', id: timer }], state).events).toEqual([]);
  });
});

describe('sameword/rounds: 出現過的詞不能再寫', () => {
  const round2 = () => missRound(started().state, ['蘋果', '牛頓', 'iPhone', '紅色']);

  it('第 2 輪面板列出上一輪每個人的詞', () => {
    const { state, events } = round2();
    expect(state.round).toBe(2);
    const b = board(events)!;
    expect(b.text).toContain('第 2/10 輪');
    for (const w of ['<@p1> 蘋果', '<@p2> 牛頓', '<@p3> iPhone', '<@p4> 紅色']) expect(b.text).toContain(w);
  });

  it('寫了上一輪別人寫過的詞被拒，原本的詞不變', () => {
    const s = run([word('p1', '水果')], round2().state).state;
    const { state, events } = run([word('p1', '牛頓')], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe('「牛頓」前面出現過了，換一個詞');
    expect(state.words).toEqual([{ user: 'p1', text: '水果' }]);
  });

  it('寫法不同也算出現過', () => {
    expect(ephemeralTo(run([word('p1', 'ｉｐｈｏｎｅ')], round2().state).events, 'p1')!.text).toContain('前面出現過了');
  });

  it('同一輪彼此相同可以', () => {
    expect(run([word('p1', '水果'), word('p2', '水果')], round2().state).state.words).toHaveLength(2);
  });
});

describe('sameword/rounds: 揭曉與自動比對', () => {
  it('揭曉依玩家順序列出每個人的詞', () => {
    const s = started().state;
    const { events } = run([word('p3', '手機'), word('p1', '蘋果'), word('p4', '紅色'), word('p2', '牛頓')], s);
    const text = announces(events).join('\n');
    expect(text.indexOf('<@p1> 蘋果')).toBeLessThan(text.indexOf('<@p2> 牛頓'));
    expect(text.indexOf('<@p2> 牛頓')).toBeLessThan(text.indexOf('<@p3> 手機'));
  });

  it('寫法不同但字一樣：相遇成功', () => {
    const { state } = writeAll(started().state, ['牛頓', '牛頓！', ' 牛 頓', '牛頓']);
    expect(state).toMatchObject({ phase: 'ended', score: 10 });
  });

  it('子字串不算相同', () => {
    expect(writeAll(started().state, ['珍奶', '珍奶茶', '珍奶', '珍奶']).state.phase).toBe('judge');
  });

  it('有人沒寫：不能相遇、不給判定，直接下一輪', () => {
    const s0 = started();
    const { state, events } = run([{ type: 'timeout', id: lastTimer(s0.events).id }], writeAll(s0.state, ['牛頓', '牛頓', '牛頓']).state);
    expect(judge(events)).toBeUndefined();
    expect(state).toMatchObject({ phase: 'write', round: 2 });
    expect(announces(events).join('\n')).toContain('<@p4> (沒寫)');
  });
});

describe('sameword/rounds: 房主判定算相同', () => {
  const toJudge = () => writeAll(started().state, ['珍奶', '珍珠奶茶', '珍奶', '珍奶']);

  it('揭曉附「🤝 算相同」「➡️ 下一輪」，30 秒計時', () => {
    const { state, events } = toJudge();
    expect(judge(events)!.options).toEqual([
      { value: `same:${state.seq}`, label: '🤝 算相同' },
      { value: `next:${state.seq}`, label: '➡️ 下一輪' },
    ]);
    expect(lastTimer(events).ms).toBe(30_000);
  });

  it('房主按算相同：相遇成功', () => {
    const s = toJudge().state;
    const { state, events } = run([{ type: 'same', user: 'p1', seq: s.seq }], s);
    expect(state).toMatchObject({ phase: 'ended', score: 10 });
    expect(result(events)).toEqual({ type: 'result', players: ids(4), winners: [], score: 10 });
    const text = announces(events).join('\n');
    expect(text).toContain('第 1 輪腦迴路相遇了');
    expect(text).not.toContain('大家都寫了');
  });

  it('房主按下一輪：立刻開始下一輪；指令也可以', () => {
    const s = toJudge().state;
    expect(run([{ type: 'next', user: 'p1', seq: s.seq }], s).state).toMatchObject({ phase: 'write', round: 2 });
    expect(run([{ type: 'next', user: 'p1' }], s).state).toMatchObject({ phase: 'write', round: 2 });
    expect(run([{ type: 'same', user: 'p1' }], s).state.phase).toBe('ended');
  });

  it('判定逾時：自動下一輪', () => {
    const { state, events } = toJudge();
    expect(run([{ type: 'timeout', id: lastTimer(events).id }], state).state).toMatchObject({ phase: 'write', round: 2 });
  });

  it('非房主被拒，這輪不變', () => {
    const s = toJudge().state;
    const { state, events } = run([{ type: 'same', user: 'p2', seq: s.seq }], s);
    expect(state).toEqual(s);
    expect(ephemeralTo(events, 'p2')!.text).toBe('只有房主可以判定');
  });

  it('舊輪次的按鈕被忽略，state 不變', () => {
    const s = toJudge().state;
    const r2 = run([{ type: 'next', user: 'p1', seq: s.seq }], s).state;
    const { state, events } = run([{ type: 'same', user: 'p1', seq: s.seq }], r2);
    expect(state).toEqual(r2);
    expect(events).toEqual([]);
  });
});

describe('sameword/rounds: 輪數上限、計分與結束', () => {
  it('第 4 輪相遇：7 分，公告詞、輪數、分數和聯想路線', () => {
    let s = started().state;
    s = missRound(s, ['蘋果', '牛頓', '手機', '紅色']).state;
    s = missRound(s, ['水果', '物理', '科技', '番茄']).state;
    s = missRound(s, ['樹', '重力', '電腦', '蔬菜']).state;
    const { state, events } = writeAll(s, ['萬有引力', '萬有引力', '萬有引力', '萬有引力']);
    expect(state.score).toBe(7);
    expect(result(events)).toEqual({ type: 'result', players: ids(4), winners: [], score: 7 });
    const text = announces(events).join('\n');
    expect(text).toContain('第 4 輪');
    expect(text).toContain('萬有引力');
    expect(text).toContain('7 分');
    expect(text).toContain('蘋果、牛頓、手機、紅色');
    expect(text).toContain('樹、重力、電腦、蔬菜');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('10 輪都沒相遇：0 分；沒寫的在路線裡是「—」', () => {
    let s = started().state;
    for (let r = 1; r < 10; r++) s = missRound(s, ids(4).map((p) => `${p}詞${r}`)).state;
    const last = writeAll(s, ['a', 'b', 'c']);
    const { state, events } = run([{ type: 'timeout', id: last.state.timers.phase! }], last.state);
    expect(state).toMatchObject({ phase: 'ended', score: 0 });
    expect(result(events)).toEqual({ type: 'result', players: ids(4), winners: [], score: 0 });
    expect(announces(events).join('\n')).toContain('a、b、c、—');
  });

  it('第 10 輪房主按下一輪：失敗結束', () => {
    let s = started().state;
    for (let r = 1; r < 10; r++) s = missRound(s, ids(4).map((p) => `${p}詞${r}`)).state;
    expect(missRound(s, ['x', 'y', 'z', 'w']).state).toMatchObject({ phase: 'ended', score: 0 });
  });

  it('10 人 10 輪 20 字的結束訊息少於 3000 字', () => {
    let s = started(10).state;
    for (let r = 1; r < 10; r++) s = missRound(s, ids(10).map((p, i) => `${'字'.repeat(17)}${r}${i}`)).state;
    const { events } = missRound(s, ids(10).map((p, i) => `${'字'.repeat(17)}X${i}`));
    const end = announces(events).at(-1)!;
    expect(end).toContain('沒有相遇');
    expect(end.length).toBeLessThan(3000);
  });
});

describe('sameword/rounds: 取消與再來一局', () => {
  it('房主取消：公告取消，沒有結果、沒有再來一局', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], started().state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('取消');
    expect(result(events)).toBeUndefined();
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });

  it('非房主取消被拒', () => {
    const { state } = run([{ type: 'cancel', user: 'p2' }], started().state);
    expect(state.phase).toBe('write');
  });

  it('再來一局：上一局玩家可以按、開新的空房間、按的人當房主；局外人被拒', () => {
    const ended = writeAll(started().state, ['牛頓', '牛頓', '牛頓', '牛頓']).state;
    const { state, events } = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended);
    expect(state).toMatchObject({ phase: 'lobby', host: 'p2' });
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
    expect(events[0]).toMatchObject({ type: 'lobby', title: '同詞相遇' });
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')).toBeDefined();
  });

  it('結束後舊的寫詞與判定按鈕被忽略', () => {
    const ended = writeAll(started().state, ['牛頓', '牛頓', '牛頓', '牛頓']).state;
    for (const a of [word('p1', '蘋果'), { type: 'same', user: 'p1' } as SamewordAction, { type: 'openWrite', user: 'p1' } as SamewordAction]) {
      expect(run([a], ended).events).toEqual([]);
    }
  });
});

describe('sameword/setup: 大廳與指令說明', () => {
  it('GameDef 的大廳資訊與 help', () => {
    expect(sameword).toMatchObject({ kind: 'sameword', emoji: '💞', name: '同詞相遇', players: '3～10 人', category: 'coop', noBots: true });
    for (const cmd of ['new', 'start', 'word', 'same', 'next', 'cancel']) expect(sameword.help).toContain(`/game sameword ${cmd}`);
  });

  it('解析子指令；不認識的回 null (顯示說明)', () => {
    expect(parseSamewordCommand('word 珍珠 奶茶', 'U1', 'C1')).toEqual({ type: 'word', user: 'U1', text: '珍珠 奶茶' });
    expect(parseSamewordCommand('same', 'U1', 'C1')).toEqual({ type: 'same', user: 'U1' });
    expect(parseSamewordCommand('next', 'U1', 'C1')).toEqual({ type: 'next', user: 'U1' });
    expect(parseSamewordCommand('new', 'U1', 'C1')).toMatchObject({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseSamewordCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseSamewordCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseSamewordCommand('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(parseSamewordCommand('removebot', 'U1', 'C1')).toMatchObject({ type: 'removeBot', user: 'U1' });
    expect(parseSamewordCommand('help', 'U1', 'C1')).toBeNull();
    expect(parseSamewordCommand('abc', 'U1', 'C1')).toBeNull();
  });

  it('按鈕和視窗', () => {
    expect(sameword.button('sameword', 'write', 'U1', 'C1')).toEqual({ type: 'openWrite', user: 'U1' });
    expect(sameword.button('sameword', 'same:3', 'U1', 'C1')).toEqual({ type: 'same', user: 'U1', seq: 3 });
    expect(sameword.button('sameword', 'next:3', 'U1', 'C1')).toEqual({ type: 'next', user: 'U1', seq: 3 });
    expect(sameword.button('join', '', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(sameword.button('leave', '', 'U1', 'C1')).toEqual({ type: 'leave', user: 'U1' });
    expect(sameword.button('start', '', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(sameword.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
    expect(sameword.modals.samewordWord.action('U1', ['牛頓'])).toEqual({ type: 'word', user: 'U1', text: '牛頓' });
    expect(sameword.modals.samewordWord.fallback).toContain('/game sameword word <詞>');
  });
});
