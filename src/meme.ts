// 梗圖大亂鬥 (What Do You Meme? 的玩法) 遊戲引擎：純邏輯，不碰任何 I/O。每輪看一張梗圖，出手牌或自己寫一句，匿名投票。
// 介面和其他遊戲一樣：applyMeme(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { memeCards } from './memeCards.js';
import { MEME_IMAGES, memeImageName } from './memeImages.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/meme.js';

export const MIN_MEME_PLAYERS = 3;
export const MAX_MEME_PLAYERS = 8;
const TITLE = '梗圖大亂鬥';
const ROUNDS = 6;
const HAND = 7;
const MAX_TEXT = 40;
const ANSWER_MS = 90_000;
const VOTE_MS = 60_000;
const LETTER = 'ABCDEFGH';
const MAX_CUSTOM = 2; // 每局最多幾輪用頻道投稿的梗圖

// 這局用到的梗圖；by 是投稿者 (內建的沒有)
export type RoundImage = { name: string; url: string; by?: string };

export interface MemePlayer {
  id: string;
  hand: string[];
  score: number;
  answer?: { text: string; own: boolean }; // own：自己寫的
  vote?: number; // 投給 answers 的第幾個
}

export interface MemeState {
  game: 'meme';
  channel: string;
  host: string;
  phase: 'lobby' | 'answer' | 'vote' | 'ended';
  players: MemePlayer[];
  deck: string[];
  used: string[]; // 出過的手牌，牌庫抽完時洗回去
  images: RoundImage[]; // 這局 6 輪的梗圖，開局時決定
  round: number;
  answers: { by: string; text: string; own: boolean }[]; // 投票時打亂後的答案
  seq: number; // 配圖／投票訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type MemeAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string; custom?: { url: string; name: string; by: string }[] } // custom：頻道投稿的梗圖，adapter 帶入
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; card: number }
  | { type: 'openWrite'; user: string }
  | { type: 'write'; user: string; text: string }
  | { type: 'vote'; user: string; seq: number; n: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<MemeAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: MemeState; events: GameEvent[] };
type Ctx = { s: MemeState; events: GameEvent[]; rng: Rng };

const find = (s: MemeState, id: string) => s.players.find((p) => p.id === id);
const humans = (s: MemeState) => s.players.filter((p) => !isBot(p.id));
const pickIndex = (rng: Rng, n: number) => Math.floor(rng() * n);

function draw(c: Ctx): string {
  const s = c.s;
  if (!s.deck.length) {
    s.deck = shuffle(s.used, c.rng);
    s.used = [];
  }
  return s.deck.shift()!;
}

// 出一張手牌：成為答案，補一張新的
function playCard(c: Ctx, p: MemePlayer, i: number) {
  const [card] = p.hand.splice(i, 1);
  p.hand.push(draw(c));
  c.s.used.push(card);
  p.answer = { text: card, own: false };
}

function answerBoard(s: MemeState): GameEvent {
  const waiting = s.players.filter((p) => !p.answer);
  return {
    type: 'prompt',
    kind: 'meme',
    audience: 'channel',
    ref: `meme:${s.seq}`,
    text: [
      tx(s.lang, 'answerBoard', { round: s.round, rounds: ROUNDS, sec: ANSWER_MS / 1000 }),
      tx(s.lang, 'submittedCount', { done: s.players.length - waiting.length, total: s.players.length }) +
        (waiting.length ? tx(s.lang, 'waiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : ''),
    ].join('\n'),
    options: [
      { value: 'hand', label: tx(s.lang, 'handButton') },
      { value: 'write', label: tx(s.lang, 'writeButton') },
    ],
  };
}

function voteBoard(s: MemeState, ended = false): GameEvent {
  const voted = humans(s).filter((p) => p.vote !== undefined).length;
  return {
    type: 'prompt',
    kind: 'meme',
    audience: 'channel',
    ref: `meme:${s.seq}`,
    text: [
      tx(s.lang, ended ? 'voteEnded' : 'voteBoard', { round: s.round, rounds: ROUNDS, sec: VOTE_MS / 1000 }),
      ...s.answers.map((a, i) => `${LETTER[i]}. ${a.text}`),
      ...(ended ? [] : [tx(s.lang, 'votedCount', { voted, total: humans(s).length })]),
    ].join('\n'),
    options: ended ? [] : s.answers.map((_, i) => ({ value: `vote:${s.seq}:${i}`, label: LETTER[i] })),
  };
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.phase = 'answer';
  for (const p of s.players) {
    delete p.answer;
    delete p.vote;
  }
  const img = s.images[s.round - 1];
  const credit = img.by ? tx(s.lang, 'credit', { who: mention(img.by) }) : '';
  c.events.push({ type: 'announce', text: tx(s.lang, 'roundImage', { round: s.round, rounds: ROUNDS, name: img.name, credit }), image: { url: img.url, alt: img.name } });
  for (const p of s.players) if (isBot(p.id)) playCard(c, p, pickIndex(c.rng, p.hand.length));
  c.events.push(answerBoard(s));
  startTimer(c, ANSWER_MS);
}

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.seq++;
  s.answers = shuffle(s.players.map((p) => ({ by: p.id, ...p.answer! })), c.rng);
  for (const p of s.players) {
    if (!isBot(p.id)) continue;
    const others = s.answers.flatMap((a, i) => (a.by === p.id ? [] : [i]));
    p.vote = others[pickIndex(c.rng, others.length)];
  }
  c.events.push(voteBoard(s));
  startTimer(c, VOTE_MS);
}

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(voteBoard(s, true));
  const votes = s.answers.map((_, i) => s.players.filter((p) => p.vote === i).length);
  s.answers.forEach((a, i) => (find(s, a.by)!.score += votes[i]));
  const order = s.answers.map((_, i) => i).sort((a, b) => votes[b] - votes[a]);
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'revealTitle', { round: s.round }),
      ...order.map((i) =>
        tx(s.lang, 'revealLine', {
          letter: LETTER[i],
          text: s.answers[i].text,
          own: s.answers[i].own ? ' ✍️' : '',
          who: mention(s.answers[i].by),
          votes: tx(s.lang, votes[i] === 1 ? 'votes1' : 'votesN', { n: votes[i] }),
        }),
      ),
      tx(s.lang, 'totals', { scores: s.players.map((p) => `${mention(p.id)} ${p.score}`).join(tx(s.lang, 'sep')) }),
    ].join('\n'),
  });
  if (s.round < ROUNDS) startRound(c);
  else endGame(c);
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
        tx(s.lang, 'winners', { who: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        ...ranking.map((p, i) =>
          tx(s.lang, 'rankLine', { rank: i + 1, who: mention(p.id), points: tx(s.lang, p.score === 1 ? 'points1' : 'pointsN', { n: p.score }), top: p.score === top ? ' 🏆' : '' }),
        ),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

// 配圖階段的共同檢查；回傳玩家，不行時回傳 null (已經回覆原因)
function answerer(c: Ctx, user: string): MemePlayer | null {
  const me = find(c.s, user);
  if (!me) return (reply(c, user, tx(c.s.lang, 'notInGame')), null);
  if (c.s.phase !== 'answer') return (reply(c, user, tx(c.s.lang, 'notAnswerTime')), null);
  if (me.answer) return (reply(c, user, tx(c.s.lang, 'alreadySent')), null);
  return me;
}

function submitted(c: Ctx, user: string) {
  c.events.push({ type: 'ephemeral', to: user, text: tx(c.s.lang, 'sent') });
  if (c.s.players.every((p) => p.answer)) startVote(c);
  else c.events.push(answerBoard(c.s));
}

function handMenu(c: Ctx, user: string): boolean {
  const me = answerer(c, user);
  if (!me) return false;
  c.events.push({
    type: 'prompt',
    kind: 'meme',
    audience: 'ephemeral',
    user,
    text: tx(c.s.lang, 'handMenu'),
    options: me.hand.map((card, i) => ({ value: `play:${c.s.seq}:${i}`, label: card })),
    perRow: 1,
  });
  return false;
}

function play(c: Ctx, user: string, seq: number, card: number): boolean {
  const me = answerer(c, user);
  if (!me) return false;
  if (seq !== c.s.seq) return reply(c, user, tx(c.s.lang, 'menuExpired'));
  if (!Number.isInteger(card) || card < 0 || card >= me.hand.length) return reply(c, user, tx(c.s.lang, 'noSuchCard'));
  playCard(c, me, card);
  submitted(c, user);
  return true;
}

function write(c: Ctx, user: string, raw: string): boolean {
  const me = answerer(c, user);
  if (!me) return false;
  const text = raw.trim();
  if (!text || [...text].length > MAX_TEXT) return reply(c, user, tx(c.s.lang, 'textLength', { max: MAX_TEXT }));
  me.answer = { text, own: true };
  submitted(c, user);
  return true;
}

function openWrite(c: Ctx, user: string): boolean {
  if (!answerer(c, user)) return false;
  c.events.push({ type: 'modal', to: user, kind: 'memeWrite', title: tx(c.s.lang, 'modalTitle'), label: tx(c.s.lang, 'modalLabel', { max: MAX_TEXT }) });
  return false;
}

function vote(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'vote' || seq !== s.seq) return reply(c, user, tx(s.lang, 'voteOver'));
  if (!s.answers[n]) return false;
  if (s.answers[n].by === user) return reply(c, user, tx(s.lang, 'noSelfVote'));
  me.vote = n;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youVoted', { letter: LETTER[n], text: s.answers[n].text }) });
  if (humans(s).every((p) => p.vote !== undefined)) reveal(c);
  else c.events.push(voteBoard(s));
  return true;
}

function timeout(c: Ctx) {
  const s = c.s;
  if (s.phase === 'vote') return reveal(c);
  const late = s.players.filter((p) => !p.answer);
  for (const p of late) playCard(c, p, pickIndex(c.rng, p.hand.length));
  if (late.length) c.events.push({ type: 'announce', text: tx(s.lang, 'late', { who: late.map((p) => mention(p.id)).join(' ') }) });
  startVote(c);
}

const rules = (lang: Lang | undefined) => tx(lang, 'rules', { rounds: ROUNDS, hand: HAND, sec: ANSWER_MS / 1000 });

// 投稿最多 MAX_CUSTOM 張，其餘用內建的補，再打亂順序
function pickImages(c: Ctx, custom: { url: string; name: string; by: string }[]): RoundImage[] {
  const mine = shuffle(custom, c.rng).slice(0, MAX_CUSTOM).map(({ name, url, by }) => ({ name, url, by }));
  const builtin = shuffle(MEME_IMAGES.filter((m) => !mine.some((x) => x.url === m.url)), c.rng)
    .slice(0, ROUNDS - mine.length)
    .map((m) => ({ name: memeImageName(m, c.s.lang), url: m.url }));
  return shuffle([...mine, ...builtin], c.rng);
}

function start(c: Ctx, user: string, custom: { url: string; name: string; by: string }[] = []): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_MEME_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_MEME_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'answer' }));
  s.deck = shuffle(memeCards(s.lang), c.rng);
  s.used = [];
  s.images = pickImages(c, custom);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: Array.from({ length: HAND }, () => draw(c)) });
  c.events.push({ type: 'announce', text: rules(s.lang) });
  startRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_MEME_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_MEME_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user, action.custom);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'play':
      return play(c, action.user, action.seq, action.card);
    case 'openWrite':
      return openWrite(c, action.user);
    case 'write':
      return write(c, action.user, action.text);
    case 'vote':
      return vote(c, action.user, action.seq, action.n);
    case 'timeout':
      if (action.id !== c.s.timers.phase || (c.s.phase !== 'answer' && c.s.phase !== 'vote')) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): MemePlayer => ({ id, hand: [], score: 0 });

export function applyMeme(state: MemeState | undefined, action: MemeAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: MemeState | undefined, host: string, channel: string): Result {
  const created: MemeState = {
    game: 'meme',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    used: [],
    images: [],
    round: 0,
    answers: [],
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
