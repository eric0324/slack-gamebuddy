// 心電感應遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyWavelength(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { spectrums } from './wavelengthCards.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/wavelength.js';

export const MIN_WAVELENGTH_PLAYERS = 4;
export const MAX_WAVELENGTH_PLAYERS = 12;
const TITLE = '心電感應';
const PHASE_MS = 180_000;
const MAX_CLUE = 30;

export type WPhase = 'lobby' | 'clue' | 'guess' | 'side' | 'ended';
export type Team = 'orange' | 'purple';
type Side = 'left' | 'right';

const teamName = (s: { lang?: Lang }, t: Team) => tx(s.lang, t);
const other = (t: Team): Team => (t === 'orange' ? 'purple' : 'orange');

export interface WPlayer {
  id: string;
  team?: Team;
}

export interface WState {
  game: 'wavelength';
  channel: string;
  host: string;
  phase: WPhase;
  players: WPlayer[];
  order: string[]; // 出題順序
  round: number;
  used: number[]; // 這局用過的光譜卡
  spectrum?: [string, string];
  target?: number;
  clue?: string;
  guesses: Record<string, number>;
  answer?: number;
  sides: Record<string, Side>;
  scores: Record<Team, number>;
  winner?: Team | 'tie';
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
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; text: string }
  | { type: 'guess'; user: string; value: number }
  | { type: 'side'; user: string; value: Side }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<WAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: WState;
  events: GameEvent[];
}

interface Ctx {
  s: WState;
  events: GameEvent[];
  rng: Rng;
}

const teamOf = (s: WState, id: string) => s.players.find((p) => p.id === id)?.team;
const psychic = (s: WState) => s.order[s.round];
const psychicTeam = (s: WState) => teamOf(s, psychic(s))!;
const mates = (s: WState) => s.players.filter((p) => p.team === psychicTeam(s) && p.id !== psychic(s)).map((p) => p.id);
const rivals = (s: WState) => s.players.filter((p) => p.team === other(psychicTeam(s))).map((p) => p.id);
const dial = (s: WState) => `${s.spectrum![0]} ◀ 0 ─ 10 ▶ ${s.spectrum![1]}`;
const scoreLine = (s: WState) => tx(s.lang, 'scoreLine', { orange: teamName(s, 'orange'), o: s.scores.orange, purple: teamName(s, 'purple'), p: s.scores.purple });
const list = (s: WState, ids: string[]) => ids.map(mention).join(tx(s.lang, 'sep'));

// 開局：隨機分隊，兩隊輪流出題，每人一題
function deal(c: Ctx) {
  const s = c.s;
  const shuffled = shuffle(s.players, c.rng);
  shuffled.forEach((p, i) => (s.players.find((x) => x.id === p.id)!.team = i % 2 === 0 ? 'orange' : 'purple'));
  const first: Team = c.rng() < 0.5 ? 'orange' : 'purple';
  const lists = [first, other(first)].map((t) => shuffled.filter((p) => teamOf(s, p.id) === t).map((p) => p.id));
  s.order = Array.from({ length: Math.max(lists[0].length, lists[1].length) }, (_, i) => [lists[0][i], lists[1][i]])
    .flat()
    .filter((id): id is string => id !== undefined);
  const roster = (t: Team) => tx(s.lang, 'roster', { team: teamName(s, t), players: list(s, s.players.filter((p) => p.team === t).map((p) => p.id)) });
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { n: s.order.length, orange: roster('orange'), purple: roster('purple') }),
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
  s.answer = undefined;
  s.guesses = {};
  s.sides = {};
  s.phase = 'clue';
  const p = psychic(s);
  c.events.push(
    {
      type: 'dm',
      to: p,
      text: tx(s.lang, 'dm', { left: s.spectrum[0], right: s.spectrum[1], target: s.target }),
    },
    {
      type: 'announce',
      text: tx(s.lang, 'round', { round: s.round + 1, total: s.order.length, team: teamName(s, psychicTeam(s)), who: mention(p), min: PHASE_MS / 60_000, dial: dial(s) }),
    },
    { type: 'prompt', kind: 'wavelength', audience: 'channel', text: tx(s.lang, 'cluePrompt', { who: mention(p) }), options: [{ value: 'clue', label: tx(s.lang, 'clueButton') }] },
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
    {
      type: 'announce',
      text: tx(s.lang, 'clueGiven', { who: mention(user), clue, dial: dial(s), team: teamName(s, psychicTeam(s)), mates: list(s, mates(s)), min: PHASE_MS / 60_000 }),
    },
    {
      type: 'prompt',
      kind: 'wavelength',
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
  if (s.phase !== 'guess' || !mates(s).includes(user)) return reply(c, user, tx(s.lang, 'notYourGuess'));
  if (!Number.isInteger(value) || value < 0 || value > 10) return false;
  s.guesses[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youPicked', { value }) });
  if (mates(s).every((id) => id in s.guesses)) finishGuess(c);
  return true;
}

// 隊友猜完：平均四捨五入當全隊答案，換對手猜左右；沒人猜就直接公布
function finishGuess(c: Ctx) {
  const s = c.s;
  const picked = Object.values(s.guesses);
  if (!picked.length) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'noGuess', { team: teamName(s, psychicTeam(s)) }) });
    reveal(c);
    return;
  }
  s.answer = Math.round(picked.reduce((a, b) => a + b, 0) / picked.length);
  s.phase = 'side';
  const rival = other(psychicTeam(s));
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'teamAnswer', { team: teamName(s, psychicTeam(s)), answer: s.answer, rival: teamName(s, rival), rivals: list(s, rivals(s)), min: PHASE_MS / 60_000 }),
    },
    {
      type: 'prompt',
      kind: 'wavelength',
      audience: 'channel',
      text: tx(s.lang, 'sidePrompt', { answer: s.answer }),
      options: [
        { value: 'side:left', label: tx(s.lang, 'left') },
        { value: 'side:right', label: tx(s.lang, 'right') },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function pickSide(c: Ctx, user: string, value: Side): boolean {
  const s = c.s;
  if (s.phase !== 'side' || !rivals(s).includes(user)) return reply(c, user, tx(s.lang, 'notYourSide'));
  s.sides[user] = value;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, value === 'left' ? 'pickedLeft' : 'pickedRight') });
  if (rivals(s).every((id) => id in s.sides)) reveal(c);
  return true;
}

// 公布這題：出題隊依距離得 4／3／2／0 分，對手猜對方向得 1 分 (正中時不算)
function reveal(c: Ctx) {
  const s = c.s;
  const team = psychicTeam(s);
  const rival = other(team);
  const votes = Object.values(s.sides);
  const lefts = votes.filter((v) => v === 'left').length;
  const rights = votes.length - lefts;
  const side: Side | undefined = lefts > rights ? 'left' : rights > lefts ? 'right' : undefined;
  const dist = s.answer === undefined ? Infinity : Math.abs(s.answer - s.target!);
  const gained = dist === 0 ? 4 : dist === 1 ? 3 : dist === 2 ? 2 : 0;
  const actual = s.answer === undefined || dist === 0 ? undefined : s.target! < s.answer ? 'left' : 'right';
  const rivalGained = side && side === actual ? 1 : 0;
  s.scores[team] += gained;
  s.scores[rival] += rivalGained;
  const cells = Array.from({ length: 11 }, (_, i) => (i === s.target && i === s.answer ? '💥' : i === s.target ? '🎯' : i === s.answer ? '📌' : '▫️'));
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'revealClue', { clue: s.clue ?? tx(s.lang, 'noClue') }),
      `${s.spectrum![0]} ${cells.join('')} ${s.spectrum![1]}`,
      tx(s.lang, 'revealTarget', { target: s.target! }) + (s.answer === undefined ? '' : tx(s.lang, 'revealAnswer', { team: teamName(s, team), answer: s.answer })),
      tx(s.lang, 'revealGain', { team: teamName(s, team), gained, rival: teamName(s, rival), rivalGained }),
      scoreLine(s),
    ].join('\n'),
  });
  nextRound(c);
}

function nextRound(c: Ctx) {
  const s = c.s;
  s.round++;
  if (s.round >= s.order.length) endGame(c);
  else startRound(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const { orange, purple } = s.scores;
  s.winner = orange > purple ? 'orange' : purple > orange ? 'purple' : 'tie';
  const result = s.winner === 'tie' ? tx(s.lang, 'tie') : tx(s.lang, 'win', { team: teamName(s, s.winner) });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.team === s.winner).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'end', { score: scoreLine(s), result }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_WAVELENGTH_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_WAVELENGTH_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_WAVELENGTH_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openClue':
      if (s.phase !== 'clue' || action.user !== psychic(s)) return reply(c, action.user, tx(s.lang, 'notYourClue'));
      c.events.push({ type: 'modal', to: action.user, kind: 'wavelengthClue', title: tx(s.lang, 'modalTitle'), label: tx(s.lang, 'modalLabel', { max: MAX_CLUE }) });
      return false;
    case 'clue':
      return giveClue(c, action.user, action.text);
    case 'guess':
      return guess(c, action.user, action.value);
    case 'side':
      return pickSide(c, action.user, action.value);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') {
        c.events.push({ type: 'announce', text: tx(s.lang, 'skipped', { who: mention(psychic(s)) }) });
        nextRound(c);
      } else if (s.phase === 'guess') finishGuess(c);
      else if (s.phase === 'side') reveal(c);
      return true;
    }
  }
}

export function applyWavelength(state: WState | undefined, action: WAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: WState | undefined, host: string, channel: string): Result {
  const created: WState = {
    game: 'wavelength',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    order: [],
    round: 0,
    used: [],
    guesses: {},
    sides: {},
    scores: { orange: 0, purple: 0 },
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
