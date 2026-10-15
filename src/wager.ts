// 猜猜看（Wits & Wagers 簡化版）遊戲引擎：純邏輯，不碰任何 I/O。每題大家寫一個數字答案，再用 2 個標記押最接近但不超過正解的答案。
// 介面和其他遊戲一樣：applyWager(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { WAGER_QUESTIONS } from './wagerQuestions.js';

export const MIN_WAGER_PLAYERS = 3;
export const MAX_WAGER_PLAYERS = 10;
const TITLE = '猜猜看';
const ROUNDS = 7;
const MARKS = 2;
const ANSWER_MS = 60_000;
const BET_MS = 45_000;
const TOO_HIGH = '🔺 全部太大';
const FORMAT_HINT = '請輸入數字，例如 1200 或 3.5';

export interface WState {
  game: 'wager';
  channel: string;
  host: string;
  phase: 'lobby' | 'answer' | 'bet' | 'ended';
  players: { id: string; score: number }[];
  deck: number[]; // 還沒出的題目（WAGER_QUESTIONS 的 index），同一頻道跨局接續，用完重洗
  q?: number; // 目前的題目
  round: number; // 第幾題（1～7）
  answers: Record<string, number>; // user → 答案
  slots: { value: number | null; by: string[] }[]; // 押注板；value null 是「全部太大」
  bets: Record<string, number[]>; // user → 押的格子
  seq: number; // 作答／押注訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type WAction =
  | { type: 'new'; user: string; channel: string }
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
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<WAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: WState; events: GameEvent[] };
type Ctx = { s: WState; events: GameEvent[]; rng: Rng };

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 10 });
const question = (s: WState) => WAGER_QUESTIONS[s.q!];
const isPlayer = (s: WState, id: string) => s.players.some((p) => p.id === id);
const slotLabel = (x: WState['slots'][number]) => (x.value === null ? TOO_HIGH : fmt(x.value));
const slotText = (x: WState['slots'][number]) => (x.value === null ? TOO_HIGH : `${fmt(x.value)}（${x.by.map(mention).join('、')}）`);
const totals = (s: WState) => `目前總分：${s.players.map((p) => `${mention(p.id)} ${p.score}`).join('、')}`;

// 全形轉半形、去掉空白和逗號後，必須是阿拉伯數字（可以有一個小數點）
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
      `💰 第 ${s.round}／${ROUNDS} 題：${q}（單位：${unit}）`,
      ended ? '作答結束' : `按「✍️ 寫答案」或打 \`/game wager answer <數字>\`（${ANSWER_MS / 1000} 秒）`,
      `已答 ${done}/${s.players.length}`,
    ].join('\n'),
    options: ended ? [] : [{ value: 'answer', label: '✍️ 寫答案' }],
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
      `🎯 第 ${s.round}／${ROUNDS} 題押注：${question(s).q}（單位：${question(s).unit}）`,
      ...s.slots.map(slotText),
      ended ? '押注結束' : `每人 ${MARKS} 個標記，押最接近但不超過正解的答案（${BET_MS / 1000} 秒）`,
      `已押完 ${done}/${s.players.length}`,
    ].join('\n'),
    options: ended ? [] : [{ value: 'betMenu', label: '🎯 押注' }],
  };
}

function nextQuestion(c: Ctx) {
  const s = c.s;
  if (s.round >= ROUNDS) return endGame(c);
  if (!s.deck.length) s.deck = shuffle(WAGER_QUESTIONS.map((_, i) => i), c.rng);
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
  return `正解：*${fmt(answer)} ${unit}*\n📖 ${note}`;
};

// 作答結束：沒人答就公布正解換下一題；否則排出押注板
function closeAnswers(c: Ctx) {
  const s = c.s;
  c.events.push(answerBoard(s, true));
  const values = [...new Set(Object.values(s.answers))].sort((a, b) => a - b);
  if (!values.length) {
    c.events.push({ type: 'announce', text: `🤷 第 ${s.round} 題沒有人作答。${solution(s)}` });
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
      `🎉 第 ${s.round} 題揭曉！${solution(s)}`,
      `贏的答案：${slotText(s.slots[win])}`,
      scored.length ? `本題得分：${scored.map(({ p, n }) => `${mention(p.id)} +${n}`).join('、')}` : '本題沒有人得分',
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
      text: [`🏆 遊戲結束，${s.winners.map(mention).join('、')} 獲勝！`, ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)} ${p.score} 分${p.score === top ? ' 🏆' : ''}`)].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 作答階段的共同檢查
function canAnswer(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (c.s.phase !== 'answer') return reply(c, user, '現在不是作答的時間。');
  return true;
}

function openAnswer(c: Ctx, user: string): boolean {
  if (canAnswer(c, user)) c.events.push({ type: 'modal', to: user, kind: 'wagerAnswer', title: '寫答案', label: `你的答案（單位：${question(c.s).unit}）` });
  return false;
}

function answer(c: Ctx, user: string, text: string): boolean {
  if (!canAnswer(c, user)) return false;
  const n = parseNumber(text);
  if (n === null) return reply(c, user, FORMAT_HINT);
  const s = c.s;
  const first = !(user in s.answers);
  s.answers[user] = n;
  c.events.push({ type: 'ephemeral', to: user, text: `已收到：${fmt(n)} ${question(s).unit}` });
  if (s.players.every((p) => p.id in s.answers)) closeAnswers(c);
  else if (first) c.events.push(answerBoard(s));
  return true;
}

// 押注階段的共同檢查；seq 對不上是舊選單
function canBet(c: Ctx, user: string, seq?: number): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, '你不在這局遊戲裡。');
  if (c.s.phase !== 'bet' || (seq !== undefined && seq !== c.s.seq)) return reply(c, user, '現在不是押注的時間。');
  return true;
}

const myBets = (s: WState, user: string) => {
  const mine = s.bets[user] ?? [];
  return `你的押注（${mine.length}/${MARKS}）：${mine.length ? mine.map((i) => slotLabel(s.slots[i])).join('、') : '還沒押'}`;
};

function betMenu(c: Ctx, user: string): boolean {
  if (!canBet(c, user)) return false;
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'wager',
    audience: 'ephemeral',
    user,
    text: `🎯 按一格放 1 個標記，兩個可以押同一格\n${myBets(s, user)}`,
    options: [...s.slots.map((x, i) => ({ value: `bet:${s.seq}:${i}`, label: slotLabel(x) })), { value: `rebet:${s.seq}`, label: '↩️ 重押' }],
  });
  return false;
}

function bet(c: Ctx, user: string, seq: number, slot: number): boolean {
  if (!canBet(c, user, seq)) return false;
  const s = c.s;
  if (!s.slots[slot]) return false;
  const mine = (s.bets[user] ??= []);
  if (mine.length >= MARKS) return reply(c, user, `你的 ${MARKS} 個標記都押了，想改可以按「↩️ 重押」。`);
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
    `💰 猜猜看開始！玩家：${s.players.map((p) => mention(p.id)).join('、')}，共 ${ROUNDS} 題。`,
    `每題先私下寫一個數字答案（${ANSWER_MS / 1000} 秒），接著答案公開排成押注板。`,
    `每人用 ${MARKS} 個標記押「最接近但不超過正解」的答案（${BET_MS / 1000} 秒），都太大就押「${TOO_HIGH}」。`,
    `押中每個標記 +1，寫出贏的答案再 +1；${ROUNDS} 題後總分最高的人獲勝。`,
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_WAGER_PLAYERS) return reply(c, user, `目前 ${s.players.length} 人，至少需要 ${MIN_WAGER_PLAYERS} 人才能開始。`);
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
      return reply(c, action.user, '猜猜看不支援 bot。');
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
