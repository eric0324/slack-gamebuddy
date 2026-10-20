// 誰是臥底遊戲引擎：純邏輯，不碰任何 I/O。介面和狼人殺一樣：applyUndercover(state, action, rng) → { state, events }。
// events 沿用狼人殺的 GameEvent，adapter 的 send() 可以共用。
import { isBot, MAX_PLAYERS, mention, type GameEvent, type GifKey, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle } from './common.js';
import { BLANK_LINES, WORD_PAIRS } from './undercoverWords.js';
import { BLANK_LINES_EN, WORD_PAIRS_EN } from './undercoverWordsEn.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/undercover.js';

export const MIN_UNDERCOVER_PLAYERS = 4;
export const SPEECH_MS = 40_000;
export const VOTE_MS = 60_000;
export const GUESS_MS = 60_000;
const TITLE = '誰是臥底';

export type UPhase = 'lobby' | 'speech' | 'vote' | 'pkSpeech' | 'pkVote' | 'guess' | 'ended';
export type URole = 'civilian' | 'undercover' | 'blank';

const roleName = (s: UState, r: URole) => tx(s.lang, r);

// 詞庫依這局的語系
const PAIRS: Record<Lang, typeof WORD_PAIRS> = { 'zh-TW': WORD_PAIRS, en: WORD_PAIRS_EN };
const BLANKS: Record<Lang, string[]> = { 'zh-TW': BLANK_LINES, en: BLANK_LINES_EN };
const pairsOf = (s: UState) => PAIRS[s.lang ?? 'zh-TW'];

// 人數 → 各身分數量
export const UNDERCOVER_TABLE: Record<number, Record<URole, number>> = {
  4: { civilian: 3, undercover: 1, blank: 0 },
  5: { civilian: 4, undercover: 1, blank: 0 },
  6: { civilian: 4, undercover: 1, blank: 1 },
  7: { civilian: 5, undercover: 1, blank: 1 },
  8: { civilian: 6, undercover: 1, blank: 1 },
  9: { civilian: 6, undercover: 2, blank: 1 },
  10: { civilian: 7, undercover: 2, blank: 1 },
  11: { civilian: 8, undercover: 2, blank: 1 },
  12: { civilian: 9, undercover: 2, blank: 1 },
};

export interface UPlayer {
  id: string;
  alive: boolean;
  role?: URole;
  word?: string;
}

export interface UState {
  game: 'undercover';
  channel: string;
  host: string;
  phase: UPhase;
  players: UPlayer[];
  timerSeq: number;
  timers: { phase?: number };
  words?: { civilian: string; undercover: string };
  round: number;
  speakers: string[]; // 還沒輪到的描述者
  speaker?: string;
  votes: Record<string, string>;
  candidates: string[];
  voters: string[];
  guesser?: string; // 正在猜詞的白板
  usedHints: Record<string, string[]>; // bot 這一局已經說過的描述句
  winner?: 'civilian' | 'undercover';
  lang?: Lang;
}

export type UAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'rematch'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'endSpeech'; user: string }
  | { type: 'skipSpeaker'; user: string }
  | { type: 'endDiscussion'; user: string }
  | { type: 'dayVote'; user: string; target: string } // target 是玩家 id 或 'abstain'
  | { type: 'guess'; user: string; word: string }
  | { type: 'timeout'; id: number };

interface Result {
  state: UState;
  events: GameEvent[];
}

interface Ctx {
  s: UState;
  events: GameEvent[];
  rng: Rng;
}

// 發牌：不洗牌時的順序是臥底、白板、平民
function deal(c: Ctx) {
  const s = c.s;
  const table = UNDERCOVER_TABLE[s.players.length];
  const roles = shuffle(
    (['undercover', 'blank', 'civilian'] as URole[]).flatMap((r) => Array<URole>(table[r]).fill(r)),
    c.rng,
  );
  const pairs = pairsOf(s);
  const pair = pairs[Math.floor(c.rng() * pairs.length)];
  const [civilian, undercover] = c.rng() < 0.5 ? [pair.a.word, pair.b.word] : [pair.b.word, pair.a.word];
  s.words = { civilian, undercover };
  s.players.forEach((p, i) => {
    p.role = roles[i];
    p.word = p.role === 'civilian' ? civilian : p.role === 'undercover' ? undercover : undefined;
  });
  const setup = (['civilian', 'undercover', 'blank'] as URole[])
    .filter((r) => table[r])
    .map((r) => tx(s.lang, 'setupItem', { n: table[r], role: roleName(s, r) }))
    .join(tx(s.lang, 'sep'));
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { players: s.players.map((p) => mention(p.id)).join(' '), setup }),
    gif: 'start',
  });
  for (const p of s.players) {
    const text = p.word ? tx(s.lang, 'yourWord', { word: p.word }) : tx(s.lang, 'youAreBlank');
    c.events.push({ type: 'dm', to: p.id, text });
  }
}

const alive = (s: UState) => s.players.filter((p) => p.alive);

function startTimer(c: Ctx, ms: number) {
  const id = ++c.s.timerSeq;
  c.s.timers = { phase: id };
  c.events.push({ type: 'startTimer', id, ms });
}

// 每一輪：隨機起點，依加入順序輪流描述
function startRound(c: Ctx) {
  const s = c.s;
  s.round += 1;
  const living = alive(s).map((p) => p.id);
  const first = Math.floor(c.rng() * living.length);
  s.phase = 'speech';
  s.speakers = [...living.slice(first), ...living.slice(0, first)];
  c.events.push({ type: 'announce', text: tx(s.lang, 'round', { round: s.round, order: s.speakers.map(mention).join(' → ') }) });
  nextSpeaker(c);
}

function nextSpeaker(c: Ctx) {
  const s = c.s;
  s.timers = {};
  for (let id = s.speakers.shift(); id; id = s.speakers.shift()) {
    s.speaker = id;
    if (isBot(id)) {
      botDescribe(c, id);
      continue;
    }
    c.events.push({
      type: 'prompt',
      kind: 'endSpeech',
      audience: 'channel',
      text: tx(s.lang, 'speakPrompt', { who: mention(id), sec: SPEECH_MS / 1000 }),
      options: [{ value: id, label: tx(s.lang, 'endSpeech') }],
    });
    startTimer(c, SPEECH_MS);
    return;
  }
  s.speaker = undefined;
  if (s.phase === 'pkSpeech') {
    const voters = alive(s).filter((p) => !s.candidates.includes(p.id)).map((p) => p.id);
    openVote(c, 'pkVote', s.candidates, voters);
    return;
  }
  startVote(c);
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const hintsOf = (s: UState, word: string) => pairsOf(s).flatMap(({ a, b }) => [a, b]).find((w) => w.word === word)?.hints ?? [];

// bot 描述：平民和臥底用自己詞的描述句 (盡量不重複)，白板用通用的模糊台詞
function botDescribe(c: Ctx, id: string) {
  const s = c.s;
  const me = s.players.find((p) => p.id === id)!;
  const pool = me.word ? hintsOf(s, me.word) : BLANKS[s.lang ?? 'zh-TW'];
  const used = (s.usedHints[id] ??= []);
  const fresh = pool.filter((h) => !used.includes(h));
  const line = pick(fresh.length ? fresh : pool, c.rng);
  used.push(line);
  c.events.push({ type: 'announce', text: tx(s.lang, 'botSays', { who: mention(id), line }) });
}

// 找出下一個輪到 bot 的行動：投票 (不投自己、不棄票) 或白板猜詞
function nextBotAction(s: UState, rng: Rng): Exclude<UAction, { type: 'new' } | { type: 'rematch' }> | null {
  if (s.phase === 'vote' || s.phase === 'pkVote') {
    const voter = s.voters.find((v) => isBot(v) && !s.votes[v]);
    if (voter) {
      const choices = s.candidates.filter((id) => id !== voter);
      return { type: 'dayVote', user: voter, target: choices.length ? pick(choices, rng) : 'abstain' };
    }
  }
  if (s.phase === 'guess' && s.guesser && isBot(s.guesser)) {
    const others = pairsOf(s).flatMap(({ a, b }) => [a.word, b.word]).filter((w) => w !== s.words!.civilian && w !== s.words!.undercover);
    return { type: 'guess', user: s.guesser, word: pick([s.words!.civilian, s.words!.undercover, pick(others, rng)], rng) };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

function startVote(c: Ctx) {
  const ids = alive(c.s).map((p) => p.id);
  openVote(c, 'vote', ids, ids);
}

function openVote(c: Ctx, phase: 'vote' | 'pkVote', candidates: string[], voters: string[]) {
  const s = c.s;
  s.phase = phase;
  s.votes = {};
  s.candidates = candidates;
  s.voters = voters;
  c.events.push({
    type: 'prompt',
    kind: phase === 'vote' ? 'dayVote' : 'pkVote',
    audience: 'channel',
    text: tx(s.lang, phase === 'vote' ? 'vote' : 'pkVote'),
    options: [...candidates.map((id) => ({ value: id, label: id })), { value: 'abstain', label: tx(s.lang, 'abstain') }],
  });
  startTimer(c, VOTE_MS);
  if (!voters.length) endVote(c);
}

function endVote(c: Ctx) {
  const s = c.s;
  const lines = s.voters.map((v) => {
    const t = s.votes[v] ?? 'abstain';
    return `${mention(v)} → ${t === 'abstain' ? tx(s.lang, 'abstain') : mention(t)}`;
  });
  c.events.push({ type: 'announce', text: tx(s.lang, 'voteResults', { lines: lines.join('\n') }) });
  const tally = new Map<string, number>();
  for (const t of Object.values(s.votes)) if (t !== 'abstain') tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, k]) => k === max).map(([id]) => id);
  if (top.length > 1 && s.phase === 'vote') {
    startPk(c, top);
    return;
  }
  if (top.length !== 1) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'noOneOut') });
    startRound(c);
    return;
  }
  eliminate(c, top[0]);
}

function startPk(c: Ctx, tied: string[]) {
  const s = c.s;
  s.phase = 'pkSpeech';
  s.candidates = tied;
  s.speakers = s.players.map((p) => p.id).filter((id) => tied.includes(id));
  c.events.push({ type: 'announce', text: tx(s.lang, 'pk', { tied: tied.map(mention).join(tx(s.lang, 'sep')) }), gif: 'pk' });
  nextSpeaker(c);
}

// 放逐：公開身分但不公開詞；白板還有一次猜詞機會
function eliminate(c: Ctx, id: string) {
  const s = c.s;
  const p = s.players.find((x) => x.id === id)!;
  p.alive = false;
  const gif: GifKey = p.role === 'undercover' ? 'duelWin' : 'exile';
  // 白板出局後還要猜詞，不會立刻結束
  const ending = p.role !== 'blank' && checkUndercoverWinner(s.players) !== null;
  c.events.push({ type: 'announce', text: tx(s.lang, 'out', { who: mention(id), role: roleName(s, p.role!) }), ...(ending ? {} : { gif }) });
  if (p.role === 'blank') {
    s.phase = 'guess';
    s.guesser = id;
    c.events.push({
      type: 'announce',
      text: tx(s.lang, 'blankGuess', { sec: GUESS_MS / 1000 }),
    });
    startTimer(c, GUESS_MS);
    return;
  }
  continueGame(c, gif);
}

const normalize = (word: string) => word.trim().toLowerCase();

function finishGuess(c: Ctx, word: string | undefined) {
  const s = c.s;
  const guesser = s.guesser!;
  s.guesser = undefined;
  s.timers = {};
  if (word !== undefined && normalize(word) === normalize(s.words!.civilian)) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'guessRight', { who: mention(guesser), word: word.trim() }) });
    endGame(c, 'undercover', 'guessRight');
    return;
  }
  const text = word === undefined ? tx(s.lang, 'noGuess', { who: mention(guesser) }) : tx(s.lang, 'guessWrong', { who: mention(guesser), word: word.trim() });
  const ending = checkUndercoverWinner(s.players) !== null;
  c.events.push({ type: 'announce', text, ...(ending ? {} : { gif: 'guessWrong' as const }) });
  continueGame(c, 'guessWrong');
}

// 臥底全部出局 → 平民勝 (白板活著也一樣)；臥底陣營 (臥底＋白板) ≥ 平民 → 臥底陣營勝
export function checkUndercoverWinner(players: UPlayer[]): 'civilian' | 'undercover' | null {
  const living = players.filter((p) => p.alive);
  if (!living.some((p) => p.role === 'undercover')) return 'civilian';
  const undercoverSide = living.filter((p) => p.role !== 'civilian').length;
  if (undercoverSide >= living.length - undercoverSide) return 'undercover';
  return null;
}

// 放逐 (或白板猜詞) 之後：判斷勝負，沒結束就開始下一輪；gif 是這個時刻的 GIF，結束時改附在結束公告上
function continueGame(c: Ctx, gif?: GifKey) {
  const winner = checkUndercoverWinner(c.s.players);
  if (winner) endGame(c, winner, gif);
  else startRound(c);
}

function endGame(c: Ctx, winner: 'civilian' | 'undercover', gif?: GifKey) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winner = winner;
  const title = tx(s.lang, winner === 'civilian' ? 'civilianWin' : 'undercoverWin');
  const roster = s.players
    .map((p) =>
      tx(s.lang, 'rosterLine', {
        who: mention(p.id),
        role: roleName(s, p.role!),
        word: p.word ? tx(s.lang, 'rosterWord', { word: p.word }) : '',
        status: tx(s.lang, p.alive ? 'alive' : 'dead'),
      }),
    )
    .join('\n');
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => (p.role === 'civilian') === (winner === 'civilian')).map((p) => p.id) });
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'end', { title, civilian: s.words!.civilian, undercover: s.words!.undercover, roster }),
      gif: gif ?? (winner === 'civilian' ? 'goodWin' : 'wolvesWin'),
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

const isSpeaking = (s: UState) => s.phase === 'speech' || s.phase === 'pkSpeech';

function handle(c: Ctx, action: Exclude<UAction, { type: 'new' } | { type: 'rematch' }>): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_PLAYERS, (id) => ({ id, alive: true }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_PLAYERS, (id) => ({ id, alive: true }));
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_UNDERCOVER_PLAYERS) {
        return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_UNDERCOVER_PLAYERS }));
      }
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'speech' }));
      deal(c);
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'endSpeech': {
      if (!isSpeaking(s)) return false;
      if (action.user !== s.speaker) return reply(c, action.user, tx(s.lang, 'notYourTurn'));
      nextSpeaker(c);
      return true;
    }
    case 'skipSpeaker': {
      if (!isSpeaking(s)) return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSkip'));
      nextSpeaker(c);
      return true;
    }
    case 'endDiscussion': {
      if (s.phase !== 'speech') return false;
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostVote'));
      startVote(c);
      return true;
    }
    case 'dayVote': {
      if (s.phase !== 'vote' && s.phase !== 'pkVote') return false;
      const voter = s.players.find((p) => p.id === action.user);
      if (!voter) return false;
      if (!voter.alive) return reply(c, action.user, tx(s.lang, 'outNoVote'));
      if (!s.voters.includes(action.user)) return reply(c, action.user, tx(s.lang, 'pkNoVote'));
      if (action.target !== 'abstain' && !s.candidates.includes(action.target)) return false;
      s.votes[action.user] = action.target;
      const choice = action.target === 'abstain' ? tx(s.lang, 'youAbstained') : tx(s.lang, 'youVoted', { who: mention(action.target) });
      c.events.push({ type: 'ephemeral', to: action.user, text: choice });
      if (s.voters.every((v) => s.votes[v])) endVote(c);
      return true;
    }
    case 'guess': {
      if (s.phase !== 'guess' || action.user !== s.guesser) return reply(c, action.user, tx(s.lang, 'cannotGuess'));
      finishGuess(c, action.word);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (isSpeaking(s)) nextSpeaker(c);
      else if (s.phase === 'vote' || s.phase === 'pkVote') endVote(c);
      else if (s.phase === 'guess') finishGuess(c, undefined);
      else return false;
      return true;
    }
  }
}

export function applyUndercover(state: UState | undefined, action: UAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winner,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: UState | undefined, host: string, channel: string): Result {
  const created: UState = {
    game: 'undercover',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host, alive: true }],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
    round: 0,
    usedHints: {},
    speakers: [],
    votes: {},
    candidates: [],
    voters: [],
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
