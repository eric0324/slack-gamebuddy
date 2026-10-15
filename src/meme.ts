// 梗圖大亂鬥（What Do You Meme? 的玩法）遊戲引擎：純邏輯，不碰任何 I/O。每輪看一張梗圖，出手牌或自己寫一句，匿名投票。
// 介面和其他遊戲一樣：applyMeme(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { MEME_CARDS } from './memeCards.js';
import { MEME_IMAGES } from './memeImages.js';

export const MIN_MEME_PLAYERS = 3;
export const MAX_MEME_PLAYERS = 8;
const TITLE = '梗圖大亂鬥';
const ROUNDS = 6;
const HAND = 7;
const MAX_TEXT = 40;
const ANSWER_MS = 90_000;
const VOTE_MS = 60_000;
const LETTER = 'ABCDEFGH';

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
  images: number[]; // 這局 6 輪的梗圖（MEME_IMAGES 的 index）
  round: number;
  answers: { by: string; text: string; own: boolean }[]; // 投票時打亂後的答案
  seq: number; // 配圖／投票訊息的 ref，也用來擋掉舊按鈕
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
}

export type MemeAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; card: number }
  | { type: 'openWrite'; user: string }
  | { type: 'write'; user: string; text: string }
  | { type: 'vote'; user: string; seq: number; n: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

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
      `🖼️ 第 ${s.round}/${ROUNDS} 輪：按「🃏 我的手牌」挑一句，或按「✍️ 自己寫」（${ANSWER_MS / 1000} 秒）`,
      `已送出 ${s.players.length - waiting.length}/${s.players.length}${waiting.length ? `，還沒送出：${waiting.map((p) => mention(p.id)).join(' ')}` : ''}`,
    ].join('\n'),
    options: [
      { value: 'hand', label: '🃏 我的手牌' },
      { value: 'write', label: '✍️ 自己寫' },
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
      ended ? `🗳️ 第 ${s.round}/${ROUNDS} 輪投票：已結束` : `🗳️ 第 ${s.round}/${ROUNDS} 輪：投給最好笑的一句（不能投自己，${VOTE_MS / 1000} 秒內可以改票）`,
      ...s.answers.map((a, i) => `${LETTER[i]}. ${a.text}`),
      ...(ended ? [] : [`已投 ${voted}/${humans(s).length}`]),
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
  const img = MEME_IMAGES[s.images[s.round - 1]];
  c.events.push({ type: 'announce', text: `🖼️ 第 ${s.round}/${ROUNDS} 輪：${img.name}`, image: { url: img.url, alt: img.name } });
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
      `🎉 第 ${s.round} 輪揭曉：`,
      ...order.map((i) => `${LETTER[i]}. ${s.answers[i].text}${s.answers[i].own ? ' ✍️' : ''} — ${mention(s.answers[i].by)}，${votes[i]} 票`),
      `目前總分：${s.players.map((p) => `${mention(p.id)} ${p.score}`).join('、')}`,
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
      text: [`🏆 遊戲結束，${s.winners.map(mention).join('、')} 獲勝！`, ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)} ${p.score} 分${p.score === top ? ' 🏆' : ''}`)].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 配圖階段的共同檢查；回傳玩家，不行時回傳 null（已經回覆原因）
function answerer(c: Ctx, user: string): MemePlayer | null {
  const me = find(c.s, user);
  if (!me) return (reply(c, user, '你不在這局遊戲裡。'), null);
  if (c.s.phase !== 'answer') return (reply(c, user, '現在不是配圖的時間。'), null);
  if (me.answer) return (reply(c, user, '你這輪已經送出了。'), null);
  return me;
}

function submitted(c: Ctx, user: string) {
  c.events.push({ type: 'ephemeral', to: user, text: '✅ 已送出' });
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
    text: '🃏 挑一句配這張梗圖（送出後不能改）',
    options: me.hand.map((card, i) => ({ value: `play:${c.s.seq}:${i}`, label: card })),
    perRow: 1,
  });
  return false;
}

function play(c: Ctx, user: string, seq: number, card: number): boolean {
  const me = answerer(c, user);
  if (!me) return false;
  if (seq !== c.s.seq) return reply(c, user, '這個選單已經過期了。');
  if (!Number.isInteger(card) || card < 0 || card >= me.hand.length) return reply(c, user, '你手上沒有這張牌。');
  playCard(c, me, card);
  submitted(c, user);
  return true;
}

function write(c: Ctx, user: string, raw: string): boolean {
  const me = answerer(c, user);
  if (!me) return false;
  const text = raw.trim();
  if (!text || [...text].length > MAX_TEXT) return reply(c, user, `要寫 1～${MAX_TEXT} 個字。`);
  me.answer = { text, own: true };
  submitted(c, user);
  return true;
}

function openWrite(c: Ctx, user: string): boolean {
  if (!answerer(c, user)) return false;
  c.events.push({ type: 'modal', to: user, kind: 'memeWrite', title: '自己寫', label: `你的梗（1～${MAX_TEXT} 字）` });
  return false;
}

function vote(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, '你不在這局遊戲裡。');
  if (s.phase !== 'vote' || seq !== s.seq) return reply(c, user, '這次投票已經結束了。');
  if (!s.answers[n]) return false;
  if (s.answers[n].by === user) return reply(c, user, '不能投自己。');
  me.vote = n;
  c.events.push({ type: 'ephemeral', to: user, text: `你投了 ${LETTER[n]}：${s.answers[n].text}` });
  if (humans(s).every((p) => p.vote !== undefined)) reveal(c);
  else c.events.push(voteBoard(s));
  return true;
}

function timeout(c: Ctx) {
  const s = c.s;
  if (s.phase === 'vote') return reveal(c);
  const late = s.players.filter((p) => !p.answer);
  for (const p of late) playCard(c, p, pickIndex(c.rng, p.hand.length));
  if (late.length) c.events.push({ type: 'announce', text: `⌛ ${late.map((p) => mention(p.id)).join(' ')} 沒送出，系統幫忙出了一張手牌。` });
  startVote(c);
}

const RULES = [
  `😂 梗圖大亂鬥開始！共 ${ROUNDS} 輪。`,
  `每輪看一張梗圖，從 ${HAND} 張手牌挑一句，或自己寫一句配上去（${ANSWER_MS / 1000} 秒）。`,
  `所有答案匿名列出，大家投給最好笑的一句，不能投自己；每得 1 票 +1 分。`,
  `${ROUNDS} 輪後總分最高的人獲勝。`,
].join('\n');

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, '只有房主可以開始遊戲。');
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_MEME_PLAYERS) return reply(c, user, `目前 ${s.players.length} 人，至少需要 ${MIN_MEME_PLAYERS} 人才能開始。`);
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'answer' }));
  s.deck = shuffle(MEME_CARDS, c.rng);
  s.used = [];
  s.images = shuffle(MEME_IMAGES.map((_, i) => i), c.rng).slice(0, ROUNDS);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: Array.from({ length: HAND }, () => draw(c)) });
  c.events.push({ type: 'announce', text: RULES });
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
      return start(c, action.user);
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
