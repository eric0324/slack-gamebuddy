// 心電感應 (合作) 遊戲引擎：純邏輯，不碰任何 I/O。全員同一隊，輪流出題、其他人一起猜，拚總分。
// 介面和其他遊戲一樣：applyWavecoop(state, action, rng) → { state, events }。光譜卡和兩隊對抗版共用。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, reply, runGame, shuffle, startTimer } from './common.js';
import { spectrums } from './wavelengthCards.js';
import { t, type Lang } from './i18n/index.js';
import { tx } from './i18n/games/wavecoop.js';

export const MIN_WAVECOOP_PLAYERS = 2;
export const MAX_WAVECOOP_PLAYERS = 12;
const TITLE = '心電感應 (合作)';
const BASE_ROUNDS = 7;
const PHASE_MS = 180_000;
const MAX_CLUE = 30;

// 依總分給評價：從高到低找第一個門檻
const RATINGS = [22, 19, 16, 13, 10, 7, 4, 0] as const;

export type WCPhase = 'lobby' | 'clue' | 'guess' | 'ended';

export interface WCState {
  game: 'wavecoop';
  channel: string;
  host: string;
  phase: WCPhase;
  players: string[];
  order: string[]; // 出題順序，輪完再從頭
  round: number; // 第幾題 (0 起算)
  total: number; // 目前總題數：基本 7 題，正中 +1
  used: number[]; // 這局用過的光譜卡
  spectrum?: [string, string];
  target?: number;
  clue?: string;
  guesses: Record<string, number>;
  score: number;
  finished?: boolean; // 正常結束才有，再來一局用
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type WCAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; text: string }
  | { type: 'guess'; user: string; value: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<WCAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: WCState;
  events: GameEvent[];
}

interface Ctx {
  s: WCState;
  events: GameEvent[];
  rng: Rng;
}

const lobbyEvent = (s: WCState): GameEvent => ({ type: 'lobby', title: TITLE, host: s.host, players: [...s.players], open: s.phase === 'lobby' });

const psychic = (s: WCState) => s.order[s.round % s.order.length];
const guessers = (s: WCState) => s.players.filter((id) => id !== psychic(s));
const dial = (s: WCState) => `${s.spectrum![0]} ◀ 0 ─ 10 ▶ ${s.spectrum![1]}`;
const minutes = (s: WCState) => tx(s.lang, 'minutes', { n: PHASE_MS / 60_000 });

function deal(c: Ctx) {
  const s = c.s;
  s.order = shuffle(s.players, c.rng);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { total: s.total, order: s.order.map(mention).join(' → ') }),
    gif: 'start',
  });
  startRound(c);
}

// 每題開始：抽光譜卡和目標，私訊出題者
function startRound(c: Ctx) {
  const s = c.s;
  const cards = spectrums(s.lang);
  const unused = cards.map((_, i) => i).filter((i) => !s.used.includes(i));
  const card = unused[Math.floor(c.rng() * unused.length)];
  s.used.push(card);
  s.spectrum = cards[card];
  s.target = Math.floor(c.rng() * 11);
  s.clue = undefined;
  s.guesses = {};
  s.phase = 'clue';
  const p = psychic(s);
  c.events.push(
    {
      type: 'dm',
      to: p,
      text: tx(s.lang, 'dm', { left: s.spectrum[0], right: s.spectrum[1], target: s.target }),
    },
    { type: 'announce', text: tx(s.lang, 'round', { round: s.round + 1, total: s.total, score: s.score, who: mention(p), minutes: minutes(s), dial: dial(s) }) },
    { type: 'prompt', kind: 'wavecoop', audience: 'channel', text: tx(s.lang, 'cluePrompt', { who: mention(p) }), options: [{ value: 'clue', label: tx(s.lang, 'clueButton') }] },
  );
  startTimer(c, PHASE_MS);
}

function giveClue(c: Ctx, user: string, text: string): boolean {
  const s = c.s;
  if (s.phase !== 'clue' || user !== psychic(s)) return reply(c, user, tx(s.lang, 'notYourClue'));
  const clue = text.trim();
  if (!clue || [...clue].length > MAX_CLUE) return reply(c, user, tx(s.lang, 'clueLength', { max: MAX_CLUE }));
  s.clue = clue;
  s.phase = 'guess';
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'clueGiven', { who: mention(user), clue, dial: dial(s), guessers: guessers(s).map(mention).join(tx(s.lang, 'sep')), minutes: minutes(s) }) },
    {
      type: 'prompt',
      kind: 'wavecoop',
      audience: 'channel',
      text: tx(s.lang, 'guessPrompt', { clue }),
      options: Array.from({ length: 11 }, (_, i) => ({ value: `guess:${i}`, label: String(i) })),
      perRow: 6,
    },
  );
  startTimer(c, PHASE_MS);
  return true;
}

function guess(c: Ctx, user: string, value: number): boolean {
  const s = c.s;
  if (s.phase !== 'guess' || !guessers(s).includes(user)) return reply(c, user, tx(s.lang, 'notYourGuess'));
  if (!Number.isInteger(value) || value < 0 || value > 10) return false;
  s.guesses[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youPicked', { value }) });
  if (guessers(s).every((id) => id in s.guesses)) reveal(c);
  return true;
}

// 公布這題：平均四捨五入當全隊答案，依距離得 4／3／2／0 分，正中加一題
function reveal(c: Ctx) {
  const s = c.s;
  const picked = Object.values(s.guesses);
  const answer = picked.length ? Math.round(picked.reduce((a, b) => a + b, 0) / picked.length) : undefined;
  const dist = answer === undefined ? Infinity : Math.abs(answer - s.target!);
  const gained = dist === 0 ? 4 : dist === 1 ? 3 : dist === 2 ? 2 : 0;
  s.score += gained;
  if (dist === 0) s.total++;
  const cells = Array.from({ length: 11 }, (_, i) => (i === s.target && i === answer ? '💥' : i === s.target ? '🎯' : i === answer ? '📌' : '▫️'));
  c.events.push({
    type: 'announce',
    text: [
      answer === undefined ? tx(s.lang, 'noGuess') : '',
      tx(s.lang, 'revealClue', { clue: String(s.clue) }),
      `${s.spectrum![0]} ${cells.join('')} ${s.spectrum![1]}`,
      tx(s.lang, 'revealTarget', { target: s.target! }) + (answer === undefined ? '' : tx(s.lang, 'revealAnswer', { answer })),
      tx(s.lang, 'revealGain', { gained, score: s.score }),
      dist === 0 ? tx(s.lang, 'bullseye') : '',
    ]
      .filter(Boolean)
      .join('\n'),
  });
  nextRound(c);
}

function nextRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (s.round >= s.total) endGame(c);
  else startRound(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  const rating = tx(s.lang, `rating${RATINGS.find((min) => s.score >= min)!}`);
  c.events.push({ type: 'result', players: [...s.players], winners: [], score: s.score }); // 合作遊戲：只記分數
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'end', { total: s.total, score: s.score, rating }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join': {
      if (s.phase !== 'lobby') return reply(c, action.user, t(s.lang, 'room.started'));
      if (s.players.includes(action.user)) return reply(c, action.user, t(s.lang, 'room.alreadyIn'));
      if (s.players.length >= MAX_WAVECOOP_PLAYERS) return reply(c, action.user, t(s.lang, 'room.full'));
      s.players.push(action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'leave': {
      if (!s.players.includes(action.user)) return false;
      if (s.phase !== 'lobby') return reply(c, action.user, t(s.lang, 'room.cannotLeave'));
      if (action.user === s.host) {
        s.phase = 'ended';
        c.events.push(lobbyEvent(s), { type: 'announce', text: t(s.lang, 'room.hostLeft') });
        return true;
      }
      s.players = s.players.filter((id) => id !== action.user);
      c.events.push(lobbyEvent(s));
      return true;
    }
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_WAVECOOP_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_WAVECOOP_PLAYERS }));
      c.events.push(lobbyEvent({ ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openClue':
      if (s.phase !== 'clue' || action.user !== psychic(s)) return reply(c, action.user, tx(s.lang, 'notYourClue'));
      c.events.push({ type: 'modal', to: action.user, kind: 'wavecoopClue', title: tx(s.lang, 'modalTitle'), label: tx(s.lang, 'modalLabel', { max: MAX_CLUE }) });
      return false;
    case 'clue':
      return giveClue(c, action.user, action.text);
    case 'guess':
      return guess(c, action.user, action.value);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') {
        c.events.push({ type: 'announce', text: tx(s.lang, 'skipped', { who: mention(psychic(s)) }) });
        nextRound(c);
      } else if (s.phase === 'guess') reveal(c);
      return true;
    }
  }
}

export function applyWavecoop(state: WCState | undefined, action: WCAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.includes(user),
    createLobby,
    handle,
  });
}

function createLobby(prev: WCState | undefined, host: string, channel: string): Result {
  const created: WCState = {
    game: 'wavecoop',
    channel,
    host,
    phase: 'lobby',
    players: [host],
    order: [],
    round: 0,
    total: BASE_ROUNDS,
    used: [],
    guesses: {},
    score: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(created)] };
}
