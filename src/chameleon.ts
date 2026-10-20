// 變色龍遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyChameleon(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, startTimer } from './common.js';
import { CHAMELEON_CARDS } from './chameleonCards.js';
import { CHAMELEON_CARDS_EN } from './chameleonCardsEn.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/chameleon.js';

export const MIN_CHAMELEON_PLAYERS = 3;
export const MAX_CHAMELEON_PLAYERS = 8;
const TITLE = '變色龍';
const STEP_MS = 120_000; // 說詞、討論、投票、猜詞都是 2 分鐘
const MAX_WORD = 20;

export type CPhase = 'lobby' | 'speak' | 'discuss' | 'vote' | 'guess' | 'ended';

export interface CState {
  game: 'chameleon';
  channel: string;
  host: string;
  phase: CPhase;
  players: { id: string }[];
  topic?: string;
  words?: string[]; // 16 個，index 0～15 對應 A1～D4
  secret?: number; // 祕密詞的格子編號
  chameleon?: string;
  order: string[]; // 說詞順序，order[0] 是起始玩家
  turn: number;
  said: Record<string, string>; // 玩家 → 說的詞
  votes: Record<string, string>; // 投票者 → 被投的人
  finished?: boolean; // 正常結束 (取消的沒有)→ 可以再來一局
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
  | { type: 'openSay'; user: string } // 按「✍️ 說詞」→ 開視窗
  | { type: 'say'; user: string; text: string } // 視窗送出或 `/game chameleon say <詞>`
  | { type: 'next'; user: string } // 房主跳過目前的說詞者
  | { type: 'startVote'; user: string } // 房主提早投票
  | { type: 'vote'; user: string; target: string }
  | { type: 'guess'; user: string; cell?: number; text?: string } // 按鈕帶格子編號，指令帶詞或座標
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

const pickIndex = (n: number, rng: Rng) => Math.min(n - 1, Math.floor(rng() * n));
export const coord = (i: number) => `${'ABCD'[Math.floor(i / 4)]}${(i % 4) + 1}`;
const cell = (s: CState, i: number) => tx(s.lang, 'cell', { coord: coord(i), word: s.words![i] });
// 主題卡依這局的語系
const CARDS: Record<Lang, typeof CHAMELEON_CARDS> = { 'zh-TW': CHAMELEON_CARDS, en: CHAMELEON_CARDS_EN };

const grid = (s: CState) =>
  [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => `${coord(r * 4 + k)} ${s.words![r * 4 + k]}`).join(tx(s.lang, 'gridSep'))).join('\n');

// 開局：抽主題卡、擲骰決定祕密詞、選變色龍和起始玩家，私訊身分
function deal(c: Ctx) {
  const s = c.s;
  const cards = CARDS[s.lang ?? 'zh-TW'];
  const card = cards[pickIndex(cards.length, c.rng)];
  s.topic = card.topic;
  s.words = [...card.words];
  s.secret = pickIndex(16, c.rng);
  s.chameleon = s.players[pickIndex(s.players.length, c.rng)].id;
  const first = pickIndex(s.players.length, c.rng);
  s.order = s.players.map((_, i) => s.players[(first + i) % s.players.length].id);
  s.turn = 0;
  s.said = {};
  s.votes = {};
  s.phase = 'speak';
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'start', { n: s.players.length }),
      tx(s.lang, 'topic', { topic: s.topic }),
      '```',
      grid(s),
      '```',
      tx(s.lang, 'order', { order: s.order.map(mention).join(' → ') }),
      tx(s.lang, 'rule', { min: STEP_MS / 60_000 }),
    ].join('\n'),
    gif: 'start',
  });
  for (const { id } of s.players) {
    const text =
      id === s.chameleon ? tx(s.lang, 'chameleonDm') : tx(s.lang, 'secretDm', { cell: cell(s, s.secret) });
    c.events.push({ type: 'dm', to: id, text });
  }
  promptSpeaker(c);
}

function promptSpeaker(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'chameleon',
    audience: 'channel',
    text: tx(s.lang, 'speakPrompt', { who: mention(s.order[s.turn]), min: STEP_MS / 60_000 }),
    options: [{ value: 'say', label: tx(s.lang, 'sayButton') }],
  });
  startTimer(c, STEP_MS);
}

const inGame = (s: CState, id: string) => s.players.some((p) => p.id === id);
const norm = (t: string) => t.trim().toLowerCase();

function speak(c: Ctx, user: string, raw: string): boolean {
  const s = c.s;
  if (s.phase !== 'speak') return reply(c, user, tx(s.lang, 'notSpeakTime'));
  if (user !== s.order[s.turn]) return reply(c, user, tx(s.lang, 'notYourTurn'));
  const text = raw.trim();
  const len = [...text].length;
  if (len < 1 || len > MAX_WORD) return reply(c, user, tx(s.lang, 'wordLength', { max: MAX_WORD }));
  if (s.words!.some((w) => norm(w) === norm(text))) return reply(c, user, tx(s.lang, 'onCard'));
  s.said[user] = text;
  c.events.push({ type: 'announce', text: tx(s.lang, 'said', { who: mention(user), word: text }) });
  nextSpeaker(c);
  return true;
}

function nextSpeaker(c: Ctx) {
  const s = c.s;
  s.turn++;
  if (s.turn < s.order.length) return promptSpeaker(c);
  s.phase = 'discuss';
  c.events.push(
    { type: 'announce', text: [tx(s.lang, 'saidHeader'), ...saidLines(s)].join('\n') },
    {
      type: 'prompt',
      kind: 'chameleon',
      audience: 'channel',
      text: tx(s.lang, 'discuss', { min: STEP_MS / 60_000 }),
      options: [{ value: 'startVote', label: tx(s.lang, 'voteButton') }],
    },
  );
  startTimer(c, STEP_MS);
}

const saidLines = (s: CState) => s.order.map((id) => tx(s.lang, 'saidLine', { who: mention(id), word: s.said[id] ?? tx(s.lang, 'noWord') }));

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.votes = {};
  c.events.push({
    type: 'prompt',
    kind: 'chameleon',
    audience: 'channel',
    text: tx(s.lang, 'vote', { min: STEP_MS / 60_000 }),
    options: s.players.map((p) => ({ value: `vote:${p.id}`, label: p.id })),
  });
  startTimer(c, STEP_MS);
}

function castVote(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (!inGame(s, user)) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'vote') return reply(c, user, tx(s.lang, 'notVoteTime'));
  if (target === user) return reply(c, user, tx(s.lang, 'noSelfVote'));
  if (!inGame(s, target)) return false;
  s.votes[user] = target;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youVoted', { who: mention(target) }) });
  if (s.players.every((p) => s.votes[p.id])) endVote(c);
  return true;
}

// 得票最多的只有 1 人就指認他；平手時看起始玩家投的人在不在同票名單裡
function accused(s: CState): string | undefined {
  const tally = new Map<string, number>();
  for (const t of Object.values(s.votes)) tally.set(t, (tally.get(t) ?? 0) + 1);
  const max = Math.max(0, ...tally.values());
  const top = [...tally].filter(([, k]) => k === max).map(([id]) => id);
  if (top.length === 1) return top[0];
  const pick = s.votes[s.order[0]];
  return pick && top.includes(pick) ? pick : undefined;
}

function endVote(c: Ctx) {
  const s = c.s;
  const lines = s.players.map((p) => `${mention(p.id)} → ${s.votes[p.id] ? mention(s.votes[p.id]) : tx(s.lang, 'noVote')}`);
  const who = accused(s);
  const verdict = who ? tx(s.lang, 'accused', { who: mention(who) }) : tx(s.lang, 'noAccused');
  if (!who || who !== s.chameleon) {
    return endGame(c, [tx(s.lang, 'voteHeader'), ...lines, verdict, tx(s.lang, 'escaped', { who: mention(s.chameleon!) })], [s.chameleon!]);
  }
  s.phase = 'guess';
  c.events.push(
    { type: 'announce', text: [tx(s.lang, 'voteHeader'), ...lines, verdict, tx(s.lang, 'caught', { who: mention(who), min: STEP_MS / 60_000 })].join('\n') },
    {
      type: 'prompt',
      kind: 'chameleon',
      audience: 'channel',
      text: tx(s.lang, 'guessPrompt', { who: mention(who) }),
      options: s.words!.map((w, i) => ({ value: `guess:${i}`, label: `${coord(i)} ${w}` })),
      perRow: 4,
    },
  );
  startTimer(c, STEP_MS);
}

function guess(c: Ctx, user: string, cellIdx?: number, text?: string): boolean {
  const s = c.s;
  if (user !== s.chameleon) return reply(c, user, tx(s.lang, 'onlyChameleon'));
  if (s.phase !== 'guess') return reply(c, user, tx(s.lang, 'notGuessTime'));
  let i = cellIdx;
  if (i === undefined) {
    const t = (text ?? '').trim();
    const m = /^([A-D])([1-4])$/i.exec(t);
    i = m ? 'ABCD'.indexOf(m[1].toUpperCase()) * 4 + Number(m[2]) - 1 : s.words!.findIndex((w) => norm(w) === norm(t));
    if (i < 0) return reply(c, user, tx(s.lang, 'notOnCard', { word: t }));
  }
  if (!Number.isInteger(i) || i < 0 || i > 15) return false;
  const result =
    i === s.secret
      ? tx(s.lang, 'guessRight', { who: mention(user) })
      : tx(s.lang, 'guessWrong', { cell: cell(s, i) });
  endGame(c, [result], i === s.secret ? [user] : others(s));
  return true;
}

// 變色龍以外的所有人
const others = (s: CState) => s.players.map((p) => p.id).filter((id) => id !== s.chameleon);

function endGame(c: Ctx, lines: string[], winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.finished = true;
  s.timers = {};
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'gameOver'),
        ...lines,
        tx(s.lang, 'secret', { cell: cell(s, s.secret!) }),
        tx(s.lang, 'chameleon', { who: mention(s.chameleon!) }),
        tx(s.lang, 'saidFooter'),
        ...saidLines(s),
      ].join('\n'),
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_CHAMELEON_PLAYERS, (id) => ({ id }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_CHAMELEON_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_CHAMELEON_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'speak' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user, s.chameleon ? tx(s.lang, 'cancelReveal', { cell: cell(s, s.secret!), who: mention(s.chameleon) }) : '');
    case 'openSay':
      if (s.phase !== 'speak') return reply(c, action.user, tx(s.lang, 'notSpeakTime'));
      if (action.user !== s.order[s.turn]) return reply(c, action.user, tx(s.lang, 'notYourTurn'));
      c.events.push({ type: 'modal', to: action.user, kind: 'chameleonWord', title: tx(s.lang, 'modalTitle'), label: tx(s.lang, 'modalLabel', { max: MAX_WORD }) });
      return false;
    case 'say':
      return speak(c, action.user, action.text);
    case 'next':
      if (s.phase !== 'speak') return reply(c, action.user, tx(s.lang, 'notSpeakTime'));
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostSkip'));
      c.events.push({ type: 'announce', text: tx(s.lang, 'skipped', { who: mention(s.order[s.turn]) }) });
      nextSpeaker(c);
      return true;
    case 'startVote':
      if (s.phase !== 'discuss') return reply(c, action.user, tx(s.lang, 'notDiscussTime'));
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostVote'));
      startVote(c);
      return true;
    case 'vote':
      return castVote(c, action.user, action.target);
    case 'guess':
      return guess(c, action.user, action.cell, action.text);
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'speak') {
        c.events.push({ type: 'announce', text: tx(s.lang, 'timeoutSpeak', { who: mention(s.order[s.turn]) }) });
        nextSpeaker(c);
      } else if (s.phase === 'discuss') startVote(c);
      else if (s.phase === 'vote') endVote(c);
      else if (s.phase === 'guess') endGame(c, [tx(s.lang, 'timeoutGuess')], others(s));
      return true;
    }
  }
}

export function applyChameleon(state: CState | undefined, action: CAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.finished,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: CState | undefined, host: string, channel: string): Result {
  const created: CState = {
    game: 'chameleon',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host }],
    order: [],
    turn: 0,
    said: {},
    votes: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
