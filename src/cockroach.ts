// 蟑螂撲克遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyCockroach(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/cockroach.js';

export const MIN_COCKROACH_PLAYERS = 2;
export const MAX_COCKROACH_PLAYERS = 6;
const TITLE = '蟑螂撲克';
const STEP_MS = 120_000;
const LOSE_AT = 4;

export type Bug = 'cockroach' | 'rat' | 'fly' | 'scorpion' | 'stinkbug' | 'spider' | 'toad' | 'bat';
export const BUGS: { bug: Bug; emoji: string; name: string }[] = [
  { bug: 'cockroach', emoji: '🪳', name: '蟑螂' },
  { bug: 'rat', emoji: '🐀', name: '老鼠' },
  { bug: 'fly', emoji: '🪰', name: '蒼蠅' },
  { bug: 'scorpion', emoji: '🦂', name: '蠍子' },
  { bug: 'stinkbug', emoji: '🪲', name: '臭蟲' },
  { bug: 'spider', emoji: '🕷️', name: '蜘蛛' },
  { bug: 'toad', emoji: '🐸', name: '青蛙' },
  { bug: 'bat', emoji: '🦇', name: '蝙蝠' },
];
const info = (b: Bug) => BUGS.find((x) => x.bug === b)!;
const bugName = (lang: Lang | undefined, b: Bug) => tx(lang, b);
const label = (lang: Lang | undefined, b: Bug) => `${info(b).emoji} ${bugName(lang, b)}`;
export const isBug = (b: string): b is Bug => BUGS.some((x) => x.bug === b);

export type CrPhase = 'lobby' | 'give' | 'respond' | 'pass' | 'ended';

export interface CrPlayer {
  id: string;
  hand: Bug[];
  front: Bug[]; // 面前朝上的牌
}

export interface CrCard {
  bug: Bug;
  claim: Bug;
  from: string; // 最後一位傳牌 (宣稱) 的人
  to: string; // 現在拿著牌的人
  seen: string[]; // 看過這張牌的人
}

export interface CrState {
  game: 'cockroach';
  channel: string;
  host: string;
  phase: CrPhase;
  players: CrPlayer[];
  turn: number;
  step: number; // 換人或換步驟就 +1，舊的按鈕和選單用它判斷過期
  card?: CrCard;
  loser?: string;
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type CrAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'play'; user: string }
  | { type: 'hand'; user: string }
  | { type: 'card'; user: string; step: number; bug: Bug }
  | { type: 'target'; user: string; step: number; bug: Bug; target: string }
  | { type: 'give'; user: string; step: number; bug: Bug; target: string; claim: Bug }
  | { type: 'answer'; user: string; step: number; yes: boolean }
  | { type: 'peek'; user: string; step: number }
  | { type: 'passMenu'; user: string }
  | { type: 'to'; user: string; step: number; target: string }
  | { type: 'pass'; user: string; step: number; target: string; claim: Bug }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<CrAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: CrState;
  events: GameEvent[];
}

interface Ctx {
  s: CrState;
  events: GameEvent[];
  rng: Rng;
}

const find = (s: CrState, id: string) => s.players.find((p) => p.id === id);
const count = (bugs: Bug[], b: Bug) => bugs.filter((x) => x === b).length;
const pickOne = <T>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)];
const groups = (bugs: Bug[]) => BUGS.filter((b) => bugs.includes(b.bug)).map((b) => ({ bug: b.bug, n: count(bugs, b.bug) }));
const longList = (lang: Lang | undefined, bugs: Bug[]) => groups(bugs).map((g) => `${label(lang, g.bug)} ×${g.n}`).join(tx(lang, 'sep')) || tx(lang, 'none');
const shortList = (bugs: Bug[]) => groups(bugs).map((g) => `${info(g.bug).emoji}×${g.n}`).join(' ') || '—';
const status = (s: CrState) => s.players.map((p) => tx(s.lang, 'statusLine', { who: mention(p.id), hand: p.hand.length, front: shortList(p.front) })).join('\n');
// 還沒看過這張牌、可以接手的人
const unseen = (s: CrState) => s.players.filter((p) => p.id !== s.card!.to && !s.card!.seen.includes(p.id)).map((p) => p.id);

const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  c.events.push({ type: 'prompt', kind: 'cockroach', audience: 'ephemeral', user, text, options });
  return false;
};
const handButton = (s: CrState) => ({ value: 'hand', label: tx(s.lang, 'handButton') });

function promptGive(c: Ctx) {
  const s = c.s;
  s.phase = 'give';
  s.step++;
  const p = s.players[s.turn];
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'yourTurn', { who: mention(p.id), min: STEP_MS / 60_000, status: status(s) }) },
    {
      type: 'prompt',
      kind: 'cockroach',
      audience: 'channel',
      text: tx(s.lang, 'givePrompt', { who: mention(p.id) }),
      options: [{ value: 'play', label: tx(s.lang, 'playButton') }, handButton(s)],
    },
  );
  startTimer(c, STEP_MS);
}

function promptRespond(c: Ctx) {
  const s = c.s;
  s.phase = 'respond';
  s.step++;
  const card = s.card!;
  const name = bugName(s.lang, card.claim);
  c.events.push({
    type: 'prompt',
    kind: 'cockroach',
    audience: 'channel',
    text: tx(s.lang, 'respondPrompt', { who: mention(card.to), card: label(s.lang, card.claim), min: STEP_MS / 60_000 }),
    options: [
      { value: `yes:${s.step}`, label: tx(s.lang, 'yesButton', { name }) },
      { value: `no:${s.step}`, label: tx(s.lang, 'noButton', { name }) },
      ...(unseen(s).length ? [{ value: `peek:${s.step}`, label: tx(s.lang, 'peekButton') }] : []),
      handButton(s),
    ],
  });
  startTimer(c, STEP_MS);
}

function giveCard(c: Ctx, user: string, bug: Bug, target: string, claim: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, tx(s.lang, 'notYourTurn'));
  const p = s.players[s.turn];
  if (!p.hand.includes(bug)) return reply(c, user, tx(s.lang, 'noSuchCard'));
  if (target === user || !find(s, target)) return reply(c, user, tx(s.lang, 'badTarget'));
  p.hand.splice(p.hand.indexOf(bug), 1);
  s.card = { bug, claim, from: user, to: target, seen: [user] };
  c.events.push({ type: 'announce', text: tx(s.lang, 'gave', { from: mention(user), to: mention(target), card: label(s.lang, claim) }) });
  promptRespond(c);
  return true;
}

function answer(c: Ctx, user: string, yes: boolean): boolean {
  const s = c.s;
  if (s.phase !== 'respond' || s.card!.to !== user) return reply(c, user, tx(s.lang, 'notHolding'));
  const card = s.card!;
  const correct = yes === (card.bug === card.claim);
  const taker = correct ? card.from : card.to;
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'answered', {
      who: mention(user),
      answer: tx(s.lang, yes ? 'yes' : 'no'),
      claim: label(s.lang, card.claim),
      card: label(s.lang, card.bug),
      result: tx(s.lang, correct ? 'right' : 'wrong'),
      taker: mention(taker),
    }),
  });
  return place(c, taker, card.bug);
}

function place(c: Ctx, taker: string, bug: Bug): boolean {
  const s = c.s;
  const p = find(s, taker)!;
  p.front.push(bug);
  s.card = undefined;
  if (count(p.front, bug) >= LOSE_AT) {
    endGame(c, taker, tx(s.lang, 'loseFour', { n: LOSE_AT, card: label(s.lang, bug) }));
    return true;
  }
  s.turn = s.players.indexOf(p);
  if (!p.hand.length) {
    endGame(c, taker, tx(s.lang, 'loseEmpty'));
    return true;
  }
  promptGive(c);
  return true;
}

function peek(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'respond' || s.card!.to !== user) return reply(c, user, tx(s.lang, 'notHolding'));
  if (!unseen(s).length) return reply(c, user, tx(s.lang, 'allSeen'));
  s.card!.seen.push(user);
  s.phase = 'pass';
  s.step++;
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'peeked', { who: mention(user), min: STEP_MS / 60_000 }) },
    {
      type: 'prompt',
      kind: 'cockroach',
      audience: 'channel',
      text: tx(s.lang, 'passPrompt', { who: mention(user) }),
      options: [{ value: 'passmenu', label: tx(s.lang, 'passButton') }, handButton(s)],
    },
  );
  if (!isBot(user)) passMenu(c, user);
  startTimer(c, STEP_MS);
  return true;
}

function passMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, tx(s.lang, 'cannotPass'));
  return menu(
    c,
    user,
    tx(s.lang, 'passMenu', { card: label(s.lang, s.card!.bug) }),
    unseen(s).map((id) => ({ value: `to:${s.step}:${id}`, label: id })),
  );
}

function passCard(c: Ctx, user: string, target: string, claim: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, tx(s.lang, 'cannotPass'));
  if (!unseen(s).includes(target)) return reply(c, user, tx(s.lang, 'onlyUnseen'));
  Object.assign(s.card!, { from: user, to: target, claim });
  c.events.push({ type: 'announce', text: tx(s.lang, 'passed', { from: mention(user), to: mention(target), card: label(s.lang, claim) }) });
  promptRespond(c);
  return true;
}

function endGame(c: Ctx, loser: string, why: string) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.loser = loser;
  const lines = s.players.map((p) => tx(s.lang, 'endLine', { who: mention(p.id), front: shortList(p.front) }));
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.players.filter((p) => p.id !== loser).map((p) => p.id) });
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'ended', { loser: mention(loser), why, lines: lines.join('\n') }) },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchPrompt'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchButton') }] },
  );
}

function playMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (!find(s, user)) return reply(c, user, tx(s.lang, 'notInGame'));
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, tx(s.lang, 'notYourTurn'));
  const options = groups(s.players[s.turn].hand).map((g) => ({ value: `card:${s.step}:${g.bug}`, label: `${label(s.lang, g.bug)} ×${g.n}` }));
  return menu(c, user, tx(s.lang, 'pickCard'), options);
}

function targetMenu(c: Ctx, user: string, bug: Bug): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (!s.players[s.turn].hand.includes(bug)) return reply(c, user, tx(s.lang, 'noSuchCard'));
  const others = s.players.filter((p) => p.id !== user);
  return menu(c, user, tx(s.lang, 'pickTarget', { card: label(s.lang, bug) }), others.map((p) => ({ value: `tgt:${s.step}:${bug}:${p.id}`, label: p.id })));
}

const claimOptions = (lang: Lang | undefined, prefix: string, target: string) => BUGS.map((b) => ({ value: `${prefix}:${b.bug}:${target}`, label: label(lang, b.bug) }));

function claimMenu(c: Ctx, user: string, bug: Bug, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'give' || s.players[s.turn].id !== user) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (target === user || !find(s, target)) return reply(c, user, tx(s.lang, 'badTarget'));
  return menu(c, user, tx(s.lang, 'pickClaim', { who: mention(target) }), claimOptions(s.lang, `claim:${s.step}:${bug}`, target));
}

function sayMenu(c: Ctx, user: string, target: string): boolean {
  const s = c.s;
  if (s.phase !== 'pass' || s.card!.to !== user) return reply(c, user, tx(s.lang, 'cannotPass'));
  if (!unseen(s).includes(target)) return reply(c, user, tx(s.lang, 'onlyUnseen'));
  return menu(c, user, tx(s.lang, 'pickClaim', { who: mention(target) }), claimOptions(s.lang, `say:${s.step}`, target));
}

function showHand(c: Ctx, user: string): boolean {
  const lang = c.s.lang;
  const p = find(c.s, user);
  if (!p) return reply(c, user, tx(lang, 'notInGame'));
  return reply(c, user, tx(lang, 'hand', { hand: longList(lang, p.hand), n: p.hand.length, front: longList(lang, p.front) }));
}

// 帶 step 的按鈕：step 不同就是過期的選單
function stale(c: Ctx, user: string, step: number) {
  if (step === c.s.step) return false;
  reply(c, user, tx(c.s.lang, 'stale'));
  return true;
}

function onTimeout(c: Ctx): boolean {
  const s = c.s;
  if (s.phase === 'give') {
    const p = s.players[s.turn];
    const bug = pickOne(c.rng, p.hand);
    const target = pickOne(c.rng, s.players.filter((x) => x.id !== p.id)).id;
    c.events.push({ type: 'announce', text: tx(s.lang, 'timeoutGive', { who: mention(p.id) }) });
    return giveCard(c, p.id, bug, target, bug);
  }
  if (s.phase === 'respond') {
    c.events.push({ type: 'announce', text: tx(s.lang, 'timeoutRespond', { who: mention(s.card!.to) }) });
    return answer(c, s.card!.to, false);
  }
  if (s.phase === 'pass') {
    c.events.push({ type: 'announce', text: tx(s.lang, 'timeoutPass', { who: mention(s.card!.to) }) });
    return passCard(c, s.card!.to, pickOne(c.rng, unseen(s)), s.card!.claim);
  }
  return false;
}

// 從 ids 中選面前 bug 最多的人 (同張數隨機)
function mostFront(s: CrState, ids: string[], bug: Bug, rng: Rng) {
  const n = (id: string) => count(find(s, id)!.front, bug);
  const best = Math.max(...ids.map(n));
  return pickOne(rng, ids.filter((id) => n(id) === best));
}

// bot 只用自己看得到的資訊：自己的手牌、所有人面前的牌、偷看過的牌
function nextBotAction(s: CrState, rng: Rng): GameAction | null {
  if (s.phase === 'give') {
    const me = s.players[s.turn];
    if (!isBot(me.id)) return null;
    const gs = groups(me.hand);
    const most = Math.max(...gs.map((g) => g.n));
    const bug = pickOne(rng, gs.filter((g) => g.n === most)).bug;
    const target = mostFront(s, s.players.filter((p) => p.id !== me.id).map((p) => p.id), bug, rng);
    const claim = rng() < 0.5 ? bug : pickOne(rng, BUGS.filter((b) => b.bug !== bug)).bug;
    return { type: 'give', user: me.id, step: s.step, bug, target, claim };
  }
  const card = s.card;
  if (!card || !isBot(card.to)) return null;
  const me = find(s, card.to)!;
  if (s.phase === 'respond') {
    const known = count(me.hand, card.claim) + s.players.reduce((n, p) => n + count(p.front, card.claim), 0);
    const canPass = unseen(s).length > 0;
    if (known >= 8) return { type: 'answer', user: me.id, step: s.step, yes: false };
    if (canPass && (count(me.front, card.claim) >= LOSE_AT - 1 || rng() < 0.3)) return { type: 'peek', user: me.id, step: s.step };
    return { type: 'answer', user: me.id, step: s.step, yes: rng() < 0.5 };
  }
  if (s.phase === 'pass') {
    const target = mostFront(s, unseen(s), card.bug, rng);
    return { type: 'pass', user: me.id, step: s.step, target, claim: rng() < 0.5 ? card.bug : card.claim };
  }
  return null;
}

function runBots(c: Ctx) {
  for (let i = 0; i < 1000; i++) {
    const action = nextBotAction(c.s, c.rng);
    if (!action || !handle(c, action)) return;
  }
}

function startGame(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'give' }));
  const deck = shuffle(BUGS.flatMap((b) => Array<Bug>(8).fill(b.bug)), c.rng);
  for (const p of s.players) {
    p.hand = [];
    p.front = [];
  }
  deck.forEach((b, i) => s.players[i % n].hand.push(b));
  s.turn = Math.floor(c.rng() * n);
  c.events.push({
    type: 'announce',
    text: [
      tx(s.lang, 'started'),
      tx(s.lang, 'seats', { seats: s.players.map((p) => mention(p.id)).join(' → ') }),
      tx(s.lang, 'handCounts', { counts: s.players.map((p) => tx(s.lang, 'handCount', { who: mention(p.id), n: p.hand.length })).join(tx(s.lang, 'sep')) }),
      tx(s.lang, 'first', { who: mention(s.players[s.turn].id) }),
      tx(s.lang, 'loseRule', { n: LOSE_AT }),
    ].join('\n'),
  });
  for (const p of s.players.filter((x) => !isBot(x.id))) {
    c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'dm', { rules: tx(s.lang, 'rules', { n: LOSE_AT }), hand: longList(s.lang, p.hand), n: p.hand.length }) });
  }
  promptGive(c);
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_COCKROACH_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_COCKROACH_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_COCKROACH_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_COCKROACH_PLAYERS }));
      startGame(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'play':
      return playMenu(c, action.user);
    case 'hand':
      return showHand(c, action.user);
    case 'passMenu':
      return passMenu(c, action.user);
    case 'card':
      return stale(c, action.user, action.step) ? false : targetMenu(c, action.user, action.bug);
    case 'target':
      return stale(c, action.user, action.step) ? false : claimMenu(c, action.user, action.bug, action.target);
    case 'give':
      return stale(c, action.user, action.step) ? false : giveCard(c, action.user, action.bug, action.target, action.claim);
    case 'answer':
      return stale(c, action.user, action.step) ? false : answer(c, action.user, action.yes);
    case 'peek':
      return stale(c, action.user, action.step) ? false : peek(c, action.user);
    case 'to':
      return stale(c, action.user, action.step) ? false : sayMenu(c, action.user, action.target);
    case 'pass':
      return stale(c, action.user, action.step) ? false : passCard(c, action.user, action.target, action.claim);
    case 'timeout':
      return action.id === s.timers.phase ? onTimeout(c) : false;
  }
}


const newPlayer = (id: string): CrPlayer => ({ id, hand: [], front: [] });

export function applyCockroach(state: CrState | undefined, action: CrAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.loser,
    isPlayer: (s, user) => !!find(s, user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: CrState | undefined, host: string, channel: string): Result {
  const created: CrState = {
    game: 'cockroach',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    turn: 0,
    step: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
