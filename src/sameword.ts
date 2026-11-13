// 同詞相遇 (Same Word) 遊戲引擎：純邏輯，不碰任何 I/O。每輪大家私下寫一個詞，一起揭曉，直到所有人寫出同一個詞。
// 介面和其他遊戲一樣：applySameword(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, startTimer } from './common.js';
import { normalize } from './herd.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/sameword.js';

export const MIN_SAMEWORD_PLAYERS = 3;
export const MAX_SAMEWORD_PLAYERS = 10;
const TITLE = '同詞相遇';
const MAX_ROUNDS = 10;
const MAX_TEXT = 20;
const WRITE_MS = 90_000;
const JUDGE_MS = 30_000;

type Word = { user: string; text: string };

export interface SamewordState {
  game: 'sameword';
  channel: string;
  host: string;
  phase: 'lobby' | 'write' | 'judge' | 'ended';
  players: { id: string }[];
  round: number; // 第幾輪 (1 起算)
  words: Word[]; // 這一輪的詞，依送出順序
  history: { user: string; text: string | null }[][]; // 已揭曉的輪次，依玩家順序 (沒寫是 null)
  used: string[]; // 揭曉過的詞正規化後的結果
  seq: number; // 面板 ref，也用來擋掉舊按鈕
  score?: number; // 正常結束才有 (取消的沒有)
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type SamewordAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openWrite'; user: string }
  | { type: 'word'; user: string; text: string }
  | { type: 'same'; user: string; seq?: number } // 按鈕帶 seq；指令沒有
  | { type: 'next'; user: string; seq?: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<SamewordAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SamewordState; events: GameEvent[] };
type Ctx = { s: SamewordState; events: GameEvent[]; rng: Rng };

const isPlayer = (s: SamewordState, id: string) => s.players.some((p) => p.id === id);
const sep = (s: SamewordState) => tx(s.lang, 'sep');
const missing = (s: SamewordState) => tx(s.lang, 'missing');

function writeBoard(s: SamewordState): GameEvent {
  const waiting = s.players.filter((p) => !s.words.some((w) => w.user === p.id));
  const prev = s.history.at(-1);
  return {
    type: 'prompt',
    kind: 'sameword',
    audience: 'channel',
    ref: `sameword:${s.seq}`,
    text: [
      tx(s.lang, 'boardRound', { round: s.round, max: MAX_ROUNDS }),
      prev
        ? tx(s.lang, 'boardPrev', { words: prev.map((w) => `${mention(w.user)} ${w.text ?? missing(s)}`).join(sep(s)) })
        : tx(s.lang, 'boardFirst'),
      tx(s.lang, 'boardHint', { sec: WRITE_MS / 1000 }),
      tx(s.lang, 'boardCount', { done: s.words.length, total: s.players.length }) +
        (waiting.length ? tx(s.lang, 'boardWaiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : ''),
    ].join('\n'),
    options: [{ value: 'write', label: tx(s.lang, 'writeButton') }],
  };
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.phase = 'write';
  s.words = [];
  c.events.push(writeBoard(s));
  startTimer(c, WRITE_MS);
}

// 揭曉：全部寫了且正規化後一樣 → 相遇；全部寫了但不一樣 → 房主判定；有人沒寫 → 下一輪
function reveal(c: Ctx) {
  const s = c.s;
  const row = s.players.map((p) => ({ user: p.id, text: s.words.find((w) => w.user === p.id)?.text ?? null }));
  s.history.push(row);
  for (const w of s.words) if (!s.used.includes(normalize(w.text))) s.used.push(normalize(w.text));
  s.seq++;
  const lines = [tx(s.lang, 'revealTitle', { round: s.round }), ...row.map((w) => `${mention(w.user)} ${w.text ?? missing(s)}`)];
  const all = row.every((w) => w.text !== null);
  if (all && new Set(row.map((w) => normalize(w.text!))).size === 1) {
    c.events.push({ type: 'announce', text: lines.join('\n') });
    return endGame(c, row[0].text!);
  }
  if (!all) {
    c.events.push({ type: 'announce', text: [...lines, tx(s.lang, 'someoneMissing')].join('\n') });
    return nextRound(c);
  }
  s.phase = 'judge';
  c.events.push({ type: 'announce', text: lines.join('\n') });
  c.events.push({
    type: 'prompt',
    kind: 'sameword',
    audience: 'channel',
    text: tx(s.lang, 'judgeAsk', { host: mention(s.host), sec: JUDGE_MS / 1000 }),
    options: [
      { value: `same:${s.seq}`, label: tx(s.lang, 'sameButton') },
      { value: `next:${s.seq}`, label: tx(s.lang, 'nextButton') },
    ],
  });
  startTimer(c, JUDGE_MS);
}

function nextRound(c: Ctx) {
  if (c.s.round >= MAX_ROUNDS) return endGame(c);
  startRound(c);
}

// met：自動相遇的詞；'judged' 是房主判定算相同；沒有就是 10 輪都沒相遇
function endGame(c: Ctx, met?: string | { judged: true }) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.score = met === undefined ? 0 : MAX_ROUNDS + 1 - s.round;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: s.score });
  const route = s.history.map((row, i) => tx(s.lang, 'routeLine', { round: i + 1, words: row.map((w) => w.text ?? '—').join(sep(s)) }));
  c.events.push(
    {
      type: 'announce',
      text: [
        met === undefined
          ? tx(s.lang, 'fail', { max: MAX_ROUNDS })
          : typeof met === 'string'
            ? tx(s.lang, 'met', { round: s.round, word: met })
            : tx(s.lang, 'metJudged', { round: s.round }),
        tx(s.lang, 'score', { score: s.score }),
        tx(s.lang, 'routeTitle'),
        ...route,
      ].join('\n'),
      gif: met === undefined ? undefined : 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function write(c: Ctx, user: string, raw: string): boolean {
  const s = c.s;
  if (!isPlayer(s, user)) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'write') return reply(c, user, tx(s.lang, 'notWriteTime'));
  const text = raw.trim();
  if ([...text].length > MAX_TEXT) return reply(c, user, tx(s.lang, 'tooLong', { max: MAX_TEXT }));
  if (!normalize(text)) return reply(c, user, tx(s.lang, 'empty'));
  if (s.used.includes(normalize(text))) return reply(c, user, tx(s.lang, 'used', { word: text }));
  const had = s.words.some((w) => w.user === user);
  s.words = [...s.words.filter((w) => w.user !== user), { user, text }];
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, had ? 'updated' : 'received') });
  if (s.words.length === s.players.length) reveal(c);
  else c.events.push(writeBoard(s));
  return true;
}

function openWrite(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notPlayer'));
  if (c.s.phase !== 'write') return reply(c, user, tx(c.s.lang, 'notWriteTime'));
  c.events.push({ type: 'modal', to: user, kind: 'samewordWord', title: tx(c.s.lang, 'modalTitle'), label: tx(c.s.lang, 'modalLabel', { max: MAX_TEXT }) });
  return false;
}

// 房主判定：舊輪次的按鈕忽略
function decide(c: Ctx, user: string, same: boolean, seq?: number): boolean {
  const s = c.s;
  if (seq !== undefined && seq !== s.seq) return false;
  if (s.phase !== 'judge') return reply(c, user, tx(s.lang, 'notJudgeTime'));
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostJudge'));
  s.timers = {};
  if (same) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'hostSame', { host: mention(s.host) }) });
    endGame(c, { judged: true });
  } else nextRound(c);
  return true;
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_SAMEWORD_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_SAMEWORD_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'write' }));
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'rulesStart', { players: s.players.map((p) => mention(p.id)).join(sep(s)) }),
      tx(s.lang, 'rulesWrite', { sec: WRITE_MS / 1000 }),
      tx(s.lang, 'rulesMeet', { max: MAX_ROUNDS }),
    ].join('\n'),
    gif: 'start',
  });
  startRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SAMEWORD_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openWrite':
      return openWrite(c, action.user);
    case 'word':
      return write(c, action.user, action.text);
    case 'same':
    case 'next':
      return decide(c, action.user, action.type === 'same', action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'write') reveal(c);
      else if (c.s.phase === 'judge') nextRound(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id });

export function applySameword(state: SamewordState | undefined, action: SamewordAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => s.score !== undefined,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: SamewordState | undefined, host: string, channel: string): Result {
  const created: SamewordState = {
    game: 'sameword',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    round: 0,
    words: [],
    history: [],
    used: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
