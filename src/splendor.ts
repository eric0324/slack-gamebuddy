// 璀璨寶石 (Splendor) 遊戲引擎：純邏輯，不碰任何 I/O。介面和其他遊戲一樣：applySplendor(state, action, rng) → { state, events }。
import { isBot, mention, quiet, type GameEvent, type Rng } from './engine.js';
import { addBots, cancelGame, joinRoom, leaveRoom, lobbyEvent, removeBots, reply, runGame, shuffle, startTimer } from './common.js';
import {
  CARDS,
  cardOf,
  cardText,
  COLORS,
  emptyGems,
  gemWord,
  GEMS,
  gemsText,
  NOBLES,
  nobleOf,
  nobleText,
  need,
  payment,
  shortfall,
  total,
  type Color,
  type Gem,
  type Gems,
} from './splendorCards.js';
import type { Lang } from './i18n/index.js';
import { tx } from './i18n/games/splendor.js';

export const MIN_SPLENDOR_PLAYERS = 2;
export const MAX_SPLENDOR_PLAYERS = 4;
const TITLE = '璀璨寶石';
export const TURN_MS = 90_000;
export const RETURN_MS = 30_000;
export const MAX_ROUNDS = 50;
const WIN_POINTS = 15;
const LEVEL_KEY = ['level1', 'level2', 'level3'] as const;

export interface SPlayer {
  id: string;
  tokens: Gems;
  cards: number[]; // 已買的卡 id
  reserved: number[]; // 保留的卡 id (最多 3)
  nobles: number[]; // 來訪的貴族 id
}

export interface SState {
  game: 'splendor';
  channel: string;
  host: string;
  phase: 'lobby' | 'play' | 'ended';
  players: SPlayer[];
  bank: Gems;
  decks: [number[], number[], number[]]; // 各級牌堆，[0] 是頂
  table: [(number | null)[], (number | null)[], (number | null)[]]; // 各級 4 個位置
  nobles: (number | null)[]; // 場上的貴族 id，顯示編號是 index + 1 (固定不變)，來訪後改成 null
  first: number; // 第一位玩家 index
  turn: number; // 輪到的玩家 index
  round: number; // 第幾輪 (1 起)
  step: 'act' | 'return';
  seq: number; // 每次輪到新玩家 +1：回合面板的 ref，也用來擋掉舊按鈕
  passStreak: number; // 連續跳過的次數，有人做動作歸零
  lastRound?: boolean; // 有人達到 15 分
  last?: string; // 上一步做了什麼 (面板用)
  winners?: string[];
  timerSeq: number;
  timers: { phase?: number };
  lang?: Lang; // 開房時的頻道語系 (runGame 存進來)
}

export type SAction =
  | { type: 'new'; user: string; channel: string; lang?: Lang }
  | { type: 'join'; user: string }
  | { type: 'leave'; user: string }
  | { type: 'start'; user: string }
  | { type: 'cancel'; user: string }
  | { type: 'addBot'; user: string; count: number }
  | { type: 'removeBot'; user: string; count: number }
  | { type: 'status'; user: string }
  | { type: 'turnMenu'; user: string; seq: number; sub?: Sub }
  | { type: 'pick3'; user: string; seq: number; colors: Color[] }
  | { type: 'take3'; user: string; seq: number; colors: Color[] }
  | { type: 'take2'; user: string; seq: number; color: Color }
  | { type: 'reserve'; user: string; seq: number; slot: string }
  | { type: 'buy'; user: string; seq: number; slot: string }
  | { type: 'retPick'; user: string; seq: number; counts: number[] } // 白藍綠紅黑金各退幾個
  | { type: 'return'; user: string; seq: number; counts: number[] }
  | { type: 'timeout'; id: number }
  | { type: 'rematch'; user: string; channel: string; lang?: Lang };

type GameAction = Exclude<SAction, { type: 'new' } | { type: 'rematch' }>;
type Result = { state: SState; events: GameEvent[] };
type Ctx = { s: SState; events: GameEvent[]; rng: Rng };

export type Sub = 'take3' | 'take2' | 'reserve' | 'buy';
export const SUBS: Sub[] = ['take3', 'take2', 'reserve', 'buy'];
const SUB_KEY = { take3: 'subTake3', take2: 'subTake2', reserve: 'subReserve', buy: 'subBuy' } as const;

// 這局語系的文字
const say = (s: SState, key: Parameters<typeof tx>[1], params?: Record<string, string | number>) => tx(s.lang, key, params);
const levelWord = (s: SState, lv: number) => say(s, LEVEL_KEY[lv]);
const gemsOf = (s: SState, g: Partial<Gems>) => gemsText(g, s.lang);
const cardOfText = (s: SState, id: number, slot?: string) => cardText(cardOf(id), slot, s.lang);

const find = (s: SState, id: string) => s.players.find((p) => p.id === id);
const current = (s: SState) => s.players[s.turn];
// 在私下選單上按的：回應取代那則選單；bot 不需要
const tell = (c: Ctx, to: string, text: string) => {
  if (!isBot(to)) c.events.push({ type: 'ephemeral', to, text, replace: true });
};
const deny = (c: Ctx, to: string, text: string) => (tell(c, to, text), false);
const menu = (c: Ctx, user: string, text: string, options: { value: string; label: string }[]) => {
  if (!isBot(user)) c.events.push({ type: 'prompt', kind: 'splendor', audience: 'ephemeral', user, text, options, perRow: 4, replace: true });
  return false;
};
// 籌碼從 from 移到 to
function move(from: Gems, to: Gems, g: Partial<Gems>) {
  for (const x of GEMS) {
    from[x] -= g[x] ?? 0;
    to[x] += g[x] ?? 0;
  }
}
const colorKey = (list: Color[]) => COLORS.filter((x) => list.includes(x)).join('');

// 折扣：已買卡的顏色張數
export function discountOf(p: SPlayer): Record<Color, number> {
  const d = { w: 0, b: 0, g: 0, r: 0, k: 0 };
  for (const id of p.cards) d[cardOf(id).color]++;
  return d;
}
export const scoreOf = (p: SPlayer) => p.cards.reduce((sum, id) => sum + cardOf(id).points, 0) + p.nobles.length * 3;
const tokensText = (s: SState, g: Gems) => `${gemsOf(s, g)} (${total(g)})`;
const payOf = (p: SPlayer, id: number) => payment(cardOf(id).cost, discountOf(p), p.tokens);

const playerLine = (s: SState, p: SPlayer) =>
  say(s, 'playerLine', {
    who: quiet(p.id),
    score: scoreOf(p),
    tokens: tokensText(s, p.tokens),
    disc: gemsOf(s, discountOf(p)),
    cards: p.cards.length,
    reserved: p.reserved.length,
    nobles: p.nobles.length,
  });

// 回合面板：回合內用同一個 ref 更新；ended 時收成一行、拿掉按鈕
function board(s: SState, ended = false): GameEvent {
  const me = current(s);
  const base = { type: 'prompt' as const, kind: 'splendor', audience: 'channel' as const, ref: `splendor:${s.seq}` };
  if (ended) return { ...base, text: say(s, 'turnOver', { who: quiet(me.id), last: s.last ?? '' }), options: [] };
  const bank = [...COLORS, 'o' as const].map((x) => say(s, 'bankItem', { gem: gemWord(x, s.lang), n: s.bank[x] })).join(say(s, 'gemSep'));
  const nobles = s.nobles.flatMap((id, i) => (id === null ? [] : [say(s, 'nobleLine', { i: i + 1, need: nobleText(nobleOf(id), s.lang) })]));
  const rows = [2, 1, 0].flatMap((lv) => [
    say(s, 'levelRow', { level: levelWord(s, lv), n: s.decks[lv].length }),
    ...s.table[lv].map((id, i) => (id === null ? say(s, 'emptySlot', { slot: `${lv + 1}-${i + 1}` }) : cardOfText(s, id, `${lv + 1}-${i + 1}`))),
  ]);
  const lines = [
    say(s, 'header', { round: s.round, final: s.lastRound ? say(s, 'finalRound') : '', who: mention(me.id), sec: TURN_MS / 1000 }),
    ...(s.last ? [say(s, 'lastMove', { last: s.last })] : []),
    ...(s.step === 'return' ? [say(s, 'waitReturn', { who: quiet(me.id), n: total(me.tokens) - 10, sec: RETURN_MS / 1000 })] : []),
    say(s, 'bank', { bank }),
    ...(nobles.length ? nobles : [say(s, 'noNobles')]),
    ...rows,
    ...s.players.map((p) => (p === me ? `👉 ${playerLine(s, p)}` : playerLine(s, p))),
  ];
  return {
    ...base,
    text: lines.join('\n'),
    options: [
      { value: `turnMenu:${s.seq}`, label: say(s, 'btnAction') },
      { value: 'status', label: say(s, 'btnStatus') },
    ],
  };
}

function status(c: Ctx, user: string): boolean {
  const s = c.s;
  const me = find(s, user);
  if (!me) return reply(c, user, say(s, 'notPlayer'));
  const reserved = me.reserved.map((id, i) => {
    const pay = payOf(me, id);
    const card = cardOfText(s, id, say(s, 'reservedLabel', { i: i + 1 }));
    return say(s, 'reservedStatus', { card, pay: pay ? say(s, 'canAfford', { pay: gemsOf(s, pay) }) : say(s, 'cannotAfford') });
  });
  const sep = say(s, 'listSep');
  const lines = [
    say(s, 'statusTitle', { score: scoreOf(me) }),
    say(s, 'statusTokens', { tokens: tokensText(s, me.tokens), disc: gemsOf(s, discountOf(me)) }),
    say(s, 'statusCards', { n: me.cards.length, list: me.cards.map((id) => cardOfText(s, id)).join(sep) || say(s, 'none') }),
    say(s, 'statusReserved', { n: me.reserved.length }),
    ...(reserved.length ? reserved : [say(s, 'none')]),
    say(s, 'statusNobles', { list: me.nobles.map((id) => nobleText(nobleOf(id), s.lang)).join(sep) || say(s, 'none') }),
  ];
  return reply(c, user, lines.join('\n'));
}

// ---------- 回合選單與四種動作 ----------

type Slot = { slot: string; id: number; label: string };
// 場上翻開的卡：三級到一級，同級依位置 1～4
const tableSlots = (s: SState): Slot[] =>
  [2, 1, 0].flatMap((lv) => s.table[lv].flatMap((id, i) => (id === null ? [] : [{ slot: `${lv + 1}-${i + 1}`, id, label: `${lv + 1}-${i + 1}` }])));
const reservedSlots = (s: SState, p: SPlayer): Slot[] => p.reserved.map((id, i) => ({ slot: `r${i + 1}`, id, label: say(s, 'reservedLabel', { i: i + 1 }) }));
const stocked = (s: SState) => COLORS.filter((x) => s.bank[x] > 0);
const pairColors = (s: SState) => COLORS.filter((x) => s.bank[x] >= 4);
const deckSlots = (s: SState) => [2, 1, 0].filter((lv) => s.decks[lv].length).map((lv) => ({ slot: `deck${lv + 1}`, label: say(s, 'deckTop', { level: levelWord(s, lv) }) }));
const buyable = (s: SState, p: SPlayer) => [...tableSlots(s), ...reservedSlots(s, p)].filter((x) => payOf(p, x.id));

// 每種動作做不到的原因；null 表示做得到
function blocked(s: SState, me: SPlayer): Record<Sub, string | null> {
  return {
    take3: stocked(s).length ? null : say(s, 'noGems'),
    take2: pairColors(s).length ? null : say(s, 'noPair'),
    reserve: me.reserved.length >= 3 ? say(s, 'reserveFull') : tableSlots(s).length || deckSlots(s).length ? null : say(s, 'nothingToReserve'),
    buy: buyable(s, me).length ? null : say(s, 'nothingToBuy'),
  };
}
const canAct = (s: SState, me: SPlayer) => Object.values(blocked(s, me)).some((x) => x === null);

// 輪到的人操作前的共同檢查；回傳錯誤訊息或 null
function turnCheck(s: SState, user: string, seq: number): string | null {
  if (!find(s, user)) return say(s, 'notPlayer');
  if (s.phase !== 'play' || current(s).id !== user) return say(s, 'notYet');
  if (seq !== s.seq) return say(s, 'stale');
  return null;
}
// 動作按鈕：只在 act 階段有效
function actCheck(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq) ?? (c.s.step === 'act' ? null : say(c.s, 'stale'));
  return err ? deny(c, user, err) : true;
}

const BACK = (s: SState, seq: number) => ({ value: `turnMenu:${seq}`, label: say(s, 'back') });

function turnMenu(c: Ctx, user: string, seq: number, sub?: Sub): boolean {
  const s = c.s;
  const err = turnCheck(s, user, seq);
  if (err) return deny(c, user, err);
  if (s.step === 'return') return sub ? deny(c, user, say(s, 'stale')) : returnMenu(c, user, [0, 0, 0, 0, 0, 0]);
  const me = current(s);
  const why = blocked(s, me);
  if (!sub) {
    const options = SUBS.filter((x) => why[x] === null).map((x) => ({ value: `turnMenu:${seq}:${x}`, label: say(s, SUB_KEY[x]) }));
    const notes = SUBS.flatMap((x) => (why[x] ? [`(${why[x]})`] : []));
    return menu(c, user, [say(s, 'yourTurn', { tokens: tokensText(s, me.tokens), disc: gemsOf(s, discountOf(me)) }), ...notes].join('\n'), options);
  }
  if (why[sub]) return deny(c, user, say(s, 'stale'));
  switch (sub) {
    case 'take3':
      return pick3Menu(c, user, []);
    case 'take2':
      return menu(c, user, say(s, 'askTake2'), [
        ...pairColors(s).map((x) => ({ value: `take2:${seq}:${x}`, label: gemWord(x, s.lang) })),
        BACK(s, seq),
      ]);
    case 'reserve':
      return menu(c, user, say(s, 'askReserve', { gold: say(s, s.bank.o ? 'goldYes' : 'goldNo') }), [
        ...tableSlots(s).map((x) => ({ value: `reserve:${seq}:${x.slot}`, label: cardOfText(s, x.id, x.label) })),
        ...deckSlots(s).map((x) => ({ value: `reserve:${seq}:${x.slot}`, label: x.label })),
        BACK(s, seq),
      ]);
    case 'buy':
      return menu(c, user, say(s, 'askBuy'), [
        ...buyable(s, me).map((x) => ({
          value: `buy:${seq}:${x.slot}`,
          label: say(s, 'buyLabel', { card: cardOfText(s, x.id, x.label), pay: gemsOf(s, payOf(me, x.id)!) }),
        })),
        BACK(s, seq),
      ]);
  }
}

// 拿 3 色要選幾種：3 和庫存有籌碼的顏色種數取小的；選法不合法回傳 false
const pickOk = (s: SState, colors: Color[], exact: boolean) =>
  new Set(colors).size === colors.length &&
  colors.every((x) => s.bank[x] > 0) &&
  (exact ? colors.length === Math.min(3, stocked(s).length) : colors.length <= Math.min(3, stocked(s).length));

// 拿 3 色：按顏色切換選取，選好再按確認；選擇記在按鈕上，不改 state
function pick3Menu(c: Ctx, user: string, colors: Color[]): boolean {
  const s = c.s;
  if (!pickOk(s, colors, false)) return deny(c, user, say(s, 'stale'));
  const seq = s.seq;
  const options = stocked(s).flatMap((x) => {
    if (colors.includes(x)) return [{ value: `pick3:${seq}:${colorKey(colors.filter((y) => y !== x))}`, label: say(s, 'picked', { gem: gemWord(x, s.lang) }) }];
    return colors.length < 3 ? [{ value: `pick3:${seq}:${colorKey([...colors, x])}`, label: gemWord(x, s.lang) }] : [];
  });
  const key = colorKey(colors);
  if (pickOk(s, colors, true)) {
    const gems = [...key].map((x) => gemWord(x as Color, s.lang)).join(say(s, 'gemSep'));
    options.push({ value: `take3:${seq}:${key}`, label: say(s, 'confirmTake', { gems }) });
  }
  return menu(c, user, say(s, 'askPick3'), [...options, BACK(s, seq)]);
}

function take(c: Ctx, user: string, got: Partial<Gems>) {
  const me = current(c.s);
  move(c.s.bank, me.tokens, got);
  tell(c, user, say(c.s, 'youTook', { gems: gemsOf(c.s, got) }));
  finishTurn(c, say(c.s, 'took', { who: quiet(me.id), gems: gemsOf(c.s, got) }), true);
}

function take3(c: Ctx, user: string, seq: number, colors: Color[]): boolean {
  if (!actCheck(c, user, seq)) return false;
  if (!pickOk(c.s, colors, true)) return deny(c, user, say(c.s, 'stale'));
  take(c, user, Object.fromEntries(colors.map((x) => [x, 1])));
  return true;
}

function take2(c: Ctx, user: string, seq: number, color: Color): boolean {
  if (!actCheck(c, user, seq)) return false;
  if (!pairColors(c.s).includes(color)) return deny(c, user, say(c.s, 'stale'));
  take(c, user, { [color]: 2 });
  return true;
}

// 翻開的卡被拿走：從同級牌堆補一張，牌堆空了就空著
function pullTable(s: SState, slot: string): number | undefined {
  const m = /^([123])-([1-4])$/.exec(slot);
  if (!m) return undefined;
  const [lv, i] = [Number(m[1]) - 1, Number(m[2]) - 1];
  const id = s.table[lv][i];
  if (id === null || id === undefined) return undefined;
  s.table[lv][i] = s.decks[lv].shift() ?? null;
  return id;
}

function reserve(c: Ctx, user: string, seq: number, slot: string): boolean {
  if (!actCheck(c, user, seq)) return false;
  const s = c.s;
  const me = current(s);
  const deck = /^deck([123])$/.exec(slot);
  const lv = deck ? Number(deck[1]) - 1 : -1;
  const id = me.reserved.length >= 3 ? undefined : deck ? s.decks[lv].shift() : pullTable(s, slot);
  if (id === undefined) return deny(c, user, say(s, 'stale'));
  me.reserved.push(id);
  const gold = s.bank.o > 0;
  if (gold) move(s.bank, me.tokens, { o: 1 });
  const tail = say(s, gold ? 'tailGold' : 'tailNoGold');
  const card = cardOf(id);
  tell(c, user, say(s, 'youReserved', { card: cardOfText(s, id), secret: deck ? say(s, 'secret') : '', tail }));
  const who = quiet(me.id);
  const last = deck
    ? say(s, 'reservedDeck', { who, level: levelWord(s, lv), tail })
    : say(s, 'reservedTable', { who, slot, color: gemWord(card.color, s.lang), points: card.points, tail });
  finishTurn(c, last, true);
  return true;
}

function buy(c: Ctx, user: string, seq: number, slot: string): boolean {
  if (!actCheck(c, user, seq)) return false;
  const s = c.s;
  const me = current(s);
  const own = /^r([123])$/.exec(slot);
  const id = own ? me.reserved[Number(own[1]) - 1] : tableSlots(s).find((x) => x.slot === slot)?.id;
  const pay = id === undefined ? null : payOf(me, id);
  if (id === undefined || !pay) return deny(c, user, say(s, 'stale'));
  if (own) me.reserved.splice(Number(own[1]) - 1, 1);
  else pullTable(s, slot);
  move(me.tokens, s.bank, pay);
  me.cards.push(id);
  const card = cardOf(id);
  const what = say(s, own ? 'boughtOwn' : 'boughtTable', { slot, color: gemWord(card.color, s.lang), points: card.points, pay: gemsOf(s, pay) });
  tell(c, user, say(s, 'youBought', { what }));
  finishTurn(c, say(s, 'bought', { who: quiet(me.id), what }), true);
  return true;
}

// ---------- 退回籌碼、回合結束 ----------

const excessOf = (p: SPlayer) => total(p.tokens) - 10;
const countsGems = (counts: number[]) => Object.fromEntries(GEMS.map((x, i) => [x, counts[i]])) as Gems;
const digits = (counts: number[]) => counts.join('');
// 選的數量合法：每種不超過持有數、總數不超過要退的數量
const countsOk = (p: SPlayer, counts: number[]) =>
  counts.length === GEMS.length && counts.every((n, i) => n >= 0 && n <= p.tokens[GEMS[i]]) && counts.reduce((a, b) => a + b, 0) <= excessOf(p);

// 退回選單：按一下多退 1 個，總數剛好時出現確認；選擇記在按鈕上，不改 state
function returnMenu(c: Ctx, user: string, counts: number[]): boolean {
  const s = c.s;
  const me = current(s);
  if (!countsOk(me, counts)) return deny(c, user, say(s, 'stale'));
  const excess = excessOf(me);
  const sum = counts.reduce((a, b) => a + b, 0);
  const options = GEMS.flatMap((x, i) => {
    if (!me.tokens[x]) return [];
    const more = counts[i] < me.tokens[x] && sum < excess ? counts.map((n, j) => (j === i ? n + 1 : n)) : counts;
    const sel = counts[i] ? say(s, 'returnSelected', { n: counts[i] }) : '';
    return [{ value: `retPick:${s.seq}:${digits(more)}`, label: say(s, 'returnLabel', { gem: gemWord(x, s.lang), sel }) }];
  });
  options.push({ value: `retPick:${s.seq}:000000`, label: say(s, 'reset') });
  if (sum === excess) options.push({ value: `return:${s.seq}:${digits(counts)}`, label: say(s, 'confirmReturn', { gems: gemsOf(s, countsGems(counts)) }) });
  const lines = [
    say(s, 'returnAsk', { n: total(me.tokens), excess, sec: RETURN_MS / 1000 }),
    say(s, 'returnHand', { hand: gemsOf(s, me.tokens), sel: gemsOf(s, countsGems(counts)) }),
  ];
  return menu(c, user, lines.join('\n'), options);
}

function returnCheck(c: Ctx, user: string, seq: number): boolean {
  const err = turnCheck(c.s, user, seq) ?? (c.s.step === 'return' ? null : say(c.s, 'stale'));
  return err ? deny(c, user, err) : true;
}

function giveBack(c: Ctx, user: string, seq: number, counts: number[]): boolean {
  if (!returnCheck(c, user, seq)) return false;
  const me = current(c.s);
  if (!countsOk(me, counts) || counts.reduce((a, b) => a + b, 0) !== excessOf(me)) return deny(c, user, say(c.s, 'stale'));
  const back = countsGems(counts);
  move(me.tokens, c.s.bank, back);
  tell(c, user, say(c.s, 'youReturned', { gems: gemsOf(c.s, back) }));
  c.s.last += say(c.s, 'returned', { who: quiet(me.id), gems: gemsOf(c.s, back) });
  endTurn(c);
  return true;
}

// 逾時自動退：每次從持有最多的顏色退 1 個 (同樣多依白藍綠紅黑)，黃金最後
export function autoReturn(p: SPlayer): Gems {
  const left = { ...p.tokens };
  const back = emptyGems();
  for (let k = excessOf(p); k > 0; k--) {
    const x = COLORS.reduce((best, y) => (left[y] > left[best] ? y : best), COLORS[0]);
    const gem = left[x] > 0 ? x : 'o';
    left[gem]--;
    back[gem]++;
  }
  return back;
}

// 做完動作 (或跳過)：更新連續跳過的次數；籌碼超過 10 個先退回，否則結束回合
function finishTurn(c: Ctx, last: string, acted: boolean) {
  const s = c.s;
  const me = current(s);
  s.passStreak = acted ? 0 : s.passStreak + 1;
  s.last = last;
  if (excessOf(me) > 0) {
    s.step = 'return';
    c.events.push(board(s));
    startTimer(c, RETURN_MS);
    returnMenu(c, me.id, [0, 0, 0, 0, 0, 0]);
    return;
  }
  endTurn(c);
}

// 回合結束：貴族來訪 (一回合最多 1 位，編號最小的)，收起這次的面板，輪到下一位
function endTurn(c: Ctx) {
  const s = c.s;
  const me = current(s);
  const disc = discountOf(me);
  const at = s.nobles.findIndex((id) => id !== null && nobleOf(id).need.every(([x, n]) => disc[x] >= n));
  if (at >= 0) {
    me.nobles.push(s.nobles[at]!);
    s.nobles[at] = null;
    s.last += say(s, 'nobleVisit', { i: at + 1, who: quiet(me.id) });
  }
  if (!s.lastRound && scoreOf(me) >= WIN_POINTS) {
    s.lastRound = true;
    c.events.push({ type: 'announce', text: say(s, 'reached', { who: mention(me.id), n: WIN_POINTS }) });
  }
  c.events.push(board(s, true));
  advance(c);
}

// 輪到下一位；一整輪都跳過、最後一輪打完、到 50 輪上限就計分
function advance(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  if (s.passStreak >= n) {
    c.events.push({ type: 'announce', text: say(s, 'allPassed') });
    return endGame(c);
  }
  if ((s.turn + 1) % n === s.first) {
    if (s.lastRound) return endGame(c);
    if (s.round >= MAX_ROUNDS) {
      c.events.push({ type: 'announce', text: say(s, 'roundLimit', { n: MAX_ROUNDS }) });
      return endGame(c);
    }
    s.round++;
  }
  s.turn = (s.turn + 1) % n;
  beginTurn(c);
}

// 分數高的在前，同分時買的卡少的在前
const cmp = (a: SPlayer, b: SPlayer) => scoreOf(b) - scoreOf(a) || a.cards.length - b.cards.length;

function endGame(c: Ctx) {
  const s = c.s;
  s.phase = 'ended';
  s.timers = {};
  const sorted = [...s.players].sort(cmp);
  s.winners = sorted.filter((p) => cmp(p, sorted[0]) === 0).map((p) => p.id);
  const lines = sorted.map((p) => {
    const place = sorted.findIndex((q) => cmp(p, q) === 0) + 1;
    const trophy = s.winners!.includes(p.id) ? ' 🏆' : '';
    return say(s, 'resultLine', { place, who: mention(p.id), score: scoreOf(p), cards: p.cards.length, nobles: p.nobles.length, trophy });
  });
  c.events.push({ type: 'result', players: s.players.map((p) => p.id), winners: s.winners });
  c.events.push(
    { type: 'announce', text: [say(s, 'gameOver', { winners: s.winners.map(mention).join(say(s, 'listSep')) }), ...lines].join('\n'), gif: 'goodWin' },
    { type: 'prompt', kind: 'rematch', audience: 'channel', text: '要再來一局嗎？', options: [{ value: 'rematch', label: '再來一局' }] },
  );
}

// 輪到新玩家：沒有任何能做的動作就自動跳過 (併進下一個面板的上一步)
function beginTurn(c: Ctx) {
  const s = c.s;
  const me = current(s);
  s.seq++;
  s.step = 'act';
  if (!canAct(s, me)) {
    s.passStreak++;
    s.last = [s.last, say(s, 'noMoves', { who: quiet(me.id) })].filter(Boolean).join(say(s, 'semiSep'));
    return advance(c);
  }
  c.events.push(board(s));
  startTimer(c, TURN_MS);
}

function timeout(c: Ctx) {
  const s = c.s;
  const me = current(s);
  if (s.step === 'act') return finishTurn(c, say(s, 'timedOut', { who: quiet(me.id) }), false);
  const back = autoReturn(me);
  move(me.tokens, s.bank, back);
  s.last = [s.last, say(s, 'autoReturned', { who: quiet(me.id), gems: gemsOf(s, back) })].filter(Boolean).join(say(s, 'commaSep'));
  endTurn(c);
}

// ---------- bot ----------

// 候選卡的固定順序：保留卡在前 (依保留順序)，再來是翻開的卡 (三級到一級、位置 1～4)
const candidates = (s: SState, me: SPlayer) => [...reservedSlots(s, me), ...tableSlots(s)];
const points = (x: Slot) => cardOf(x.id).points;

// 目標卡：缺口最小；同缺口取分數高的；再相同取固定順序在前的
export function targetOf(s: SState, me: SPlayer): Slot | undefined {
  const disc = discountOf(me);
  const gap = (x: Slot) => shortfall(cardOf(x.id).cost, disc, me.tokens);
  return candidates(s, me).reduce<Slot | undefined>((best, x) => {
    if (!best) return x;
    const d = gap(x) - gap(best);
    return d < 0 || (d === 0 && points(x) > points(best)) ? x : best;
  }, undefined);
}

// 目標卡每種顏色的應付；沒有目標時全是 0
const targetNeed = (s: SState, me: SPlayer) => {
  const t = targetOf(s, me);
  return t ? need(cardOf(t.id).cost, discountOf(me)) : { w: 0, b: 0, g: 0, r: 0, k: 0 };
};

// bot 這一步要做什麼 (回傳和真人按按鈕一樣的 action)；沒有能做的回傳 null
export function botMove(s: SState, me: SPlayer): SAction | null {
  const base = { user: me.id, seq: s.seq };
  // 1. 買得起就買分數最高的；同分付最少的；再相同取固定順序在前的
  const buys = candidates(s, me).flatMap((x) => {
    const pay = payOf(me, x.id);
    return pay ? [{ ...x, paid: total(pay) }] : [];
  });
  const best = buys.reduce<(typeof buys)[number] | undefined>((b, x) => {
    if (!b) return x;
    const d = points(x) - points(b);
    return d > 0 || (d === 0 && x.paid < b.paid) ? x : b;
  }, undefined);
  if (best) return { type: 'buy', ...base, slot: best.slot };
  // 2～3. 朝目標卡拿寶石
  const target = targetOf(s, me);
  const open = stocked(s);
  if (open.length) {
    const owe = targetNeed(s, me);
    const lack = (x: Color) => Math.max(0, owe[x] - me.tokens[x]);
    const short = COLORS.filter((x) => lack(x) > 0);
    if (short.length === 1 && lack(short[0]) >= 2 && s.bank[short[0]] >= 4) return { type: 'take2', ...base, color: short[0] };
    // sort 是穩定排序：同樣多時維持白藍綠紅黑的順序
    const want = [
      ...open.filter((x) => lack(x) > 0).sort((a, b) => lack(b) - lack(a)),
      ...open.filter((x) => lack(x) === 0).sort((a, b) => s.bank[b] - s.bank[a]),
    ].slice(0, 3);
    return { type: 'take3', ...base, colors: COLORS.filter((x) => want.includes(x)) };
  }
  // 4. 保留目標卡；目標是自己保留的卡時改保留場上分數最高的，場上沒有卡就保留最高級的牌堆頂
  if (me.reserved.length >= 3) return null;
  if (target && !target.slot.startsWith('r')) return { type: 'reserve', ...base, slot: target.slot };
  const top = tableSlots(s).reduce<Slot | undefined>((b, x) => (!b || points(x) > points(b) ? x : b), undefined);
  const slot = top?.slot ?? deckSlots(s)[0]?.slot;
  return slot ? { type: 'reserve', ...base, slot } : null;
}

// bot 退回：先退目標卡用不到的 (超過應付的部分，最多的先退)，再退持有最多的，黃金最後
export function botReturn(s: SState, me: SPlayer): number[] {
  const owe = targetNeed(s, me);
  const left = { ...me.tokens };
  const counts = [0, 0, 0, 0, 0, 0];
  for (let k = excessOf(me); k > 0; k--) {
    const extra = COLORS.filter((x) => left[x] > owe[x]);
    const most = (list: Color[], v: (x: Color) => number) => list.reduce((b, x) => (v(x) > v(b) ? x : b), list[0]);
    let gem: Gem = extra.length ? most(extra, (x) => left[x] - owe[x]) : most(COLORS, (x) => left[x]);
    if (!left[gem]) gem = 'o';
    left[gem]--;
    counts[GEMS.indexOf(gem)]++;
  }
  return counts;
}

// state 有變之後：輪到 bot 就讓它行動，直到輪到真人或遊戲結束
function runBots(c: Ctx) {
  for (let guard = 0; guard < 2000 && c.s.phase === 'play' && isBot(current(c.s).id); guard++) {
    const s = c.s;
    const me = current(s);
    if (s.step === 'return') {
      giveBack(c, me.id, s.seq, botReturn(s, me));
      continue;
    }
    // 防禦：策略算出的動作萬一被拒，改成跳過，不會卡住
    const move = botMove(s, me);
    if (!move || !handle(c, move as GameAction)) finishTurn(c, say(s, 'passes', { who: quiet(me.id) }), false);
  }
}


function start(c: Ctx, user: string): boolean {
  const s = c.s;
  if (user !== s.host) return reply(c, user, say(s, 'onlyHostStart'));
  if (s.phase !== 'lobby') return false;
  const n = s.players.length;
  if (n < MIN_SPLENDOR_PLAYERS) return reply(c, user, say(s, 'needMore', { n, min: MIN_SPLENDOR_PLAYERS }));
  c.events.push(lobbyEvent(TITLE, { ...s, phase: 'play' }));
  const each = n === 2 ? 4 : n === 3 ? 5 : 7;
  const decks = [1, 2, 3].map((lv) => shuffle(CARDS.filter((x) => x.level === lv).map((x) => x.id), c.rng)) as SState['decks'];
  const first = Math.floor(c.rng() * n);
  Object.assign(s, {
    phase: 'play',
    players: s.players.map((p) => newPlayer(p.id)),
    bank: { w: each, b: each, g: each, r: each, k: each, o: 5 },
    decks,
    table: decks.map((d) => d.splice(0, 4)),
    nobles: shuffle(NOBLES.map((x) => x.id), c.rng).slice(0, n + 1),
    first,
    turn: first,
    round: 1,
    passStreak: 0,
    lastRound: false,
    last: undefined,
  });
  const order = Array.from({ length: n }, (_, k) => mention(s.players[(first + k) % n].id)).join(' → ');
  c.events.push({ type: 'announce', text: say(s, 'started', { order, rules: say(s, 'rules') }) });
  beginTurn(c);
  return true;
}

function handle(c: Ctx, action: GameAction): boolean {
  switch (action.type) {
    case 'join':
      return joinRoom(c, TITLE, action.user, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'leave':
      return leaveRoom(c, TITLE, action.user);
    case 'addBot':
      return addBots(c, TITLE, action.user, action.count, MAX_SPLENDOR_PLAYERS, newPlayer);
    case 'removeBot':
      return removeBots(c, TITLE, action.user, action.count);
    case 'start':
      return start(c, action.user);
    case 'cancel':
      return cancelGame(c, action.user);
    case 'status':
      return status(c, action.user);
    case 'turnMenu':
      return turnMenu(c, action.user, action.seq, action.sub);
    case 'pick3': {
      const err = turnCheck(c.s, action.user, action.seq) ?? (c.s.step === 'act' ? null : say(c.s, 'stale'));

      return err ? deny(c, action.user, err) : pick3Menu(c, action.user, action.colors);
    }
    case 'take3':
      return take3(c, action.user, action.seq, action.colors);
    case 'take2':
      return take2(c, action.user, action.seq, action.color);
    case 'reserve':
      return reserve(c, action.user, action.seq, action.slot);
    case 'buy':
      return buy(c, action.user, action.seq, action.slot);
    case 'retPick':
      return returnCheck(c, action.user, action.seq) && returnMenu(c, action.user, action.counts);
    case 'return':
      return giveBack(c, action.user, action.seq, action.counts);
    case 'timeout':
      if (action.id !== c.s.timers.phase) return false;
      timeout(c);
      return true;
    default:
      return false;
  }
}

const newPlayer = (id: string): SPlayer => ({ id, tokens: emptyGems(), cards: [], reserved: [], nobles: [] });

export function applySplendor(state: SState | undefined, action: SAction, rng: Rng): Result {
  return runGame(state, action, rng, {
    finished: (s) => !!s.winners,
    isPlayer: (s, user) => s.players.some((p) => p.id === user),
    createLobby,
    handle,
    afterChange: runBots,
  });
}

function createLobby(prev: SState | undefined, host: string, channel: string): Result {
  const created: SState = {
    game: 'splendor',
    channel,
    host,
    phase: 'lobby',
    players: [newPlayer(host)],
    bank: emptyGems(),
    decks: [[], [], []],
    table: [[], [], []],
    nobles: [],
    first: 0,
    turn: 0,
    round: 0,
    step: 'act',
    seq: prev?.seq ?? 0,
    passStreak: 0,
    timerSeq: prev?.timerSeq ?? 0,
    timers: {},
  };
  return { state: created, events: [lobbyEvent(TITLE, created)] };
}
