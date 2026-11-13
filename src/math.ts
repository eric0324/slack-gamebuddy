// 口算擂台 (Math Duel)：出題 + 遊戲引擎，純邏輯，不碰任何 I/O。
// 介面和其他遊戲一樣：applyMath(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/math.js';

export type Mode = 'fraction' | 'arith';
export type Level = 'easy' | 'normal' | 'hard' | 'hell';
// text 是不分語系的題目 (例如 "12 × 7"、"3/4 ? 2/3")；options 和 answer 都是按鈕上的文字
export interface Question {
  mode: Mode;
  text: string;
  options: string[];
  answer: string;
}

// ---------- 出題 ----------

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pickOne = <T>(rng: Rng, items: readonly T[]) => items[Math.floor(rng() * items.length)];
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => [...String(n)].map((d) => SUP[Number(d)]).join('');
// 多項式的一項：係數 1 省略、x¹ 寫成 x、x⁰ 只寫係數
const term = (a: number, n: number) => (n === 0 ? `${a}` : `${a === 1 ? '' : a}x${n === 1 ? '' : sup(n)}`);

// 4 個選項：正解＋3 個接近的非負整數 (差 1～10 或 10 的倍數)
function numberOptions(answer: number, rng: Rng): string[] {
  const cands = new Set<number>();
  for (let d = 1; d <= 10; d++) cands.add(answer + d).add(answer - d);
  for (let d = 20; d <= 50; d += 10) cands.add(answer + d).add(answer - d);
  const wrong = shuffle([...cands].filter((x) => x >= 0 && x !== answer), rng).slice(0, 3);
  return shuffle([answer, ...wrong], rng).map(String);
}

function basic(level: Exclude<Level, 'hell'>, rng: Rng): [string, number] {
  const op = pickOne(rng, ['+', '−', '×', '÷'] as const);
  if (op === '+' || op === '−') {
    const [lo, hi] = { easy: [1, 20], normal: [10, 99], hard: [100, 999] }[level];
    let a = int(rng, lo, hi);
    let b = int(rng, lo, hi);
    if (op === '−' && a < b) [a, b] = [b, a];
    return [`${a} ${op} ${b}`, op === '+' ? a + b : a - b];
  }
  if (op === '×') {
    const [a1, a2, b1, b2] = { easy: [1, 9, 1, 9], normal: [2, 12, 2, 12], hard: [12, 99, 2, 9] }[level];
    const a = int(rng, a1, a2);
    const b = int(rng, b1, b2);
    return [`${a} × ${b}`, a * b];
  }
  const [d1, d2, q1, q2] = { easy: [1, 9, 1, 9], normal: [2, 12, 2, 12], hard: [2, 12, 10, 99] }[level];
  const d = int(rng, d1, d2);
  const q = int(rng, q1, q2);
  return [`${d * q} ÷ ${d}`, q];
}

function hell(rng: Rng): [string, number] {
  const kind = pickOne(rng, ['derivative', 'integral', 'limit', 'mixed'] as const);
  if (kind === 'derivative') {
    const n = int(rng, 2, 4);
    const m = int(rng, 1, n - 1);
    const [a, b, c, k] = [int(rng, 1, 5), int(rng, 1, 5), int(rng, 0, 9), int(rng, 1, 3)];
    const poly = [term(a, n), term(b, m), ...(c ? [term(c, 0)] : [])].join(' + ');
    return [`f(x) = ${poly}, f′(${k})`, a * n * k ** (n - 1) + b * m * k ** (m - 1)];
  }
  if (kind === 'integral') {
    const n = int(rng, 1, 3);
    const t = int(rng, 1, 3);
    const [c, k] = [int(rng, 0, 9), int(rng, 1, 3)];
    const body = c ? `(${term(t * (n + 1), n)} + ${c})` : term(t * (n + 1), n);
    return [`∫₀${sup(k)} ${body} dx`, t * k ** (n + 1) + c * k];
  }
  if (kind === 'limit') {
    // (x − k)(x + b) = x² + (b − k)x − bk，約分後在 x = k 是 k + b
    const [k, b] = [int(rng, 1, 9), int(rng, 1, 9)];
    const p = b - k;
    const mid = p === 0 ? '' : `${p > 0 ? '+' : '−'} ${Math.abs(p) === 1 ? '' : Math.abs(p)}x `;
    return [`lim(x→${k}) (x² ${mid}− ${b * k}) / (x − ${k})`, k + b];
  }
  if (rng() < 0.5) {
    const [a, b, c, e, q] = [int(rng, 10, 99), int(rng, 2, 12), int(rng, 2, 12), int(rng, 2, 9), int(rng, 2, 12)];
    return [`${a} + ${b} × ${c} − ${e * q} ÷ ${e}`, a + b * c - q];
  }
  const [n, m] = [int(rng, 2, 15), int(rng, 2, 12)];
  return [`√${n * n} + ${m}²`, n + m * m];
}

// 一個真分數或假分數；回傳 [分子, 分母]
type Frac = [number, number];
const sameValue = ([a, b]: Frac, [c, d]: Frac) => a * d === c * b;

function fractions(level: Level, rng: Rng): [Frac, Frac] {
  if (level === 'easy') {
    if (rng() < 0.5) {
      const d = int(rng, 3, 10);
      const a = int(rng, 1, d - 1);
      let c = int(rng, 1, d - 2);
      if (c >= a) c++;
      return [[a, d], [c, d]];
    }
    const n = int(rng, 1, 8);
    const b = int(rng, n + 1, 10);
    let d = int(rng, n + 1, 9);
    if (d >= b) d++;
    return [[n, b], [n, d]];
  }
  const [lo, hi] = level === 'normal' ? [2, 12] : level === 'hard' ? [2, 20] : [11, 50];
  const withDen = (d: number): Frac => [int(rng, 1, level === 'hard' ? 2 * d : d - 1), d];
  const rand = () => withDen(int(rng, lo, hi));
  if (rng() < 0.2) {
    // 等值分數：分子分母同乘 k，乘完的分母還在範圍內
    const maxBase = Math.floor(hi / 2);
    const d = int(rng, lo, maxBase);
    const a = int(rng, 1, level === 'hard' ? 2 * d : d - 1);
    const k = int(rng, 2, Math.floor(hi / d));
    return [[a, d], [a * k, d * k]];
  }
  const x = rand();
  if (level === 'hell') {
    // 分母 ≥ 11 時，c = round(a·d / b) 跟 x 差不到 1/22 < 0.05，所以一定找得到不等值的接近分數
    const near: Frac[] = [];
    for (let d = lo; d <= hi; d++) {
      for (let c = 1; c < d; c++) {
        const f: Frac = [c, d];
        if (!sameValue(f, x) && 20 * Math.abs(c * x[1] - x[0] * d) < d * x[1]) near.push(f);
      }
    }
    return [x, pickOne(rng, near)];
  }
  // 第二個分母從「排除第一個分母」的範圍抽，兩個分數一定寫法不同
  let d = int(rng, lo, hi - 1);
  if (d >= x[1]) d++;
  return [x, withDen(d)];
}

export function makeQuestion(mode: Mode, level: Level, rng: Rng): Question {
  if (mode === 'arith') {
    const [text, answer] = level === 'hell' ? hell(rng) : basic(level, rng);
    return { mode, text, options: numberOptions(answer, rng), answer: String(answer) };
  }
  const pair = fractions(level, rng);
  const [[a, b], [c, d]] = rng() < 0.5 ? pair : [pair[1], pair[0]];
  const cmp = a * d - c * b;
  return { mode, text: `${a}/${b} ? ${c}/${d}`, options: ['<', '=', '>'], answer: cmp < 0 ? '<' : cmp > 0 ? '>' : '=' };
}

// ---------- 遊戲 ----------

export const MIN_MATH_PLAYERS = 2;
export const MAX_MATH_PLAYERS = 8;
const TITLE = '口算擂台';
const SETUP_MS = 60_000;
const REVEAL_MS = 3_000;
const answerMs = (level: Level) => (level === 'hell' ? 20_000 : 10_000);
const BONUS = [5, 4, 3, 2, 1]; // 第 1～5 個答對的速度分
const MODES: Mode[] = ['fraction', 'arith'];
const LEVELS: Level[] = ['easy', 'normal', 'hard', 'hell'];
const TOTALS = [10, 15, 20] as const;
type Total = (typeof TOTALS)[number];

export interface MathState {
  game: 'math';
  channel: string;
  host: string;
  phase: 'lobby' | 'setup' | 'question' | 'reveal' | 'ended';
  players: { id: string; score: number; correct: number }[];
  mode: Mode;
  level: Level;
  total: Total;
  round: number; // 第幾題 (1 起算)
  current?: Question;
  picks: { user: string; value: string }[]; // 這一題，依作答順序
  winners?: string[]; // 正常結束才有 (取消的沒有)
  seq: number; // 面板 ref，也用來擋掉舊按鈕
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type MathAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'set'; user: string; seq?: number; mode?: Mode; level?: Level; total?: Total; words?: string[] } // 按鈕帶一項；指令帶多個字
  | { type: 'go'; user: string; seq?: number }
  | { type: 'answer'; user: string; seq?: number; index?: number; value?: string } // 按鈕帶 index；指令帶選項文字
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<MathAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: MathState; events: GameEvent[] };
type Ctx = { s: MathState; events: GameEvent[]; rng: Rng };

const isPlayer = (s: MathState, id: string) => s.players.some((p) => p.id === id);
const sep = (s: MathState) => tx(s.lang, 'sep');
const modeName = (s: MathState, m: Mode) => tx(s.lang, m === 'fraction' ? 'modeFraction' : 'modeArith');
const levelName = (s: MathState, l: Level) => tx(s.lang, `level_${l}`);
const totalName = (s: MathState, n: number) => tx(s.lang, 'totalLabel', { n });
const settings = (s: MathState) => tx(s.lang, 'settings', { mode: modeName(s, s.mode), level: levelName(s, s.level), total: s.total });
// 依總分排名，同分同名次 (1、1、3)
const ranked = (s: MathState) => {
  const sorted = [...s.players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => ({ ...p, rank: sorted.findIndex((q) => q.score === p.score) + 1 }));
};
const standings = (s: MathState) => ranked(s).map((p) => tx(s.lang, 'scoreItem', { who: mention(p.id), score: p.score })).join(sep(s));

function setupPanel(s: MathState): GameEvent {
  const mark = (on: boolean, label: string) => (on ? `✅ ${label}` : label);
  return {
    type: 'prompt',
    kind: 'math',
    audience: 'channel',
    ref: `math:${s.seq}`,
    text: tx(s.lang, 'setupAsk', { host: mention(s.host), sec: SETUP_MS / 1000 }),
    options: [
      ...MODES.map((m) => ({ value: `mode:${s.seq}:${m}`, label: mark(s.mode === m, modeName(s, m)) })),
      ...LEVELS.map((l) => ({ value: `level:${s.seq}:${l}`, label: mark(s.level === l, levelName(s, l)) })),
      ...TOTALS.map((n) => ({ value: `total:${s.seq}:${n}`, label: mark(s.total === n, totalName(s, n)) })),
      { value: `go:${s.seq}`, label: tx(s.lang, 'goButton') },
    ],
  };
}

function board(s: MathState): GameEvent {
  return {
    type: 'prompt',
    kind: 'math',
    audience: 'channel',
    ref: `math:${s.seq}`,
    text: [
      tx(s.lang, 'boardQuestion', { round: s.round, max: s.total, question: s.current!.mode === 'arith' ? `${s.current!.text} = ?` : s.current!.text }),
      tx(s.lang, s.current!.mode === 'arith' ? 'boardHint' : 'boardHintFraction', { sec: answerMs(s.level) / 1000 }),
      tx(s.lang, 'boardCount', { done: s.picks.length, total: s.players.length }),
    ].join('\n'),
    options: s.current!.options.map((label, i) => ({ value: `ans:${s.seq}:${i}`, label })),
  };
}

function nextQuestion(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.phase = 'question';
  s.picks = [];
  s.current = makeQuestion(s.mode, s.level, c.rng);
  c.events.push(board(s));
  startTimer(c, answerMs(s.level));
}

function reveal(c: Ctx) {
  const s = c.s;
  const q = s.current!;
  const correct = s.picks.filter((p) => p.value === q.answer).map((p) => p.user);
  const wrong = s.picks.filter((p) => p.value !== q.answer).map((p) => p.user);
  const missing = s.players.filter((p) => !s.picks.some((x) => x.user === p.id)).map((p) => p.id);
  const gains = correct.map((id, i) => ({ id, pts: 10 + (BONUS[i] ?? 0) }));
  for (const g of gains) {
    const p = s.players.find((x) => x.id === g.id)!;
    p.score += g.pts;
    p.correct++;
  }
  s.phase = 'reveal';
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'revealTitle', { round: s.round, question: q.text, answer: q.answer }),
      gains.length ? tx(s.lang, 'gotRight', { who: gains.map((g) => `${mention(g.id)} +${g.pts}`).join(sep(s)) }) : tx(s.lang, 'nobodyRight'),
      ...(wrong.length ? [tx(s.lang, 'gotWrong', { who: wrong.map(mention).join(sep(s)) })] : []),
      ...(missing.length ? [tx(s.lang, 'missing', { who: missing.map(mention).join(sep(s)) })] : []),
      tx(s.lang, 'standings', { scores: standings(s) }),
    ].join('\n'),
  });
  startTimer(c, REVEAL_MS);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const best = Math.max(...s.players.map((p) => p.score));
  s.winners = best > 0 ? s.players.filter((p) => p.score === best).map((p) => p.id) : [];
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'endTitle'),
        ...ranked(s).map((p) => tx(s.lang, 'rankLine', { rank: p.rank, who: mention(p.id), score: p.score, correct: p.correct })),
        s.winners.length ? tx(s.lang, 'winners', { who: s.winners.map(mention).join(sep(s)) }) : tx(s.lang, 'noWinner'),
      ].join('\n'),
      gif: s.winners.length ? 'goodWin' : undefined,
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function answer(c: Ctx, user: string, seq?: number, index?: number, value?: string): boolean {
  const s = c.s;
  if (seq !== undefined && seq !== s.seq) return false;
  if (!isPlayer(s, user)) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'question') return reply(c, user, tx(s.lang, 'notAnswerTime'));
  if (s.picks.some((p) => p.user === user)) return reply(c, user, tx(s.lang, 'alreadyAnswered'));
  const picked = index !== undefined ? s.current!.options[index] : s.current!.options.find((o) => o === value?.trim());
  if (picked === undefined) return reply(c, user, tx(s.lang, 'notOption', { options: s.current!.options.join(' ') }));
  s.picks.push({ user, value: picked });
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'answered') });
  if (s.picks.length === s.players.length) reveal(c);
  else c.events.push(board(s));
  return true;
}

// 依這局語系把指令的字對應到設定
function parseWord(s: MathState, word: string): Partial<Pick<MathState, 'mode' | 'level' | 'total'>> | null {
  const w = word.toLowerCase();
  const n = Number(w);
  if (TOTALS.includes(n as Total)) return { total: n as Total };
  const mode = MODES.find((m) => tx(s.lang, m === 'fraction' ? 'wordFraction' : 'wordArith').toLowerCase() === w);
  if (mode) return { mode };
  const level = LEVELS.find((l) => tx(s.lang, `word_${l}`).toLowerCase() === w);
  return level ? { level } : null;
}

function set(c: Ctx, action: Extract<GameAction, { type: 'set' }>): boolean {
  const s = c.s;
  if (action.seq !== undefined && action.seq !== s.seq) return false;
  if (s.phase !== 'setup') return reply(c, action.user, tx(s.lang, 'notSetupTime'));
  if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSetup'));
  const changes = action.words ? action.words.map((w) => parseWord(s, w)) : [{ mode: action.mode, level: action.level, total: action.total }];
  if (!changes.length || changes.some((x) => !x)) {
    const words = [...MODES.map((m) => tx(s.lang, m === 'fraction' ? 'wordFraction' : 'wordArith')), ...LEVELS.map((l) => tx(s.lang, `word_${l}`)), ...TOTALS];
    return reply(c, action.user, tx(s.lang, 'unknownSetting', { words: words.join(sep(s)) }));
  }
  for (const ch of changes) {
    if (ch!.mode && MODES.includes(ch!.mode)) s.mode = ch!.mode;
    if (ch!.level && LEVELS.includes(ch!.level)) s.level = ch!.level;
    if (ch!.total && TOTALS.includes(ch!.total)) s.total = ch!.total;
  }
  c.events.push(setupPanel(s));
  return true;
}

function go(c: Ctx, user: string, seq?: number): boolean {
  const s = c.s;
  if (seq !== undefined && seq !== s.seq) return false;
  if (s.phase !== 'setup') return reply(c, user, tx(s.lang, 'notSetupTime'));
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostSetup'));
  begin(c);
  return true;
}

function begin(c: Ctx) {
  c.events.push({ type: 'announce', text: tx(c.s.lang, 'chosen', { settings: settings(c.s) }) });
  nextQuestion(c);
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_MATH_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_MATH_PLAYERS }));
  s.phase = 'setup';
  s.seq++;
  c.events.push(lobbyEvent(TITLE, s));
  c.events.push({
    type: 'announce',
    text: [tx(s.lang, 'rulesStart', { players: s.players.map((p) => mention(p.id)).join(sep(s)) }), tx(s.lang, 'rulesAnswer'), tx(s.lang, 'rulesScore')].join('\n'),
    gif: 'start',
  });
  c.events.push(setupPanel(s));
  startTimer(c, SETUP_MS);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_MATH_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `\n${tx(c.s.lang, 'standings', { scores: standings(c.s) })}`);
    case 'set':
      return set(c, action);
    case 'go':
      return go(c, action.user, action.seq);
    case 'answer':
      return answer(c, action.user, action.seq, action.index, action.value);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'setup') begin(c);
      else if (c.s.phase === 'question') reveal(c);
      else if (c.s.phase === 'reveal') {
        if (c.s.round >= c.s.total) endGame(c);
        else nextQuestion(c);
      } else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0, correct: 0 });

export function applyMath(state: MathState | undefined, action: MathAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: MathState | undefined, host: string, channel: string): Result {
  const created: MathState = {
    game: 'math',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    mode: 'arith',
    level: 'normal',
    total: 10,
    round: 0,
    picks: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
