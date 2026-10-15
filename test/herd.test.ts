import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyHerd, type HerdAction, type HerdState } from '../src/herd.js';
import { herd, parseHerdCommand } from '../src/games/herd.js';
import { HERD_QUESTIONS } from '../src/herdQuestions.js';

// rng 接近 1 時 shuffle 不換位置：題目依題庫順序
const rng = () => 0.99999;

function run(actions: HerdAction[], start?: HerdState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyHerd(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as HerdAction)]);
const started = (n = 5) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const board = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel' && p.kind === 'herd').at(-1);
const hostMenu = (events: GameEvent[]) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === 'p1');
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const score = (s: HerdState, id: string) => s.players.find((p) => p.id === id)!.score;
const answer = (user: string, text: string): HerdAction => ({ type: 'answer', user, text });
// 依序作答：answers[i] 是 p(i+1) 的答案；undefined 表示不答
const answerAll = (s: HerdState, answers: (string | undefined)[]) =>
  run(answers.flatMap((t, i) => (t === undefined ? [] : [answer(`p${i + 1}`, t)])), s);
// 作答後直接完成（房主按完成或只有一組時自動計分）
const playQuestion = (s: HerdState, answers: string[]) => {
  const r = answerAll(s, answers);
  return r.state.phase === 'merge' ? run([{ type: 'done', user: 'p1' }], r.state) : r;
};

describe('herd/setup: 從眾心理的房間', () => {
  it('開房：公告標示從眾心理', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'herd', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '從眾心理', players: ['A'] });
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
    expect(ephemeralTo(events, 'p1')!.text).toBe('從眾心理不支援 bot。');
  });

  it('頻道已經有遊戲：拒絕開房', () => {
    const { events } = run([{ type: 'new', user: 'p9', channel: 'C1' }], started().state);
    expect(ephemeralTo(events, 'p9')!.text).toBe('這個頻道已經有遊戲了。');
  });

  it('開局：公告規則和玩家，接著出第 1 題', () => {
    const { state, events } = started(5);
    const text = announces(events).join('\n');
    expect(text).toContain('從眾心理開始');
    expect(text).toContain('<@p5>');
    expect(text).toContain('粉紅牛');
    expect(text).toContain('8 分');
    expect(text).toContain('15 題');
    expect(board(events)!.text).toContain(`第 1/15 題：${HERD_QUESTIONS[0]}`);
    expect(state).toMatchObject({ phase: 'answer', round: 1, question: 0 });
  });
});

describe('herd/setup: 題庫', () => {
  it('連續幾局也不重複：新的一局接著上一局剩下的題目抽', () => {
    const first = run([{ type: 'cancel', user: 'p1' }], started().state).state;
    for (const action of [{ type: 'new', user: 'p1', channel: 'C1' }] as HerdAction[]) {
      const lobby = run([action], first).state;
      expect(lobby.deck).toEqual(first.deck);
      const s = run([...ids(4).slice(1).map((user) => ({ type: 'join', user }) as HerdAction), { type: 'start', user: 'p1' }], lobby).state;
      expect(s.question).not.toBe(first.question);
      expect(s.question).toBe(1);
    }
  });
});

describe('herd/setup: 指令和按鈕', () => {
  it('help 列出 answer、merge、done', () => {
    expect(herd.help).toContain('`/game herd answer');
    expect(herd.help).toContain('`/game herd merge');
    expect(herd.help).toContain('`/game herd done`');
    expect(herd).toMatchObject({ kind: 'herd', emoji: '🐑', name: '從眾心理', players: '4～12 人', category: 'bluff', noBots: true });
  });

  it('解析子指令', () => {
    expect(parseHerdCommand('answer 雞 排', 'U1', 'C1')).toEqual({ type: 'answer', user: 'U1', text: '雞 排' });
    expect(parseHerdCommand('merge 1 3', 'U1', 'C1')).toEqual({ type: 'merge', user: 'U1', groups: [1, 3] });
    expect(parseHerdCommand('done', 'U1', 'C1')).toEqual({ type: 'done', user: 'U1' });
    expect(parseHerdCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseHerdCommand('whatever', 'U1', 'C1')).toBeNull();
  });

  it('按鈕和視窗', () => {
    expect(herd.button('herd', 'write', 'U1', 'C1')).toEqual({ type: 'openWrite', user: 'U1' });
    expect(herd.button('herd', 'pick:3:2', 'U1', 'C1')).toEqual({ type: 'pick', user: 'U1', seq: 3, group: 2 });
    expect(herd.button('herd', 'merge:3', 'U1', 'C1')).toEqual({ type: 'merge', user: 'U1', seq: 3 });
    expect(herd.button('herd', 'done:3', 'U1', 'C1')).toEqual({ type: 'done', user: 'U1', seq: 3 });
    expect(herd.button('join', '', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(herd.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
    expect(herd.modals.herdAnswer.action('U1', ['雞排'])).toEqual({ type: 'answer', user: 'U1', text: '雞排' });
    expect(herd.modals.herdAnswer.fallback).toContain('/game herd answer');
  });
});

describe('herd/rounds: 作答', () => {
  it('題目公告附「✍️ 作答」按鈕，開始 60 秒計時', () => {
    const { events } = started();
    expect(board(events)!.options).toEqual([{ value: 'write', label: '✍️ 作答' }]);
    expect(lastTimer(events).ms).toBe(60_000);
  });

  it('按作答開視窗', () => {
    const { events } = run([{ type: 'openWrite', user: 'p2' }], started().state);
    expect(events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'p2', kind: 'herdAnswer' }));
  });

  it('作答：只有自己看到已收到，頻道顯示已作答 1/5，沒有答案', () => {
    const { state, events } = run([answer('p1', '雞排')], started().state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已收到答案');
    expect(board(events)!.text).toContain('已作答 1/5');
    expect(board(events)!.text).not.toContain('雞排');
    expect(state.answers).toEqual([{ user: 'p1', text: '雞排' }]);
  });

  it('改答案：覆蓋，只有自己看到已更新', () => {
    const { state, events } = run([answer('p1', '雞排'), answer('p1', '臭豆腐')], started().state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已更新答案');
    expect(state.answers).toEqual([{ user: 'p1', text: '臭豆腐' }]);
  });

  it('答案太長、空白、只有符號被拒', () => {
    const s = started().state;
    expect(ephemeralTo(run([answer('p1', '字'.repeat(21))], s).events, 'p1')!.text).toBe('答案最多 20 個字');
    expect(ephemeralTo(run([answer('p1', '   ')], s).events, 'p1')!.text).toBe('答案不能是空的');
    expect(ephemeralTo(run([answer('p1', '!!??')], s).events, 'p1')!.text).toBe('答案不能是空的');
    expect(run([answer('p1', '字'.repeat(20))], s).state.answers).toHaveLength(1);
  });

  it('不在遊戲裡的人被拒', () => {
    const { events } = run([answer('zz', '雞排')], started().state);
    expect(ephemeralTo(events, 'zz')!.text).toBe('你不在這局遊戲裡。');
  });

  it('全部答完：不等 60 秒，立刻公告分組', () => {
    const { state, events } = answerAll(started().state, ['雞排', '雞排', '雞排', '臭豆腐', '蚵仔煎']);
    expect(state.phase).toBe('merge');
    expect(board(events)!.text).toContain('雞排');
  });

  it('超時沒作答：用其他人的答案分組，不得分、不拿粉紅牛', () => {
    const s = answerAll(started().state, ['雞排', '雞排', '雞排', '臭豆腐']).state;
    const r = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(r.state.groups.flatMap((g) => g.members)).not.toContain('p5');
    const done = run([{ type: 'done', user: 'p1' }], r.state).state;
    expect(score(done, 'p5')).toBe(0);
    expect(done.cow).toBe('p4');
  });
});

describe('herd/rounds: 自動分組', () => {
  it('寫法不同但字一樣：同一組，顯示第一個送出的原始答案', () => {
    const { state } = answerAll(started(4).state, ['雞排', '雞排！', ' 雞 排', '鹹酥雞']);
    expect(state.groups[0]).toEqual({ text: '雞排', members: ['p1', 'p2', 'p3'] });
  });

  it('全形和大小寫視為一樣', () => {
    const { state } = answerAll(started(4).state, ['KFC', 'ｋｆｃ', 'kfc', '麥當勞']);
    expect(state.groups[0].members).toEqual(['p1', 'p2', 'p3']);
  });

  it('意思一樣但字不同、子字串：不同組', () => {
    const { state } = answerAll(started(4).state, ['珍奶', '珍珠奶茶', '奶茶', '珍珠奶茶']);
    expect(state.groups.map((g) => g.text)).toEqual(['珍珠奶茶', '珍奶', '奶茶']);
  });

  it('公告每組編號、答案、作答者和人數，人數多的排前面', () => {
    const { events } = answerAll(started().state, ['臭豆腐', '雞排', '雞排', '雞排', '蚵仔煎']);
    const text = board(events)!.text;
    expect(text).toContain('1. 雞排（3 人）：<@p2>、<@p3>、<@p4>');
    expect(text).toContain('2. 臭豆腐（1 人）：<@p1>');
  });
});

describe('herd/rounds: 房主合併', () => {
  const grouped = () => answerAll(started().state, ['珍珠奶茶', '珍珠奶茶', '珍奶', '奶綠', '紅茶']);

  it('房主看到每組按鈕、合併、完成；開始 30 秒計時', () => {
    const { state, events } = grouped();
    const menu = hostMenu(events)!;
    expect(menu.options.map((o) => o.value)).toEqual([
      `pick:${state.seq}:0`,
      `pick:${state.seq}:1`,
      `pick:${state.seq}:2`,
      `pick:${state.seq}:3`,
      `merge:${state.seq}`,
      `done:${state.seq}`,
    ]);
    expect(lastTimer(events).ms).toBe(30_000);
  });

  it('選兩組按合併：合成一組（顯示編號小的答案），分組公告更新', () => {
    const s = grouped().state;
    const { state, events } = run(
      [
        { type: 'pick', user: 'p1', seq: s.seq, group: 0 },
        { type: 'pick', user: 'p1', seq: s.seq, group: 1 },
        { type: 'merge', user: 'p1', seq: s.seq },
      ],
      s,
    );
    expect(state.groups[0]).toEqual({ text: '珍珠奶茶', members: ['p1', 'p2', 'p3'] });
    expect(state.groups).toHaveLength(3);
    expect(board(events)!.text).toContain('1. 珍珠奶茶（3 人）');
    expect(board(events)!.ref).toBe(board(grouped().events)!.ref);
    expect(state.phase).toBe('merge');
  });

  it('再按一次取消選取', () => {
    const s = grouped().state;
    const { state } = run([{ type: 'pick', user: 'p1', seq: s.seq, group: 0 }, { type: 'pick', user: 'p1', seq: s.seq, group: 0 }], s);
    expect(state.selected).toEqual([]);
  });

  it('選不到兩組：被拒', () => {
    const s = grouped().state;
    const { events } = run([{ type: 'pick', user: 'p1', seq: s.seq, group: 0 }, { type: 'merge', user: 'p1', seq: s.seq }], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe('請至少選兩組');
  });

  it('指令合併：merge 1 3', () => {
    const { state } = run([{ type: 'merge', user: 'p1', groups: [1, 2] }], grouped().state);
    expect(state.groups[0].members).toEqual(['p1', 'p2', 'p3']);
  });

  it('非房主：被拒', () => {
    const s = grouped().state;
    for (const action of [{ type: 'merge', user: 'p2', groups: [1, 2] }, { type: 'done', user: 'p2' }, { type: 'pick', user: 'p2', seq: s.seq, group: 0 }] as HerdAction[]) {
      expect(ephemeralTo(run([action], s).events, 'p2')!.text).toBe('只有房主可以合併答案');
    }
  });

  it('舊的選單被拒', () => {
    const s = grouped().state;
    const { events } = run([{ type: 'done', user: 'p1', seq: s.seq - 1 }], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe('這個選單已經過期了。');
  });

  it('合併到只剩一組：直接計分', () => {
    const s = answerAll(started(4).state, ['珍奶', '珍奶', '珍珠奶茶', '珍珠奶茶']).state;
    const { state } = run([{ type: 'merge', user: 'p1', groups: [1, 2] }], s);
    expect(state.round).toBe(2);
    expect(['p1', 'p2', 'p3', 'p4'].map((p) => score(state, p))).toEqual([1, 1, 1, 1]);
  });

  it('時間到：用目前的分組計分', () => {
    const s = grouped().state;
    const { state } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(score(state, 'p1')).toBe(1);
    expect(state.round).toBe(2);
  });

  it('大家答案都一樣：不出現合併按鈕，直接計分', () => {
    const { state, events } = answerAll(started(4).state, ['雞排', '雞排', '雞排', '雞排']);
    expect(hostMenu(events)).toBeUndefined();
    expect(score(state, 'p4')).toBe(1);
    expect(state.round).toBe(2);
  });

  it('沒人作答：跳過合併直接下一題', () => {
    const s = started().state;
    const { state } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.round).toBe(2);
  });
});

describe('herd/rounds: 計分與粉紅牛', () => {
  it('唯一最多：那組每人 +1；兩個單獨答案，粉紅牛不動', () => {
    const { state, events } = playQuestion(started().state, ['雞排', '雞排', '雞排', '臭豆腐', '蚵仔煎']);
    expect(['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => score(state, p))).toEqual([1, 1, 1, 0, 0]);
    expect(state.cow).toBeUndefined();
    expect(announces(events).join('\n')).toContain('目前分數');
  });

  it('最多平手：沒有人得分', () => {
    const { state } = playQuestion(started(4).state, ['雞排', '雞排', '臭豆腐', '臭豆腐']);
    expect(state.players.every((p) => p.score === 0)).toBe(true);
  });

  it('最多的組只有 1 人：沒有人得分', () => {
    const { state } = playQuestion(started(4).state, ['a1', 'b2', 'c3', 'd4']);
    expect(state.players.every((p) => p.score === 0)).toBe(true);
    expect(state.cow).toBeUndefined();
  });

  it('拿到粉紅牛：唯一單獨答案拿走，原持有者失去', () => {
    let s = playQuestion(started().state, ['蚵仔煎', '雞排', '雞排', '雞排', '雞排']).state;
    expect(s.cow).toBe('p1');
    const r = playQuestion(s, ['雞排', '雞排', '雞排', '雞排', '蚵仔煎']);
    s = r.state;
    expect(s.cow).toBe('p5');
    expect(['p1', 'p2', 'p3', 'p4', 'p5'].map((p) => score(s, p))).toEqual([1, 2, 2, 2, 1]);
    expect(announces(r.events).join('\n')).toContain('🐮');
  });
});

describe('herd/rounds: 勝負與結束', () => {
  const withScores = (scores: number[], cow?: string) => {
    const s = structuredClone(started(scores.length).state);
    s.players.forEach((p, i) => (p.score = scores[i]));
    s.cow = cow;
    return s;
  };

  it('到 8 分且沒粉紅牛：獲勝，送 result 和再來一局', () => {
    const { state, events } = playQuestion(withScores([7, 0, 0, 0]), ['雞排', '雞排', '臭豆腐', '蚵仔煎']);
    expect(state.phase).toBe('ended');
    expect(state.winners).toEqual(['p1']);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p1'] });
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('粉紅牛在這題轉走：原持有者到 8 分就獲勝', () => {
    const { state } = playQuestion(withScores([0, 7, 0, 0], 'p2'), ['蚵仔煎', '雞排', '雞排', '雞排']);
    expect(score(state, 'p2')).toBe(8);
    expect(state.cow).toBe('p1');
    expect(state.winners).toEqual(['p2']);
  });

  it('拿著粉紅牛到 8 分且牛沒轉走：遊戲繼續', () => {
    const { state } = playQuestion(withScores([0, 7, 0, 0], 'p2'), ['雞排', '雞排', '臭豆腐', '臭豆腐']);
    expect(state.phase).toBe('answer');
    expect(state.round).toBe(2);
  });

  it('同題並列：多人到 8 分都獲勝', () => {
    const { state } = playQuestion(withScores([7, 0, 7, 0]), ['雞排', '雞排', '雞排', '蚵仔煎']);
    expect(state.winners).toEqual(['p1', 'p3']);
  });

  it('15 題結束：沒有粉紅牛的人裡最高分並列獲勝', () => {
    const s = withScores([6, 7, 6, 0], 'p2');
    s.round = 15;
    const { state } = playQuestion(s, ['a1', 'b2', 'a1', 'b2']);
    expect(state.winners).toEqual(['p1', 'p3']);
  });

  it('15 題結束最高分是 0：沒有人獲勝', () => {
    const s = withScores([0, 0, 0, 0]);
    s.round = 15;
    const { state, events } = playQuestion(s, ['a1', 'b2', 'a1', 'b2']);
    expect(state.winners).toEqual([]);
    expect(events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: [] });
  });

  it('再來一局：上一局玩家才能按', () => {
    const ended = playQuestion(withScores([7, 0, 0, 0]), ['雞排', '雞排', '臭豆腐', '蚵仔煎']).state;
    expect(ephemeralTo(run([{ type: 'rematch', user: 'zz', channel: 'C1' }], ended).events, 'zz')!.text).toContain('只有上一局的玩家');
    expect(run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p3' });
  });

  it('房主取消：公告目前分數，沒有 result 也沒有再來一局', () => {
    const s = playQuestion(started().state, ['雞排', '雞排', '雞排', '臭豆腐', '蚵仔煎']).state;
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('<@p1> 1');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
  });
});
