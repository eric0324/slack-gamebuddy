// 機密代號遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCodenames(state, action, rng) → { state, events }。
import { CODENAMES_WORDS_BY_LANG } from './codenamesWords.js';
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/codenames.js';

export const MIN_CODENAMES_PLAYERS = 4;
export const MAX_CODENAMES_PLAYERS = 12;
const TITLE = '機密代號';
const CLUE_MS = 120_000;
const GUESS_MS = 180_000;

export type CPhase = 'lobby' | 'clue' | 'guess' | 'ended';

export type Team = 'red' | 'blue';
export type CardColor = Team | 'neutral' | 'assassin';

export interface CPlayer {
  id: string;
  team?: Team;
  spymaster?: boolean;
}

export interface Card {
  word: string;
  color: CardColor;
  revealed: boolean;
}

const EMOJI: Record<CardColor, string> = { red: '🟥', blue: '🟦', neutral: '⬜', assassin: '💀' };
const other = (t: Team): Team => (t === 'red' ? 'blue' : 'red');

export interface CState {
  game: 'codenames';
  channel: string;
  host: string;
  phase: CPhase;
  players: CPlayer[];
  cards: Card[];
  startTeam: Team;
  turn: Team;
  clue?: { word: string; count: number };
  guessed: number; // 這回合已經翻了幾張
  winner?: Team;
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type CAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'clue'; user: string; word: string; count: number }
  | { type: 'guess'; user: string; index: number }
  | { type: 'endGuess'; user: string }
  | { type: 'skipTurn'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: CState;
  events: GameEvent[];
}

interface Ctx {
  s: CState;
  events: GameEvent[];
  rng: Rng;
}

const left = (s: CState, team: Team) => s.cards.filter((x) => x.color === team && !x.revealed).length;
const teamName = (s: CState, t: Team) => tx(s.lang, t === 'red' ? 'teamRed' : 'teamBlue');
const sideName = (s: CState, t: Team) => tx(s.lang, t === 'red' ? 'sideRed' : 'sideBlue');
const boardText = (s: CState) => tx(s.lang, 'board', { red: left(s, 'red'), blue: left(s, 'blue') });
// 提示和牌桌上的詞比對：英文不分大小寫
const sameWord = (s: CState, a: string, b: string) => (s.lang === 'en' ? a.toLowerCase() === b.toLowerCase() : a === b);

// 牌桌：5×5 按鈕，翻開的牌加上顏色 emoji 和樣式；reveal 為 true 時全部翻開 (遊戲結束)
function boardEvent(s: CState, reveal = false): GameEvent {
  const buttons = s.cards.map((x, i) => {
    const shown = x.revealed || reveal;
    const style = shown && x.color === 'red' ? 'danger' : shown && x.color === 'blue' ? 'primary' : undefined;
    return { value: String(i), label: shown ? `${EMOJI[x.color]}${x.word}` : x.word, ...(style ? { style } : {}) } as {
      value: string;
      label: string;
      style?: 'primary' | 'danger';
    };
  });
  return {
    type: 'board',
    text: boardText(s),
    rows: Array.from({ length: 5 }, (_, r) => buttons.slice(r * 5, r * 5 + 5)),
  };
}

// 開局：隨機分隊、選隊長、決定先攻，擺牌桌並私訊隊長答案
function deal(c: Ctx) {
  const s = c.s;
  s.startTeam = c.rng() < 0.5 ? 'red' : 'blue';
  s.turn = s.startTeam;
  shuffle(s.players, c.rng).forEach((p, i) => {
    const player = s.players.find((x) => x.id === p.id)!;
    player.team = i % 2 === 0 ? 'red' : 'blue';
    player.spymaster = i < 2;
  });
  const words = shuffle(CODENAMES_WORDS_BY_LANG[s.lang ?? 'zh-TW'], c.rng).slice(0, 25);
  const colors: CardColor[] = [
    ...Array<CardColor>(9).fill(s.startTeam),
    ...Array<CardColor>(8).fill(other(s.startTeam)),
    ...Array<CardColor>(7).fill('neutral'),
    'assassin',
  ];
  const dealt = shuffle(colors, c.rng);
  s.cards = words.map((word, i) => ({ word, color: dealt[i], revealed: false }));
  const roster = (t: Team) => {
    const team = s.players.filter((p) => p.team === t);
    const captain = team.find((p) => p.spymaster)!;
    const members = team.filter((p) => !p.spymaster).map((p) => mention(p.id));
    return tx(s.lang, 'roster', { emoji: EMOJI[t], team: teamName(s, t), captain: mention(captain.id), members: members.join(tx(s.lang, 'sep')) });
  };
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'start', { red: roster('red'), blue: roster('blue'), first: teamName(s, s.startTeam), second: teamName(s, other(s.startTeam)) }),
      gif: 'start',
    },
    boardEvent(s),
  );
  const answer = Array.from({ length: 5 }, (_, r) =>
    s.cards
      .slice(r * 5, r * 5 + 5)
      .map((x) => `${EMOJI[x.color]}${x.word}`)
      .join('　'),
  ).join('\n');
  for (const p of s.players.filter((x) => x.spymaster)) {
    c.events.push({
      type: 'dm',
      to: p.id,
      text: tx(s.lang, 'key', { team: teamName(s, p.team!), answer }),
    });
  }
}

const captainOf = (s: CState, t: Team) => s.players.find((p) => p.team === t && p.spymaster)!.id;

// 回合開始：請目前隊伍的隊長給提示
function startTurn(c: Ctx) {
  const s = c.s;
  s.phase = 'clue';
  s.clue = undefined;
  s.guessed = 0;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'turn', { emoji: EMOJI[s.turn], team: teamName(s, s.turn), captain: mention(captainOf(s, s.turn)), min: CLUE_MS / 60_000, board: boardText(s) }),
  });
  startTimer(c, CLUE_MS);
}

function endTurn(c: Ctx) {
  c.s.turn = other(c.s.turn);
  startTurn(c);
}

function giveClue(c: Ctx, user: string, word: string, count: number): boolean {
  const s = c.s;
  if (s.phase !== 'clue' || user !== captainOf(s, s.turn)) return reply(c, user, tx(s.lang, 'notClueTime'));
  if (!word || /\s/.test(word)) return reply(c, user, tx(s.lang, 'oneWord'));
  if (s.cards.some((x) => !x.revealed && sameWord(s, x.word, word))) return reply(c, user, tx(s.lang, 'onBoard'));
  if (!Number.isInteger(count) || count < 1 || count > 9) return reply(c, user, tx(s.lang, 'countRange'));
  s.phase = 'guess';
  s.clue = { word, count };
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'clueGiven', { team: teamName(s, s.turn), side: sideName(s, s.turn), word, count, max: count + 1, min: GUESS_MS / 60_000 }),
  });
  c.events.push({ type: 'prompt', kind: 'endGuess', audience: 'channel', text: tx(s.lang, 'endPrompt'), options: [{ value: 'end', label: tx(s.lang, 'endButton') }] });
  startTimer(c, GUESS_MS);
  return true;
}

const COLOR_KEY = { red: 'colorRed', blue: 'colorBlue', neutral: 'colorNeutral', assassin: 'colorAssassin' } as const;

// 翻牌：自己隊的牌可以繼續猜 (最多提示數字＋1 張)，其他顏色回合結束
function guessCard(c: Ctx, user: string, index: number): boolean {
  const s = c.s;
  const card = s.cards[index];
  if (!card || card.revealed) return false;
  const p = s.players.find((x) => x.id === user);
  if (!p) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'guess') return reply(c, user, tx(s.lang, 'notGuessTime'));
  if (p.spymaster) return reply(c, user, tx(s.lang, 'spymasterNoGuess'));
  if (p.team !== s.turn) return reply(c, user, tx(s.lang, 'notYourTeam'));
  card.revealed = true;
  s.guessed++;
  c.events.push({ type: 'announce', text: tx(s.lang, 'revealed', { who: mention(user), word: card.word, color: tx(s.lang, COLOR_KEY[card.color]) }) });
  if (card.color === 'assassin') {
    c.events.push({ type: 'announce', text: tx(s.lang, 'assassin', { team: teamName(s, s.turn) }) });
    endGame(c, other(s.turn));
    return true;
  }
  const done = (['red', 'blue'] as Team[]).find((t) => left(s, t) === 0);
  if (done) {
    endGame(c, done);
    return true;
  }
  c.events.push(boardEvent(s));
  if (card.color !== s.turn) endTurn(c);
  else if (s.guessed >= s.clue!.count + 1) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'maxGuesses', { n: s.guessed }) });
    endTurn(c);
  }
  return true;
}

// 結束：牌桌全部翻開，公告獲勝隊伍和兩隊成員
function endGame(c: Ctx, winner: Team) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const members = (t: Team) =>
    tx(s.lang, 'members', {
      emoji: EMOJI[t],
      team: teamName(s, t),
      list: s.players
        .filter((p) => p.team === t)
        .map((p) => `${mention(p.id)}${p.spymaster ? tx(s.lang, 'spymasterTag') : ''}`)
        .join(tx(s.lang, 'sep')),
    });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.team === winner).map((p) => p.id) });
  c.events.push(
    boardEvent(s, true),
    { type: 'announce', text: tx(s.lang, 'win', { team: teamName(s, winner), red: members('red'), blue: members('blue') }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CODENAMES_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CODENAMES_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_CODENAMES_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      deal(c);
      startTurn(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'clue':
      return giveClue(c, action.user, action.word, action.count);
    case 'guess':
      return guessCard(c, action.user, action.index);
    case 'endGuess': {
      if (s.phase !== 'guess') return false;
      const p = s.players.find((x) => x.id === action.user);
      if (!p || p.spymaster || p.team !== s.turn) return reply(c, action.user, tx(s.lang, 'onlyTeamEnd'));
      if (s.guessed === 0) return reply(c, action.user, tx(s.lang, 'guessFirst'));
      c.events.push({ type: 'announce', text: tx(s.lang, 'endedGuess', { team: teamName(s, s.turn) }) });
      endTurn(c);
      return true;
    }
    case 'skipTurn': {
      if (s.phase !== 'clue' && s.phase !== 'guess') return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSkip'));
      c.events.push({ type: 'announce', text: tx(s.lang, 'skipped', { team: teamName(s, s.turn) }) });
      endTurn(c);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      const key = s.phase === 'clue' ? 'timeoutClue' : 'timeoutGuess';
      c.events.push({ type: 'announce', text: tx(s.lang, key, { team: teamName(s, s.turn), side: sideName(s, s.turn) }) });
      endTurn(c);
      return true;
    }
  }
}

export function applyCodenames(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'codenames',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    cards: [],
    startTeam: 'red',
    turn: 'red',
    guessed: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
