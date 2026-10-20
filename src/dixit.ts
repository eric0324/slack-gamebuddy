// 妙語說書人 (Dixit) 遊戲引擎：純邏輯，不碰任何 I/O。說書人看自己的一張梗圖給一句提示，其他人出牌混淆，大家猜哪張是說書人的。
// 介面和其他遊戲一樣：applyDixit(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import { MEME_IMAGES } from './memeImages.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/dixit.js';

export const MIN_DIXIT_PLAYERS = 3;
export const MAX_DIXIT_PLAYERS = 8;
const TITLE = '妙語說書人';
const TARGET = 20;
const CLUE_MS = 120_000;
const PLAY_MS = 90_000;
const VOTE_MS = 60_000;
const MAX_CLUE = 50;

// 一張牌：只有圖片；by 是頻道投稿者 (內建的沒有)，不顯示
export type Card = { url: string; by?: string };

export interface DixitPlayer {
  id: string;
  hand: Card[]; // 這輪出的牌留在原位，揭曉後才拿掉，舊選單的按鈕位置才不會錯
  score: number;
  played: Card[]; // 這輪出的牌 (說書人不算)
  vote?: number; // 投給 table 的第幾張
}

export interface DixitState {
  game: 'dixit';
  channel: string;
  host: string;
  phase: 'lobby' | 'clue' | 'play' | 'vote' | 'ended';
  players: DixitPlayer[]; // 加入順序 = 說書人順序
  deck: Card[];
  teller: number; // 說書人在 players 的 index
  round: number;
  seq: number; // 頻道訊息的 ref，也用來擋掉舊按鈕
  pick?: number; // 說書人在手牌選單選的牌 (還沒送出提示)
  clue?: string;
  tellerCard?: Card;
  table: { card: Card; by: string }[]; // 投票時打亂後的牌
  skips: number; // 連續沒出提示的輪數
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type DixitAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string; custom?: { url: string; name: string; by: string }[] } // custom：頻道投稿的梗圖，adapter 帶入
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'pick'; user: string; seq: number; card: number }
  | { type: 'clue'; user: string; text: string; card?: number } // card：指令帶的手牌 index (從 0 起)；視窗送出時用 pick
  | { type: 'play'; user: string; seq: number; card: number }
  | { type: 'vote'; user: string; seq: number; n: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<DixitAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: DixitState; events: GameEvent[] };
type Ctx = { s: DixitState; events: GameEvent[]; rng: Rng };

const handSize = (s: DixitState) => (s.players.length === 3 ? 7 : 6);
const teller = (s: DixitState) => s.players[s.teller];
const handButton = (s: DixitState) => ({ value: 'hand', label: tx(s.lang, 'handButton') });
const find = (s: DixitState, id: string) => s.players.find((p) => p.id === id);
const nonTellers = (s: DixitState) => s.players.filter((_, i) => i !== s.teller);
const perPlay = (s: DixitState) => (s.players.length === 3 ? 2 : 1);
const pickIndex = (rng: Rng, n: number) => Math.floor(rng() * n);
const scores = (s: DixitState) =>
  [...s.players]
    .sort((a, b) => b.score - a.score)
    .map((p) => tx(s.lang, 'scoreItem', { who: mention(p.id), n: p.score }))
    .join(tx(s.lang, 'sep'));

// 手牌第 i 張這輪已經出了 (說書人的牌或出到桌上的牌)
const used = (s: DixitState, p: DixitPlayer, i: number) => {
  const url = p.hand[i]?.url;
  return url === undefined || s.tellerCard?.url === url || p.played.some((c) => c.url === url);
};

function clueBoard(s: DixitState): GameEvent {
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: tx(s.lang, 'clueBoard', { round: s.round, who: mention(teller(s).id), sec: CLUE_MS / 1000 }),
    options: [handButton(s)],
  };
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.seq++;
  s.phase = 'clue';
  delete s.pick;
  delete s.clue;
  delete s.tellerCard;
  s.table = [];
  for (const p of s.players) {
    p.played = [];
    delete p.vote;
  }
  c.events.push(clueBoard(s));
  startTimer(c, CLUE_MS);
}

function playBoard(s: DixitState): GameEvent {
  const waiting = nonTellers(s).filter((p) => p.played.length < perPlay(s));
  const total = s.players.length - 1;
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: tx(s.lang, 'playBoard', {
      round: s.round,
      who: mention(teller(s).id),
      clue: String(s.clue),
      count: tx(s.lang, perPlay(s) === 2 ? 'playTwo' : 'playOne'),
      sec: PLAY_MS / 1000,
      done: total - waiting.length,
      total,
      waiting: waiting.length ? tx(s.lang, 'waiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : '',
    }),
    options: [handButton(s)],
  };
}

function startPlay(c: Ctx) {
  const s = c.s;
  s.phase = 'play';
  s.seq++;
  c.events.push(playBoard(s));
  startTimer(c, PLAY_MS);
}

function nextRound(c: Ctx) {
  c.s.teller = (c.s.teller + 1) % c.s.players.length;
  startRound(c);
}

// 手牌選單：只有本人看到，圖片依序編號；按鈕的 value 用手牌原本的位置，出過的牌不再列出
function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase === 'lobby') return reply(c, user, tx(s.lang, 'notStarted'));
  const isTeller = me === teller(s);
  const act = s.phase === 'clue' && isTeller ? 'pick' : s.phase === 'play' && !isTeller && me.played.length < perPlay(s) ? 'play' : undefined;
  const left = me.hand.flatMap((_, i) => (used(s, me, i) ? [] : [i]));
  const text =
    act === 'pick'
      ? tx(s.lang, 'menuPick')
      : act === 'play'
        ? tx(s.lang, 'menuPlay', { clue: String(s.clue), n: perPlay(s) - me.played.length })
        : tx(s.lang, 'menuIdle');
  c.events.push({
    type: 'prompt',
    kind: 'dixit',
    audience: 'ephemeral',
    user,
    text,
    images: left.map((i, k) => ({ url: me.hand[i].url, title: String(k + 1) })),
    options: act ? left.map((i, k) => ({ value: `${act}:${s.seq}:${i}`, label: String(k + 1) })) : [],
  });
  return false;
}

// 說書階段的共同檢查：回傳說書人，不行時回傳 null (已經回覆原因)
function storyteller(c: Ctx, user: string): DixitPlayer | null {
  const s = c.s;
  if (!find(s, user)) return (reply(c, user, tx(s.lang, 'notInGame')), null);
  if (s.phase !== 'clue') return (reply(c, user, tx(s.lang, 'notCluePhase')), null);
  if (user !== teller(s).id) return (reply(c, user, tx(s.lang, 'tellerIs', { who: mention(teller(s).id) })), null);
  return teller(s);
}

function pick(c: Ctx, user: string, seq: number, card: number): boolean {
  const me = storyteller(c, user);
  if (!me) return false;
  if (seq !== c.s.seq || !Number.isInteger(card) || !me.hand[card]) return reply(c, user, tx(c.s.lang, 'stale'));
  c.s.pick = card;
  c.events.push({ type: 'modal', to: user, kind: 'dixitClue', title: tx(c.s.lang, 'modalTitle'), label: tx(c.s.lang, 'modalLabel', { max: MAX_CLUE }) });
  return true;
}

function clue(c: Ctx, user: string, raw: string, card?: number): boolean {
  const s = c.s;
  const me = storyteller(c, user);
  if (!me) return false;
  const i = card ?? s.pick;
  if (i === undefined) return reply(c, user, tx(s.lang, 'pickFirst'));
  if (!Number.isInteger(i) || !me.hand[i]) return reply(c, user, tx(s.lang, 'cardRange', { n: me.hand.length }));
  const text = raw.trim();
  if (!text || [...text].length > MAX_CLUE) return reply(c, user, tx(s.lang, 'clueLength', { max: MAX_CLUE }));
  s.tellerCard = me.hand[i];
  s.clue = text;
  s.skips = 0;
  c.events.push({ type: 'announce', text: tx(s.lang, 'clueGiven', { who: mention(user), clue: text }) });
  startPlay(c);
  return true;
}

function clueTimeout(c: Ctx) {
  const s = c.s;
  s.skips++;
  c.events.push({ type: 'announce', text: tx(s.lang, 'clueSkipped', { who: mention(teller(s).id) }) });
  if (s.skips < s.players.length) return nextRound(c);
  // 一整圈都沒人出提示：大家可能都不在了，結束但不算戰績
  s.phase = 'ended';
  s.timers = {};
  c.events.push({ type: 'announce', text: tx(s.lang, 'allGone', { scores: scores(s) }) });
}

function voteBoard(s: DixitState, ended = false): GameEvent {
  const voters = nonTellers(s);
  const voted = voters.filter((p) => p.vote !== undefined).length;
  return {
    type: 'prompt',
    kind: 'dixit',
    audience: 'channel',
    ref: `dixit:${s.seq}`,
    text: [
      ended
        ? tx(s.lang, 'voteEnded', { round: s.round })
        : tx(s.lang, 'voteAsk', { round: s.round, who: mention(teller(s).id), clue: String(s.clue), sec: VOTE_MS / 1000 }),
      ...(ended ? [] : [tx(s.lang, 'voted', { n: voted, total: voters.length })]),
    ].join('\n'),
    images: s.table.map((t, i) => ({ url: t.card.url, title: String(i + 1) })),
    options: ended ? [] : [...s.table.map((_, i) => ({ value: `vote:${s.seq}:${i}`, label: String(i + 1) })), handButton(s)],
    perRow: s.table.length,
  };
}

function startVote(c: Ctx) {
  const s = c.s;
  s.phase = 'vote';
  s.seq++;
  const t = teller(s);
  s.table = shuffle([{ card: s.tellerCard!, by: t.id }, ...nonTellers(s).flatMap((p) => p.played.map((card) => ({ card, by: p.id })))], c.rng);
  c.events.push(voteBoard(s));
  startTimer(c, VOTE_MS);
}

function play(c: Ctx, user: string, seq: number, card: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'play') return reply(c, user, tx(s.lang, 'notPlayPhase'));
  if (me === teller(s)) return reply(c, user, tx(s.lang, 'tellerNoPlay'));
  if (me.played.length >= perPlay(s)) return reply(c, user, tx(s.lang, 'alreadyPlayed'));
  if (seq !== s.seq || !Number.isInteger(card) || used(s, me, card)) return reply(c, user, tx(s.lang, 'stale'));
  me.played.push(me.hand[card]); // 牌留在手牌原位，揭曉後才拿掉
  if (me.played.length < perPlay(s)) {
    c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'playedOne') });
    c.events.push(playBoard(s));
    return true;
  }
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'played') });
  if (nonTellers(s).every((p) => p.played.length >= perPlay(s))) startVote(c);
  else c.events.push(playBoard(s));
  return true;
}

function playTimeout(c: Ctx) {
  const s = c.s;
  const late = nonTellers(s).filter((p) => p.played.length < perPlay(s));
  for (const p of late) {
    while (p.played.length < perPlay(s)) {
      const left = p.hand.flatMap((_, i) => (used(s, p, i) ? [] : [i]));
      p.played.push(p.hand[left[pickIndex(c.rng, left.length)]]);
    }
  }
  if (late.length) c.events.push({ type: 'announce', text: tx(s.lang, 'autoPlayed', { who: late.map((p) => mention(p.id)).join(' ') }) });
  startVote(c);
}

function vote(c: Ctx, user: string, seq: number, n: number): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'vote' || seq !== s.seq) return reply(c, user, tx(s.lang, 'voteOver'));
  if (me === teller(s)) return reply(c, user, tx(s.lang, 'tellerNoVote'));
  if (!s.table[n]) return false;
  if (s.table[n].by === user) return reply(c, user, tx(s.lang, 'ownCard'));
  me.vote = n;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'youVoted', { n: n + 1 }) });
  if (nonTellers(s).every((p) => p.vote !== undefined)) reveal(c);
  else c.events.push(voteBoard(s));
  return true;
}

// 計分：全部猜對或全部沒猜對時說書人 0、其他人 +2；否則說書人和猜對的人 +3；說書人以外的牌每得 1 票 +1
function score(s: DixitState): Map<string, number> {
  const t = teller(s);
  const others = nonTellers(s);
  const answer = s.table.findIndex((x) => x.by === t.id);
  const right = others.filter((p) => p.vote === answer);
  const gain = new Map(s.players.map((p) => [p.id, 0]));
  const add = (id: string, n: number) => gain.set(id, gain.get(id)! + n);
  if (right.length === 0 || right.length === others.length) for (const p of others) add(p.id, 2);
  else for (const p of [t, ...right]) add(p.id, 3);
  for (const p of others) if (p.vote !== undefined && s.table[p.vote].by !== t.id) add(s.table[p.vote].by, 1);
  return gain;
}

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(voteBoard(s, true));
  const gain = score(s);
  for (const p of s.players) p.score += gain.get(p.id)!;
  const t = teller(s);
  const answer = s.table.findIndex((x) => x.by === t.id);
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'reveal', { round: s.round, who: mention(t.id), n: answer + 1 }),
      ...s.table.map((x, i) => {
        const voters = s.players.filter((p) => p.vote === i).map((p) => mention(p.id));
        return tx(s.lang, 'revealLine', { i: i + 1, by: mention(x.by), tag: i === answer ? tx(s.lang, 'tellerTag') : '', voters: voters.join(' ') || tx(s.lang, 'nobody') });
      }),
      tx(s.lang, 'roundGain', { list: s.players.map((p) => tx(s.lang, 'gainItem', { who: mention(p.id), n: gain.get(p.id)! })).join(tx(s.lang, 'sep')) }),
      tx(s.lang, 'totalScores', { scores: scores(s) }),
    ].join('\n'),
  });
  for (const p of s.players) p.hand = p.hand.filter((_, i) => !used(s, p, i));
  if (s.players.some((p) => p.score >= TARGET)) return endGame(c, tx(s.lang, 'reasonTarget', { n: TARGET }));
  const need = s.players.reduce((n, p) => n + handSize(s) - p.hand.length, 0);
  if (s.deck.length < need) return endGame(c, tx(s.lang, 'reasonDeck'));
  for (const p of s.players) p.hand.push(...s.deck.splice(0, handSize(s) - p.hand.length));
  nextRound(c);
}

function endGame(c: Ctx, reason: string) {
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
        tx(s.lang, 'endTitle', { reason, winners: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        ...ranking.map((p, i) => tx(s.lang, 'rankLine', { i: i + 1, who: mention(p.id), n: p.score, top: p.score === top ? ' 🏆' : '' })),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function rules(s: DixitState): string {
  return [
    tx(s.lang, 'rulesStart'),
    tx(s.lang, 'rulesOrder', { order: s.players.map((p) => mention(p.id)).join(' → ') }),
    tx(s.lang, 'rulesHow'),
    ...(s.players.length === 3 ? [tx(s.lang, 'rules3p')] : []),
    tx(s.lang, 'rulesScore'),
    tx(s.lang, 'rulesEnd', { n: TARGET }),
  ].join('\n');
}

// 內建梗圖加上頻道投稿，網址相同只留一張，不留名稱
function buildDeck(custom: { url: string; by: string }[]): Card[] {
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const m of [...MEME_IMAGES.map(({ url }) => ({ url })), ...custom.map(({ url, by }) => ({ url, by }))]) {
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    cards.push(m);
  }
  return cards;
}

function start(c: Ctx, user: string, custom: { url: string; name: string; by: string }[] = []): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  if (s.players.length < MIN_DIXIT_PLAYERS) return reply(c, user, tx(s.lang, 'needPlayers', { n: s.players.length, min: MIN_DIXIT_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'clue' }));
  s.deck = shuffle(buildDeck(custom), c.rng);
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: s.deck.splice(0, handSize(s)) });
  s.teller = 0;
  s.round = 0;
  s.skips = 0;
  c.events.push({ type: 'announce', text: rules(s) });
  startRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_DIXIT_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(c.s.lang, 'noBots'));
    case 'start':
      return start(c, action.user, action.custom);
    case 'cancel':
      return cancelGame(c, action.user, c.s.phase === 'lobby' ? '' : tx(c.s.lang, 'cancelScores', { scores: scores(c.s) }));
    case 'hand':
      return handMenu(c, action.user);
    case 'pick':
      return pick(c, action.user, action.seq, action.card);
    case 'clue':
      return clue(c, action.user, action.text, action.card);
    case 'play':
      return play(c, action.user, action.seq, action.card);
    case 'vote':
      return vote(c, action.user, action.seq, action.n);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      if (c.s.phase === 'clue') clueTimeout(c);
      else if (c.s.phase === 'play') playTimeout(c);
      else reveal(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): DixitPlayer => ({ id, hand: [], score: 0, played: [] });

export function applyDixit(state: DixitState | undefined, action: DixitAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: DixitState | undefined, host: string, channel: string): Result {
  const created: DixitState = {
    game: 'dixit',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    teller: 0,
    round: 0,
    seq: prev?.seq ?? 0,
    table: [],
    skips: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
