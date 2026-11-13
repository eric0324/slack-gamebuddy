import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySync, type SyncAction, type SyncState } from '../src/sync.js';
import { sync, parseSyncCommand } from '../src/games/sync.js';
import { MIX_THEMES, SYNC_QUESTIONS, SYNC_THEMES, themeIds } from '../src/syncQuestions.js';

// rng 接近 1 時 shuffle 不換位置：題目依題庫順序
const rng = () => 0.99999;

function run(actions: SyncAction[], start?: SyncState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applySync(state, action, rng));
  return { state: state!, events };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as SyncAction)]);
const started = (n = 3) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const themed = (n = 3, theme: (typeof SYNC_THEMES)[number] = 'food') => {
  const s = started(n).state;
  return run([{ type: 'theme', user: 'p1', seq: s.seq, theme }], s);
};
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const board = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'sync' && p.options.some((o) => o.value.startsWith('pick:'))).at(-1);
const themeMenu = (events: GameEvent[]) => prompts(events).find((p) => p.kind === 'sync' && p.options.some((o) => o.value.startsWith('theme:')));
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const result = (events: GameEvent[]) => events.find((e) => e.type === 'result');
const pick = (user: string, option: number, seq?: number): SyncAction => ({ type: 'pick', user, option, seq });
// picks[i] 是 p(i+1) 選的選項 index；undefined 表示不答 (逾時)
const answerAll = (s: SyncState, picks: (number | undefined)[]) => {
  const r = run(picks.flatMap((o, i) => (o === undefined ? [] : [pick(`p${i + 1}`, o)])), s);
  return r.state.round === s.round && r.state.phase === 'answer' ? run([{ type: 'timeout', id: r.state.timers.phase! }], r.state) : r;
};
const q = (s: SyncState) => SYNC_QUESTIONS[s.question!];

describe('sync/setup: 默契問答的房間', () => {
  it('開房：公告標示默契問答', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'sync', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '默契問答', players: ['A'] });
  });

  it('人數不足：至少 2 人；最多 8 人', () => {
    const one = run([{ type: 'start', user: 'p1' }], lobbyWith(1).state);
    expect(one.state.phase).toBe('lobby');
    expect(ephemeralTo(one.events, 'p1')!.text).toContain('至少需要 2 人');
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(full.state.players).toHaveLength(8);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('離開、房主離開取消、非房主開始被拒', () => {
    expect(run([{ type: 'leave', user: 'p2' }], lobbyWith(3).state).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobbyWith(3).state).events, 'p2')!.text).toContain('只有房主可以開始遊戲');
  });

  it('不支援 bot', () => {
    for (const type of ['addBot', 'removeBot'] as const) {
      const { state, events } = run([{ type, user: 'p1', count: 1 }], lobbyWith(3).state);
      expect(state.players).toHaveLength(3);
      expect(ephemeralTo(events, 'p1')!.text).toBe('默契問答不支援 bot。');
    }
  });

  it('頻道已經有遊戲：拒絕開房', () => {
    expect(ephemeralTo(run([{ type: 'new', user: 'p9', channel: 'C1' }], started().state).events, 'p9')!.text).toBe('這個頻道已經有遊戲了。');
  });
});

describe('sync/setup: 選主題', () => {
  it('開始後公告規則摘要和 13 個主題按鈕，30 秒計時', () => {
    const { state, events } = started();
    expect(state.phase).toBe('theme');
    const text = announces(events).join('\n');
    for (const s of ['默契問答開始', '<@p3>', '選了不能改', '60 秒', '10 題', '不算同選']) expect(text).toContain(s);
    expect(themeMenu(events)!.options.map((o) => o.label)).toEqual(['通用隨機', '日常偏好', '朋友日常', '吃喝美食', '旅行出遊', '電影', '音樂', '遊戲', '足球', '原神', '心動與戀愛', '家人之間', '同事同學']);
    expect(themeMenu(events)!.options[3].value).toBe(`theme:${state.seq}:food`);
    expect(lastTimer(events).ms).toBe(30_000);
  });

  it('房主按主題：公告主題，出第 1 題 (來自該主題)', () => {
    const { state, events } = themed(3, 'food');
    expect(state).toMatchObject({ phase: 'answer', theme: 'food', round: 1 });
    expect(q(state).theme).toBe('food');
    expect(announces(events).join('\n')).toContain('主題：吃喝美食');
  });

  it('`theme <名稱>` 指令；名稱不對列出清單', () => {
    const s = started().state;
    expect(run([{ type: 'theme', user: 'p1', name: '心動與戀愛' }], s).state.theme).toBe('love');
    const bad = run([{ type: 'theme', user: 'p1', name: '星座' }], s);
    expect(bad.state.phase).toBe('theme');
    expect(ephemeralTo(bad.events, 'p1')!.text).toContain('通用隨機、日常偏好');
  });

  it('非房主選主題被拒', () => {
    const s = started().state;
    const { state, events } = run([{ type: 'theme', user: 'p2', seq: s.seq, theme: 'movies' }], s);
    expect(state.phase).toBe('theme');
    expect(ephemeralTo(events, 'p2')!.text).toBe('只有房主可以選主題');
  });

  it('30 秒沒選：通用隨機', () => {
    const s0 = started();
    const { state, events } = run([{ type: 'timeout', id: lastTimer(s0.events).id }], s0.state);
    expect(state).toMatchObject({ phase: 'answer', theme: 'mix' });
    expect(announces(events).join('\n')).toContain('主題：通用隨機');
  });
});

describe('sync/setup: 牌堆', () => {
  it('通用隨機 10 題都來自四個日常主題', () => {
    let s = themed(2, 'mix').state;
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      seen.push(s.question!);
      s = answerAll(s, [0, 0]).state;
    }
    expect(seen.every((id) => MIX_THEMES.includes(SYNC_QUESTIONS[id].theme))).toBe(true);
  });

  it('同頻道同主題下一局不重複；抽完才重新洗牌', () => {
    const first = run([{ type: 'cancel', user: 'p1' }], themed(2, 'movies').state).state;
    const again = run([{ type: 'new', user: 'p1', channel: 'C1' }, { type: 'join', user: 'p2' }, { type: 'start', user: 'p1' }], first).state;
    const s = run([{ type: 'theme', user: 'p1', seq: again.seq, theme: 'movies' }], again).state;
    expect(s.question).not.toBe(first.question);
    expect(s.decks.movies!.length).toBe(themeIds('movies').length - 2);
    const empty = { ...again, decks: { movies: [] } };
    expect(run([{ type: 'theme', user: 'p1', seq: again.seq, theme: 'movies' }], empty).state.decks.movies!.length).toBe(themeIds('movies').length - 1);
  });
});

describe('sync/rounds: 作答', () => {
  it('題目面板：N/10、題目、選項按鈕、ref、60 秒', () => {
    const { state, events } = themed();
    const b = board(events)!;
    expect(b.text).toContain('第 1/10 題');
    expect(b.text).toContain(q(state).q);
    expect(b.options).toEqual(q(state).options.map((label, i) => ({ value: `pick:${state.seq}:${i}`, label })));
    expect(b.ref).toBe(`sync:${state.seq}`);
    expect(lastTimer(events).ms).toBe(60_000);
  });

  it('作答：只有自己看到已選，面板原地更新且不洩漏', () => {
    const s = themed().state;
    const { state, events } = run([pick('p1', 1, s.seq)], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe(`已選「${q(s).options[1]}」`);
    const b = board(events)!;
    expect(b.text).toContain('已作答 1/3');
    expect(b.text).toContain('<@p2> <@p3>');
    expect(b.ref).toBe(`sync:${state.seq}`);
    expect(b.options).toHaveLength(q(s).options.length);
    expect(b.text).not.toContain('<@p1>');
  });

  it('選了不能改', () => {
    const s = run([pick('p1', 0)], themed().state).state;
    const { state, events } = run([pick('p1', 1)], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已經選過了，不能修改');
    expect(state.picks).toEqual([{ user: 'p1', option: 0 }]);
  });

  it('編號不存在、局外人被拒', () => {
    const s = themed().state;
    expect(ephemeralTo(run([pick('p1', 9)], s).events, 'p1')!.text).toContain('沒有這個選項');
    expect(run([pick('p1', 9)], s).state.picks).toEqual([]);
    expect(ephemeralTo(run([pick('x', 0)], s).events, 'x')!.text).toContain('不在這局');
  });

  it('舊題目的按鈕被忽略', () => {
    const s1 = themed().state;
    const s2 = answerAll(s1, [0, 0, 0]).state;
    const { state, events } = run([pick('p1', 1, s1.seq)], s2);
    expect(state).toEqual(s2);
    expect(events).toEqual([]);
  });
});

describe('sync/rounds: 揭曉與全員同選', () => {
  it('全員作答立刻揭曉：列出每個選項 (含沒人選的)，全員同選 +1，接著出下一題', () => {
    const s = themed().state;
    const { state, events } = run([pick('p1', 0), pick('p2', 0), pick('p3', 0)], s);
    const text = announces(events).join('\n');
    expect(text).toContain(`${q(s).options[0]}：<@p1> <@p2> <@p3>`);
    expect(text).toContain(`${q(s).options[1]}：—`);
    expect(text).toContain('🎯 全員同選');
    expect(state).toMatchObject({ same: 1, round: 2, phase: 'answer' });
    expect(board(events)!.text).toContain('第 2/10 題');
  });

  it('選得不一樣：沒有全員同選', () => {
    const { state, events } = answerAll(themed().state, [0, 1, 0]);
    expect(announces(events).join('\n')).not.toContain('全員同選');
    expect(state.same).toBe(0);
  });

  it('60 秒逾時：沒作答另列，不算同選；舊計時器被忽略', () => {
    const s0 = themed();
    const timer = lastTimer(s0.events).id;
    const partial = run([pick('p1', 0), pick('p2', 0)], s0.state).state;
    const { state, events } = run([{ type: 'timeout', id: timer }], partial);
    const text = announces(events).join('\n');
    expect(text).toContain('沒作答：<@p3>');
    expect(text).not.toContain('全員同選');
    expect(state).toMatchObject({ same: 0, round: 2 });
    expect(run([{ type: 'timeout', id: timer }], state).events).toEqual([]);
  });
});

describe('sync/rounds: 結算與答題記錄', () => {
  const play = (n: number, rows: (number | undefined)[][]) => {
    let r = themed(n);
    for (const row of rows) r = answerAll(r.state, row);
    return r;
  };

  it('10 題後結算：全員同選 N/10、每一對次數、答題記錄、result', () => {
    // 6 題全員同選；p1、p2 另外 2 題同選 (共 8 次)；p2、p3 另外 1 題 (共 7 次)；p1、p3 共 6 次
    const rows = [...Array(6).fill([0, 0, 0]), [0, 0, 1], [1, 1, 0], [0, 1, undefined], [1, 0, 0]];
    const { state, events } = play(3, rows);
    expect(state).toMatchObject({ phase: 'ended', score: 6 });
    expect(result(events)).toEqual({ type: 'result', players: ids(3), winners: [], score: 6 });
    const text = announces(events).join('\n');
    expect(text).toContain('全員同選 6/10 題');
    expect(text).toContain('<@p1> & <@p2>：8 次');
    expect(text.indexOf('<@p1> & <@p2>')).toBeLessThan(text.indexOf('<@p1> & <@p3>'));
    expect(text).toContain('<@p1> & <@p3>：6 次');
    expect(text).toContain('<@p2> & <@p3>：7 次');
    expect(text).toContain(`10. ${SYNC_QUESTIONS[state.history[9].question].q}`);
    expect(text).toContain('📝 答題記錄');
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('8 人局每則結算訊息少於 3000 字', () => {
    let r = run([{ type: 'new', user: 'U0123456781', channel: 'C1' }, ...Array.from({ length: 7 }, (_, i) => ({ type: 'join', user: `U012345678${i + 2}` }) as SyncAction), { type: 'start', user: 'U0123456781' }]);
    r = run([{ type: 'theme', user: 'U0123456781', seq: r.state.seq, theme: 'genshin' }], r.state);
    for (let i = 0; i < 10; i++) r = run(r.state.players.map((p, j) => pick(p.id, j % q(r.state).options.length)), r.state);
    expect(r.state.phase).toBe('ended');
    for (const t of announces(r.events)) expect(t.length).toBeLessThan(3000);
  });
});

describe('sync/rounds: 取消與再來一局', () => {
  it('房主取消：沒有 result、沒有再來一局；非房主取消被拒', () => {
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], themed().state);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('取消');
    expect(result(events)).toBeUndefined();
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'cancel', user: 'p2' }], themed().state).state.phase).toBe('answer');
  });

  it('再來一局：上一局玩家、新的空房間、按的人當房主、牌堆接續；結束後按鈕被忽略', () => {
    let r = themed(2, 'music');
    for (let i = 0; i < 10; i++) r = answerAll(r.state, [0, 0]);
    const ended = r.state;
    const { state, events } = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended);
    expect(state).toMatchObject({ phase: 'lobby', host: 'p2' });
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
    expect(state.decks).toEqual(ended.decks);
    expect(events[0]).toMatchObject({ type: 'lobby', title: '默契問答' });
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')).toBeDefined();
    expect(run([pick('p1', 0)], ended).events).toEqual([]);
  });
});

describe('sync/setup: 大廳與指令說明', () => {
  it('GameDef 的大廳資訊與 help', () => {
    expect(sync).toMatchObject({ kind: 'sync', emoji: '🎯', name: '默契問答', players: '2～8 人', category: 'coop', noBots: true });
    for (const cmd of ['new', 'start', 'theme', 'pick', 'cancel']) expect(sync.help).toContain(`/game sync ${cmd}`);
  });

  it('解析子指令', () => {
    expect(parseSyncCommand('theme 心動與戀愛', 'U1', 'C1')).toEqual({ type: 'theme', user: 'U1', name: '心動與戀愛' });
    expect(parseSyncCommand('theme Genshin Impact', 'U1', 'C1')).toEqual({ type: 'theme', user: 'U1', name: 'Genshin Impact' });
    expect(parseSyncCommand('pick 2', 'U1', 'C1')).toEqual({ type: 'pick', user: 'U1', option: 1 });
    expect(parseSyncCommand('pick x', 'U1', 'C1')).toBeNull();
    expect(parseSyncCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseSyncCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseSyncCommand('new', 'U1', 'C1')).toMatchObject({ type: 'new', user: 'U1', channel: 'C1' });
    expect(parseSyncCommand('help', 'U1', 'C1')).toBeNull();
    expect(parseSyncCommand('abc', 'U1', 'C1')).toBeNull();
  });

  it('按鈕路由', () => {
    expect(sync.button('sync', 'theme:2:food', 'U1', 'C1')).toEqual({ type: 'theme', user: 'U1', seq: 2, theme: 'food' });
    expect(sync.button('sync', 'pick:3:1', 'U1', 'C1')).toEqual({ type: 'pick', user: 'U1', seq: 3, option: 1 });
    expect(sync.button('join', '', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(sync.button('leave', '', 'U1', 'C1')).toEqual({ type: 'leave', user: 'U1' });
    expect(sync.button('start', '', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(sync.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
  });
});
