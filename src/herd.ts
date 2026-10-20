// 從眾心理 (Herd Mentality) 遊戲引擎：純邏輯，不碰任何 I/O。每題大家私下寫答案，跟多數人一樣就得分。
// 介面和其他遊戲一樣：applyHerd(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { HERD_QUESTIONS, herdQuestions } from './herdQuestions.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/herd.js';

export const MIN_HERD_PLAYERS = 4;
export const MAX_HERD_PLAYERS = 12;
const TITLE = '從眾心理';
const TARGET = 8;
const MAX_ROUNDS = 15;
const MAX_TEXT = 20;
const ANSWER_MS = 60_000;
const MERGE_MS = 30_000;

export interface HerdState {
  game: 'herd';
  channel: string;
  host: string;
  phase: 'lobby' | 'answer' | 'merge' | 'ended';
  players: { id: string; score: number }[];
  deck: number[]; // 還沒抽的題目 (HERD_QUESTIONS 的 index)，跨局沿用
  question?: number;
  round: number; // 第幾題 (1 起算)
  answers: { user: string; text: string }[]; // 這題的原始答案，依送出順序
  groups: { text: string; members: string[] }[]; // 分組／合併後
  selected: number[]; // 房主已選的組
  cow?: string; // 粉紅牛持有者
  seq: number; // 題目／分組訊息的 ref，也用來擋掉舊按鈕
  winners?: string[]; // 正常結束才有 (取消的沒有)
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type HerdAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openWrite'; user: string }
  | { type: 'answer'; user: string; text: string }
  | { type: 'pick'; user: string; seq: number; group: number }
  | { type: 'merge'; user: string; seq?: number; groups?: number[] } // 按鈕帶 seq；指令帶組的編號 (1 起算)
  | { type: 'done'; user: string; seq?: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<HerdAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: HerdState; events: GameEvent[] };
type Ctx = { s: HerdState; events: GameEvent[]; rng: Rng };

// 比對前正規化：全形轉半形、英文轉小寫、去掉空白、標點和符號
const normalize = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const isPlayer = (s: HerdState, id: string) => s.players.some((p) => p.id === id);
const list = (s: HerdState, ids: string[]) => ids.map(mention).join(tx(s.lang, 'sep'));
const question = (s: HerdState) => herdQuestions(s.lang)[s.question!];
const scores = (s: HerdState, cow: boolean) =>
  s.players.map((p) => tx(s.lang, 'scoreItem', { who: mention(p.id), score: p.score }) + (cow && p.id === s.cow ? ' 🐮' : '')).join(tx(s.lang, 'sep'));
const scoreLine = (s: HerdState) => tx(s.lang, 'scoreLine', { scores: scores(s, true) });

function answerBoard(s: HerdState): GameEvent {
  const waiting = s.players.filter((p) => !s.answers.some((a) => a.user === p.id));
  return {
    type: 'prompt',
    kind: 'herd',
    audience: 'channel',
    ref: `herd:${s.seq}`,
    text: [
      tx(s.lang, 'boardQuestion', { round: s.round, max: MAX_ROUNDS, question: question(s) }),
      tx(s.lang, 'boardHint', { sec: ANSWER_MS / 1000 }),
      tx(s.lang, 'boardCount', { done: s.answers.length, total: s.players.length }) +
        (waiting.length ? tx(s.lang, 'boardWaiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : ''),
    ].join('\n'),
    options: [{ value: 'write', label: tx(s.lang, 'writeButton') }],
  };
}

function groupBoard(s: HerdState): GameEvent {
  return {
    type: 'prompt',
    kind: 'herd',
    audience: 'channel',
    ref: `herd:${s.seq}`,
    text: [
      tx(s.lang, 'groupTitle', { round: s.round, question: question(s) }),
      ...s.groups.map((g, i) => tx(s.lang, 'groupLine', { n: i + 1, text: g.text, count: g.members.length, members: list(s, g.members) })),
      ...(s.phase === 'merge' ? [tx(s.lang, 'groupMerge', { host: mention(s.host), sec: MERGE_MS / 1000 })] : []),
    ].join('\n'),
    options: [],
  };
}

function mergeMenu(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'herd',
    audience: 'ephemeral',
    user: s.host,
    text: tx(s.lang, 'mergeMenu'),
    options: [
      ...s.groups.map((g, i) => ({ value: `pick:${s.seq}:${i}`, label: `${s.selected.includes(i) ? '✅ ' : ''}${i + 1}. ${g.text} (${g.members.length})` })),
      { value: `merge:${s.seq}`, label: tx(s.lang, 'mergeButton') },
      { value: `done:${s.seq}`, label: tx(s.lang, 'doneButton') },
    ],
  });
}

function startQuestion(c: Ctx) {
  const s = c.s;
  if (!s.deck.length) s.deck = shuffle(HERD_QUESTIONS.map((_, i) => i), c.rng);
  s.question = s.deck.shift()!;
  s.round++;
  s.seq++;
  s.phase = 'answer';
  s.answers = [];
  s.groups = [];
  s.selected = [];
  c.events.push(answerBoard(s));
  startTimer(c, ANSWER_MS);
}

// 人數多的排前面；同人數照出現順序
const sortGroups = (groups: HerdState['groups']) => [...groups].sort((a, b) => b.members.length - a.members.length);

function group(c: Ctx) {
  const s = c.s;
  const byKey = new Map<string, { text: string; members: string[] }>();
  for (const a of s.answers) {
    const key = normalize(a.text);
    const g = byKey.get(key);
    if (g) g.members.push(a.user);
    else byKey.set(key, { text: a.text, members: [a.user] });
  }
  s.groups = sortGroups([...byKey.values()]);
  s.seq++;
  if (!s.groups.length) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'noAnswers', { round: s.round }) });
    return next(c);
  }
  if (s.groups.length === 1) {
    c.events.push(groupBoard(s));
    return score(c);
  }
  s.phase = 'merge';
  c.events.push(groupBoard(s));
  mergeMenu(c);
  startTimer(c, MERGE_MS);
}

function score(c: Ctx) {
  const s = c.s;
  s.phase = 'answer'; // 計分中，避免合併按鈕；接著進下一題或結束
  s.timers = {};
  const sizes = s.groups.map((g) => g.members.length);
  const top = Math.max(...sizes);
  const tops = s.groups.filter((g) => g.members.length === top);
  const gained = tops.length === 1 && top >= 2 ? tops[0].members : [];
  for (const id of gained) s.players.find((p) => p.id === id)!.score++;
  const singles = s.groups.filter((g) => g.members.length === 1);
  const lines = [gained.length ? tx(s.lang, 'gained', { text: tops[0].text, who: list(s, gained) }) : tx(s.lang, 'noScore')];
  if (singles.length === 1 && singles[0].members[0] !== s.cow) {
    const prev = s.cow;
    s.cow = singles[0].members[0];
    lines.push(tx(s.lang, 'cow', { who: mention(s.cow), text: singles[0].text, from: prev ? tx(s.lang, 'cowFrom', { prev: mention(prev) }) : '' }));
  }
  lines.push(scoreLine(s));
  c.events.push({ type: 'announce', text: lines.join('\n') });
  next(c);
}

// 檢查勝負，還沒結束就出下一題
function next(c: Ctx) {
  const s = c.s;
  const reached = s.players.filter((p) => p.score >= TARGET && p.id !== s.cow).map((p) => p.id);
  if (reached.length) return endGame(c, reached);
  if (s.round >= MAX_ROUNDS) {
    const others = s.players.filter((p) => p.id !== s.cow);
    const best = Math.max(0, ...others.map((p) => p.score));
    return endGame(c, best > 0 ? others.filter((p) => p.score === best).map((p) => p.id) : []);
  }
  startQuestion(c);
}

function endGame(c: Ctx, winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winners = winners;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        winners.length ? tx(s.lang, winners.length === 1 ? 'winOne' : 'winMany', { who: list(s, winners) }) : tx(s.lang, 'noWinner'),
        tx(s.lang, 'finalScores', { scores: scores(s, false) }),
        ...(s.cow ? [tx(s.lang, 'cowHolder', { who: mention(s.cow) })] : []),
      ].join('\n'),
      gif: winners.length ? 'goodWin' : undefined,
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function answer(c: Ctx, user: string, raw: string): boolean {
  const s = c.s;
  if (!isPlayer(s, user)) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'answer') return reply(c, user, tx(s.lang, 'notAnswerTime'));
  const text = raw.trim();
  if ([...text].length > MAX_TEXT) return reply(c, user, tx(s.lang, 'tooLong', { max: MAX_TEXT }));
  if (!normalize(text)) return reply(c, user, tx(s.lang, 'empty'));
  const had = s.answers.some((a) => a.user === user);
  s.answers = [...s.answers.filter((a) => a.user !== user), { user, text }];
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, had ? 'updated' : 'received') });
  if (s.answers.length === s.players.length) group(c);
  else c.events.push(answerBoard(s));
  return true;
}

function openWrite(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notPlayer'));
  if (c.s.phase !== 'answer') return reply(c, user, tx(c.s.lang, 'notAnswerTime'));
  c.events.push({ type: 'modal', to: user, kind: 'herdAnswer', title: tx(c.s.lang, 'modalTitle'), label: tx(c.s.lang, 'modalLabel', { max: MAX_TEXT }) });
  return false;
}

// 合併階段的共同檢查：房主、合併中、選單沒過期
function merger(c: Ctx, user: string, seq?: number): boolean {
  if (c.s.phase !== 'merge') return reply(c, user, tx(c.s.lang, 'notMergeTime'));
  if (user !== c.s.host) return reply(c, user, tx(c.s.lang, 'onlyHostMerge'));
  if (seq !== undefined && seq !== c.s.seq) return reply(c, user, tx(c.s.lang, 'expired'));
  return true;
}

function pick(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  if (!merger(c, user, seq) || !s.groups[n]) return false;
  s.selected = s.selected.includes(n) ? s.selected.filter((x) => x !== n) : [...s.selected, n];
  mergeMenu(c);
  return true;
}

function merge(c: Ctx, user: string, seq?: number, numbers?: number[]): boolean {
  const s = c.s;
  if (!merger(c, user, seq)) return false;
  const picked = [...new Set(numbers ? numbers.map((n) => n - 1) : s.selected)].filter((i) => s.groups[i]).sort((a, b) => a - b);
  if (picked.length < 2) return reply(c, user, tx(s.lang, 'pickTwo'));
  const [keep, ...rest] = picked;
  s.groups[keep].members.push(...rest.flatMap((i) => s.groups[i].members));
  s.groups = sortGroups(s.groups.filter((_, i) => !rest.includes(i)));
  s.selected = [];
  c.events.push(groupBoard(s));
  if (s.groups.length === 1) score(c);
  else mergeMenu(c);
  return true;
}

function done(c: Ctx, user: string, seq?: number): boolean {
  if (!merger(c, user, seq)) return false;
  score(c);
  return true;
}

const RULES = (s: HerdState) =>
  [
    tx(s.lang, 'rulesStart', { players: list(s, s.players.map((p) => p.id)) }),
    tx(s.lang, 'rulesAnswer', { sec: ANSWER_MS / 1000 }),
    tx(s.lang, 'rulesCow'),
    tx(s.lang, 'rulesWin', { target: TARGET, max: MAX_ROUNDS }),
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_HERD_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_HERD_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'answer' }));
  c.events.push({ type: 'announce', text: RULES(s), gif: 'start' });
  startQuestion(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_HERD_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : `\n${scoreLine(c.s)}`);
    case 'openWrite':
      return openWrite(c, action.user);
    case 'answer':
      return answer(c, action.user, action.text);
    case 'pick':
      return pick(c, action.user, action.seq, action.group);
    case 'merge':
      return merge(c, action.user, action.seq, action.groups);
    case 'done':
      return done(c, action.user, action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'answer') group(c);
      else if (c.s.phase === 'merge') score(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0 });

export function applyHerd(state: HerdState | undefined, action: HerdAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: HerdState | undefined, host: string, channel: string): Result {
  const created: HerdState = {
    game: 'herd',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: prev?.deck ?? [], // 接著上一局剩下的題目抽，同一頻道跨局不重複
    round: 0,
    answers: [],
    groups: [],
    selected: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
