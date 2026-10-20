// Emoji 傳話 (傳情畫意的 emoji 版) 遊戲引擎：純邏輯，不碰任何 I/O。每人一條鏈，文字用 emoji 演、emoji 用文字猜，傳一圈後投票。
// 介面和其他遊戲一樣：applyEmoji(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { emojiPrompts } from './emojiPrompts.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/emoji.js';

export const MIN_EMOJI_PLAYERS = 4;
export const MAX_EMOJI_PLAYERS = 10;
export const MAX_EMOJI = 20;
const TITLE = 'Emoji 傳話';
const EMOJI_MS = 90_000;
const GUESS_MS = 60_000;
const VOTE_MS = 90_000;

// 一個 emoji：Slack shortcode、RGI emoji (ZWJ 組合、膚色、國旗、keycap)，或單一 pictographic 字元 (可接 U+FE0F)
const TOKEN = new RegExp(String.raw`:[a-z0-9_+'\-]+:|\p{RGI_Emoji}|\p{Extended_Pictographic}️?`, 'yv');

// 去掉所有空白後全部是 emoji 時回傳個數，否則回傳 null
export function emojiCount(text: string): number | null {
  const t = text.replace(/\s/g, '');
  if (!t) return null;
  let n = 0;
  for (let i = 0; i < t.length; n++) {
    TOKEN.lastIndex = i;
    const m = TOKEN.exec(t);
    if (!m) return null;
    i += m[0].length;
  }
  return n;
}

export function isEmojiOnly(text: string): boolean {
  const n = emojiCount(text);
  return n !== null && n <= MAX_EMOJI;
}

type Kind = 'emoji' | 'guess';
export type Entry = { step: number; by: string; kind: Kind; text?: string }; // text 沒有＝沒交；跳過的不記

export interface EState {
  game: 'emoji';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'vote' | 'ended';
  players: { id: string; score: number }[]; // 順序＝傳遞順序
  deck: number[]; // 還沒發的題目 (EMOJI_PROMPTS 的 index)，同一頻道跨局接續
  chains: { owner: string; prompt: number; entries: Entry[] }[];
  step: number; // 第幾步 (1～steps)
  steps: number;
  pending: Record<string, string>; // 這一步 user → 已交的內容 (截止才寫進 entries)
  votes: Record<string, { emoji?: string; guess?: string }>; // user → 作品編號 `鏈-步`
  seq: number; // 步驟／投票訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type EAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'openSend'; user: string }
  | { type: 'send'; user: string; text: string }
  | { type: 'voteMenu'; user: string; cat: Kind }
  | { type: 'vote'; user: string; seq: number; cat: Kind; tag: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<EAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: EState; events: GameEvent[] };
type Ctx = { s: EState; events: GameEvent[]; rng: Rng };

const isPlayer = (s: EState, id: string) => s.players.some((p) => p.id === id);
const kindOf = (step: number): Kind => (step % 2 ? 'emoji' : 'guess');

const MAX_GUESS = 30;

// 第 step 步這位玩家手上的鏈：第 i 條鏈由第 (i + step − 1) mod N 位作答
function chainOf(s: EState, user: string) {
  const n = s.players.length;
  const j = s.players.findIndex((p) => p.id === user);
  return s.chains[(((j - (s.step - 1)) % n) + n) % n];
}

// 這一步拿到的內容：emoji 步拿最近的文字 (題目或猜測)，猜測步拿最近的 emoji；沒有就是跳過 (null)
function inputOf(s: EState, user: string): string | null {
  const ch = chainOf(s, user);
  const want = kindOf(s.step) === 'emoji' ? 'guess' : 'emoji';
  const last = ch.entries.filter((e) => e.kind === want && e.text !== undefined).at(-1);
  if (last) return last.text!;
  return want === 'guess' ? emojiPrompts(s.lang)[ch.prompt] : null;
}

// 這一步需要作答的玩家 (跳過的不算)
const needed = (s: EState) => s.players.filter((p) => inputOf(s, p.id) !== null).map((p) => p.id);

function stepBoard(s: EState, ended = false): GameEvent {
  const need = needed(s);
  const head = tx(s.lang, 'stepHead', { step: s.step, steps: s.steps });
  return {
    type: 'prompt',
    kind: 'emoji',
    audience: 'channel',
    ref: `emoji:${s.seq}`,
    text: [
      kindOf(s.step) === 'emoji' ? tx(s.lang, 'stepEmoji', { head, sec: EMOJI_MS / 1000 }) : tx(s.lang, 'stepGuess', { head, sec: GUESS_MS / 1000 }),
      ended ? tx(s.lang, 'stepEnded') : tx(s.lang, 'stepHelp'),
      tx(s.lang, 'submitted', { done: need.filter((u) => u in s.pending).length, total: need.length }),
    ].join('\n'),
    options: ended ? [] : [{ value: 'send', label: tx(s.lang, 'answerButton') }],
  };
}

function nextStep(c: Ctx) {
  const s = c.s;
  s.step++;
  s.seq++;
  s.pending = {};
  c.events.push(stepBoard(s));
  startTimer(c, kindOf(s.step) === 'emoji' ? EMOJI_MS : GUESS_MS);
}

// 這一步結束：交的和沒交的寫進鏈 (跳過的不記)；整步沒人交就中止
function endStep(c: Ctx) {
  const s = c.s;
  c.events.push(stepBoard(s, true));
  const need = needed(s);
  if (!need.some((u) => u in s.pending)) {
    s.phase = 'ended';
    s.timers = {};
    c.events.push({ type: 'announce', text: tx(s.lang, 'nobodySubmitted') });
    return;
  }
  for (const by of need) chainOf(s, by).entries.push({ step: s.step, by, kind: kindOf(s.step), ...(by in s.pending ? { text: s.pending[by] } : {}) });
  if (s.step < s.steps) nextStep(c);
  else showChains(c);
}

const ICON: Record<Kind, string> = { emoji: '🎨', guess: '🧠' };
const cat = (s: EState, k: Kind) => tx(s.lang, k === 'emoji' ? 'catEmoji' : 'catGuess');
type Work = { tag: string; kind: Kind; by: string; text: string };

// 有交的作品，依鏈、步驟排序；tag 是 `鏈-步`
const works = (s: EState): Work[] =>
  s.chains.flatMap((ch, i) => ch.entries.flatMap((e) => (e.text === undefined ? [] : [{ tag: `${i + 1}-${e.step}`, kind: e.kind, by: e.by, text: e.text }])));
const votable = (s: EState, user: string, cat: Kind) => works(s).filter((w) => w.kind === cat && w.by !== user);
// 兩類都投了 (沒有可以投的作品的那一類視為已投)
const doneVoting = (s: EState, user: string) => (['emoji', 'guess'] as const).every((cat) => s.votes[user]?.[cat] || !votable(s, user, cat).length);

function voteBoard(s: EState, ended = false): GameEvent {
  const done = s.players.filter((p) => doneVoting(s, p.id)).length;
  return {
    type: 'prompt',
    kind: 'emoji',
    audience: 'channel',
    ref: `emoji:${s.seq}`,
    text: ended
      ? tx(s.lang, 'voteEnded')
      : [tx(s.lang, 'voteHead', { emoji: cat(s, 'emoji'), guess: cat(s, 'guess'), sec: VOTE_MS / 1000 }), tx(s.lang, 'votedDone', { done, total: s.players.length })].join('\n'),
    options: ended
      ? []
      : [
          { value: 'voteMenu:emoji', label: tx(s.lang, 'voteEmojiButton') },
          { value: 'voteMenu:guess', label: tx(s.lang, 'voteGuessButton') },
        ],
  };
}

// 最後一步結束：依序公布每條鏈，接著投票
function showChains(c: Ctx) {
  const s = c.s;
  c.events.push({ type: 'announce', text: tx(s.lang, 'chainsIntro') });
  s.chains.forEach((ch, i) => {
    const lines = ch.entries.map((e) =>
      e.text === undefined ? tx(s.lang, 'missed', { who: mention(e.by) }) : tx(s.lang, 'entry', { tag: `${i + 1}-${e.step}`, icon: ICON[e.kind], who: mention(e.by), text: e.text }),
    );
    c.events.push({ type: 'announce', text: [tx(s.lang, 'chainTitle', { n: i + 1 }), tx(s.lang, 'chainPrompt', { who: mention(ch.owner), prompt: emojiPrompts(s.lang)[ch.prompt] }), ...lines].join('\n') });
  });
  s.phase = 'vote';
  s.seq++;
  s.votes = {};
  c.events.push(voteBoard(s));
  startTimer(c, VOTE_MS);
}

function canVote(c: Ctx, user: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notInGame'));
  if (c.s.phase !== 'vote') return reply(c, user, tx(c.s.lang, 'notVoteTime'));
  return true;
}

function voteMenu(c: Ctx, user: string, k: Kind): boolean {
  if (!canVote(c, user)) return false;
  const s = c.s;
  const list = votable(s, user, k);
  if (!list.length) return reply(c, user, tx(s.lang, 'nothingToVote', { cat: cat(s, k) }));
  const mine = s.votes[user]?.[k];
  c.events.push({
    type: 'prompt',
    kind: 'emoji',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'voteMenu', { cat: cat(s, k), current: mine ? tx(s.lang, 'voteCurrent', { tag: mine }) : '' }),
    options: list.map((w) => ({ value: `vote:${s.seq}:${k}:${w.tag}`, label: w.tag })),
    perRow: 5,
  });
  return false;
}

function vote(c: Ctx, user: string, seq: number, k: Kind, tag: string): boolean {
  if (!isPlayer(c.s, user)) return reply(c, user, tx(c.s.lang, 'notInGame'));
  const s = c.s;
  if (s.phase !== 'vote' || seq !== s.seq) return reply(c, user, tx(s.lang, 'voteOver'));
  const w = works(s).find((x) => x.tag === tag && x.kind === k);
  if (!w) return reply(c, user, tx(s.lang, 'noSuchWork'));
  if (w.by === user) return reply(c, user, tx(s.lang, 'noSelfVote'));
  const was = doneVoting(s, user);
  (s.votes[user] ??= {})[k] = tag;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youVoted', { tag, cat: cat(s, k) }) });
  if (s.players.every((p) => doneVoting(s, p.id))) reveal(c);
  else if (!was && doneVoting(s, user)) c.events.push(voteBoard(s));
  return true;
}

// 揭曉：每票 +1 給作者，公布各類最高票 (同票全列、0 票不列)
function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(voteBoard(s, true));
  const all = works(s);
  const count = (w: Work) => Object.values(s.votes).filter((v) => v[w.kind] === w.tag).length;
  for (const w of all) s.players.find((p) => p.id === w.by)!.score += count(w);
  const best = (['emoji', 'guess'] as const).flatMap((k) => {
    const list = all.filter((w) => w.kind === k);
    const top = Math.max(0, ...list.map(count));
    if (!top) return [];
    return [tx(s.lang, 'best', { cat: cat(s, k) }), ...list.filter((w) => count(w) === top).map((w) => tx(s.lang, 'bestLine', { tag: w.tag, who: mention(w.by), text: w.text, votes: top }))];
  });
  c.events.push({ type: 'announce', text: [tx(s.lang, 'revealTitle'), ...best].join('\n') });
  endGame(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const top = Math.max(...s.players.map((p) => p.score));
  s.winners = s.players.filter((p) => p.score === top).map((p) => p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  const ranking = [...s.players].sort((a, b) => b.score - a.score);
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'winners', { winners: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        ...ranking.map((p, i) => tx(s.lang, 'rankLine', { rank: i + 1, who: mention(p.id), score: p.score, crown: p.score === top ? ' 🏆' : '' })),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

// 作答時間的共同檢查；回傳拿到的內容，不行時回傳 null (已經回覆原因)
function answerer(c: Ctx, user: string): string | null {
  if (!isPlayer(c.s, user)) return (reply(c, user, tx(c.s.lang, 'notInGame')), null);
  if (c.s.phase !== 'play') return (reply(c, user, tx(c.s.lang, 'notAnswerTime')), null);
  const input = inputOf(c.s, user);
  if (input === null) reply(c, user, tx(c.s.lang, 'resting'));
  return input;
}

function openSend(c: Ctx, user: string): boolean {
  const input = answerer(c, user);
  if (input === null) return false;
  const emoji = kindOf(c.s.step) === 'emoji';
  const lang = c.s.lang;
  reply(c, user, tx(lang, emoji ? 'youGotEmoji' : 'youGotGuess', { input }));
  c.events.push({
    type: 'modal',
    to: user,
    kind: 'emojiSend',
    title: tx(lang, 'modalTitle'),
    label: emoji ? tx(lang, 'modalEmoji', { input, max: MAX_EMOJI }) : tx(lang, 'modalGuess', { input, max: MAX_GUESS }),
  });
  return false;
}

function send(c: Ctx, user: string, raw: string): boolean {
  if (answerer(c, user) === null) return false;
  const s = c.s;
  const text = raw.trim();
  if (kindOf(s.step) === 'emoji' ? !isEmojiOnly(text) : !text || Array.from(text).length > MAX_GUESS) {
    return reply(c, user, kindOf(s.step) === 'emoji' ? tx(s.lang, 'emojiHint', { max: MAX_EMOJI }) : tx(s.lang, 'guessLength', { max: MAX_GUESS }));
  }
  const first = !(user in s.pending);
  s.pending[user] = text;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'received', { text }) });
  if (needed(s).every((u) => u in s.pending)) endStep(c);
  else if (first) c.events.push(stepBoard(s));
  return true;
}

// 從 deck 依序發 n 題；不夠時先發完剩下的，再重洗全部題目 (排除這局已發的) 補足
function deal(c: Ctx, n: number): number[] {
  const s = c.s;
  const dealt = s.deck.splice(0, n);
  if (dealt.length < n) {
    s.deck = shuffle(emojiPrompts(s.lang).map((_, i) => i).filter((i) => !dealt.includes(i)), c.rng);
    dealt.push(...s.deck.splice(0, n - dealt.length));
  }
  return dealt;
}

const RULES = (s: EState) =>
  [
    tx(s.lang, 'rules1', { order: [...s.players, s.players[0]].map((p) => mention(p.id)).join(' → '), steps: s.steps }),
    tx(s.lang, 'rules2'),
    tx(s.lang, 'rules3', { emojiSec: EMOJI_MS / 1000, guessSec: GUESS_MS / 1000 }),
    tx(s.lang, 'rules4'),
  ].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_EMOJI_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_EMOJI_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const n = s.players.length;
  const prompts = deal(c, n);
  s.chains = s.players.map((p, i) => ({ owner: p.id, prompt: prompts[i], entries: [] }));
  s.steps = n % 2 ? n - 1 : n;
  s.phase = 'play';
  c.events.push({ type: 'announce', text: RULES(s), gif: 'start' });
  nextStep(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_EMOJI_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'openSend':
      return openSend(c, action.user);
    case 'send':
      return send(c, action.user, action.text);
    case 'voteMenu':
      return voteMenu(c, action.user, action.cat);
    case 'vote':
      return vote(c, action.user, action.seq, action.cat, action.tag);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'play') endStep(c);
      else if (c.s.phase === 'vote') reveal(c);
      else return false;
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string) => ({ id, score: 0 });

export function applyEmoji(state: EState | undefined, action: EAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer,
    createLobby,
    handle,
  });
}

function createLobby(prev: EState | undefined, host: string, channel: string): Result {
  const created: EState = {
    game: 'emoji',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: prev?.deck ?? [], // 接著上一局剩下的題目，同一頻道跨局不重複
    chains: [],
    step: 0,
    steps: 0,
    pending: {},
    votes: {},
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
