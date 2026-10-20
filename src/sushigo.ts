// 壽司派對 (Sushi Go!) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySushiGo(state, action, rng) → { state, events }。
import { isBot, mention, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import { t, type Lang } from './i18n/index.js';
import { tx } from './i18n/games/sushigo.js';

export const MIN_SUSHIGO_PLAYERS = 2;
export const MAX_SUSHIGO_PLAYERS = 5;
const TITLE = '壽司派對';
const ROUNDS = 3;
export const PICK_MS = 60_000;
export const HAND_SIZE: Record<number, number> = { 2: 10, 3: 9, 4: 8, 5: 7 };

// 牌種：這個順序就是選單排序和 bot 同分時的優先順序
export const CARDS = ['tempura', 'sashimi', 'dumpling', 'maki1', 'maki2', 'maki3', 'egg', 'salmon', 'squid', 'pudding', 'wasabi', 'chopsticks'] as const;
export type Card = (typeof CARDS)[number];

const MAKI: Partial<Record<Card, number>> = { maki1: 1, maki2: 2, maki3: 3 };
const NIGIRI: Partial<Record<Card, number>> = { egg: 1, salmon: 2, squid: 3 };
const DUMPLING = [0, 1, 3, 6, 10, 15];

export type Detail = { tempura: number; sashimi: number; dumpling: number; maki: number; nigiri: number };

const count = (table: Card[], card: Card) => table.filter((c) => c === card).length;
const makiOf = (table: Card[]) => table.reduce((n, c) => n + (MAKI[c] ?? 0), 0);

// 握壽司放在它之前、還沒用過的最早一張芥末上
function nigiriScore(table: Card[]): number {
  let wasabi = 0;
  let total = 0;
  for (const c of table) {
    if (c === 'wasabi') wasabi++;
    else if (NIGIRI[c]) {
      total += NIGIRI[c]! * (wasabi > 0 ? 3 : 1);
      if (wasabi > 0) wasabi--;
    }
  }
  return total;
}

// 壽司捲：最多 6、第二多 3 (平分捨去小數)；最多同分時沒有第二名；沒有壽司捲不得分
function makiScores(tables: Card[][]): number[] {
  const counts = tables.map(makiOf);
  const out = counts.map(() => 0);
  const award = (value: number, points: number) => {
    const who = counts.flatMap((n, i) => (n === value ? [i] : []));
    for (const i of who) out[i] = Math.trunc(points / who.length);
    return who.length;
  };
  const levels = [...new Set(counts.filter((n) => n > 0))].sort((a, b) => b - a);
  if (!levels.length) return out;
  if (award(levels[0], 6) === 1 && levels.length > 1) award(levels[1], 3);
  return out;
}

export function scoreRound(tables: Card[][]): { total: number; detail: Detail }[] {
  const maki = makiScores(tables);
  return tables.map((t, i) => {
    const detail: Detail = {
      tempura: Math.floor(count(t, 'tempura') / 2) * 5,
      sashimi: Math.floor(count(t, 'sashimi') / 3) * 10,
      dumpling: DUMPLING[Math.min(count(t, 'dumpling'), 5)],
      maki: maki[i],
      nigiri: nigiriScore(t),
    };
    return { total: Object.values(detail).reduce((a, b) => a + b, 0), detail };
  });
}

// 布丁：最多 +6、最少 −6 (平分捨去小數)；2 人局不扣分；大家一樣多都是 0
export function scorePudding(counts: number[]): number[] {
  const out = counts.map(() => 0);
  const max = Math.max(...counts);
  const min = Math.min(...counts);
  if (max === min) return out;
  const split = (value: number, points: number) => {
    const who = counts.flatMap((n, i) => (n === value ? [i] : []));
    for (const i of who) out[i] = Math.trunc(points / who.length);
  };
  split(max, 6);
  if (counts.length > 2) split(min, -6);
  return out;
}

export const cardName = (lang: Lang | undefined, card: Card) => tx(lang, `card.${card}`);
const COPIES: Record<Card, number> = { tempura: 14, sashimi: 14, dumpling: 14, maki1: 6, maki2: 12, maki3: 8, egg: 5, salmon: 10, squid: 5, pudding: 10, wasabi: 6, chopsticks: 4 };

export const newDeck = (): Card[] => CARDS.flatMap((c) => Array.from({ length: COPIES[c] }, () => c));

export interface SGPlayer {
  id: string;
  hand: Card[];
  table: Card[]; // 這一輪出過的牌，依出牌順序
  puddings: number; // 前幾輪累積的布丁 (不含這一輪桌上的)
  rounds: number[]; // 每輪分數
  pick?: Card;
  extra?: Card | null; // undefined＝還沒回答筷子，null＝不用筷子
  auto?: boolean; // 這回合是超時自動出牌
}

export interface SGState {
  game: 'sushigo';
  channel: string;
  host: string;
  phase: 'lobby' | 'pick' | 'ended';
  players: SGPlayer[];
  deck: Card[];
  round: number;
  turn: number; // 這一輪的第幾回合
  seq: number; // 全局回合序號：牌桌訊息的 ref，也用來擋掉舊選單
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type SGAction =
  | { type: 'new'; user: string; channel: string }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'hand'; user: string }
  | { type: 'pick'; user: string; seq: number; card: Card }
  | { type: 'extra'; user: string; seq: number; card: Card | 'none' }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string };

type GameAction = Exclude<SGAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SGState; events: GameEvent[] };
type Ctx = { s: SGState; events: GameEvent[]; rng: Rng };

const handSize = (s: SGState) => HAND_SIZE[s.players.length];
const total = (p: SGPlayer) => p.rounds.reduce((a, b) => a + b, 0);
const done = (p: SGPlayer) => p.pick !== undefined && p.extra !== undefined;

// 相同的牌合併：🍤 天婦羅 ×2，依牌種順序
export function groupText(lang: Lang | undefined, cards: Card[]): string {
  const parts = CARDS.filter((c) => cards.includes(c)).map((c) => `${cardName(lang, c)} ×${count(cards, c)}`);
  return parts.length ? parts.join(tx(lang, 'sep')) : tx(lang, 'none');
}

function board(s: SGState, revealed = false): GameEvent {
  const waiting = s.players.filter((p) => !done(p));
  const head = tx(s.lang, 'head', { round: s.round, rounds: ROUNDS, turn: s.turn, size: handSize(s) });
  const lines = [
    revealed ? tx(s.lang, 'revealed', { head }) : tx(s.lang, 'choose', { head, sec: PICK_MS / 1000 }),
    ...s.players.map((p) => tx(s.lang, 'row', { who: mention(p.id), cards: groupText(s.lang, p.table), puddings: p.puddings + count(p.table, 'pudding'), total: total(p) })),
  ];
  if (!revealed) {
    const wait = waiting.length ? tx(s.lang, 'waiting', { who: waiting.map((p) => mention(p.id)).join(' ') }) : '';
    lines.push(tx(s.lang, 'progress', { done: s.players.length - waiting.length, all: s.players.length }) + wait);
  }
  return {
    type: 'prompt',
    kind: 'sushigo',
    audience: 'channel',
    ref: `sushigo:${s.seq}`,
    text: lines.join('\n'),
    options: revealed ? [] : [{ value: 'hand', label: tx(s.lang, 'handButton') }],
  };
}

function startRound(c: Ctx) {
  const s = c.s;
  s.round++;
  s.turn = 0;
  const n = handSize(s);
  for (const p of s.players) {
    p.hand = s.deck.splice(0, n);
    p.table = [];
  }
  c.events.push({ type: 'announce', text: tx(s.lang, 'roundStart', { round: s.round, rounds: ROUNDS, n }) });
  startTurn(c);
}

function startTurn(c: Ctx) {
  const s = c.s;
  s.turn++;
  s.seq++;
  for (const p of s.players) {
    Object.assign(p, { pick: undefined, extra: undefined, auto: false });
    if (isBot(p.id)) Object.assign(p, { pick: botCard(p.hand, p.table), extra: null });
  }
  c.events.push(board(s));
  startTimer(c, PICK_MS);
  if (s.players.every(done)) reveal(c);
}

// bot 估每種牌的價值 (看自己這一輪桌上的牌)，出最高的；同分依牌種順序。超時的真人也用這個
function cardValue(card: Card, hand: Card[], table: Card[]): number {
  switch (card) {
    case 'tempura':
      return count(table, 'tempura') % 2 === 1 ? 5 : 2;
    case 'sashimi':
      return [2, 4, 10][count(table, 'sashimi') % 3];
    case 'dumpling': {
      const n = count(table, 'dumpling');
      return DUMPLING[Math.min(n + 1, 5)] - DUMPLING[Math.min(n, 5)];
    }
    case 'egg':
    case 'salmon':
    case 'squid':
      return nigiriScore([...table, card]) - nigiriScore(table);
    case 'wasabi':
      return hand.length >= 3 ? 3 : 0;
    case 'maki1':
    case 'maki2':
    case 'maki3':
      return MAKI[card]!;
    case 'pudding':
      return 2;
    case 'chopsticks':
      return 0;
  }
}

export function botCard(hand: Card[], table: Card[]): Card {
  const value = (c: Card) => cardValue(c, hand, table);
  return CARDS.filter((c) => hand.includes(c)).reduce((best, c) => (value(c) > value(best) ? c : best));
}

// 時間到：沒選的人依 bot 規則出牌 (不用筷子)，選了第一張沒回答筷子的只出第一張
function timeout(c: Ctx) {
  for (const p of c.s.players) {
    if (p.pick === undefined) Object.assign(p, { pick: botCard(p.hand, p.table), auto: true });
    if (p.extra === undefined) p.extra = null;
  }
  reveal(c);
}


// 相同牌種合併成一顆按鈕
const cardOptions = (lang: Lang | undefined, cards: Card[], prefix: string) =>
  CARDS.filter((c) => cards.includes(c)).map((c) => ({ value: `${prefix}:${c}`, label: `${cardName(lang, c)} ×${count(cards, c)}` }));

function handMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (s.phase !== 'pick') return reply(c, user, tx(s.lang, 'notStarted'));
  c.events.push({
    type: 'prompt',
    kind: 'sushigo',
    audience: 'ephemeral',
    user,
    text: tx(s.lang, 'handMenu', { current: me.pick ? tx(s.lang, 'current', { card: cardName(s.lang, me.pick) }) : '', table: groupText(s.lang, me.table) }),
    options: cardOptions(s.lang, me.hand, `pick:${s.seq}`),
    perRow: 4,
  });
  return false;
}

function pickCard(c: Ctx, user: string, seq: number, card: Card): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'stale'));
  if (!me.hand.includes(card)) return reply(c, user, tx(s.lang, 'noCard', { card: cardName(s.lang, card) }));
  const wasDone = done(me);
  me.pick = card;
  me.extra = canChop(me) ? undefined : null;
  c.events.push({ type: 'ephemeral', to: user, text: tx(s.lang, 'picked', { card: cardName(s.lang, card) }) });
  if (me.extra === undefined) chopMenu(c, me);
  afterPick(c, wasDone !== done(me));
  return true;
}

// 桌上有這回合以前出的筷子，而且手牌至少 2 張
const canChop = (p: SGPlayer) => p.table.includes('chopsticks') && p.hand.length >= 2;
const withoutPick = (p: SGPlayer) => {
  const rest = [...p.hand];
  rest.splice(rest.indexOf(p.pick!), 1);
  return rest;
};

function chopMenu(c: Ctx, me: SGPlayer) {
  c.events.push({
    type: 'prompt',
    kind: 'sushigo',
    audience: 'ephemeral',
    user: me.id,
    text: tx(c.s.lang, 'chopMenu', { card: cardName(c.s.lang, me.pick!) }),
    options: [...cardOptions(c.s.lang, withoutPick(me), `extra:${c.s.seq}`), { value: `extra:${c.s.seq}:none`, label: tx(c.s.lang, 'noChop') }],
    perRow: 4,
  });
}

function extraCard(c: Ctx, user: string, seq: number, card: Card | 'none'): boolean {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notPlayer'));
  if (seq !== s.seq) return reply(c, user, tx(s.lang, 'stale'));
  if (!me.pick) return reply(c, user, tx(s.lang, 'pickFirst'));
  if (!canChop(me)) return reply(c, user, tx(s.lang, 'noChopsticks'));
  if (card !== 'none' && !withoutPick(me).includes(card)) return reply(c, user, tx(s.lang, 'noSecond', { card: cardName(s.lang, card) }));
  const wasDone = done(me);
  me.extra = card === 'none' ? null : card;
  const text = card === 'none' ? tx(s.lang, 'skipChop') : tx(s.lang, 'useChop', { card: cardName(s.lang, card) });
  c.events.push({ type: 'ephemeral', to: user, text });
  afterPick(c, wasDone !== done(me));
  return true;
}

// 有人選好之後：全部選好就揭曉，否則第一次選好時更新進度
function afterPick(c: Ctx, progressed: boolean) {
  if (c.s.players.every(done)) reveal(c);
  else if (progressed) c.events.push(board(c.s));
}

const played = (p: SGPlayer) => [p.pick!, ...(p.extra ? [p.extra] : [])];

function reveal(c: Ctx) {
  const s = c.s;
  c.events.push(board(s, true));
  const lines = s.players.map((p) => {
    const cards = played(p).map((x) => cardName(s.lang, x)).join(tx(s.lang, 'plus'));
    return tx(s.lang, 'revealLine', { who: mention(p.id), chop: p.extra ? '🥢 ' : '', cards, auto: p.auto ? tx(s.lang, 'auto') : '' });
  });
  c.events.push({ type: 'announce', text: tx(s.lang, 'reveal', { lines: lines.join(tx(s.lang, 'sep')) }) });
  for (const p of s.players) {
    for (const card of played(p)) {
      p.hand.splice(p.hand.indexOf(card), 1);
      p.table.push(card);
    }
    if (p.extra) {
      p.table.splice(p.table.indexOf('chopsticks'), 1);
      p.hand.push('chopsticks');
    }
  }
  // 手牌傳給下一位：玩家 i 拿到玩家 i−1 的手牌
  const passed = s.players.map((p) => p.hand);
  s.players.forEach((p, i) => (p.hand = passed[(i - 1 + passed.length) % passed.length]));
  if (s.players[0].hand.length) startTurn(c);
  else endRound(c);
}

const DETAILS: (keyof Detail)[] = ['tempura', 'sashimi', 'dumpling', 'maki', 'nigiri'];
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

function endRound(c: Ctx) {
  const s = c.s;
  const scores = scoreRound(s.players.map((p) => p.table));
  const lines = s.players.map((p, i) => {
    p.rounds.push(scores[i].total);
    p.puddings += count(p.table, 'pudding');
    p.table = [];
    const parts = DETAILS.filter((k) => scores[i].detail[k]).map((k) => tx(s.lang, 'detailPart', { name: tx(s.lang, `detail.${k}`), points: scores[i].detail[k] }));
    const shown = parts.length ? parts.join(tx(s.lang, 'sep')) + tx(s.lang, 'arrow') : '';
    return tx(s.lang, 'scoreLine', { who: mention(p.id), parts: shown, score: scores[i].total, total: total(p), puddings: p.puddings });
  });
  c.events.push({ type: 'announce', text: [tx(s.lang, 'roundScore', { round: s.round }), ...lines].join('\n') });
  if (s.round < ROUNDS) startRound(c);
  else endGame(c);
}

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const pudding = scorePudding(s.players.map((p) => p.puddings));
  const final = s.players.map((p, i) => ({ p, score: total(p) + pudding[i], bonus: pudding[i] }));
  const ranking = [...final].sort((a, b) => b.score - a.score || b.p.puddings - a.p.puddings);
  const top = ranking[0];
  const won = (x: (typeof final)[number]) => x.score === top.score && x.p.puddings === top.p.puddings;
  s.winners = final.filter(won).map((x) => x.p.id);
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    {
      type: 'announce',
      text: [
        tx(s.lang, 'winners', { who: s.winners.map(mention).join(tx(s.lang, 'sep')) }),
        tx(s.lang, 'puddings', { list: final.map((x) => tx(s.lang, 'puddingItem', { who: mention(x.p.id), n: x.p.puddings, bonus: signed(x.bonus) })).join(tx(s.lang, 'sep')) }),
        ...ranking.map((x, i) =>
          tx(s.lang, 'rank', { i: i + 1, who: mention(x.p.id), score: x.score, rounds: x.p.rounds.join('/'), bonus: signed(x.bonus), n: x.p.puddings, win: won(x) ? ' 🏆' : '' }),
        ),
      ].join('\n'),
      gif: 'goodWin',
    },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: t(s.lang, 'rematch.ask'), options: [{ value: 'rematch', label: t(s.lang, 'rematch.button') }] },
  );
}

function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, tx(s.lang, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_SUSHIGO_PLAYERS) return reply(c, user, tx(s.lang, 'notEnough', { n, min: MIN_SUSHIGO_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'pick' }));
  s.deck = shuffle(newDeck(), c.rng);
  for (const p of s.players) Object.assign(p, newPlayer(p.id));
  s.phase = 'pick';
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start', { seats: s.players.map((p) => mention(p.id)).join(' → '), rounds: ROUNDS, n: handSize(s) }),
  });
  for (const p of s.players) if (!isBot(p.id)) c.events.push({ type: 'dm', to: p.id, text: tx(s.lang, 'rules') });
  startRound(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SUSHIGO_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SUSHIGO_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'hand':
      return handMenu(c, action.user);
    case 'pick':
      return pickCard(c, action.user, action.seq, action.card);
    case 'extra':
      return extraCard(c, action.user, action.seq, action.card);
    case 'timeout':
      if (action.id !== c.s.timers.phase || c.s.phase !== 'pick') return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): SGPlayer => ({ id, hand: [], table: [], puddings: 0, rounds: [] });

export function applySushiGo(state: SGState | undefined, action: SGAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: SGState | undefined, host: string, channel: string): Result {
  const created: SGState = {
    game: 'sushigo',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    deck: [],
    round: 0,
    turn: 0,
    seq: prev?.seq ?? 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
