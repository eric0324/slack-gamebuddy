// 一字千金遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyJustOne(state, action, rng) → { state, events }。
import { CODENAMES_WORDS_BY_LANG } from './codenamesWords.js';
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/justone.js';

export const MIN_JUSTONE_PLAYERS = 3;
export const MAX_JUSTONE_PLAYERS = 7;
const TITLE = '一字千金';
const DECK_SIZE = 13;
const CLUE_MS = 90_000;
const GUESS_MS = 90_000;

export type JPhase = 'lobby' | 'clue' | 'guess' | 'ended';

export interface JPlayer {
  id: string;
}

export interface JState {
  game: 'justone';
  channel: string;
  host: string;
  phase: JPhase;
  players: JPlayer[];
  deck: string[]; // 還沒翻的牌
  word?: string; // 這一輪的詞
  card: number; // 第幾張 (1 起算)
  guesser: number; // 猜詞的人在 players 裡的位置
  score: number;
  clues: Record<string, string>;
  removed: string[]; // 這輪被刪掉的提示 (回合結束時公開)
  finished?: boolean; // 牌堆用完正常結束 (取消的遊戲沒有)
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type JAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'clue'; user: string; word: string }
  | { type: 'guess'; user: string; word: string }
  | { type: 'skipGuess'; user: string }
  | { type: 'skipStep'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<JAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: JState;
  events: GameEvent[];
}

interface Ctx {
  s: JState;
  events: GameEvent[];
  rng: Rng;
}

// 新的一輪：翻一張牌給猜詞以外的人
function startRound(c: Ctx) {
  const s = c.s;
  s.word = s.deck.shift();
  s.card++;
  s.phase = 'clue';
  s.clues = {};
  const guesser = s.players[s.guesser].id;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'round', { card: s.card, guesser: mention(guesser), sec: CLUE_MS / 1000 }),
  });
  for (const p of s.players.filter((x) => x.id !== guesser)) {
    c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'word', { card: s.card, word: s.word!, guesser: mention(guesser) }) });
  }
  startTimer(c, CLUE_MS);
}

const cluers = (s: JState) => s.players.filter((_, i) => i !== s.guesser).map((p) => p.id);

function giveClue(c: Ctx, user: string, word: string): boolean {
  const s = c.s;
  if (!s.players.some((p) => p.id === user)) return false;
  if (s.phase !== 'clue' || !cluers(s).includes(user)) return reply(c, user, tx(s.lang, 'cannotClue'));
  const w = word.trim();
  if (!w || /\s/.test(w)) return reply(c, user, tx(s.lang, 'oneWord'));
  s.clues[user] = w;
  reply(c, user, tx(s.lang, 'clueReceived', { word: w }));
  const done = Object.keys(s.clues).length;
  c.events.push({ type: 'announce', text: tx(s.lang, 'clueCount', { done, total: cluers(s).length }) });
  if (done === cluers(s).length) endClues(c);
  return true;
}

const normalize = (text: string) => text.trim().toLowerCase();

// 給提示結束：刪掉重複的和跟答案相同的提示，公開留下的提示
function endClues(c: Ctx) {
  const s = c.s;
  s.phase = 'guess';
  const entries = cluers(s)
    .filter((id) => s.clues[id] !== undefined)
    .map((id) => [id, s.clues[id]] as const);
  const count = new Map<string, number>();
  for (const [, w] of entries) count.set(normalize(w), (count.get(normalize(w)) ?? 0) + 1);
  const ok = (w: string) => count.get(normalize(w)) === 1 && normalize(w) !== normalize(s.word!);
  const kept = entries.filter(([, w]) => ok(w));
  s.removed = entries.filter(([, w]) => !ok(w)).map(([id, w]) => tx(s.lang, 'clueItem', { who: mention(id), word: w }));
  const guesser = s.players[s.guesser].id;
  const shown = kept.length ? kept.map(([id, w]) => tx(s.lang, 'clueItem', { who: mention(id), word: w })).join(tx(s.lang, 'sep')) : tx(s.lang, 'noClues');
  const removed = s.removed.length ? tx(s.lang, 'removedNote', { n: s.removed.length }) : '';
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'clues', { shown, removed, guesser: mention(guesser), sec: GUESS_MS / 1000 }),
    },
    { type: 'prompt', kind: 'skipGuess', audience: 'channel', text: tx(s.lang, 'skipPrompt'), options: [{ value: guesser, label: tx(s.lang, 'skipButton') }] },
  );
  startTimer(c, GUESS_MS);
}

// 猜詞結果：猜對得分；跳過丟掉這張；猜錯再多丟一張 (牌堆空了就丟一張得分的牌)
function finishGuess(c: Ctx, result: 'right' | 'skip' | 'wrong') {
  const s = c.s;
  const lines = [tx(s.lang, result === 'right' ? 'right' : result === 'skip' ? 'skipped' : 'wrong', { word: s.word! })];
  if (result === 'right') s.score++;
  if (result === 'wrong') {
    if (s.deck.length) {
      s.deck.shift();
      lines.push(tx(s.lang, 'discardDeck'));
    } else if (s.score > 0) {
      s.score--;
      lines.push(tx(s.lang, 'discardScore'));
    }
  }
  if (s.removed.length) lines.push(tx(s.lang, 'removedList', { list: s.removed.join(tx(s.lang, 'sep')) }));
  lines.push(tx(s.lang, 'status', { score: s.score, left: s.deck.length }));
  c.events.push({ type: 'announce', text: lines.join('\n') });
  s.guesser = (s.guesser + 1) % s.players.length;
  if (s.deck.length) startRound(c);
  else endGame(c);
}

// 官方評價
function rating(lang: Lang | undefined, score: number) {
  if (score >= 13) return tx(lang, 'rate13');
  if (score === 12) return tx(lang, 'rate12');
  if (score === 11) return tx(lang, 'rate11');
  if (score >= 9) return tx(lang, 'rate9');
  if (score >= 7) return tx(lang, 'rate7');
  if (score >= 4) return tx(lang, 'rate4');
  return tx(lang, 'rate0');
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.finished = true;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: s.score }); // 合作遊戲：只記分數
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'end', { score: s.score, rating: rating(s.lang, s.score) }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_JUSTONE_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_JUSTONE_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_JUSTONE_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      s.deck = shuffle(CODENAMES_WORDS_BY_LANG[s.lang ?? 'zh-TW'], c.rng).slice(0, DECK_SIZE);
      s.guesser = Math.floor(c.rng() * n);
      c.events.push({ type: 'announce', text: tx(s.lang, 'start', { deck: DECK_SIZE }), gif: 'start' });
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'clue':
      return giveClue(c, action.user, action.word);
    case 'guess': {
      if (s.phase !== 'guess' || action.user !== s.players[s.guesser].id) return reply(c, action.user, tx(s.lang, 'notYourGuess'));
      finishGuess(c, normalize(action.word) === normalize(s.word!) ? 'right' : 'wrong');
      return true;
    }
    case 'skipGuess': {
      if (s.phase !== 'guess' || action.user !== s.players[s.guesser].id) return reply(c, action.user, tx(s.lang, 'onlyGuesserSkip'));
      finishGuess(c, 'skip');
      return true;
    }
    case 'skipStep': {
      if (s.phase !== 'clue' && s.phase !== 'guess') return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSkip'));
      if (s.phase === 'clue') endClues(c);
      else finishGuess(c, 'skip');
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') endClues(c);
      else if (s.phase === 'guess') finishGuess(c, 'skip');
      else return false;
      return true;
    }
  }
}

export function applyJustOne(state: JState | undefined, action: JAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: JState | undefined, host: string, channel: string): Result {
  const created: JState = {
    game: 'justone',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    deck: [],
    card: 0,
    guesser: 0,
    score: 0,
    clues: {},
    removed: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
