// 情書 (Love Letter 2019 版) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyLoveLetter(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/loveletter.js';

export const MIN_LOVELETTER_PLAYERS = 2;
export const MAX_LOVELETTER_PLAYERS = 6;
const TITLE = '情書';
const TURN_MS = 120_000;

export type Role = 'spy' | 'guard' | 'priest' | 'baron' | 'handmaid' | 'prince' | 'chancellor' | 'king' | 'countess' | 'princess';

export const CARDS: { role: Role; value: number; count: number }[] = [
  { role: 'spy', value: 0, count: 2 },
  { role: 'guard', value: 1, count: 6 },
  { role: 'priest', value: 2, count: 2 },
  { role: 'baron', value: 3, count: 2 },
  { role: 'handmaid', value: 4, count: 2 },
  { role: 'prince', value: 5, count: 2 },
  { role: 'chancellor', value: 6, count: 2 },
  { role: 'king', value: 7, count: 1 },
  { role: 'countess', value: 8, count: 1 },
  { role: 'princess', value: 9, count: 1 },
];
const CARD = Object.fromEntries(CARDS.map((c) => [c.role, c])) as Record<Role, (typeof CARDS)[number]>;
export const TOKENS_TO_WIN: Record<number, number> = { 2: 6, 3: 5, 4: 4, 5: 3, 6: 3 };
const TARGETED: Role[] = ['guard', 'priest', 'baron', 'prince', 'king'];
const GUESSABLE: Role[] = CARDS.map((c) => c.role).filter((r) => r !== 'guard');
// 卡牌名稱和說明依語系從字典取
const cardName = (r: Role, lang?: Lang) => tx(lang, `name_${r}`);
const cardHelp = (r: Role, lang?: Lang) => tx(lang, `help_${r}`);
const helpText = (lang?: Lang) =>
  CARDS.map((c) => tx(lang, 'helpLine', { value: c.value, name: cardName(c.role, lang), count: c.count, help: cardHelp(c.role, lang) })).join('\n');

export const cardLabel = (r: Role, lang?: Lang) => `${CARD[r].value} ${cardName(r, lang)}`;

export interface LPlayer {
  id: string;
  hand: Role[];
  discards: Role[]; // 這一輪打出或被棄掉的牌 (公開)
  out: boolean;
  protected: boolean;
  tokens: number;
}

export interface LState {
  game: 'loveletter';
  channel: string;
  host: string;
  phase: 'lobby' | 'turn' | 'chancellor' | 'ended';
  players: LPlayer[];
  deck: Role[];
  burned?: Role; // 每輪蓋掉的 1 張
  faceUp: Role[]; // 2 人局翻開的 3 張
  round: number;
  turn: number;
  turnSeq: number; // 每個回合 +1，選單帶著它擋掉舊選單
  chancellor?: { pool: Role[] };
  lastWinners: string[];
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type LAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'log'; user: string }
  | { type: 'menu'; user: string }
  | { type: 'pick'; user: string; seq: number; index: number }
  | { type: 'target'; user: string; seq: number; index: number; target: string }
  | { type: 'play'; user: string; seq: number; index: number; target?: string; guess?: Role }
  | { type: 'keep'; user: string; seq: number; index: number }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<LAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: LState;
  events: GameEvent[];
}

interface Ctx {
  s: LState;
  events: GameEvent[];
  rng: Rng;
}

const pick = <T>(items: T[], rng: Rng): T => items[Math.floor(rng() * items.length)];
const current = (s: LState) => s.players[s.turn];
const playerOf = (s: LState, id: string) => s.players.find((p) => p.id === id);
const say = (c: Ctx, text: string) => c.events.push({ type: 'announce', text });
const dm = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'dm', to, text });
};
const cardsText = (cards: Role[], lang?: Lang) => cards.map((r) => cardLabel(r, lang)).join(tx(lang, 'sep'));
const handText = (p: LPlayer, lang?: Lang) => cardsText(p.hand, lang);

const tokenList = (s: LState) => s.players.map((p) => tx(s.lang, 'tokenItem', { who: mention(p.id), n: p.tokens })).join(tx(s.lang, 'sep'));

// 每輪：洗牌、蓋 1 張 (2 人局再翻開 3 張)、每人 1 張；上一輪勝者先開始
function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.deck = shuffle(CARDS.flatMap((x) => Array<Role>(x.count).fill(x.role)), c.rng);
  s.burned = s.deck.shift();
  s.faceUp = s.players.length === 2 ? s.deck.splice(0, 3) : [];
  s.chancellor = undefined;
  for (const p of s.players) Object.assign(p, { hand: [s.deck.shift()!], discards: [], out: false, protected: false });
  const ids = s.players.map((p) => p.id);
  s.turn = s.round === 1 ? Math.floor(c.rng() * ids.length) : ids.indexOf(pick(s.lastWinners, c.rng));
  const order = ids.map((_, i) => ids[(s.turn + i) % ids.length]);
  const lines = [
    tx(s.lang, 'roundStart', { round: s.round, order: order.map(mention).join(' → ') }),
    tx(s.lang, 'tokensGoal', { goal: TOKENS_TO_WIN[ids.length], list: tokenList(s) }),
  ];
  if (s.faceUp.length) lines.push(tx(s.lang, 'faceUp', { cards: cardsText(s.faceUp, s.lang) }));
  c.events.push({ type: 'announce', text: lines.join('\n'), gif: s.round === 1 ? 'start' : undefined });
  for (const p of s.players) dm(c, p.id, tx(s.lang, 'yourHandDm', { round: s.round, hand: handText(p, s.lang), help: helpText(s.lang) }));
  beginTurn(c);
}

function beginTurn(c: Ctx) {
  const s = c.s;
  const p = current(s);
  p.protected = false;
  p.hand.push(s.deck.shift()!);
  s.turnSeq++;
  s.phase = 'turn';
  say(c, tx(s.lang, 'yourTurn', { who: mention(p.id), round: s.round, left: s.deck.length }));
  if (!isBot(p.id)) {
    c.events.push({
      type: 'prompt',
      kind: 'loveletter',
      audience: 'channel',
      text: tx(s.lang, 'pressPlay', { who: mention(p.id), min: TURN_MS / 60_000 }),
      options: [
        { value: 'menu', label: tx(s.lang, 'playBtn') },
        { value: 'hand', label: tx(s.lang, 'handBtn') },
        { value: 'log', label: tx(s.lang, 'logBtn') },
      ],
    });
  }
  startTimer(c, TURN_MS);
}

// 可以出的牌 (同一種只列一次)：伯爵夫人和國王／王子同時在手只能出伯爵夫人；公主不能主動出
function playable(p: LPlayer): number[] {
  const forced = p.hand.includes('countess') && (p.hand.includes('king') || p.hand.includes('prince'));
  return p.hand
    .map((r, i) => [r, i] as const)
    .filter(([r, i]) => p.hand.indexOf(r) === i && r !== 'princess' && (!forced || r === 'countess'))
    .map(([, i]) => i);
}

// 可以選的目標：還在場、沒有受到保護的其他玩家；王子也可以選自己
function targetsFor(s: LState, p: LPlayer, role: Role): string[] {
  const others = s.players.filter((x) => x.id !== p.id && !x.out && !x.protected).map((x) => x.id);
  return role === 'prince' ? [...others, p.id] : others;
}

// 檢查選單的每一步：回合編號、輪到誰、這張牌能不能出；不行就回覆原因並回傳 null
function check(c: Ctx, user: string, seq: number, index: number): LPlayer | null {
  const s = c.s;
  const p = current(s);
  const error =
    seq !== s.turnSeq ? tx(s.lang, 'expired')
    : s.phase !== 'turn' || p.id !== user ? tx(s.lang, 'notYourTurn')
    : !playable(p).includes(index) ? tx(s.lang, 'cannotPlay')
    : undefined;
  if (!error) return p;
  reply(c, user, error);
  return null;
}

function menu(c: Ctx, user: string): boolean {
  const s = c.s;
  const p = current(s);
  if (s.phase === 'chancellor' && p.id === user) {
    promptKeep(c); // 宰相選到一半，重新顯示選牌按鈕
    return false;
  }
  if (s.phase !== 'turn' || p.id !== user) return reply(c, user, tx(s.lang, 'notYourTurn'));
  const lines = p.hand.map((r) => tx(s.lang, 'menuItem', { card: cardLabel(r, s.lang), help: cardHelp(r, s.lang) }));
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'menu', { lines: lines.join('\n') }),
    options: playable(p).map((i) => ({ value: `pick:${s.turnSeq}:${i}`, label: cardLabel(p.hand[i], s.lang) })),
  });
  return false;
}

function choose(c: Ctx, user: string, seq: number, index: number): boolean {
  const p = check(c, user, seq, index);
  if (!p) return false;
  const role = p.hand[index];
  const targets = targetsFor(c.s, p, role);
  if (!TARGETED.includes(role) || !targets.length) return resolve(c, p, index);
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: tx(c.s.lang, 'chooseTarget', { card: cardLabel(role, c.s.lang) }),
    options: targets.map((id) => ({ value: `tgt:${seq}:${index}:${id}`, label: id })),
  });
  return false;
}

function chooseTarget(c: Ctx, user: string, seq: number, index: number, target: string): boolean {
  const p = check(c, user, seq, index);
  if (!p) return false;
  const role = p.hand[index];
  if (!targetsFor(c.s, p, role).includes(target)) return reply(c, user, tx(c.s.lang, 'badTarget'));
  if (role !== 'guard') return resolve(c, p, index, target);
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user,
    text: tx(c.s.lang, 'guess', { who: mention(target) }),
    options: GUESSABLE.map((r) => ({ value: `guess:${seq}:${index}:${r}:${target}`, label: cardLabel(r, c.s.lang) })),
  });
  return false;
}

function playCard(c: Ctx, a: Extract<LAction, { type: 'play' }>): boolean {
  const p = check(c, a.user, a.seq, a.index);
  if (!p) return false;
  const role = p.hand[a.index];
  const targets = targetsFor(c.s, p, role);
  if (TARGETED.includes(role) && targets.length) {
    if (!a.target || !targets.includes(a.target)) return reply(c, a.user, tx(c.s.lang, 'badTarget'));
    if (role === 'guard' && (!a.guess || !GUESSABLE.includes(a.guess))) return reply(c, a.user, tx(c.s.lang, 'noGuard'));
  }
  return resolve(c, p, a.index, a.target, a.guess);
}

function eliminate(c: Ctx, t: LPlayer) {
  const shown = t.hand;
  t.out = true;
  t.discards.push(...shown);
  t.hand = [];
  const lang = c.s.lang;
  say(c, tx(lang, 'out', { who: mention(t.id), shown: shown.length ? tx(lang, 'outHand', { cards: cardsText(shown, lang) }) : '' }));
}

// 打出一張牌並執行效果
function resolve(c: Ctx, p: LPlayer, index: number, targetId?: string, guess?: Role, auto = false): boolean {
  const s = c.s;
  const role = p.hand.splice(index, 1)[0];
  p.discards.push(role);
  const lang = s.lang;
  const head = tx(lang, 'head', { auto: auto ? tx(lang, 'autoPlay') : '', who: mention(p.id), card: cardLabel(role, lang) });
  const t = targetId && TARGETED.includes(role) ? playerOf(s, targetId) : undefined;
  if (TARGETED.includes(role) && !t) {
    say(c, tx(lang, 'noTarget', { head }));
  } else if (role === 'guard' && t && guess) {
    const hit = t.hand[0] === guess;
    say(c, tx(lang, 'guardPlay', { head, who: mention(t.id), card: cardLabel(guess, lang), result: tx(lang, hit ? 'hit' : 'miss') }));
    if (hit) eliminate(c, t);
  } else if (role === 'priest' && t) {
    dm(c, p.id, tx(lang, 'priestDm', { who: mention(t.id), hand: handText(t, lang) }));
    say(c, tx(lang, 'priestPlay', { head, who: mention(t.id) }));
  } else if (role === 'baron' && t) {
    dm(c, p.id, tx(lang, 'baronDm', { who: mention(t.id), hand: handText(t, lang) }));
    dm(c, t.id, tx(lang, 'baronTargetDm', { who: mention(p.id), hand: handText(p, lang) }));
    const diff = CARD[p.hand[0]].value - CARD[t.hand[0]].value;
    say(c, tx(lang, 'baronPlay', { head, who: mention(t.id), tie: tx(lang, diff === 0 ? 'baronTie' : 'baronNoTie') }));
    if (diff !== 0) eliminate(c, diff > 0 ? t : p);
  } else if (role === 'handmaid') {
    p.protected = true;
    say(c, tx(lang, 'handmaidPlay', { head }));
  } else if (role === 'prince' && t) {
    const dropped = t.hand.shift()!;
    t.discards.push(dropped);
    say(c, tx(lang, 'princePlay', { head, who: mention(t.id), card: cardLabel(dropped, lang) }));
    if (dropped === 'princess') eliminate(c, t);
    else {
      let card = s.deck.shift();
      if (!card) [card, s.burned] = [s.burned, undefined]; // 牌堆空了拿蓋掉的那張
      t.hand = card ? [card] : [];
      if (card) dm(c, t.id, tx(lang, 'princeDm', { old: cardLabel(dropped, lang), card: cardLabel(card, lang) }));
    }
  } else if (role === 'chancellor') {
    const drawn = s.deck.splice(0, 2);
    if (drawn.length) {
      s.chancellor = { pool: [...p.hand, ...drawn] };
      s.phase = 'chancellor';
      say(c, tx(lang, 'chancellorPlay', { head, n: s.chancellor.pool.length }));
      promptKeep(c);
      startTimer(c, TURN_MS);
      return true;
    }
    say(c, tx(lang, 'chancellorEmpty', { head }));
  } else if (role === 'king' && t) {
    [p.hand, t.hand] = [t.hand, p.hand];
    dm(c, p.id, tx(lang, 'kingDm', { who: mention(t.id), hand: handText(p, lang) }));
    dm(c, t.id, tx(lang, 'kingTargetDm', { who: mention(p.id), hand: handText(t, lang) }));
    say(c, tx(lang, 'kingPlay', { head, who: mention(t.id) }));
  } else if (role === 'princess') {
    say(c, tx(lang, 'princessPlay', { head }));
    eliminate(c, p);
  } else {
    say(c, tx(lang, 'plainPlay', { head }));
  }
  endTurn(c);
  return true;
}

function promptKeep(c: Ctx) {
  const s = c.s;
  c.events.push({
    type: 'prompt',
    kind: 'loveletter',
    audience: 'ephemeral',
    user: current(s).id,
    text: tx(s.lang, 'keepPrompt', { min: TURN_MS / 60_000 }),
    options: s.chancellor!.pool.map((r, i) => ({ value: `keep:${s.turnSeq}:${i}`, label: cardLabel(r, s.lang) })),
  });
}

function finishChancellor(c: Ctx, k: number) {
  const s = c.s;
  const p = current(s);
  const pool = s.chancellor!.pool;
  const rest = shuffle(pool.filter((_, i) => i !== k), c.rng);
  s.deck.push(...rest);
  p.hand = [pool[k]];
  s.chancellor = undefined;
  s.phase = 'turn';
  dm(c, p.id, tx(s.lang, 'keptDm', { card: cardLabel(pool[k], s.lang) }));
  say(c, tx(s.lang, 'keptSay', { who: mention(p.id), n: rest.length }));
  endTurn(c);
}

function endTurn(c: Ctx) {
  const s = c.s;
  const living = s.players.filter((p) => !p.out);
  if (living.length === 1) return endRound(c, [living[0].id], false);
  if (!s.deck.length) {
    const best = Math.max(...living.map((p) => (p.hand[0] ? CARD[p.hand[0]].value : -1)));
    return endRound(c, living.filter((p) => p.hand[0] && CARD[p.hand[0]].value === best).map((p) => p.id), true);
  }
  for (let i = 1; i <= s.players.length; i++) {
    const k = (s.turn + i) % s.players.length;
    if (!s.players[k].out) {
      s.turn = k;
      break;
    }
  }
  beginTurn(c);
}

function endRound(c: Ctx, winners: string[], showdown: boolean) {
  const s = c.s;
  const living = s.players.filter((p) => !p.out);
  for (const id of winners) playerOf(s, id)!.tokens++;
  const spies = living.filter((p) => p.discards.includes('spy'));
  const lang = s.lang;
  const lines = [tx(lang, 'roundEnd', { round: s.round, who: winners.map(mention).join(tx(lang, 'sep')) })];
  if (showdown) {
    lines.push(tx(lang, 'showdown', { list: living.map((p) => tx(lang, 'showdownItem', { who: mention(p.id), hand: handText(p, lang) })).join(tx(lang, 'sep')) }));
  }
  if (spies.length === 1) {
    spies[0].tokens++;
    lines.push(tx(lang, 'spyBonus', { who: mention(spies[0].id) }));
  }
  if (s.burned) lines.push(tx(lang, 'burned', { card: cardLabel(s.burned, lang) }));
  lines.push(tx(lang, 'tokens', { list: tokenList(s) }));
  say(c, lines.join('\n'));
  s.lastWinners = winners;
  const reached = s.players.filter((p) => p.tokens >= TOKENS_TO_WIN[s.players.length]);
  if (!reached.length) return startRound(c);
  const top = Math.max(...reached.map((p) => p.tokens));
  endGame(c, s.players.filter((p) => p.tokens === top).map((p) => p.id));
}

function endGame(c: Ctx, winners: string[]) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.winners = winners;
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: winners });
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'win', { who: winners.map(mention).join(tx(s.lang, 'sep')) }), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 每個角色還沒公開出現的張數 (打出、棄掉、出局、2 人局翻開的都算公開)
function unseen(s: LState): Record<Role, number> {
  const left = Object.fromEntries(CARDS.map((x) => [x.role, x.count])) as Record<Role, number>;
  for (const r of [...s.faceUp, ...s.players.flatMap((p) => p.discards)]) left[r]--;
  return left;
}

function showLog(c: Ctx, user: string) {
  const s = c.s;
  const left = unseen(s);
  const lang = s.lang;
  const lines = [tx(lang, 'logTitle', { round: s.round })];
  for (const p of s.players) {
    const tags = `${p.out ? tx(lang, 'tagOut') : ''}${p.protected ? tx(lang, 'tagProtected') : ''}`;
    lines.push(tx(lang, 'logLine', { who: mention(p.id), n: p.tokens, tags, cards: p.discards.length ? cardsText(p.discards, lang) : tx(lang, 'none') }));
  }
  if (s.faceUp.length) lines.push(tx(lang, 'faceUp', { cards: cardsText(s.faceUp, lang) }));
  lines.push(tx(lang, 'unseen', { list: CARDS.map((x) => tx(lang, 'unseenItem', { name: cardName(x.role, lang), n: Math.max(0, left[x.role]) })).join(tx(lang, 'sep')) }));
  c.events.push({ type: 'ephemeral', to: user, text: lines.join('\n') });
}

function showHand(c: Ctx, user: string) {
  const p = playerOf(c.s, user);
  const lang = c.s.lang;
  if (!p || p.out) {
    reply(c, user, tx(lang, 'notInRound'));
    return;
  }
  const lines = [tx(lang, 'yourHand', { hand: handText(p, lang) })];
  if (p.protected) lines.push(tx(lang, 'protected'));
  lines.push(tx(lang, 'yourTokens', { n: p.tokens }));
  c.events.push({ type: 'ephemeral', to: user, text: lines.join('\n') });
}

// 超時 (smart=false) 和 bot (smart=true) 共用的自動出牌
function autoPlay(c: Ctx, p: LPlayer, smart: boolean) {
  const opts = playable(p);
  const maid = opts.find((i) => p.hand[i] === 'handmaid');
  const index = smart && maid !== undefined ? maid : opts.reduce((a, b) => (CARD[p.hand[b]].value < CARD[p.hand[a]].value ? b : a));
  const role = p.hand[index];
  const targets = targetsFor(c.s, p, role);
  const others = targets.filter((id) => id !== p.id);
  const target = TARGETED.includes(role) && targets.length ? pick(smart && others.length ? others : targets, c.rng) : undefined;
  const left = unseen(c.s);
  const guesses = smart ? GUESSABLE.filter((r) => left[r] > 0) : GUESSABLE;
  const guess = role === 'guard' ? pick(guesses.length ? guesses : GUESSABLE, c.rng) : undefined;
  resolve(c, p, index, target, guess, !smart);
}

const bestIndex = (pool: Role[]) => pool.reduce((a, r, i) => (CARD[r].value > CARD[pool[a]].value ? i : a), 0);

function runBots(c: Ctx) {
  const s = c.s;
  for (let i = 0; i < 10_000; i++) {
    if (s.phase !== 'turn' && s.phase !== 'chancellor') return;
    const p = current(s);
    if (!isBot(p.id)) return;
    if (s.phase === 'chancellor') finishChancellor(c, bestIndex(s.chancellor!.pool));
    else autoPlay(c, p, true);
  }
}

const newPlayer = (id: string): LPlayer => ({ id, hand: [], discards: [], out: false, protected: false, tokens: 0 });

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_LOVELETTER_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_LOVELETTER_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_LOVELETTER_PLAYERS) return reply(c, action.user, tx(s.lang, 'needPlayers', { n, min: MIN_LOVELETTER_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'turn' }));
      startRound(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      showHand(c, action.user);
      return false;
    case 'log':
      if (s.phase === 'lobby') return false;
      showLog(c, action.user);
      return false;
    case 'menu':
      return menu(c, action.user);
    case 'pick':
      return choose(c, action.user, action.seq, action.index);
    case 'target':
      return chooseTarget(c, action.user, action.seq, action.index, action.target);
    case 'play':
      return playCard(c, action);
    case 'keep': {
      if (s.phase !== 'chancellor' || action.seq !== s.turnSeq || current(s).id !== action.user) return reply(c, action.user, tx(s.lang, 'expired'));
      if (!s.chancellor!.pool[action.index]) return false;
      finishChancellor(c, action.index);
      return true;
    }
    case 'timeout': {
      if (action.id !== s.timers.phase) return false;
      if (s.phase === 'chancellor') finishChancellor(c, 0);
      else if (s.phase === 'turn') autoPlay(c, current(s), false);
      else return false;
      return true;
    }
  }
}

export function applyLoveLetter(state: LState | undefined, action: LAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: LState | undefined, host: string, channel: string): Result {
  const created: LState = {
    game: 'loveletter',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    faceUp: [],
    round: 0,
    turn: 0,
    turnSeq: prev?.turnSeq ?? 0,
    lastWinners: [],
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
