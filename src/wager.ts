// 猜猜看 (Wits & Wagers 簡化版) 遊戲引擎：純邏輯，不碰任何 I/O。每題大家寫一個數字答案，再用 2 個標記押最接近但不超過正解的答案。
// 介面和其他遊戲一樣：applyWager(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { wagerQuestions } from './wagerQuestions.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/wager.js';

export const MIN_WAGER_PLAYERS = 3;
export const MAX_WAGER_PLAYERS = 10;
const TITLE = '猜猜看';
const ROUNDS = 7;
const MARKS = 2;
const ANSWER_MS = 60_000;
const BET_MS = 45_000;

export interface WState {
  game: 'wager';
  channel: string;
  host: string;
  phase: 'lobby' | 'answer' | 'bet' | 'ended';
  players: { id: string; score: number }[];
  deck: number[]; // 還沒出的題目 (WAGER_QUESTIONS 的 index)，同一頻道跨局接續，用完重洗
  q?: number; // 目前的題目
  round: number; // 第幾題 (1～7)
  answers: Record<string, number>; // user → 答案
  slots: { value: number | null; by: string[] }[]; // 押注板；value null 是「全部太大」
  bets: Record<string, number[]>; // user → 押的格子
  seq: number; // 作答／押注訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type WAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openAnswer'; user: string }
  | { type: 'answer'; user: string; text: string }
  | { type: 'betMenu'; user: string }
  | { type: 'bet'; user: string; seq: number; slot: number }
  | { type: 'rebet'; user: string; seq: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<WAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: WState; events: GameEvent[] };
type Ctx = { s: WState; events: GameEvent[]; rng: Rng };

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 10 });
const question = (s: WState) => wagerQuestions(s.lang)[s.q!];
const isPlayer = (s: WState, id: string) => s.players.some((p) => p.id === id);
const list = (s: WState, items: string[]) => items.join(tx(s.lang, 'sep'));
const slotLabel = (s: WState, x: WState['slots'][number]) => (x.value === null ? tx(s.lang, 'tooHigh') : fmt(x.value));
const slotText = (s: WState, x: WState['slots'][number]) => (x.value === null ? tx(s.lang, 'tooHigh') : `${fmt(x.value)} (${list(s, x.by.map(mention))})`);
const totals = (s: WState) => tx(s.lang, 'totals', { list: list(s, s.players.map((p) => tx(s.lang, 'playerScore', { who: mention(p.id), score: p.score }))) });

// 全形轉半形、去掉空白和逗號後，必須是阿拉伯數字 (可以有一個小數點)
export function parseNumber(text: string): number | null {
  const t = text.normalize('NFKC').replace(/[\s,]/g, '');
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

function answerBoard(s: WState, ended = false): GameEvent {
  const { q, unit } = question(s);
  const done = Object.keys(s.answers).length;
  return {
    type: 'prompt',
    kind: 'wager',
    audience: 'channel',
    ref: `wager:${s.seq}`,
    text: [
      tx(s.lang, 'answerTitle', { round: s.round, rounds: ROUNDS, q, unit }),
      ended ? tx(s.lang, 'answerEnded') : tx(s.lang, 'answerHint', { sec: ANSWER_MS / 1000 }),
      tx(s.lang, 'answered', { done, total: s.players.length }),
    ].join('\n'),
    options: ended ? [] : [{ value: 'answer', label: tx(s.lang, 'answerButton') }],
  };
}

function betBoard(s: WState, ended = false): GameEvent {
  const done = s.players.filter((p) => (s.bets[p.id] ?? []).length === MARKS).length;
  return {
    type: 'prompt',
    kind: 'wager',
    audience: 'channel',
    ref: `wager:${s.seq}`,
    text: [
      tx(s.lang, 'betTitle', { round: s.round, rounds: ROUNDS, q: question(s).q, unit: question(s).unit }),
      ...s.slots.map((x) => slotText(s, x)),
      ended ? tx(s.lang, 'betEnded') : tx(s.lang, 'betHint', { marks: MARKS, sec: BET_MS / 1000 }),
      tx(s.lang, 'betDone', { done, total: s.players.length }),
    ].join('\n'),
    options: ended ? [] : [{ value: 'betMenu', label: tx(s.lang, 'betButton') }],
  };
}

function nextQuestion(c: Ctx) {
  const s = c.s;
  if (s.round >= ROUNDS) return endGame(c);
  if (!s.deck.length) s.deck = shuffle(wagerQuestions(s.lang).map((_, i) => i), c.rng);
  s.q = s.deck.shift()!;
  s.round++;
  s.seq++;
  s.phase = 'answer';
  s.answers = {};
  s.slots = [];
  s.bets = {};
  c.events.push(answerBoard(s));
  startTimer(c, ANSWER_MS);
}

const solution = (s: WState) => {
  const { answer, unit, note } = question(s);
  return tx(s.lang, 'solution', { answer: fmt(answer), unit, note });
};

// 作答結束：沒人答就公布正解換下一題；否則排出押注板
function closeAnswers(c: Ctx) {
  const s = c.s;
  c.events.push(answerBoard(s, true));
  const values = [...new Set(Object.values(s.answers))].sort((a, b) => a - b);
  if (!values.length) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'noAnswers', { round: s.round, solution: solution(s) }) });
    return nextQuestion(c);
  }
  s.phase = 'bet';
  s.seq++;
  s.slots = [{ value: null, by: [] }, ...values.map((v) => ({ value: v, by: s.players.filter((p) => s.answers[p.id] === v).map((p) => p.id) }))];
  c.events.push(betBoard(s));
  startTimer(c, BET_MS);
}

// 揭曉：贏格是不超過正解的最大答案，沒有就是「全部太大」
function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(betBoard(s, true));
  const { answer } = question(s);
  const fit = s.slots.map((x, i) => [x.value, i] as const).filter(([v]) => v !== null && v <= answer);
  const win = fit.length ? fit[fit.length - 1][1] : 0;
  const gained = s.players.map((p) => ({ p, n: (s.bets[p.id] ?? []).filter((x) => x === win).length + (s.slots[win].by.includes(p.id) ? 1 : 0) }));
  for (const { p, n } of gained) p.score += n;
  const scored = gained.filter((g) => g.n > 0);
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'revealed', { round: s.round, solution: solution(s) }),
      tx(s.lang, 'winningAnswer', { slot: slotText(s, s.slots[win]) }),
      scored.length ? tx(s.lang, 'roundScores', { list: list(s, scored.map(({ p, n }) => tx(s.lang, 'gain', { who: mention(p.id), n }))) }) : tx(s.lang, 'noScore'),
      totals(s),
    ].join('\n'),
  });
  nextQuestion(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const top = Math.max(...s.players.map((p) => p.score));
  s.winners = s.players.filter((p) => p.score === top).map((p) => p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  const ranking = [...s.players].sort((a, b) => b.score - a.score);
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'gameOver', { winners: list(s, s.winners.map(mention)) }),
        ...ranking.map((p, i) => tx(s.lang, 'rankLine', { rank: i + 1, who: mention(p.id), score: p.score, crown: p.score === top ? ' 🏆' : '' })),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

// 作答階段的共同檢查
function canAnswer(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notInGame'));
  if (c.s.phase !== 'answer') return reply(c, user, tx(c.s.lang, 'notAnswerTime'));
  return true;
}

function openAnswer(c: Ctx, user: string): boolean {
  if (canAnswer(c, user)) c.events.push({ type: 'modal', to: user, kind: 'wagerAnswer', title: tx(c.s.lang, 'modalTitle'), label: tx(c.s.lang, 'modalLabel', { unit: question(c.s).unit }) });
  return false;
}

function answer(c: Ctx, user: string, text: string): boolean {
  if (!canAnswer(c, user)) return false;
  const n = parseNumber(text);
  const s = c.s;
  if (n === null) return reply(c, user, tx(s.lang, 'formatHint'));
  const first = !(user in s.answers);
  s.answers[user] = n;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'received', { n: fmt(n), unit: question(s).unit }) });
  if (s.players.every((p) => p.id in s.answers)) closeAnswers(c);
  else if (first) c.events.push(answerBoard(s));
  return true;
}

// 押注階段的共同檢查；seq 對不上是舊選單
function canBet(c: Ctx, user: string, seq?: number): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notInGame'));
  if (c.s.phase !== 'bet' || (seq !== undefined && seq !== c.s.seq)) return reply(c, user, tx(c.s.lang, 'notBetTime'));
  return true;
}

const myBets = (s: WState, user: string) => {
  const mine = s.bets[user] ?? [];
  return tx(s.lang, 'myBets', { n: mine.length, marks: MARKS, list: mine.length ? list(s, mine.map((i) => slotLabel(s, s.slots[i]))) : tx(s.lang, 'noBetsYet') });
};

function betMenu(c: Ctx, user: string): boolean {
  if (!canBet(c, user)) return false;
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'wager',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'betMenu', { bets: myBets(s, user) }),
    options: [...s.slots.map((x, i) => ({ value: `bet:${s.seq}:${i}`, label: slotLabel(s, x) })), { value: `rebet:${s.seq}`, label: tx(s.lang, 'rebetButton') }],
  });
  return false;
}

function bet(c: Ctx, user: string, seq: number, slot: number): boolean {
  if (!canBet(c, user, seq)) return false;
  const s = c.s;
  if (!s.slots[slot]) return false;
  const mine = (s.bets[user] ??= []);
  if (mine.length >= MARKS) return reply(c, user, tx(s.lang, 'allMarksUsed', { marks: MARKS }));
  mine.push(slot);
  c.events.push({ type: 'ephemeral', to: user, text: myBets(s, user) });
  if (s.players.every((p) => (s.bets[p.id] ?? []).length === MARKS)) reveal(c);
  else if (mine.length === MARKS) c.events.push(betBoard(s));
  return true;
}

function rebet(c: Ctx, user: string, seq: number): boolean {
  if (!canBet(c, user, seq)) return false;
  const s = c.s;
  const full = (s.bets[user] ?? []).length === MARKS;
  s.bets[user] = [];
  c.events.push({ type: 'ephemeral', to: user, text: myBets(s, user) });
  if (full) c.events.push(betBoard(s));
  return true;
}

const RULES = (s: WState) =>
  [
    tx(s.lang, 'rules1', { players: list(s, s.players.map((p) => mention(p.id))), rounds: ROUNDS }),
    tx(s.lang, 'rules2', { sec: ANSWER_MS / 1000 }),
    tx(s.lang, 'rules3', { marks: MARKS, sec: BET_MS / 1000, tooHigh: tx(s.lang, 'tooHigh') }),
    tx(s.lang, 'rules4', { rounds: ROUNDS }),
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_WAGER_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_WAGER_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'answer' }));
  c.events.push({ type: 'announce', text: RULES(s), gif: 'start' });
  nextQuestion(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_WAGER_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `\n${totals(c.s)}`);
    case 'openAnswer':
      return openAnswer(c, action.user);
    case 'answer':
      return answer(c, action.user, action.text);
    case 'betMenu':
      return betMenu(c, action.user);
    case 'bet':
      return bet(c, action.user, action.seq, action.slot);
    case 'rebet':
      return rebet(c, action.user, action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'answer') closeAnswers(c);
      else if (c.s.phase === 'bet') reveal(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0 });

export function applyWager(state: WState | undefined, action: WAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: WState | undefined, host: string, channel: string): Result {
  const created: WState = {
    game: 'wager',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: prev?.deck ?? [], // 接著上一局剩下的題目，同一頻道跨局不重複
    round: 0,
    answers: {},
    slots: [],
    bets: {},
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
