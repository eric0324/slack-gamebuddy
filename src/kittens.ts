// 炸彈貓 (Exploding Kittens 原版) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyKittens(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/kittens.js';

export const MIN_KITTENS_PLAYERS = 2;
export const MAX_KITTENS_PLAYERS = 5;
const TITLE = '炸彈貓';
export const PLAY_MS = 60_000;
export const NOPE_MS = 5_000;
export const FAVOR_MS = 30_000;
export const PLACE_MS = 30_000;

export const CATS = ['taco', 'melon', 'potato', 'beard', 'rainbow'] as const;
export type Cat = (typeof CATS)[number];
// 手牌的固定順序 (也是選單排序)；炸彈不會留在手上
export const CARDS = ['defuse', 'nope', 'attack', 'skip', 'favor', 'shuffle', 'future', ...CATS] as const;
export type Card = 'bomb' | (typeof CARDS)[number];
const ACTIONS = ['attack', 'skip', 'favor', 'shuffle', 'future'] as const;
type ActionCard = (typeof ACTIONS)[number];

// 卡牌名稱 (含 emoji) 在字典的 card.<牌>
export const cardName = (lang: Lang | undefined, card: Card) => tx(lang, `card.${card}`);
const COPIES: Record<Exclude<Card, 'bomb' | 'defuse'>, number> = {
  nope: 5, attack: 4, skip: 4, favor: 4, shuffle: 4, future: 5, taco: 4, melon: 4, potato: 4, beard: 4, rainbow: 4,
};
// 被索取時 bot 給牌的順序：越前面越不重要
const GIVE_ORDER: Card[] = [...CATS, 'shuffle', 'future', 'favor', 'skip', 'attack', 'nope', 'defuse'];
export type Pos = 'top' | '2' | '3' | 'bottom' | 'random';

export interface KPlayer {
  id: string;
  hand: Card[];
  out?: number; // 第幾個出局
}

export interface KState {
  game: 'kittens';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'target' | 'nope' | 'favor' | 'place' | 'ended';
  players: KPlayer[];
  deck: Card[]; // deck[0] 是最上面
  turn: number; // 輪到的玩家 index
  turnsLeft: number; // 這位還要進行幾回合 (被攻擊是 2)
  seq: number; // 每回合 +1：牌桌訊息的 ref，也用來擋掉舊選單
  nopeSeq: number; // 反對等待訊息的 ref
  played: string[]; // 這回合出過的牌 (顯示用)
  outCount: number;
  pending?: { card: Card; pair?: boolean; by: string; target?: string; nopes: number }; // 等反對的牌
  choosing?: { card: Card; pair?: boolean }; // phase 'target'：選對象中
  favor?: { from: string; to: string }; // phase 'favor'：from 要給 to 一張牌
  botTop: Record<string, Card | null>; // bot 記得的牌堆最上面那張
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type KAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'play'; user: string; seq: number; card: Card; pair?: boolean }
  | { type: 'target'; user: string; seq: number; target: string }
  | { type: 'nope'; user: string }
  | { type: 'draw'; user: string; seq: number }
  | { type: 'give'; user: string; card: Card }
  | { type: 'place'; user: string; pos: Pos }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<KAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: KState; events: GameEvent[] };
type Ctx = { s: KState; events: GameEvent[]; rng: Rng };

const count = (cards: Card[], card: Card) => cards.filter((c) => c === card).length;
const alive = (s: KState) => s.players.filter((p) => !p.out);
const current = (s: KState) => s.players[s.turn];
const find = (s: KState, id: string) => s.players.find((p) => p.id === id);
const take = (hand: Card[], card: Card) => hand.splice(hand.indexOf(card), 1)[0];
const grouped = (s: KState, cards: Card[]) =>
  CARDS.filter((c) => cards.includes(c)).map((c) => `${cardName(s.lang, c)} ×${count(cards, c)}`).join(tx(s.lang, 'sep')) || tx(s.lang, 'noHand');
const playName = (s: KState, card: Card, pair?: boolean) => (pair ? tx(s.lang, 'pair', { card: cardName(s.lang, card) }) : cardName(s.lang, card));
// 「🌮 打出一對塔可貓」：卡名第一個空白前是 emoji，後面是名稱 (英文卡名本身有空白)
const pairLabel = (s: KState, cat: Card) => {
  const full = cardName(s.lang, cat);
  const i = full.indexOf(' ');
  return tx(s.lang, 'pairLabel', { emoji: full.slice(0, i), name: full.slice(i + 1) });
};
const targetsOf =(s: KState, id: string) => alive(s).filter((p) => p.id !== id && p.hand.length > 0);
const nextAlive = (s: KState, from: number) => {
  for (let i = 1; i <= s.players.length; i++) {
    const idx = (from + i) % s.players.length;
    if (!s.players[idx].out) return idx;
  }
  return from;
};

// 只對真人送私下訊息 (bot 不需要)
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text });
};
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'kittens', audience: 'ephemeral', user, text, options, perRow: 4 });
};

function board(s: KState, ended = false): GameEvent {
  const me = current(s);
  const lines = ended
    ? [tx(s.lang, 'turnEnd', { who: mention(me.id) })]
    : [
        tx(s.lang, 'boardTurn', {
          who: mention(me.id),
          more: s.turnsLeft > 1 ? tx(s.lang, 'turnsMore', { n: s.turnsLeft }) : '',
          deck: s.deck.length,
          sec: PLAY_MS / 1000,
        }),
        ...s.players.map((p) => (p.out ? tx(s.lang, 'boardOut', { who: mention(p.id) }) : tx(s.lang, 'boardCards', { who: mention(p.id), n: p.hand.length }))),
        ...(s.played.length ? [tx(s.lang, 'boardPlayed', { cards: s.played.join(tx(s.lang, 'sep')) })] : []),
      ];
  return {
    type: 'prompt',
    kind: 'kittens',
    audience: 'channel',
    ref: `kittens:${s.seq}`,
    text: lines.join('\n'),
    options: ended ? [] : [{ value: 'hand', label: tx(s.lang, 'myHand') }, { value: `draw:${s.seq}`, label: tx(s.lang, 'drawBtn') }],
  };
}

function nopePrompt(s: KState, text: string, open: boolean): GameEvent {
  return { type: 'prompt', kind: 'kittens', audience: 'channel', ref: `kittens:nope:${s.seq}:${s.nopeSeq}`, text, options: open ? [{ value: 'nope', label: tx(s.lang, 'nopeBtn') }] : [] };
}

function startTurn(c: Ctx) {
  const s = c.s;
  s.seq++;
  s.played = [];
  s.phase = 'play';
  s.choosing = undefined;
  c.events.push(board(s));
  startTimer(c, PLAY_MS);
}

// 結束目前這 1 回合：被攻擊還有剩就再來一回合，否則換下一位
function finishOneTurn(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  s.turnsLeft--;
  if (s.turnsLeft <= 0) {
    s.turn = nextAlive(s, s.turn);
    s.turnsLeft = 1;
  }
  startTurn(c);
}

function passTurn(c: Ctx, turnsLeft: number) {
  const s = c.s;
  c.events.push(board(s, true));
  s.turn = nextAlive(s, s.turn);
  s.turnsLeft = turnsLeft;
  startTurn(c);
}

function backToPlay(c: Ctx) {
  c.s.phase = 'play';
  c.events.push(board(c.s));
  startTimer(c, PLAY_MS);
}

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (me.out) return reply(c, user, tx(s.lang, 'isOut'));
  const myTurn = current(s).id === user && (s.phase === 'play' || s.phase === 'target');
  const canTarget = targetsOf(s, user).length > 0;
  const options = !myTurn
    ? []
    : [
        ...ACTIONS.filter((a) => me.hand.includes(a) && (a !== 'favor' || canTarget)).map((a) => ({ value: `play:${s.seq}:${a}`, label: cardName(s.lang, a) })),
        ...(canTarget ? CATS.filter((cat) => count(me.hand, cat) >= 2) : []).map((cat) => ({ value: `play:${s.seq}:pair:${cat}`, label: pairLabel(s, cat) })),
      ];
  c.events.push({ type: 'prompt', kind: 'kittens', audience: 'ephemeral', user, text: tx(s.lang, 'yourHand', { hand: grouped(s, me.hand) }), options, perRow: 4 });
  return false;
}

// 輪到的人出牌前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: KState, user: string, seq: number): string | null {
  const me = find(s, user);
  if (!me) return tx(s.lang, 'notPlayer');
  if (me.out) return tx(s.lang, 'isOut');
  if (seq !== s.seq) return tx(s.lang, 'stale');
  if (current(s).id !== user) return tx(s.lang, 'notYourTurn');
  if (s.phase !== 'play' && s.phase !== 'target') return tx(s.lang, 'cannotPlay');
  return null;
}

function play(c: Ctx, user: string, seq: number, card: Card, pair?: boolean): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  const hand = current(s).hand;
  const ok = pair ? (CATS as readonly Card[]).includes(card) && count(hand, card) >= 2 : (ACTIONS as readonly Card[]).includes(card) && hand.includes(card);
  if (!ok) return reply(c, user, tx(s.lang, 'stale'));
  if (pair || card === 'favor') {
    const targets = targetsOf(s, user);
    if (!targets.length) return reply(c, user, tx(s.lang, 'noTargets'));
    s.phase = 'target';
    s.choosing = { card, pair };
    menu(c, user, tx(s.lang, 'chooseTarget', { card: playName(s, card, pair) }), targets.map((p) => ({ value: `target:${s.seq}:${p.id}`, label: p.id })));
    return true;
  }
  commit(c, card, pair);
  return true;
}

function chooseTarget(c: Ctx, user: string, seq: number, target: string): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return reply(c, user, err);
  if (s.phase !== 'target' || !s.choosing) return reply(c, user, tx(s.lang, 'stale'));
  if (!targetsOf(s, user).some((p) => p.id === target)) return reply(c, user, tx(s.lang, 'badTarget'));
  const { card, pair } = s.choosing;
  s.choosing = undefined;
  commit(c, card, pair, target);
  return true;
}

// 打出牌：從手牌移出、公告，開始等反對
function commit(c: Ctx, card: Card, pair?: boolean, target?: string) {
  const s = c.s;
  const me = current(s);
  take(me.hand, card);
  if (pair) take(me.hand, card);
  s.played.push(playName(s, card, pair));
  s.pending = { card, pair, by: me.id, target, nopes: 0 };
  s.phase = 'nope';
  s.nopeSeq++;
  const name = playName(s, card, pair);
  const text = target ? tx(s.lang, 'playedAt', { who: mention(me.id), card: name, target: mention(target) }) : tx(s.lang, 'played', { who: mention(me.id), card: name });
  c.events.push({ type: 'announce', text });
  c.events.push(nopePrompt(s, tx(s.lang, 'nopeOpen', { text, sec: NOPE_MS / 1000 }), true));
  c.events.push(board(s));
  startTimer(c, NOPE_MS);
}

function nope(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (me.out) return reply(c, user, tx(s.lang, 'isOut'));
  if (s.phase !== 'nope' || !s.pending) return reply(c, user, tx(s.lang, 'tooLate'));
  if (!me.hand.includes('nope')) return reply(c, user, tx(s.lang, 'noNope'));
  take(me.hand, 'nope');
  s.pending.nopes++;
  const p = s.pending;
  c.events.push({ type: 'announce', text: tx(s.lang, 'noped', { who: mention(user), n: p.nopes }) });
  c.events.push(nopePrompt(s, tx(s.lang, 'nopeAgain', { by: mention(p.by), card: playName(s, p.card, p.pair), n: p.nopes, sec: NOPE_MS / 1000 }), true));
  c.events.push(board(s));
  startTimer(c, NOPE_MS);
  return true;
}

// 反對等待結束：奇數張失效，偶數張生效
function resolve(c: Ctx) {
  const s = c.s;
  const p = s.pending!;
  s.pending = undefined;
  const name = playName(s, p.card, p.pair);
  const by = mention(p.by);
  if (p.nopes % 2 === 1) {
    c.events.push(nopePrompt(s, tx(s.lang, 'nopedPrompt', { by, card: name }), false));
    c.events.push({ type: 'announce', text: tx(s.lang, 'nopedAnnounce', { by, card: name }) });
    return backToPlay(c);
  }
  c.events.push(nopePrompt(s, tx(s.lang, 'works', { by, card: name }), false));
  if (p.pair) return steal(c, p.by, p.target!);
  switch (p.card) {
    case 'attack':
      c.events.push({ type: 'announce', text: tx(s.lang, 'attackWorks', { by }) });
      return passTurn(c, 2);
    case 'skip':
      c.events.push({ type: 'announce', text: tx(s.lang, 'skipWorks', { by }) });
      return finishOneTurn(c);
    case 'shuffle':
      s.deck = shuffle(s.deck, c.rng);
      s.botTop = {};
      c.events.push({ type: 'announce', text: tx(s.lang, 'shuffleWorks') });
      return backToPlay(c);
    case 'future': {
      const top = s.deck.slice(0, 3);
      tell(c, p.by, tx(s.lang, 'futureTop', { cards: top.map((x) => cardName(s.lang, x)).join(' → ') }));
      if (isBot(p.by)) s.botTop[p.by] = top[0] ?? null;
      c.events.push({ type: 'announce', text: tx(s.lang, 'futureSeen', { by }) });
      return backToPlay(c);
    }
    case 'favor':
      return askFavor(c, p.by, p.target!);
  }
}

function askFavor(c: Ctx, to: string, from: string) {
  const s = c.s;
  const giver = find(s, from)!;
  if (!giver.hand.length) {
    c.events.push({ type: 'announce', text: tx(s.lang, 'favorEmpty', { who: mention(from) }) });
    return backToPlay(c);
  }
  s.phase = 'favor';
  s.favor = { from, to };
  c.events.push({ type: 'announce', text: tx(s.lang, 'favorWait', { from: mention(from), to: mention(to), sec: FAVOR_MS / 1000 }) });
  menu(c, from, tx(s.lang, 'favorMenu', { to: mention(to) }), CARDS.filter((x) => giver.hand.includes(x)).map((x) => ({ value: `give:${x}`, label: `${cardName(s.lang, x)} ×${count(giver.hand, x)}` })));
  startTimer(c, FAVOR_MS);
}

function give(c: Ctx, user: string, card: Card): boolean {
  const s = c.s;
  if (s.phase !== 'favor' || s.favor?.from !== user) return reply(c, user, tx(s.lang, 'noNeedGive'));
  if (!find(s, user)!.hand.includes(card)) return reply(c, user, tx(s.lang, 'noSuchCard', { card: cardName(s.lang, card) }));
  transfer(c, user, s.favor.to, card);
  c.events.push({ type: 'announce', text: tx(s.lang, 'gave', { who: mention(user), to: mention(s.favor.to) }) });
  s.favor = undefined;
  backToPlay(c);
  return true;
}

function transfer(c: Ctx, from: string, to: string, card: Card) {
  take(find(c.s, from)!.hand, card);
  find(c.s, to)!.hand.push(card);
  const name = cardName(c.s.lang, card);
  tell(c, to, tx(c.s.lang, 'gotFrom', { from: mention(from), card: name }));
  tell(c, from, tx(c.s.lang, 'gaveTo', { card: name, to: mention(to) }));
}

function steal(c: Ctx, by: string, target: string) {
  const victim = find(c.s, target)!;
  if (!victim.hand.length) {
    c.events.push({ type: 'announce', text: tx(c.s.lang, 'stealEmpty', { who: mention(target) }) });
    return backToPlay(c);
  }
  transfer(c, target, by, victim.hand[Math.floor(c.rng() * victim.hand.length)]);
  c.events.push({ type: 'announce', text: tx(c.s.lang, 'stole', { by: mention(by), target: mention(target) }) });
  backToPlay(c);
}

function draw(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq);
  if (err) return reply(c, user, err);
  drawCard(c);
  return true;
}

function drawCard(c: Ctx) {
  const s = c.s;
  const me = current(s);
  s.choosing = undefined;
  const card = s.deck.shift()!;
  s.botTop = {};
  if (card !== 'bomb') {
    me.hand.push(card);
    tell(c, me.id, tx(s.lang, 'drew', { card: cardName(s.lang, card) }));
    return finishOneTurn(c);
  }
  c.events.push({ type: 'announce', text: tx(s.lang, 'drewBomb', { who: mention(me.id), card: cardName(s.lang, 'bomb') }) });
  if (me.hand.includes('defuse')) {
    take(me.hand, 'defuse');
    s.phase = 'place';
    c.events.push({ type: 'announce', text: tx(s.lang, 'defused', { who: mention(me.id) }) });
    menu(c, me.id, tx(s.lang, 'placeMenu'), placeOptions(s, s.deck.length));
    return startTimer(c, PLACE_MS);
  }
  eliminate(c, me);
}

const placeOptions = (s: KState, n: number) =>
  (['top', ...(n >= 2 ? ['2'] : []), ...(n >= 3 ? ['3'] : []), ...(n >= 1 ? ['bottom', 'random'] : [])] as Pos[]).map((p) => ({ value: `place:${p}`, label: tx(s.lang, `pos.${p}`) }));

function place(c: Ctx, user: string, pos: Pos): boolean {
  const s = c.s;
  if (s.phase !== 'place' || current(s).id !== user) return reply(c, user, tx(s.lang, 'noNeedPlace'));
  const n = s.deck.length;
  const index = { top: 0, '2': 1, '3': 2, bottom: n, random: Math.floor(c.rng() * (n + 1)) }[pos];
  s.deck.splice(Math.min(index, n), 0, 'bomb');
  s.botTop = {};
  c.events.push({ type: 'announce', text: tx(s.lang, 'placed') });
  finishOneTurn(c);
  return true;
}

function eliminate(c: Ctx, me: KPlayer) {
  const s = c.s;
  me.hand = [];
  me.out = ++s.outCount;
  c.events.push({ type: 'announce', text: tx(s.lang, 'eliminated', { who: mention(me.id) }) });
  if (alive(s).length === 1) return endGame(c);
  passTurn(c, 1);
}

function endGame(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  s.phase = 'ended';
  s.timers = {};
  const winner = alive(s)[0];
  s.winners = [winner.id];
  const ranking = [winner, ...s.players.filter((p) => p.out).sort((a, b) => b.out! - a.out!)];
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [tx(s.lang, 'gameOver', { who: mention(winner.id) }), ...ranking.map((p, i) => `${i + 1}. ${mention(p.id)}${i === 0 ? ' 🏆' : ''}`)].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: tx(s.lang, 'rematchAsk'), options: [{ value: 'rematch', label: tx(s.lang, 'rematchBtn') }] },
  );
}

function timeout(c: Ctx) {
  const s = c.s;
  switch (s.phase) {
    case 'play':
    case 'target':
      c.events.push({ type: 'announce', text: tx(s.lang, 'timedOut', { who: mention(current(s).id) }) });
      return drawCard(c);
    case 'nope':
      return resolve(c);
    case 'favor': {
      const hand = find(s, s.favor!.from)!.hand;
      return give(c, s.favor!.from, hand[Math.floor(c.rng() * hand.length)]);
    }
    case 'place':
      return place(c, current(s).id, 'random');
  }
}

// bot：輪到自己就出牌或抽牌；對自己不利的牌反對一次；被索取給最不重要的；拆解後隨機放
function botStep(c: Ctx): boolean {
  const s = c.s;
  const me = current(s);
  if (s.phase === 'nope') {
    const p = s.pending!;
    if (p.nopes > 0) return false;
    const victim = p.card === 'attack' && !p.pair ? s.players[nextAlive(s, s.turn)].id : p.card === 'favor' || p.pair ? p.target : undefined;
    const bot = victim && victim !== p.by && isBot(victim) ? find(s, victim)! : undefined;
    if (!bot?.hand.includes('nope')) return false;
    return nope(c, bot.id);
  }
  if (s.phase === 'favor' && isBot(s.favor!.from)) {
    const hand = find(s, s.favor!.from)!.hand;
    return give(c, s.favor!.from, GIVE_ORDER.find((x) => hand.includes(x))!);
  }
  if (!isBot(me.id)) return false;
  if (s.phase === 'place') return place(c, me.id, 'random');
  if (s.phase !== 'play') return false;
  const top = s.botTop[me.id];
  if (top === undefined && me.hand.includes('future')) return play(c, me.id, s.seq, 'future');
  if (top === 'bomb') {
    const dodge = (['attack', 'skip', 'shuffle'] as Card[]).find((x) => me.hand.includes(x));
    if (dodge) return play(c, me.id, s.seq, dodge);
    return draw(c, me.id, s.seq);
  }
  const cat = CATS.find((x) => count(me.hand, x) >= 2);
  const targets = targetsOf(s, me.id);
  if (cat && targets.length) {
    const target = targets.reduce((best, p) => (p.hand.length > best.hand.length ? p : best));
    s.phase = 'target';
    s.choosing = { card: cat, pair: true };
    return chooseTarget(c, me.id, s.seq, target.id);
  }
  return draw(c, me.id, s.seq);
}

function runBots(c: Ctx) {
  for (let i = 0; i < 200 && c.s.phase !== 'ended' && botStep(c); i++);
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_KITTENS_PLAYERS) return reply(c, user, tx(s.lang, 'notEnough', { n, min: MIN_KITTENS_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const deck = shuffle(
    (Object.keys(COPIES) as (keyof typeof COPIES)[]).flatMap((x) => Array<Card>(COPIES[x]).fill(x)),
    c.rng,
  );
  for (const p of s.players) Object.assign(p, newPlayer(p.id), { hand: [...deck.splice(0, 7), 'defuse'] });
  const bombs = n - 1;
  s.deck = shuffle([...deck, ...Array<Card>(n <= 3 ? 2 : 6 - n).fill('defuse'), ...Array<Card>(bombs).fill('bomb')], c.rng);
  s.turn = Math.floor(c.rng() * n);
  s.turnsLeft = 1;
  s.outCount = 0;
  s.botTop = {};
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'started', { seats: s.players.map((p) => mention(p.id)).join(' → '), first: mention(current(s).id), deck: s.deck.length, bombs }),
    gif: 'start',
  });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: `${tx(s.lang, 'rules')}\n\n${tx(s.lang, 'yourHand', { hand: grouped(s, p.hand) })}` });
  startTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_KITTENS_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_KITTENS_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'play':
      return play(c, action.user, action.seq, action.card, action.pair);
    case 'target':
      return chooseTarget(c, action.user, action.seq, action.target);
    case 'nope':
      return nope(c, action.user);
    case 'draw':
      return draw(c, action.user, action.seq);
    case 'give':
      return give(c, action.user, action.card);
    case 'place':
      return place(c, action.user, action.pos);
    case 'timeout':
      if (action.id !== c.s.timers.phase || c.s.phase === 'lobby') return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): KPlayer => ({ id, hand: [] });

export function applyKittens(state: KState | undefined, action: KAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: KState | undefined, host: string, channel: string): Result {
  const created: KState = {
    game: 'kittens',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    turn: 0,
    turnsLeft: 1,
    seq: prev?.seq ?? 0,
    nopeSeq: prev?.nopeSeq ?? 0,
    played: [],
    outCount: 0,
    botTop: {},
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
