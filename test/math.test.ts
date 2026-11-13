import { describe, expect, it } from 'vitest';
import { makeQuestion, type Level, type Question } from '../src/math.js';

const N = 500;
const sample = (mode: 'arith' | 'fraction', level: Level) => Array.from({ length: N }, () => makeQuestion(mode, level, Math.random));
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const fromSup = (s: string) => Number([...s].map((ch) => SUP.indexOf(ch)).join(''));
const between = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

// 四個選項：不重複、非負整數、剛好一個正解、錯誤答案和正解差 1～10 或 10 的倍數
function checkOptions(q: Question) {
  expect(q.options, q.text).toHaveLength(4);
  expect(new Set(q.options).size, q.text).toBe(4);
  expect(q.options.filter((o) => o === q.answer), q.text).toHaveLength(1);
  for (const o of q.options) {
    expect(o, q.text).toMatch(/^\d+$/);
    const d = Math.abs(Number(o) - Number(q.answer));
    if (o !== q.answer) expect(d <= 10 || d % 10 === 0, `${q.text} ${o}`).toBe(true);
  }
}

describe('math/rounds: 四則運算出題', () => {
  const RANGES = {
    easy: { add: [1, 20], mul: [1, 9, 1, 9], div: [1, 9, 1, 9] },
    normal: { add: [10, 99], mul: [2, 12, 2, 12], div: [2, 12, 2, 12] },
    hard: { add: [100, 999], mul: [12, 99, 2, 9], div: [2, 12, 10, 99] },
  } as const;

  for (const level of ['easy', 'normal', 'hard'] as const) {
    it(`${level}：數字範圍、減法非負、除法整除、答案正確、4 個選項`, () => {
      const r = RANGES[level];
      const ops = new Set<string>();
      for (const q of sample('arith', level)) {
        const m = q.text.match(/^(\d+) ([+−×÷]) (\d+)$/)!;
        expect(m, q.text).not.toBeNull();
        const [a, op, b] = [Number(m[1]), m[2], Number(m[3])];
        ops.add(op);
        if (op === '+' || op === '−') {
          expect(between(a, r.add[0], r.add[1]) && between(b, r.add[0], r.add[1]), q.text).toBe(true);
          if (op === '−') expect(a >= b, q.text).toBe(true);
          expect(Number(q.answer)).toBe(op === '+' ? a + b : a - b);
        } else if (op === '×') {
          expect(between(a, r.mul[0], r.mul[1]) && between(b, r.mul[2], r.mul[3]), q.text).toBe(true);
          expect(Number(q.answer)).toBe(a * b);
        } else {
          expect(a % b, q.text).toBe(0);
          expect(between(b, r.div[0], r.div[1]) && between(a / b, r.div[2], r.div[3]), q.text).toBe(true);
          expect(Number(q.answer)).toBe(a / b);
        }
        checkOptions(q);
      }
      expect([...ops].sort()).toEqual(['+', '×', '÷', '−'].sort());
    });
  }

  // 解析多項式：例如 "3x⁴ + 2x² + 5" → [{a:3,n:4},{a:2,n:2},{a:5,n:0}]
  const terms = (poly: string) =>
    poly.split(' + ').map((t) => {
      const m = t.match(/^(\d*)(x([⁰¹²³⁴⁵⁶⁷⁸⁹]*))?$/)!;
      expect(m, poly).not.toBeNull();
      const a = m[1] === '' ? 1 : Number(m[1]);
      return { a, n: m[2] ? (m[3] ? fromSup(m[3]) : 1) : 0 };
    });

  it('地獄：四種題型都會出現，題目文字可以算回正解，4 個選項', () => {
    const kinds = new Set<string>();
    for (const q of sample('arith', 'hell')) {
      let expected: number;
      let m: RegExpMatchArray | null;
      if ((m = q.text.match(/^f\(x\) = (.+), f′\((\d)\)$/))) {
        kinds.add('d');
        const ts = terms(m[1]);
        const k = Number(m[2]);
        expect(between(k, 1, 3)).toBe(true);
        expect(ts.length >= 2 && ts.length <= 3, q.text).toBe(true);
        expect(between(ts[0].n, 2, 4) && ts[1].n >= 1 && ts[1].n < ts[0].n, q.text).toBe(true);
        expected = ts.reduce((sum, t) => sum + (t.n ? t.a * t.n * k ** (t.n - 1) : 0), 0);
      } else if ((m = q.text.match(/^∫₀([¹²³]) \(?(.+?)\)? dx$/))) {
        kinds.add('i');
        const k = fromSup(m[1]);
        const ts = terms(m[2]);
        expect(between(ts[0].n, 1, 3), q.text).toBe(true);
        expect(ts[0].a % (ts[0].n + 1), q.text).toBe(0);
        expected = ts.reduce((sum, t) => sum + (t.a * k ** (t.n + 1)) / (t.n + 1), 0);
      } else if ((m = q.text.match(/^lim\(x→(\d)\) \(x² (?:([+−]) (\d*)x )?− (\d+)\) \/ \(x − (\d)\)$/))) {
        kinds.add('l');
        const k = Number(m[1]);
        const p = m[2] ? (m[2] === '+' ? 1 : -1) * (m[3] === '' ? 1 : Number(m[3])) : 0;
        const q0 = Number(m[4]);
        expect(Number(m[5])).toBe(k);
        // 分子在 x = k 時是 0 (可以約分)，約分後是 x + (p + k)
        expect(k * k + p * k - q0, q.text).toBe(0);
        expected = 2 * k + p;
      } else if ((m = q.text.match(/^(\d+) \+ (\d+) × (\d+) − (\d+) ÷ (\d+)$/))) {
        kinds.add('m');
        const [a, b, c, d, e] = m.slice(1).map(Number);
        expect(d % e, q.text).toBe(0);
        expected = a + b * c - d / e;
      } else if ((m = q.text.match(/^√(\d+) \+ (\d+)²$/))) {
        kinds.add('r');
        const root = Math.sqrt(Number(m[1]));
        expect(Number.isInteger(root), q.text).toBe(true);
        expected = root + Number(m[2]) ** 2;
      } else throw new Error(`看不懂的題目：${q.text}`);
      expect(Number(q.answer), q.text).toBe(expected);
      expect(expected >= 0 && Number.isInteger(expected), q.text).toBe(true);
      checkOptions(q);
    }
    expect([...kinds].sort()).toEqual(['d', 'i', 'l', 'm', 'r']);
  });

  it('spec 的例子：f′(2) = 104、∫₀² (6x² + 1) dx = 18 的格式', () => {
    for (let i = 0; i < 3000; i++) {
      const q = makeQuestion('arith', 'hell', Math.random);
      if (q.text === 'f(x) = 3x⁴ + 2x² + 5, f′(2)') expect(q.answer).toBe('104');
      if (q.text === '∫₀² (6x² + 1) dx') expect(q.answer).toBe('18');
    }
  });
});

describe('math/rounds: 分數比大小出題', () => {
  const parse = (q: Question) => {
    const m = q.text.match(/^(\d+)\/(\d+) \? (\d+)\/(\d+)$/)!;
    expect(m, q.text).not.toBeNull();
    const [a, b, c, d] = m.slice(1).map(Number);
    return { a, b, c, d };
  };

  for (const level of ['easy', 'normal', 'hard', 'hell'] as const) {
    it(`${level}：範圍、寫法不同、正解符合交叉相乘`, () => {
      let equal = 0;
      for (const q of sample('fraction', level)) {
        const { a, b, c, d } = parse(q);
        expect(q.options).toEqual(['<', '=', '>']);
        expect(`${a}/${b}`, q.text).not.toBe(`${c}/${d}`);
        const cmp = a * d - c * b;
        expect(q.answer, q.text).toBe(cmp < 0 ? '<' : cmp > 0 ? '>' : '=');
        if (cmp === 0) equal++;
        if (level === 'easy') {
          expect(between(b, 2, 10) && between(d, 2, 10) && a < b && c < d && a >= 1 && c >= 1, q.text).toBe(true);
          expect(b === d || a === c, q.text).toBe(true);
        } else if (level === 'normal') {
          expect(between(b, 2, 12) && between(d, 2, 12) && a < b && c < d && b !== d && a >= 1 && c >= 1, q.text).toBe(true);
        } else if (level === 'hard') {
          expect(between(b, 2, 20) && between(d, 2, 20) && a <= 2 * b && c <= 2 * d && a >= 1 && c >= 1, q.text).toBe(true);
        } else {
          expect(between(b, 11, 50) && between(d, 11, 50) && a < b && c < d && a >= 1 && c >= 1, q.text).toBe(true);
          expect(20 * Math.abs(a * d - c * b) < b * d, q.text).toBe(true);
        }
      }
      if (level === 'easy') expect(equal).toBe(0);
      else expect(between(equal / N, 0.1, 0.3), `${level} = ${equal}`).toBe(true);
    });
  }
});

// ---------- engine ----------
import { type GameEvent } from '../src/engine.js';
import { applyMath, type MathAction, type MathState } from '../src/math.js';
import { math, parseMathCommand } from '../src/games/math.js';

// 固定種子的亂數，讓 engine 測試可以重現
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
let rng = seeded();
function run(actions: MathAction[], start?: MathState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyMath(state, action, rng));
  return { state: state!, events };
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const lobbyWith = (n: number) => run([{ type: 'new', user: 'p1', channel: 'C1' }, ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as MathAction)]);
const started = (n = 3) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const going = (n = 3, extra: MathAction[] = []) => {
  const s = started(n).state;
  return run([...extra, { type: 'go', user: 'p1' }], s);
};
const ephemeralTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const panel = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'math' && p.options.some((o) => o.value.startsWith('go:'))).at(-1);
const board = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'math' && p.options.some((o) => o.value.startsWith('ans:'))).at(-1);
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const result = (events: GameEvent[]) => events.find((e) => e.type === 'result');
const right = (s: MathState) => s.current!.options.indexOf(s.current!.answer);
const wrong = (s: MathState) => s.current!.options.findIndex((o) => o !== s.current!.answer);
const ans = (user: string, index: number, seq?: number): MathAction => ({ type: 'answer', user, index, seq });
const score = (s: MathState, id: string) => s.players.find((p) => p.id === id)!.score;
// 一題：who 依序作答 (true 答對、false 答錯)；沒全答就讓計時到；接著讓揭曉的 3 秒計時到
function play(s: MathState, who: [string, boolean][]) {
  let r = run(who.map(([u, ok]) => ans(u, ok ? right(s) : wrong(s))), s);
  if (r.state.phase === 'question') r = run([{ type: 'timeout', id: r.state.timers.phase! }], r.state);
  const revealed = r;
  if (r.state.phase === 'reveal') r = run([{ type: 'timeout', id: r.state.timers.phase! }], r.state);
  return { ...r, revealed };
}

describe('math/setup: 口算擂台的房間', () => {
  it('開房：公告標示口算擂台', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'math', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '口算擂台', players: ['A'] });
  });

  it('人數 2～8、離開、房主離開取消、非房主開始被拒、頻道已有遊戲', () => {
    expect(ephemeralTo(run([{ type: 'start', user: 'p1' }], lobbyWith(1).state).events, 'p1')!.text).toContain('至少需要 2 人');
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(8).state);
    expect(full.state.players).toHaveLength(8);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
    expect(run([{ type: 'leave', user: 'p2' }], lobbyWith(3).state).state.players.map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(run([{ type: 'leave', user: 'p1' }], lobbyWith(3).state).state.phase).toBe('ended');
    expect(ephemeralTo(run([{ type: 'start', user: 'p2' }], lobbyWith(3).state).events, 'p2')!.text).toContain('只有房主可以開始遊戲');
    expect(ephemeralTo(run([{ type: 'new', user: 'p9', channel: 'C1' }], started().state).events, 'p9')!.text).toBe('這個頻道已經有遊戲了。');
  });

  it('不支援 bot', () => {
    for (const type of ['addBot', 'removeBot'] as const) {
      const { state, events } = run([{ type, user: 'p1', count: 1 }], lobbyWith(3).state);
      expect(state.players).toHaveLength(3);
      expect(ephemeralTo(events, 'p1')!.text).toBe('口算擂台不支援 bot。');
    }
  });
});

describe('math/setup: 設定面板', () => {
  it('開始後公告規則摘要和設定面板 (預設四則運算、普通、10 題)，60 秒', () => {
    const { state, events } = started();
    expect(state.phase).toBe('setup');
    const text = announces(events).join('\n');
    for (const s of ['口算擂台開始', '<@p3>', '10 秒', '地獄 20 秒', '答對 10 分', '只能答一次']) expect(text).toContain(s);
    const p = panel(events)!;
    expect(p.options.map((o) => o.label)).toEqual(['分數比大小', '✅ 四則運算', '簡單', '✅ 普通', '困難', '地獄', '✅ 10 題', '15 題', '20 題', '▶️ 開始出題']);
    expect(p.options.map((o) => o.value)).toEqual(['mode:fraction', 'mode:arith', 'level:easy', 'level:normal', 'level:hard', 'level:hell', 'total:10', 'total:15', 'total:20', 'go'].map((v) => v.replace(':', `:${state.seq}:`).replace(/^go$/, `go:${state.seq}`)));
    expect(p.ref).toBe(`math:${state.seq}`);
    expect(lastTimer(events).ms).toBe(60_000);
  });

  it('房主按設定：面板原地更新', () => {
    const s = started().state;
    const { state, events } = run([
      { type: 'set', user: 'p1', seq: s.seq, mode: 'fraction' },
      { type: 'set', user: 'p1', seq: s.seq, level: 'hell' },
      { type: 'set', user: 'p1', seq: s.seq, total: 15 },
    ], s);
    expect(state).toMatchObject({ mode: 'fraction', level: 'hell', total: 15 });
    const p = panel(events)!;
    expect(p.options.filter((o) => o.label.startsWith('✅')).map((o) => o.label)).toEqual(['✅ 分數比大小', '✅ 地獄', '✅ 15 題']);
    expect(p.ref).toBe(`math:${s.seq}`);
  });

  it('`set 分數 困難 20`；不認識的字列出可用設定', () => {
    const s = started().state;
    expect(run([{ type: 'set', user: 'p1', words: ['分數', '困難', '20'] }], s).state).toMatchObject({ mode: 'fraction', level: 'hard', total: 20 });
    const bad = run([{ type: 'set', user: 'p1', words: ['困難', '超難'] }], s);
    expect(bad.state.level).toBe('normal');
    expect(ephemeralTo(bad.events, 'p1')!.text).toContain('分數、四則、簡單、普通、困難、地獄、10、15、20');
  });

  it('非房主被拒', () => {
    const s = started().state;
    for (const a of [{ type: 'set', user: 'p2', seq: s.seq, level: 'hard' }, { type: 'go', user: 'p2', seq: s.seq }] as MathAction[]) {
      const { state, events } = run([a], s);
      expect(state).toEqual(s);
      expect(ephemeralTo(events, 'p2')!.text).toBe('只有房主可以調整設定');
    }
  });

  it('開始出題、60 秒逾時：用目前設定開始並公告', () => {
    const s = started().state;
    const go = run([{ type: 'set', user: 'p1', seq: s.seq, level: 'easy' }, { type: 'go', user: 'p1', seq: s.seq }], s);
    expect(go.state).toMatchObject({ phase: 'question', round: 1 });
    expect(announces(go.events).join('\n')).toContain('四則運算・簡單・10 題');
    const s0 = started();
    const t = run([{ type: 'timeout', id: lastTimer(s0.events).id }], s0.state);
    expect(t.state).toMatchObject({ phase: 'question', mode: 'arith', level: 'normal', total: 10 });
  });
});

describe('math/rounds: 作答', () => {
  it('題目面板：N/總題數、題目、按鈕、ref、10 秒；地獄 20 秒', () => {
    const { state, events } = going();
    const b = board(events)!;
    expect(b.text).toContain('第 1/10 題');
    expect(b.text).toContain(`${state.current!.text} = ?`);
    expect(b.options).toEqual(state.current!.options.map((label, i) => ({ value: `ans:${state.seq}:${i}`, label })));
    expect(b.ref).toBe(`math:${state.seq}`);
    expect(lastTimer(events).ms).toBe(10_000);
    const s = started().state;
    expect(lastTimer(run([{ type: 'set', user: 'p1', seq: s.seq, level: 'hell' }, { type: 'go', user: 'p1' }], s).events).ms).toBe(20_000);
    const f = run([{ type: 'set', user: 'p1', seq: s.seq, mode: 'fraction' }, { type: 'go', user: 'p1' }], s);
    expect(board(f.events)!.options.map((o) => o.label)).toEqual(['<', '=', '>']);
    expect(board(f.events)!.text).toContain(f.state.current!.text);
  });

  it('作答：只說已作答、不洩漏對錯；面板原地更新', () => {
    const s = going().state;
    const { state, events } = run([ans('p1', right(s), s.seq)], s);
    expect(ephemeralTo(events, 'p1')!.text).toBe('已作答');
    expect(board(events)!.text).toContain('已作答 1/3');
    expect(board(events)!.ref).toBe(`math:${state.seq}`);
    expect(JSON.stringify(events)).not.toMatch(/答對|正確/);
  });

  it('只能答一次；`answer <選項>`；不在選項裡、局外人被拒', () => {
    const s = going().state;
    const once = run([ans('p1', 0), ans('p1', 1)], s);
    expect(ephemeralTo(once.events, 'p1')!.text).toBe('已經答過了');
    expect(once.state.picks).toEqual([{ user: 'p1', value: s.current!.options[0] }]);
    expect(run([{ type: 'answer', user: 'p2', value: s.current!.answer }], s).state.picks).toEqual([{ user: 'p2', value: s.current!.answer }]);
    const bad = run([{ type: 'answer', user: 'p2', value: '-999' }], s);
    expect(bad.state.picks).toEqual([]);
    expect(ephemeralTo(bad.events, 'p2')!.text).toContain('不在選項裡');
    expect(ephemeralTo(run([ans('x', 0)], s).events, 'x')!.text).toContain('不在這局');
  });

  it('舊題目按鈕被忽略', () => {
    const s1 = going().state;
    const s2 = play(s1, [['p1', true], ['p2', true], ['p3', true]]).state;
    const { state, events } = run([ans('p1', 0, s1.seq)], s2);
    expect(state).toEqual(s2);
    expect(events).toEqual([]);
  });
});

describe('math/rounds: 計分與揭曉', () => {
  it('依答對順序加分；揭曉列出正解、答對順序、答錯、沒作答、目前排名', () => {
    const s = going(4).state;
    const { state, revealed } = play(s, [['p2', true], ['p1', false], ['p3', true]]);
    expect([score(state, 'p2'), score(state, 'p3'), score(state, 'p1'), score(state, 'p4')]).toEqual([15, 14, 0, 0]);
    const text = announces(revealed.events).join('\n');
    expect(text).toContain(`正解：${s.current!.answer}`);
    expect(text).toContain('答對：<@p2> +15、<@p3> +14');
    expect(text).toContain('答錯：<@p1>');
    expect(text).toContain('沒作答：<@p4>');
    expect(text.indexOf('<@p2> 15')).toBeLessThan(text.indexOf('<@p3> 14'));
  });

  it('第 6 個以後答對只有 10 分', () => {
    const s = going(7).state;
    const { state } = play(s, ids(7).map((u) => [u, true]));
    expect(ids(7).map((u) => score(state, u))).toEqual([15, 14, 13, 12, 11, 10, 10]);
  });

  it('沒人答對：沒人得分，公告正解', () => {
    const s = going().state;
    const { state, revealed } = play(s, [['p1', false]]);
    expect(ids(3).map((u) => score(state, u))).toEqual([0, 0, 0]);
    expect(announces(revealed.events).join('\n')).toContain('沒有人答對');
  });

  it('全員作答立刻揭曉；揭曉後 3 秒才出下一題，揭曉中作答被拒', () => {
    const s = going().state;
    const r = run([ans('p1', right(s)), ans('p2', right(s)), ans('p3', right(s))], s);
    expect(r.state.phase).toBe('reveal');
    expect(lastTimer(r.events).ms).toBe(3_000);
    expect(ephemeralTo(run([ans('p1', 0)], r.state).events, 'p1')!.text).toContain('不是作答的時間');
    const next = run([{ type: 'timeout', id: r.state.timers.phase! }], r.state);
    expect(next.state).toMatchObject({ phase: 'question', round: 2 });
    expect(board(next.events)!.text).toContain('第 2/10 題');
  });
});

describe('math/rounds: 結束與排名', () => {
  const playAll = (n: number, total: number, perRound: (i: number) => [string, boolean][]) => {
    const s = started(n).state;
    let state = run([{ type: 'set', user: 'p1', seq: s.seq, total: total as 10 }, { type: 'go', user: 'p1' }], s).state;
    const all: GameEvent[] = [];
    for (let i = 0; i < total; i++) {
      const r = play(state, perRound(i));
      all.push(...r.revealed.events, ...r.events);
      state = r.state;
    }
    return { state, all };
  };

  it('同分並列：排名、答對題數、winners', () => {
    // p1、p2 輪流第一個答對，總分一樣；p3 都答錯
    const { state, all } = playAll(3, 10, (i) => (i % 2 ? [['p1', true], ['p2', true], ['p3', false]] : [['p2', true], ['p1', true], ['p3', false]]));
    expect(state.phase).toBe('ended');
    expect(score(state, 'p1')).toBe(score(state, 'p2'));
    expect(result(all)).toEqual({ type: 'result', players: ids(3), winners: ['p1', 'p2'] });
    const text = announces(all).join('\n');
    expect(text).toContain('1. <@p1> 145 分 (答對 10 題)');
    expect(text).toContain('1. <@p2> 145 分 (答對 10 題)');
    expect(text).toContain('3. <@p3> 0 分 (答對 0 題)');
    expect(text).toContain('🏆 <@p1>、<@p2> 獲勝！');
    expect(prompts(all).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('全部 0 分：沒有人獲勝；題數 15 照設定結束', () => {
    const { state, all } = playAll(2, 15, () => [['p1', false], ['p2', false]]);
    expect(state.round).toBe(15);
    expect(result(all)).toEqual({ type: 'result', players: ids(2), winners: [] });
    expect(announces(all).join('\n')).toContain('沒有人獲勝');
  });
});

describe('math/rounds: 取消與再來一局', () => {
  it('房主取消：公告目前分數，沒有 result、沒有再來一局；非房主取消被拒', () => {
    const s = play(going().state, [['p1', true]]).state;
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('<@p1> 15');
    expect(result(events)).toBeUndefined();
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'cancel', user: 'p2' }], s).state.phase).toBe('question');
  });

  it('再來一局：上一局玩家、新的空房間、按的人當房主；結束後按鈕被忽略', () => {
    let ended = going(2).state;
    for (let i = 0; i < 10; i++) ended = play(ended, [['p1', true], ['p2', false]]).state;
    const { state, events } = run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended);
    expect(state).toMatchObject({ phase: 'lobby', host: 'p2' });
    expect(state.players.map((p) => p.id)).toEqual(['p2']);
    expect(events[0]).toMatchObject({ type: 'lobby', title: '口算擂台' });
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')).toBeDefined();
    expect(run([ans('p1', 0)], ended).events).toEqual([]);
  });
});

describe('math/setup: 大廳與指令說明', () => {
  it('GameDef 的大廳資訊與 help', () => {
    expect(math).toMatchObject({ kind: 'math', emoji: '🧮', name: '口算擂台', players: '2～8 人', category: 'party', noBots: true });
    for (const cmd of ['new', 'start', 'set', 'go', 'answer', 'cancel']) expect(math.help).toContain(`/game math ${cmd}`);
  });

  it('解析子指令', () => {
    expect(parseMathCommand('set 分數  困難 20', 'U1', 'C1')).toEqual({ type: 'set', user: 'U1', words: ['分數', '困難', '20'] });
    expect(parseMathCommand('go', 'U1', 'C1')).toEqual({ type: 'go', user: 'U1' });
    expect(parseMathCommand('answer 42', 'U1', 'C1')).toEqual({ type: 'answer', user: 'U1', value: '42' });
    expect(parseMathCommand('answer <', 'U1', 'C1')).toEqual({ type: 'answer', user: 'U1', value: '<' });
    expect(parseMathCommand('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(parseMathCommand('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(parseMathCommand('help', 'U1', 'C1')).toBeNull();
    expect(parseMathCommand('abc', 'U1', 'C1')).toBeNull();
  });

  it('按鈕路由', () => {
    expect(math.button('math', 'mode:2:fraction', 'U1', 'C1')).toEqual({ type: 'set', user: 'U1', seq: 2, mode: 'fraction' });
    expect(math.button('math', 'level:2:hell', 'U1', 'C1')).toEqual({ type: 'set', user: 'U1', seq: 2, level: 'hell' });
    expect(math.button('math', 'total:2:15', 'U1', 'C1')).toEqual({ type: 'set', user: 'U1', seq: 2, total: 15 });
    expect(math.button('math', 'go:2', 'U1', 'C1')).toEqual({ type: 'go', user: 'U1', seq: 2 });
    expect(math.button('math', 'ans:3:1', 'U1', 'C1')).toEqual({ type: 'answer', user: 'U1', seq: 3, index: 1 });
    expect(math.button('join', '', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(math.button('leave', '', 'U1', 'C1')).toEqual({ type: 'leave', user: 'U1' });
    expect(math.button('start', '', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(math.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
  });
});
