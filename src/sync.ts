// 默契問答 (In Sync) 遊戲引擎：純邏輯，不碰任何 I/O。10 題選擇題，大家各選一個一起揭曉，看有幾題全員選到一起。
// 介面和其他遊戲一樣：applySync(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { SYNC_THEMES, themeIds, type ThemeKey } from './syncQuestions.js';
import { syncQuestion, themeName } from './syncQuestionsEn.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/sync.js';

export const MIN_SYNC_PLAYERS = 2;
export const MAX_SYNC_PLAYERS = 8;
const TITLE = '默契問答';
const ROUNDS = 10;
const THEME_MS = 30_000;
const ANSWER_MS = 60_000;

type Pick = { user: string; option: number };

export interface SyncState {
  game: 'sync';
  channel: string;
  host: string;
  phase: 'lobby' | 'theme' | 'answer' | 'ended';
  players: { id: string }[];
  theme?: ThemeKey;
  decks: Partial<Record<ThemeKey, number[]>>; // 各主題還沒抽的題目 (SYNC_QUESTIONS 的 index)，跨局沿用
  question?: number;
  round: number; // 第幾題 (1 起算)
  picks: Pick[]; // 這一題，依作答順序
  history: { question: number; picks: Pick[] }[]; // 已揭曉的題目
  same: number; // 全員同選的題數
  score?: number; // 正常結束才有 (取消的沒有)
  seq: number; // 面板 ref，也用來擋掉舊按鈕
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type SyncAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'theme'; user: string; seq?: number; theme?: ThemeKey; name?: string } // 按鈕帶 seq＋theme；指令帶名稱
  | { type: 'pick'; user: string; option: number; seq?: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<SyncAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SyncState; events: GameEvent[] };
type Ctx = { s: SyncState; events: GameEvent[]; rng: Rng };

const isPlayer = (s: SyncState, id: string) => s.players.some((p) => p.id === id);
const question = (s: SyncState, id = s.question!) => syncQuestion(s.lang, id);
const who = (ids: string[]) => ids.map(mention).join(' ');

function board(s: SyncState): GameEvent {
  const waiting = s.players.filter((p) => !s.picks.some((x) => x.user === p.id));
  const { q, options } = question(s);
  return {
    type: 'prompt',
    kind: 'sync',
    audience: 'channel',
    ref: `sync:${s.seq}`,
    text: [
      tx(s.lang, 'boardQuestion', { round: s.round, max: ROUNDS, question: q }),
      tx(s.lang, 'boardHint', { sec: ANSWER_MS / 1000 }),
      tx(s.lang, 'boardCount', { done: s.picks.length, total: s.players.length }) +
        (waiting.length ? tx(s.lang, 'boardWaiting', { who: who(waiting.map((p) => p.id)) }) : ''),
    ].join('\n'),
    options: options.map((label, i) => ({ value: `pick:${s.seq}:${i}`, label })),
  };
}

function nextQuestion(c: Ctx) {
  const s = c.s;
  const theme = s.theme!;
  if (!s.decks[theme]?.length) s.decks[theme] = shuffle(themeIds(theme), c.rng);
  s.question = s.decks[theme]!.shift()!;
  s.round++;
  s.seq++;
  s.phase = 'answer';
  s.picks = [];
  c.events.push(board(s));
  startTimer(c, ANSWER_MS);
}

function chooseTheme(c: Ctx, theme: ThemeKey) {
  const s = c.s;
  s.theme = theme;
  c.events.push({ type: 'announce', text: tx(s.lang, 'themeChosen', { theme: themeName(s.lang, theme) }) });
  nextQuestion(c);
}

function reveal(c: Ctx) {
  const s = c.s;
  const { q, options } = question(s);
  const missing = s.players.filter((p) => !s.picks.some((x) => x.user === p.id)).map((p) => p.id);
  const byOption = (i: number) => s.players.filter((p) => s.picks.some((x) => x.user === p.id && x.option === i)).map((p) => p.id);
  const all = !missing.length && new Set(s.picks.map((x) => x.option)).size === 1;
  if (all) s.same++;
  s.history.push({ question: s.question!, picks: s.picks });
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'revealTitle', { round: s.round, question: q }),
      ...options.map((o, i) => tx(s.lang, 'optionLine', { option: o, who: byOption(i).length ? who(byOption(i)) : '—' })),
      ...(missing.length ? [tx(s.lang, 'missing', { who: who(missing) })] : []),
      ...(all ? [tx(s.lang, 'allSame')] : []),
    ].join('\n'),
  });
  if (s.round >= ROUNDS) endGame(c);
  else nextQuestion(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.score = s.same;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: s.score });
  const ids = s.players.map((p) => p.id);
  const pairs = ids
    .flatMap((a, i) => ids.slice(i + 1).map((b) => ({ a, b, n: s.history.filter((h) => { const x = h.picks.find((p) => p.user === a); const y = h.picks.find((p) => p.user === b); return x && y && x.option === y.option; }).length })))
    .sort((x, y) => y.n - x.n);
  const record = s.history.map((h, i) => {
    const { q, options } = question(s, h.question);
    const parts = options.flatMap((o, j) => {
      const users = ids.filter((id) => h.picks.some((p) => p.user === id && p.option === j));
      return users.length ? [`${o} ${who(users)}`] : [];
    });
    return tx(s.lang, 'recordLine', { n: i + 1, question: q, parts: parts.join(' / ') || '—' });
  });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'endTitle'),
        tx(s.lang, 'endSame', { n: s.same, max: ROUNDS }),
        tx(s.lang, 'pairTitle'),
        ...pairs.map((p) => tx(s.lang, 'pairLine', { a: mention(p.a), b: mention(p.b), n: p.n })),
      ].join('\n'),
      gif: s.same > 0 ? 'goodWin' : undefined,
    },
    { type: 'announce', text: [tx(s.lang, 'recordTitle'), ...record].join('\n') },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function pick(c: Ctx, user: string, option: number, seq?: number): boolean {
  const s = c.s;
  if (seq !== undefined && seq !== s.seq) return false;
  if (!isPlayer(s, user)) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'answer') return reply(c, user, tx(s.lang, 'notAnswerTime'));
  if (s.picks.some((x) => x.user === user)) return reply(c, user, tx(s.lang, 'alreadyPicked'));
  const label = question(s).options[option];
  if (label === undefined) return reply(c, user, tx(s.lang, 'noOption'));
  s.picks.push({ user, option });
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'picked', { option: label }) });
  if (s.picks.length === s.players.length) reveal(c);
  else c.events.push(board(s));
  return true;
}

function theme(c: Ctx, user: string, seq?: number, key?: ThemeKey, name?: string): boolean {
  const s = c.s;
  if (seq !== undefined && seq !== s.seq) return false;
  if (s.phase !== 'theme') return reply(c, user, tx(s.lang, 'notThemeTime'));
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostTheme'));
  const wanted = name?.trim().toLowerCase();
  const chosen = key ?? SYNC_THEMES.find((t) => themeName(s.lang, t).toLowerCase() === wanted);
  if (!chosen || !SYNC_THEMES.includes(chosen)) {
    return reply(c, user, tx(s.lang, 'unknownTheme', { themes: SYNC_THEMES.map((t) => themeName(s.lang, t)).join(tx(s.lang, 'sep')) }));
  }
  chooseTheme(c, chosen);
  return true;
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_SYNC_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_SYNC_PLAYERS }));
  s.phase = 'theme';
  s.seq++;
  c.events.push(lobbyEvent(TITLE, s));
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'rulesStart', { players: s.players.map((p) => mention(p.id)).join(tx(s.lang, 'sep')) }),
      tx(s.lang, 'rulesPick', { sec: ANSWER_MS / 1000 }),
      tx(s.lang, 'rulesSame', { max: ROUNDS }),
    ].join('\n'),
    gif: 'start',
  });
  c.events.push({
    type: 'prompt',
    kind: 'sync',
    audience: 'channel',
    text: tx(s.lang, 'themeAsk', { host: mention(s.host), sec: THEME_MS / 1000 }),
    options: SYNC_THEMES.map((t) => ({ value: `theme:${s.seq}:${t}`, label: themeName(s.lang, t) })),
  });
  startTimer(c, THEME_MS);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SYNC_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'theme':
      return theme(c, action.user, action.seq, action.theme, action.name);
    case 'pick':
      return pick(c, action.user, action.option, action.seq);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'theme') chooseTheme(c, 'mix');
      else if (c.s.phase === 'answer') reveal(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id });

export function applySync(state: SyncState | undefined, action: SyncAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => s.score !== undefined,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: SyncState | undefined, host: string, channel: string): Result {
  const created: SyncState = {
    game: 'sync',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    decks: prev?.decks ?? {}, // 接著上一局剩下的題目抽，同一頻道同主題跨局不重複
    round: 0,
    picks: [],
    history: [],
    same: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
