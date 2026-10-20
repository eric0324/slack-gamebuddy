// 花火遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applyHanabi(state, action, rng) → { state, events }。
import { mention, type GameEvent, type Rng } from './engine.js';
import { cancelGame, joinRoom, leaveRoom, lobbyEvent, reply, runGame, shuffle, startTimer } from './common.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/hanabi.js';

export const MIN_HANABI_PLAYERS = 2;
export const MAX_HANABI_PLAYERS = 5;
const TITLE = '花火';
const TURN_MS = 120_000;
const MAX_HINTS = 8;
const MAX_FUSES = 3;

export type Color = 'red' | 'yellow' | 'green' | 'blue' | 'white';
const COLORS: Color[] = ['red', 'yellow', 'green', 'blue', 'white'];
export const COLOR_NAME: Record<Color, string> = { red: '紅', yellow: '黃', green: '綠', blue: '藍', white: '白' }; // 中文指令的顏色名稱
const COLOR_EMOJI: Record<Color, string> = { red: '🟥', yellow: '🟨', green: '🟩', blue: '🟦', white: '⬜' };
const NUMBERS = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5];

export interface HCard {
  color: Color;
  n: number;
  knowColor?: boolean; // 被提示過顏色
  knowNumber?: boolean; // 被提示過數字
}

export type HPhase = 'lobby' | 'turn' | 'ended';

export interface HPlayer {
  id: string;
  hand: HCard[];
}

export interface HState {
  game: 'hanabi';
  channel: string;
  host: string;
  phase: HPhase;
  players: HPlayer[];
  deck: HCard[];
  fireworks: Record<Color, number>;
  hints: number;
  fuses: number;
  discard: HCard[];
  turn: number;
  remaining?: number; // 牌堆抽完後還剩幾個回合
  score?: number;
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang;
}

export type HAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'peek'; user: string }
  | { type: 'discards'; user: string }
  | { type: 'play'; user: string; index: number }
  | { type: 'discard'; user: string; index: number }
  | { type: 'hint'; user: string; target: string; color?: Color; number?: number }
  | { type: 'hintMenu'; user: string }
  | { type: 'hintTarget'; user: string; target: string }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<HAction, { type: 'new' } | { type: 'rematch' }>;

interface Result {
  state: HState;
  events: GameEvent[];
}

interface Ctx {
  s: HState;
  events: GameEvent[];
  rng: Rng;
}

const show = (x: HCard) => `${COLOR_EMOJI[x.color]}${x.n}`;
const known = (s: HState, x: HCard) => `${x.knowColor ? tx(s.lang, x.color) : tx(s.lang, 'unknown')}${x.knowNumber ? x.n : tx(s.lang, 'unknown')}`;
const fireworksLine = (s: HState) => COLORS.map((col) => `${COLOR_EMOJI[col]}${s.fireworks[col]}`).join(' ');

// 洗牌發牌：2～3 人每人 5 張、4～5 人每人 4 張
function deal(c: Ctx) {
  const s = c.s;
  s.deck = shuffle(
    COLORS.flatMap((color) => NUMBERS.map((n) => ({ color, n }))),
    c.rng,
  );
  const size = s.players.length <= 3 ? 5 : 4;
  for (const p of s.players) p.hand = s.deck.splice(0, size);
  s.turn = Math.floor(c.rng() * s.players.length);
  c.events.push({
    type: 'announce',
    text: tx(s.lang, 'start'),
    gif: 'start',
  });
  startTurn(c);
}

function startTurn(c: Ctx) {
  const s = c.s;
  s.phase = 'turn';
  const p = s.players[s.turn];
  const slots = p.hand.map((_, i) => i);
  c.events.push(
    {
      type: 'announce',
      text: tx(s.lang, 'turn', { who: mention(p.id), min: TURN_MS / 60_000, fireworks: fireworksLine(s), hints: s.hints, fuses: s.fuses, maxFuses: MAX_FUSES, deck: s.deck.length }),
    },
    {
      type: 'prompt',
      kind: 'hanabiTurn',
      audience: 'channel',
      text: tx(s.lang, 'turnPrompt', { who: mention(p.id) }),
      options: [
        { value: 'peek', label: tx(s.lang, 'btnPeek') },
        { value: 'discards', label: tx(s.lang, 'btnDiscards') },
        { value: 'hint', label: tx(s.lang, 'btnHint') },
        ...slots.map((i) => ({ value: `play:${i}`, label: tx(s.lang, 'btnPlay', { n: i + 1 }) })),
        ...slots.map((i) => ({ value: `discard:${i}`, label: tx(s.lang, 'btnDiscard', { n: i + 1 }) })),
      ],
    },
  );
  startTimer(c, TURN_MS);
}

// 看牌：只讓按的人看到別人的手牌和自己已知的提示
function peek(c: Ctx, user: string) {
  const s = c.s;
  const me = s.players.find((p) => p.id === user);
  if (!me) return reply(c, user, tx(s.lang, 'notInGame'));
  const others = s.players.filter((p) => p.id !== user).map((p) => tx(s.lang, 'handLine', { who: mention(p.id), cards: p.hand.map(show).join(' ') }));
  const mine = me.hand.map((x, i) => tx(s.lang, 'knownLine', { n: i + 1, card: known(s, x) })).join('\n');
  return reply(c, user, tx(s.lang, 'peek', { others: others.join('\n'), mine }));
}

// 棄牌堆：公開資訊，誰都能看；依顏色分行、數字由小到大
function discards(c: Ctx, user: string) {
  const lines = COLORS.map((col) => [col, c.s.discard.filter((x) => x.color === col).map((x) => x.n).sort((a, b) => a - b)] as const)
    .filter(([, ns]) => ns.length)
    .map(([col, ns]) => `${COLOR_EMOJI[col]} ${ns.join(' ')}`);
  return reply(c, user, lines.length ? tx(c.s.lang, 'discards', { lines: lines.join('\n') }) : tx(c.s.lang, 'discardsEmpty'));
}

const currentId = (s: HState) => s.players[s.turn].id;

// 從手牌拿出一張，牌堆還有就補一張到最後
function takeCard(s: HState, p: HPlayer, index: number) {
  const [card] = p.hand.splice(index, 1);
  if (s.deck.length) {
    p.hand.push(s.deck.shift()!);
    // 抽到最後一張：包含自己在內每人再輪一次 (這個回合結束時會先扣 1)
    if (!s.deck.length) s.remaining = s.players.length + 1;
  }
  return card;
}

function playCard(c: Ctx, user: string, index: number): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || user !== currentId(s)) return reply(c, user, tx(s.lang, 'notYourTurn'));
  const p = s.players[s.turn];
  if (!p.hand[index]) return false;
  const card = takeCard(s, p, index);
  if (s.fireworks[card.color] + 1 === card.n) {
    s.fireworks[card.color] = card.n;
    const bonus = card.n === 5 && s.hints < MAX_HINTS;
    if (bonus) s.hints++;
    c.events.push({ type: 'announce', text: tx(s.lang, 'playOk', { who: mention(user), card: show(card), bonus: bonus ? tx(s.lang, 'playBonus') : '' }) });
  } else {
    s.fuses++;
    s.discard.push(card);
    c.events.push({ type: 'announce', text: tx(s.lang, 'playFail', { who: mention(user), card: show(card), fuses: s.fuses, maxFuses: MAX_FUSES }) });
    if (s.fuses >= MAX_FUSES) {
      endGame(c, true);
      return true;
    }
  }
  if (COLORS.every((col) => s.fireworks[col] === 5)) {
    endGame(c, false);
    return true;
  }
  endTurn(c);
  return true;
}

function discardCard(c: Ctx, user: string, index: number): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || user !== currentId(s)) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (s.hints >= MAX_HINTS) return reply(c, user, tx(s.lang, 'hintsFull'));
  const p = s.players[s.turn];
  if (!p.hand[index]) return false;
  const card = takeCard(s, p, index);
  s.discard.push(card);
  s.hints++;
  c.events.push({ type: 'announce', text: tx(s.lang, 'discarded', { who: mention(user), card: show(card) }) });
  endTurn(c);
  return true;
}

// 提示：花 1 個標記，告訴對方他手上所有某個顏色或某個數字的牌
function giveHint(c: Ctx, user: string, targetId: string, color?: Color, number?: number): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || user !== currentId(s)) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (s.hints <= 0) return reply(c, user, tx(s.lang, 'noHints'));
  if (targetId === user) return reply(c, user, tx(s.lang, 'hintSelf'));
  const t = s.players.find((p) => p.id === targetId);
  if (!t) return reply(c, user, tx(s.lang, 'targetNotInGame'));
  const match = (x: HCard) => (color ? x.color === color : x.n === number);
  const slots = t.hand.map((x, i) => [x, i] as const).filter(([x]) => match(x));
  if (!slots.length) return reply(c, user, tx(s.lang, 'hintEmpty'));
  for (const [x] of slots) {
    if (color) x.knowColor = true;
    else x.knowNumber = true;
  }
  s.hints--;
  // 英文句中的顏色用小寫 (red)；中文不受影響
  // 只指出一張牌時英文用單數 (card 1 is a 3)；中文兩個 key 相同
  const one = slots.length === 1;
  const what = color ? tx(s.lang, 'hintColor', { color: tx(s.lang, color).toLowerCase() }) : tx(s.lang, one ? 'hintNumberOne' : 'hintNumber', { n: number! });
  const slotList = slots.map(([, i]) => i + 1).join(tx(s.lang, 'slotSep'));
  c.events.push({ type: 'announce', text: tx(s.lang, one ? 'hintedOne' : 'hinted', { who: mention(user), target: mention(t.id), slots: slotList, what }) });
  endTurn(c);
  return true;
}

// 給提示的按鈕選單：只讓輪到的人看到，不改 state；最後的按鈕直接變成 hint action
const ephemeralPrompt = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  c.events.push({ type: 'prompt', kind: 'hanabiTurn', audience: 'ephemeral', user, text, options });
  return false;
};

function hintMenu(c: Ctx, user: string): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || user !== currentId(s)) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (s.hints <= 0) return reply(c, user, tx(s.lang, 'noHints'));
  const others = s.players.filter((p) => p.id !== user);
  return ephemeralPrompt(c, user, tx(s.lang, 'hintWho'), others.map((p) => ({ value: `hintTarget:${p.id}`, label: p.id })));
}

function hintTarget(c: Ctx, user: string, targetId: string): boolean {
  const s = c.s;
  if (s.phase !== 'turn' || user !== currentId(s)) return reply(c, user, tx(s.lang, 'notYourTurn'));
  if (targetId === user) return reply(c, user, tx(s.lang, 'hintSelf'));
  const t = s.players.find((p) => p.id === targetId);
  if (!t) return reply(c, user, tx(s.lang, 'targetNotInGame'));
  const colors = COLORS.filter((col) => t.hand.some((x) => x.color === col));
  const numbers = [1, 2, 3, 4, 5].filter((n) => t.hand.some((x) => x.n === n));
  return ephemeralPrompt(c, user, tx(s.lang, 'hintWhat', { who: mention(t.id), cards: t.hand.map(show).join(' ') }), [
    ...colors.map((col) => ({ value: `hint:${t.id}:${col}`, label: tx(s.lang, col) })),
    ...numbers.map((n) => ({ value: `hint:${t.id}:${n}`, label: String(n) })),
  ]);
}

function endTurn(c: Ctx) {
  const s = c.s;
  if (s.remaining !== undefined && --s.remaining <= 0) {
    endGame(c, false);
    return;
  }
  s.turn = (s.turn + 1) % s.players.length;
  startTurn(c);
}

// 官方評價
function rating(lang: Lang | undefined, score: number) {
  if (score >= 25) return tx(lang, 'rate25');
  if (score >= 21) return tx(lang, 'rate21');
  if (score >= 16) return tx(lang, 'rate16');
  if (score >= 11) return tx(lang, 'rate11');
  if (score >= 6) return tx(lang, 'rate6');
  return tx(lang, 'rate0');
}

// 結束：失誤 3 次得 0 分，否則是五種顏色打到的數字加總
function endGame(c: Ctx, exploded: boolean) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  s.score = exploded ? 0 : COLORS.reduce((n, col) => n + s.fireworks[col], 0);
  const hands = s.players.map((p) => tx(s.lang, 'handLine', { who: mention(p.id), cards: p.hand.map(show).join(' ') })).join('\n');
  const title = exploded ? tx(s.lang, 'exploded', { rating: rating(s.lang, 0) }) : tx(s.lang, 'ended', { score: s.score, rating: rating(s.lang, s.score) });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: [], score: s.score }); // 合作遊戲：只記分數
  c.events.push(
    { type: 'announce', text: tx(s.lang, 'final', { title, fireworks: fireworksLine(s), hands }), gif: exploded ? 'questFail' : 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

function handle(c: Ctx, action: GameAction): boolean {
  const s = c.s;
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_HANABI_PLAYERS, (id) => ({ id, hand: [] }));
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
    case 'removeBot':
      return reply(c, action.user, tx(s.lang, 'noBots'));
    case 'start': {
      if (action.user !== s.host) return reply(c, action.user, tx(s.lang, 'onlyHostStart'));
      if (s.phase !== 'lobby') return false;
      const n = s.players.length;
      if (n < MIN_HANABI_PLAYERS) return reply(c, action.user, tx(s.lang, 'notEnough', { n, min: MIN_HANABI_PLAYERS }));
      c.events.push(lobbyEvent(TITLE, { ...s, phase: 'turn' }));
      deal(c);
      return true;
    }
    case 'cancel':
      return cancelGame(c, action.user);
    case 'peek':
      if (s.phase === 'lobby') return false;
      return peek(c, action.user);
    case 'discards':
      if (s.phase === 'lobby') return false;
      return discards(c, action.user);
    case 'play':
      return playCard(c, action.user, action.index);
    case 'discard':
      return discardCard(c, action.user, action.index);
    case 'hint':
      return giveHint(c, action.user, action.target, action.color, action.number);
    case 'hintMenu':
      return hintMenu(c, action.user);
    case 'hintTarget':
      return hintTarget(c, action.user, action.target);
    case 'timeout': {
      if (action.id !== s.timers.phase || s.phase !== 'turn') return false;
      const me = currentId(s);
      c.events.push({ type: 'announce', text: tx(s.lang, 'timeout', { who: mention(me) }) });
      if (s.hints < MAX_HINTS) return discardCard(c, me, 0);
      const next = s.players[(s.turn + 1) % s.players.length];
      const card = next.hand[Math.floor(c.rng() * next.hand.length)];
      return c.rng() < 0.5 ? giveHint(c, me, next.id, card.color) : giveHint(c, me, next.id, undefined, card.n);
    }
  }
}

export function applyHanabi(state: HState | undefined, action: HAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => s.score !== undefined,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
  });
}

function createLobby(prev: HState | undefined, host: string, channel: string): Result {
  const created: HState = {
    game: 'hanabi',
    channel,
    host,
    phase: 'lobby',
    players: [{ id: host, hand: [] }],
    deck: [],
    fireworks: { red: 0, yellow: 0, green: 0, blue: 0, white: 0 },
    hints: MAX_HINTS,
    fuses: 0,
    discard: [],
    turn: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
