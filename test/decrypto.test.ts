import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyDecrypto, type DAction, type DState } from '../src/decrypto.js';
import { DECRYPTO_WORDS } from '../src/decryptoWords.js';

const rng = () => 0.99999;

function run(actions: DAction[], start?: DState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyDecrypto(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as DAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind = 'decrypto') =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const values = (p: { options: { value: string }[] }) => p.options.map((o) => o.value);
const dmTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;

// rng 固定時不洗牌：p1、p3… 是黑隊，p2、p4… 是白隊；黑隊的詞是詞庫前 4 個，白隊是第 5～8 個；
// 4 人局第 1 回合黑隊 p1、白隊 p2 加密，兩隊密碼都是 1-2-3
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const clues = (texts: string[], user: string): DAction => ({ type: 'clue', user, texts });
// 第 1 回合兩隊都寫完提示，進入投票
const voting = () => run([clues(['海', '火', '鐘'], 'p1'), clues(['甲', '乙', '丙'], 'p2')], started(4).state);
// 跳到第 2 回合的投票：第 1 回合兩隊都解對
const round2 = () => {
  const v = run(
    [
      { type: 'vote', user: 'p3', mode: 'decode', round: 0, code: '123' },
      { type: 'vote', user: 'p4', mode: 'decode', round: 0, code: '123' },
    ],
    voting().state,
  );
  return run([clues(['a', 'b', 'c'], 'p3'), clues(['d', 'e', 'f'], 'p4')], v.state);
};

describe('decrypto/setup: 截碼戰的房間', () => {
  it('開房：公告標示截碼戰', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'decrypto', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '截碼戰', players: ['A'] });
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
    expect(ephemeralTo(events, 'p1')!.text).toBe('截碼戰不支援 bot。');
  });

  it('加入、離開、房主離開取消、房主取消；非房主不能開始', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(3);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobby).events, 'p2')).toBeDefined();
  });
});

describe('decrypto/setup: 分隊與祕密詞', () => {
  it('5 人分隊：一隊 3 人、一隊 2 人，公告兩隊成員', () => {
    const { state, events } = started(5);
    const teams = state.players.map((p) => p.team);
    expect(teams.filter((t) => t === 'black')).toHaveLength(3);
    expect(teams.filter((t) => t === 'white')).toHaveLength(2);
    const text = announces(events).join('\n');
    expect(text).toContain('⚫ 黑隊：<@p1>、<@p3>、<@p5>');
    expect(text).toContain('⚪ 白隊：<@p2>、<@p4>');
  });

  it('每隊 4 個不重複的詞，只私訊自己隊，頻道看不到', () => {
    const { state, events } = started(4);
    const black = DECRYPTO_WORDS.slice(0, 4);
    const white = DECRYPTO_WORDS.slice(4, 8);
    expect(state.teams.black.words).toEqual(black);
    expect(state.teams.white.words).toEqual(white);
    for (const id of ['p1', 'p3']) {
      const dm = dmTo(events, id).join('\n');
      expect(dm).toContain(`1 ${black[0]}`);
      expect(dm).toContain(`4 ${black[3]}`);
      for (const w of white) expect(dm).not.toContain(w);
    }
    expect(dmTo(events, 'p4').join('\n')).toContain(`2 ${white[1]}`);
    const channel = announces(events).join('\n') + prompts(events).map((p) => p.text).join('\n');
    for (const w of [...black, ...white]) expect(channel).not.toContain(w);
  });

  it('加密者輪替：每回合換下一位，輪完從頭開始', () => {
    const s = started(4).state;
    expect(s.teams.black.order).toEqual(['p1', 'p3']);
    const skip = (st: DState) => {
      let x = run([{ type: 'timeout', id: st.timers.phase! }], st).state;
      x = run([{ type: 'timeout', id: x.timers.phase! }], x).state;
      return x;
    };
    // 沒寫提示也沒人投：兩隊各解錯 1 次，進第 2 回合
    const r2 = skip(s);
    expect(r2.round).toBe(1);
    expect(r2.teams.black.order[r2.round % 2]).toBe('p3');
    expect(ephemeralTo(run([{ type: 'openClue', user: 'p1' }], r2).events, 'p1')).toBeDefined();
  });
});

describe('decrypto/rounds: 寫提示', () => {
  it('私訊加密者密碼，頻道公告回合和加密者，附上寫提示和提示紀錄按鈕', () => {
    const { state, events } = started(4);
    expect(state).toMatchObject({ phase: 'clue', round: 0 });
    expect(state.teams.black.code).toEqual([1, 2, 3]);
    expect(dmTo(events, 'p1').join('\n')).toContain('密碼是 1-2-3');
    expect(dmTo(events, 'p3').join('\n')).not.toContain('密碼是');
    const text = announces(events).at(-1)!;
    expect(text).toContain('第 1／8 回合');
    expect(text).toContain('<@p1>');
    expect(text).toContain('<@p2>');
    expect(values(prompts(events).at(-1)!)).toEqual(['clue', 'history']);
    expect(lastTimer(events).ms).toBe(180_000);
  });

  it('加密者按寫提示：跳出 3 欄視窗；其他人被拒絕', () => {
    const s = started(4).state;
    const { events } = run([{ type: 'openClue', user: 'p1' }], s);
    expect(events).toEqual([
      expect.objectContaining({ type: 'modal', to: 'p1', kind: 'decryptoClue', title: '寫提示' }),
    ]);
    expect((events[0] as { fields: string[] }).fields).toHaveLength(3);
    const other = run([{ type: 'openClue', user: 'p3' }], s);
    expect(other.state).toBe(s);
    expect(ephemeralTo(other.events, 'p3')!.text).toContain('這回合不是你加密');
  });

  it('送出提示：要剛好 3 個、每個 1～30 字；非加密者被拒', () => {
    const s = started(4).state;
    expect(ephemeralTo(run([clues(['海', '火'], 'p1')], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([clues(['海', ' ', '鐘'], 'p1')], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([clues(['海', '火', '鐘'.repeat(31)], 'p1')], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([clues(['海', '火', '鐘'], 'p3')], s).events, 'p3')!.text).toContain('這回合不是你加密');
  });

  it('一隊送出只讓他看到已送出；兩隊都送出才公開提示', () => {
    const one = run([clues(['海', '火', '鐘'], 'p1')], started(4).state);
    expect(one.state.phase).toBe('clue');
    expect(ephemeralTo(one.events, 'p1')!.text).toContain('已送出');
    expect(announces(one.events).join()).not.toContain('海');
    const both = run([clues(['甲', '乙', '丙'], 'p2')], one.state);
    expect(both.state.phase).toBe('vote');
    const text = announces(both.events).join('\n');
    expect(text).toContain('海 → 火 → 鐘');
    expect(text).toContain('甲 → 乙 → 丙');
  });

  it('寫提示超時：沒送出的隊提示是空白', () => {
    const one = run([clues(['海', '火', '鐘'], 'p1')], started(4).state);
    const { state, events } = run([{ type: 'timeout', id: one.state.timers.phase! }], one.state);
    expect(state.phase).toBe('vote');
    expect(announces(events).join('\n')).toContain('（沒有提示）');
  });
});

describe('decrypto/rounds: 投票解碼與攔截', () => {
  it('第 1 回合只有解碼按鈕，不攔截', () => {
    const { events } = voting();
    expect(values(prompts(events).at(-1)!)).toEqual(['decode', 'history']);
    expect(lastTimer(events).ms).toBe(180_000);
  });

  it('第 2 回合有攔截按鈕', () => {
    expect(values(prompts(round2().events).at(-1)!)).toEqual(['decode', 'intercept', 'history']);
  });

  it('按解碼：只讓自己看到 24 組密碼按鈕，不改狀態', () => {
    const s = voting().state;
    const { state, events } = run([{ type: 'voteMenu', user: 'p3', mode: 'decode' }], s);
    expect(state).toBe(s);
    const p = prompts(events)[0];
    expect(p).toMatchObject({ audience: 'ephemeral', user: 'p3', perRow: 6 });
    expect(p.options).toHaveLength(24);
    expect(p.options[0]).toEqual({ value: 'vote:decode:0:123', label: '1-2-3' });
    expect(new Set(values(p)).size).toBe(24);
  });

  it('加密者不能解自己的碼；第 1 回合不能攔截', () => {
    const s = voting().state;
    expect(ephemeralTo(run([{ type: 'voteMenu', user: 'p1', mode: 'decode' }], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'vote', user: 'p1', mode: 'decode', round: 0, code: '123' }], s).events, 'p1')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'voteMenu', user: 'p3', mode: 'intercept' }], s).events, 'p3')).toBeDefined();
  });

  it('改選：覆蓋之前的選擇，只讓自己看到', () => {
    const s = voting().state;
    const { state, events } = run(
      [
        { type: 'vote', user: 'p3', mode: 'decode', round: 0, code: '413' },
        { type: 'vote', user: 'p3', mode: 'decode', round: 0, code: '123' },
      ],
      s,
    );
    expect(state.decodeVotes).toEqual({ p3: '123' });
    expect(ephemeralTo(events, 'p3')!.text).toContain('你選了 1-2-3');
    expect(announces(events)).toEqual([]);
  });

  it('舊回合的選單被擋掉；不合法的密碼被忽略', () => {
    const s = round2().state;
    const old = run([{ type: 'vote', user: 'p1', mode: 'decode', round: 0, code: '123' }], s);
    expect(old.state).toBe(s);
    expect(run([{ type: 'vote', user: 'p1', mode: 'decode', round: 1, code: '113' }], s).state).toBe(s);
  });

  it('全部投完提早揭曉', () => {
    const { state, events } = run(
      [
        { type: 'vote', user: 'p1', mode: 'decode', round: 1, code: '123' },
        { type: 'vote', user: 'p2', mode: 'decode', round: 1, code: '123' },
        { type: 'vote', user: 'p1', mode: 'intercept', round: 1, code: '123' },
        { type: 'vote', user: 'p2', mode: 'intercept', round: 1, code: '321' },
        { type: 'vote', user: 'p3', mode: 'intercept', round: 1, code: '123' },
        { type: 'vote', user: 'p4', mode: 'intercept', round: 1, code: '321' },
      ],
      round2().state,
    );
    expect(state.round).toBe(2);
    expect(announces(events).join('\n')).toContain('揭曉');
  });

  it('多數決：2 票對 1 票', () => {
    const s = started(6).state; // 黑隊 p1、p3、p5；白隊 p2、p4、p6
    const v = run([clues(['a', 'b', 'c'], 'p1'), clues(['d', 'e', 'f'], 'p2')], s).state;
    const { state } = run(
      [
        { type: 'vote', user: 'p3', mode: 'decode', round: 0, code: '123' },
        { type: 'vote', user: 'p5', mode: 'decode', round: 0, code: '123' },
        { type: 'vote', user: 'p4', mode: 'decode', round: 0, code: '213' },
        { type: 'vote', user: 'p6', mode: 'decode', round: 0, code: '213' },
      ],
      v,
    );
    expect(state.teams.black.miss).toBe(0);
    expect(state.teams.white.miss).toBe(1);
  });

  it('平手時從最高票隨機選一組', () => {
    const s = started(6).state;
    const v = run([clues(['a', 'b', 'c'], 'p1'), clues(['d', 'e', 'f'], 'p2')], s).state;
    const votes: DAction[] = [
      { type: 'vote', user: 'p3', mode: 'decode', round: 0, code: '123' },
      { type: 'vote', user: 'p5', mode: 'decode', round: 0, code: '413' },
    ];
    const tie = (r: () => number) => run([...votes, { type: 'timeout', id: v.timers.phase! }], v, r).state.teams.black.miss;
    expect(tie(() => 0)).toBe(0); // 選到 1-2-3
    expect(tie(() => 0.99999)).toBe(1); // 選到 4-1-3
  });

  it('投票超時：沒人投解碼算解錯', () => {
    const v = voting().state;
    const { state } = run([{ type: 'timeout', id: v.timers.phase! }], v);
    expect(state.teams.black.miss).toBe(1);
    expect(state.teams.white.miss).toBe(1);
  });
});

describe('decrypto/rounds: 揭曉與記號', () => {
  it('公布正確密碼、答案；解錯和攔截各得記號', () => {
    let s = round2().state;
    s = { ...s, teams: { black: { ...s.teams.black, code: [4, 1, 3] }, white: { ...s.teams.white, code: [2, 3, 1] } } };
    const { state, events } = run(
      [
        { type: 'vote', user: 'p1', mode: 'decode', round: 1, code: '143' },
        { type: 'vote', user: 'p2', mode: 'decode', round: 1, code: '231' },
        { type: 'vote', user: 'p3', mode: 'intercept', round: 1, code: '231' },
        { type: 'timeout', id: s.timers.phase! },
      ],
      s,
    );
    expect(state.teams.black).toMatchObject({ miss: 1, intercept: 1 });
    expect(state.teams.white).toMatchObject({ miss: 0, intercept: 0 });
    const text = announces(events).join('\n');
    expect(text).toContain('4-1-3');
    expect(text).toContain('1-4-3');
    expect(text).toContain('2-3-1');
  });

  it('提示依正確密碼記到編號下；任何人都能看提示紀錄，不改變狀態', () => {
    const s0 = started(4).state;
    const s1: DState = { ...s0, teams: { ...s0.teams, black: { ...s0.teams.black, code: [4, 1, 3] } } };
    const v = run([clues(['海', '火', '鐘'], 'p1'), clues(['甲', '乙', '丙'], 'p2')], s1).state;
    const done = run([{ type: 'timeout', id: v.timers.phase! }], v).state;
    expect(done.teams.black.history).toEqual([['火'], [], ['鐘'], ['海']]);
    const { state, events } = run([{ type: 'history', user: 'x9' }], done);
    expect(state).toBe(done);
    const text = ephemeralTo(events, 'x9')!.text;
    expect(text).toContain('1：火');
    expect(text).toContain('3：鐘');
    expect(text).toContain('4：海');
    expect(text).toContain('2：乙');
  });
});

describe('decrypto/rounds: 勝負與結束', () => {
  const withTokens = (b: [number, number], w: [number, number], round = 1) => {
    const s = round2().state;
    return {
      ...s,
      round,
      teams: {
        black: { ...s.teams.black, intercept: b[0], miss: b[1] },
        white: { ...s.teams.white, intercept: w[0], miss: w[1] },
      },
    } as DState;
  };
  const allCorrect = (s: DState, extra: DAction[] = []) =>
    run(
      [
        { type: 'vote', user: s.teams.black.order.find((id) => id !== encryptor(s, 'black'))!, mode: 'decode', round: s.round, code: '123' },
        { type: 'vote', user: s.teams.white.order.find((id) => id !== encryptor(s, 'white'))!, mode: 'decode', round: s.round, code: '123' },
        ...extra,
        { type: 'timeout', id: s.timers.phase! },
      ],
      s,
    );
  const encryptor = (s: DState, t: 'black' | 'white') => s.teams[t].order[s.round % s.teams[t].order.length];

  it('攔截兩次獲勝：公告兩隊祕密詞和再來一局', () => {
    const s = withTokens([1, 0], [0, 0]);
    const { state, events } = allCorrect(s, [{ type: 'vote', user: 'p1', mode: 'intercept', round: 1, code: '123' }]);
    expect(state).toMatchObject({ phase: 'ended', winner: 'black' });
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: state.players.filter((p) => p.team === 'black').map((p) => p.id) });
    const text = announces(events).join('\n');
    expect(text).toContain('⚫ 黑隊獲勝');
    for (const w of [...state.teams.black.words, ...state.teams.white.words]) expect(text).toContain(w);
    expect(values(prompts(events, 'rematch')[0])).toEqual(['rematch']);
  });

  it('解錯兩次落敗', () => {
    const s = withTokens([0, 0], [0, 1]);
    const { state } = run(
      [
        { type: 'vote', user: 'p1', mode: 'decode', round: 1, code: '123' },
        { type: 'timeout', id: s.timers.phase! },
      ],
      s,
    );
    expect(state.winner).toBe('black');
  });

  it('兩隊同時達到條件：比（攔截 − 解錯）', () => {
    const s = withTokens([1, 0], [1, 1]);
    const { state } = allCorrect(s, [
      { type: 'vote', user: 'p1', mode: 'intercept', round: 1, code: '123' },
      { type: 'vote', user: 'p2', mode: 'intercept', round: 1, code: '123' },
    ]);
    expect(state.teams.black.intercept).toBe(2);
    expect(state.teams.white.intercept).toBe(2);
    expect(state.winner).toBe('black');
  });

  it('打完第 8 回合同分平手', () => {
    const { state, events } = allCorrect(withTokens([0, 0], [0, 0], 7));
    expect(state.winner).toBe('tie');
    expect(announces(events).join('\n')).toContain('平手');
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: state.players.map((p) => p.id), winners: [] });
  });

  it('沒達到條件就進下一回合', () => {
    const { state } = allCorrect(withTokens([0, 0], [0, 0]));
    expect(state).toMatchObject({ phase: 'clue', round: 2, decodeVotes: {}, interceptVotes: {} });
  });

  it('再來一局：上一局的玩家可以開；取消的遊戲不行', () => {
    const ended = allCorrect(withTokens([0, 0], [0, 0], 7)).state;
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state.phase).toBe('lobby');
    const cancelled = run([{ type: 'cancel', user: 'p1' }], started(4).state).state;
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], cancelled).state).toBe(cancelled);
  });
});
