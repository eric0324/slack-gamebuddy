// 截碼戰遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyDecrypto(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { DECRYPTO_WORDS_BY_LANG } from './decryptoWords.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/decrypto.js';

export const MIN_DECRYPTO_PLAYERS = 4;
export const MAX_DECRYPTO_PLAYERS = 12;
const TITLE = '截碼戰';
const PHASE_MS = 180_000;
const MAX_CLUE = 30;
const MAX_ROUNDS = 8;

export type DPhase = 'lobby' | 'clue' | 'vote' | 'ended';
export type Team = 'black' | 'white';
type Mode = 'decode' | 'intercept';

const TEAMS: Team[] = ['black', 'white'];
const other = (t: Team): Team => (t === 'black' ? 'white' : 'black');

// 1～4 取 3 個不重複數字的所有排列 (24 組)，依字典順序
const CODES = [1, 2, 3, 4].flatMap((a) => [1, 2, 3, 4].flatMap((b) => [1, 2, 3, 4].map((c) => [a, b, c])))
  .filter(([a, b, c]) => a !== b && b !== c && a !== c)
  .map((x) => x.join(''));
const fmt = (code: string) => code.split('').join('-');

export interface DPlayer {
  id: string;
  team?: Team;
}

export interface DTeam {
  words: string[];
  order: string[]; // 加密者順序
  code?: number[];
  clues?: string[];
  history: string[][]; // history[i]：編號 i+1 下用過的提示
  miss: number;
  intercept: number;
}

export interface DState {
  game: 'decrypto';
  channel: string;
  host: string;
  phase: DPhase;
  players: DPlayer[];
  round: number; // 從 0 開始
  teams: Record<Team, DTeam>;
  decodeVotes: Record<string, string>;
  interceptVotes: Record<string, string>;
  winner?: Team | 'tie';
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type DAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openClue'; user: string }
  | { type: 'clue'; user: string; texts: string[] }
  | { type: 'voteMenu'; user: string; mode: Mode }
  | { type: 'vote'; user: string; mode: Mode; round: number; code: string }
  | { type: 'history'; user: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<DAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: DState;
  events: GameEvent[];
}

interface Ctx {
  s: DState;
  events: GameEvent[];
  rng: Rng;
}

const emptyTeam = (): DTeam => ({ words: [], order: [], history: [[], [], [], []], miss: 0, intercept: 0 });
const teamOf = (s: DState, id: string) => s.players.find((p) => p.id === id)?.team;
const encryptor = (s: DState, t: Team) => s.teams[t].order[s.round % s.teams[t].order.length];
const decoders = (s: DState, t: Team) => s.teams[t].order.filter((id) => id !== encryptor(s, t));
const teamName = (s: DState, t: Team) => tx(s.lang, t === 'black' ? 'teamBlack' : 'teamWhite');
const tokens = (s: DState) =>
  TEAMS.map((t) => tx(s.lang, 'tokens', { team: teamName(s, t), intercept: s.teams[t].intercept, miss: s.teams[t].miss })).join(tx(s.lang, 'tokensSep'));
const clueLine = (s: DState, t: Team) => {
  const cl = s.teams[t].clues;
  return tx(s.lang, 'clueLine', { team: teamName(s, t), encryptor: mention(encryptor(s, t)), clues: cl ? cl.join(' → ') : tx(s.lang, 'noClues') });
};

// 開局：隨機分隊，每隊 4 個祕密詞，私訊給隊員
function deal(c: Ctx) {
  const s = c.s;
  const shuffled = shuffle(s.players, c.rng);
  shuffled.forEach((p, i) => (s.players.find((x) => x.id === p.id)!.team = i % 2 === 0 ? 'black' : 'white'));
  const words = shuffle(DECRYPTO_WORDS_BY_LANG[s.lang ?? 'zh-TW'], c.rng);
  TEAMS.forEach((t, i) => {
    s.teams[t].words = words.slice(i * 4, i * 4 + 4);
    s.teams[t].order = shuffled.filter((p) => teamOf(s, p.id) === t).map((p) => p.id);
  });
  const roster = (t: Team) => tx(s.lang, 'roster', { team: teamName(s, t), list: s.teams[t].order.map(mention).join(tx(s.lang, 'sep')) });
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { max: MAX_ROUNDS, black: roster('black'), white: roster('white') }),
    gif: 'start',
  });
  for (const t of TEAMS) {
    const list = s.teams[t].words.map((w, i) => `${i + 1} ${w}`).join('\n');
    for (const id of s.teams[t].order) c.events.push({ type: 'dm', to: id, text: tx(s.lang, 'wordsDm', { team: teamName(s, t), list }) });
  }
  startRound(c);
}

// 每回合開始：兩隊各抽一組密碼，私訊加密者
function startRound(c: Ctx) {
  const s = c.s;
  s.phase = 'clue';
  s.decodeVotes = {};
  s.interceptVotes = {};
  for (const t of TEAMS) {
    const team = s.teams[t];
    team.code = shuffle([1, 2, 3, 4], c.rng).slice(0, 3);
    team.clues = undefined;
    const hint = team.code.map((n) => `${n} ${team.words[n - 1]}`).join(' → ');
    c.events.push({
      type: 'dm',
      to: encryptor(s, t),
      text: tx(s.lang, 'codeDm', { round: s.round + 1, code: team.code.join('-'), hint }),
    });
  }
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'roundStart', {
        round: s.round + 1,
        max: MAX_ROUNDS,
        encryptors: TEAMS.map((t) => tx(s.lang, 'encryptorItem', { team: teamName(s, t), who: mention(encryptor(s, t)) })).join(tx(s.lang, 'sep')),
        min: PHASE_MS / 60_000,
        tokens: tokens(s),
      }),
    },
    {
      type: 'prompt',
      kind: 'decrypto',
      audience: 'channel',
      text: tx(s.lang, 'cluePrompt'),
      options: [
        { value: 'clue', label: tx(s.lang, 'clueButton') },
        { value: 'history', label: tx(s.lang, 'historyButton') },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function giveClue(c: Ctx, user: string, texts: string[]): boolean {
  const s = c.s;
  const t = teamOf(s, user);
  if (s.phase !== 'clue' || !t || encryptor(s, t) !== user) return reply(c, user, tx(s.lang, 'notEncryptor'));
  const clean = texts.map((x) => x.trim());
  if (clean.length !== 3 || clean.some((x) => !x || [...x].length > MAX_CLUE)) {
    return reply(c, user, tx(s.lang, 'clueRule', { max: MAX_CLUE }));
  }
  s.teams[t].clues = clean;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'clueSent', { clues: clean.join(' → ') }) });
  if (TEAMS.every((x) => s.teams[x].clues)) startVote(c);
  return true;
}

// 兩隊提示一起公開，開始投票
function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  const steal = s.round > 0;
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'cluesHeader', { round: s.round + 1 }),
        ...TEAMS.map((t) => clueLine(s, t)),
        tx(s.lang, steal ? 'voteHintSteal' : 'voteHintFirst'),
        tx(s.lang, 'minutes', { min: PHASE_MS / 60_000 }),
      ].join('\n'),
    },
    {
      type: 'prompt',
      kind: 'decrypto',
      audience: 'channel',
      text: tx(s.lang, 'votePrompt'),
      options: [
        { value: 'decode', label: tx(s.lang, 'decodeButton') },
        ...(steal ? [{ value: 'intercept', label: tx(s.lang, 'interceptButton') }] : []),
        { value: 'history', label: tx(s.lang, 'historyButton') },
      ],
    },
  );
  startTimer(c, PHASE_MS);
}

function canVote(s: DState, user: string, mode: Mode) {
  const t = teamOf(s, user);
  if (s.phase !== 'vote' || !t) return tx(s.lang, 'cannotVote');
  if (mode === 'decode' && encryptor(s, t) === user) return tx(s.lang, 'encryptorNoDecode');
  if (mode === 'intercept' && s.round === 0) return tx(s.lang, 'noInterceptFirst');
  return undefined;
}

function voteMenu(c: Ctx, user: string, mode: Mode): boolean {
  const err = canVote(c.s, user, mode);
  if (err) return reply(c, user, err);
  c.events.push({
    type: 'prompt',
    kind: 'decrypto',
    audience: 'ephemeral',
    user,
    text: tx(c.s.lang, mode === 'decode' ? 'decodeMenu' : 'interceptMenu'),
    options: CODES.map((code) => ({ value: `vote:${mode}:${c.s.round}:${code}`, label: fmt(code) })),
    perRow: 6,
  });
  return false;
}

function vote(c: Ctx, user: string, mode: Mode, round: number, code: string): boolean {
  const s = c.s;
  const err = canVote(s, user, mode);
  if (err) return reply(c, user, err);
  if (round !== s.round) return reply(c, user, tx(s.lang, 'oldMenu'));
  if (!CODES.includes(code)) return false;
  (mode === 'decode' ? s.decodeVotes : s.interceptVotes)[user] = code;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youChose', { code: fmt(code) }) });
  const done =
    TEAMS.every((t) => decoders(s, t).every((id) => id in s.decodeVotes)) &&
    (s.round === 0 || s.players.every((p) => p.id in s.interceptVotes));
  if (done) reveal(c);
  return true;
}

// 多數決，平手時從最高票隨機選一組；沒有票回傳 undefined
function majority(c: Ctx, votes: string[]): string | undefined {
  const count = new Map<string, number>();
  for (const v of votes) count.set(v, (count.get(v) ?? 0) + 1);
  const top = Math.max(0, ...count.values());
  const tied = [...count].filter(([, n]) => n === top).map(([v]) => v).sort();
  return tied.length ? tied[Math.floor(c.rng() * tied.length)] : undefined;
}

function reveal(c: Ctx) {
  const s = c.s;
  const lines = [tx(s.lang, 'revealHeader', { round: s.round + 1 })];
  const teamVotes = (t: Team, votes: Record<string, string>) => s.teams[t].order.filter((id) => id in votes).map((id) => votes[id]);
  const answers = TEAMS.map((t) => ({
    t,
    decode: majority(c, teamVotes(t, s.decodeVotes)),
    steal: s.round > 0 ? majority(c, teamVotes(t, s.interceptVotes)) : undefined,
  }));
  for (const { t, decode, steal } of answers) {
    const team = s.teams[t];
    const code = team.code!.join('');
    const ok = decode === code;
    if (!ok) team.miss++;
    let line = tx(s.lang, 'revealLine', {
      team: teamName(s, t),
      code: fmt(code),
      decode: decode ? fmt(decode) : tx(s.lang, 'noVotes'),
      result: tx(s.lang, ok ? 'decodeOk' : 'decodeWrong'),
    });
    if (s.round > 0) {
      const caught = steal === s.teams[other(t)].code!.join('');
      if (caught) team.intercept++;
      line += tx(s.lang, 'interceptPart', {
        other: teamName(s, other(t)),
        steal: steal ? fmt(steal) : tx(s.lang, 'noVotes'),
        result: tx(s.lang, caught ? 'interceptOk' : 'interceptFail'),
      });
    }
    lines.push(line);
    team.code!.forEach((n, i) => team.clues?.[i] && team.history[n - 1].push(team.clues[i]));
  }
  lines.push(tokens(s));
  c.events.push({ type: 'announce', text: lines.join('\n') });
  checkEnd(c);
}

function checkEnd(c: Ctx) {
  const s = c.s;
  const signal = (t: Team) => s.teams[t].intercept >= 2 || s.teams[other(t)].miss >= 2;
  const [b, w] = TEAMS.map(signal);
  if (b !== w) return endGame(c, b ? 'black' : 'white');
  if (b || s.round >= MAX_ROUNDS - 1) {
    const score = (t: Team) => s.teams[t].intercept - s.teams[t].miss;
    return endGame(c, score('black') > score('white') ? 'black' : score('white') > score('black') ? 'white' : 'tie');
  }
  s.round++;
  startRound(c);
}

function endGame(c: Ctx, winner: Team | 'tie') {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const result = winner === 'tie' ? tx(s.lang, 'tie') : tx(s.lang, 'win', { team: teamName(s, winner) });
  const words = TEAMS.map((t) => tx(s.lang, 'wordsLine', { team: teamName(s, t), list: s.teams[t].words.map((x, i) => `${i + 1} ${x}`).join(tx(s.lang, 'sep')) }));
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.team === winner).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: [tx(s.lang, 'gameOver', { result }), tokens(s), ...words].join('\n'), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function history(c: Ctx, user: string): boolean {
  const s = c.s;
  const lines = [tx(s.lang, 'historyHeader')];
  for (const t of TEAMS) {
    lines.push(teamName(s, t), ...s.teams[t].history.map((h, i) => tx(s.lang, 'historyLine', { n: i + 1, clues: h.length ? h.join(tx(s.lang, 'sep')) : '—' })));
  }
  return reply(c, user, lines.join('\n'));
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DECRYPTO_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_DECRYPTO_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_DECRYPTO_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openClue': {
      const t = teamOf(s, action.user);
      if (s.phase !== 'clue' || !t || encryptor(s, t) !== action.user) return reply(c, action.user, tx(s.lang, 'notEncryptor'));
      const code = s.teams[t].code!;
      c.events.push({
        type: 'modal',
        to: action.user,
        kind: 'decryptoClue',
        title: tx(s.lang, 'modalTitle'),
        label: tx(s.lang, 'modalLabel', { code: code.join('-') }),
        fields: code.map((n, i) => tx(s.lang, 'modalField', { i: i + 1, n, word: s.teams[t].words[n - 1] })),
      });
      return false;
    }
    case 'clue':
      return giveClue(c, action.user, action.texts);
    case 'voteMenu':
      return voteMenu(c, action.user, action.mode);
    case 'vote':
      return vote(c, action.user, action.mode, action.round, action.code);
    case 'history':
      if (s.phase === 'lobby') return false;
      return history(c, action.user);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'clue') startVote(c);
      else if (s.phase === 'vote') reveal(c);
      return true;
    }
  }
}

export function applyDecrypto(state: DState | undefined, action: DAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: DState | undefined, host: string, channel: string): Result {
  const created: DState = {
    game: 'decrypto',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    round: 0,
    teams: { black: emptyTeam(), white: emptyTeam() },
    decodeVotes: {},
    interceptVotes: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
